import process from 'node:process'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../logger.js'
import { sendToParent } from './ipc.js'

describe('sendToParent', () => {
  const original = { send: process.send, connected: process.connected }

  /** Pretend this process was forked, with the IPC channel open or closed. */
  function forked(connected: boolean, send = vi.fn()): ReturnType<typeof vi.fn> {
    process.send = send as never
    Object.defineProperty(process, 'connected', { value: connected, configurable: true })
    return send
  }

  afterEach(() => {
    process.send = original.send
    Object.defineProperty(process, 'connected', { value: original.connected, configurable: true })
    vi.restoreAllMocks()
  })

  it('sends the message while the channel to the parent is open', () => {
    const send = forked(true)

    sendToParent({ id: 'status', data: 1 })

    expect(send).toHaveBeenCalledExactlyOnceWith({ id: 'status', data: 1 }, undefined, undefined, expect.any(Function))
  })

  it('does not send once the parent has gone', () => {
    const send = forked(false)

    sendToParent({ id: 'status' })

    expect(send).not.toHaveBeenCalled()
  })

  it('does nothing in a process that has no parent', () => {
    process.send = undefined

    expect(() => sendToParent({ id: 'status' })).not.toThrow()
  })

  it('takes the error of a send that fails because the channel closed in between', () => {
    const debug = vi.spyOn(Logger.internal, 'debug').mockImplementation(() => {})
    forked(true, vi.fn((_message, _handle, _options, callback: (error: Error | null) => void) => {
      callback(new Error('Channel closed'))
    }))

    expect(() => sendToParent({ id: 'status' })).not.toThrow()

    expect(debug).toHaveBeenCalledWith(expect.any(String), 'Channel closed')
  })
})
