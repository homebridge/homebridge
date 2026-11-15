import type { MockInstance } from 'vitest'

import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { IpcIncomingEvent, IpcOutgoingEvent, IpcService } from './ipcService.js'

describe('ipcService', () => {
  let service: IpcService
  let send: ReturnType<typeof vi.fn>
  let processOn: MockInstance<typeof process.on>
  const original = {
    send: Object.getOwnPropertyDescriptor(process, 'send'),
    connected: Object.getOwnPropertyDescriptor(process, 'connected'),
  }

  function setParent(connected: boolean): void {
    send = vi.fn()
    Object.defineProperty(process, 'send', { value: send, configurable: true, writable: true })
    Object.defineProperty(process, 'connected', { value: connected, configurable: true, writable: true })
  }

  function restore(name: 'send' | 'connected'): void {
    const descriptor = original[name]
    if (descriptor) {
      Object.defineProperty(process, name, descriptor)
    } else {
      delete (process as unknown as Record<string, unknown>)[name]
    }
  }

  // Hands a message to the listener the service put on `process`, without
  // emitting on the test worker's own process (the test runner listens there too).
  function deliver(message: unknown): void {
    const handler = processOn.mock.calls.find(([event]) => event === 'message')?.[1] as (message: unknown) => void
    handler(message)
  }

  beforeEach(() => {
    service = new IpcService()
    processOn = vi.spyOn(process, 'on')
  })

  afterEach(() => {
    service.stop()
    processOn.mockRestore()
    restore('send')
    restore('connected')
  })

  describe('messages from the parent process', () => {
    it('passes a known request on to its listener, with its data', () => {
      const listener = vi.fn()
      service.on(IpcIncomingEvent.RESTART_CHILD_BRIDGE, listener)
      service.start()

      deliver({ id: 'restartChildBridge', data: '0E:DC:5D:BE:D6:75' })

      expect(listener).toHaveBeenCalledWith('0E:DC:5D:BE:D6:75')
    })

    it.each([
      null,
      undefined,
      'text',
      42,
      {},
      { data: 'no id' },
    ])('ignores a message that is not an object with an id (%j)', (message) => {
      service.start()
      expect(() => deliver(message)).not.toThrow()
    })

    // An `error` event with no listener throws: one message with that id
    // from the parent took Homebridge down.
    it('ignores a message whose id is not a known request, the id "error" included', () => {
      const listener = vi.fn()
      service.on('unknownRequest' as IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST, listener)
      service.start()

      expect(() => process.emit('message', {
        id: 'error',
        data: new Error('from the parent'),
      }, undefined)).not.toThrow()
      deliver({ id: 'unknownRequest' })

      expect(listener).not.toHaveBeenCalled()
    })

    it('stops listening, and drops its own listeners, on stop()', () => {
      const listener = vi.fn()
      service.on(IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST, listener)
      const before = process.listenerCount('message')
      service.start()
      expect(process.listenerCount('message')).toBe(before + 1)

      service.stop()

      expect(process.listenerCount('message')).toBe(before)
      expect(service.listenerCount(IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST)).toBe(0)
    })
  })

  describe('messages to the parent process', () => {
    it('sends the id and the data when the channel is open', () => {
      setParent(true)

      service.sendMessage(IpcOutgoingEvent.SERVER_STATUS_UPDATE, { status: 'ok' })

      expect(send).toHaveBeenCalledTimes(1)
      expect(send.mock.calls[0][0]).toEqual({
        id: 'serverStatusUpdate',
        data: { status: 'ok' },
      })
    })

    it('sends nothing once the parent has gone', () => {
      setParent(false)

      service.sendMessage(IpcOutgoingEvent.SERVER_STATUS_UPDATE, { status: 'ok' })

      expect(send).not.toHaveBeenCalled()
    })
  })
})
