import type { MatterAPI } from '../api.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clusterNames } from './index.js'
import { SwitchAPIImpl } from './SwitchAPI.js'

describe('switchAPIImpl.emit', () => {
  let updateAccessoryState: ReturnType<typeof vi.fn>
  let switchApi: SwitchAPIImpl

  beforeEach(() => {
    updateAccessoryState = vi.fn().mockResolvedValue(undefined)
    switchApi = new SwitchAPIImpl({ updateAccessoryState } as unknown as Pick<MatterAPI, 'updateAccessoryState'>)
  })

  it('should emit press as currentPosition=1 by default', async () => {
    await switchApi.emit('uuid-default-press', 'press')

    expect(updateAccessoryState).toHaveBeenCalledWith(
      'uuid-default-press',
      clusterNames.Switch,
      { currentPosition: 1 },
      undefined,
    )
  })

  it('should emit press with custom position', async () => {
    await switchApi.emit('uuid-multi-button', 'press', { position: 3 })

    expect(updateAccessoryState).toHaveBeenCalledWith(
      'uuid-multi-button',
      clusterNames.Switch,
      { currentPosition: 3 },
      undefined,
    )
  })

  it('should emit release as currentPosition=0', async () => {
    await switchApi.emit('uuid-release', 'release')

    expect(updateAccessoryState).toHaveBeenCalledWith(
      'uuid-release',
      clusterNames.Switch,
      { currentPosition: 0 },
      undefined,
    )
  })

  it('should emit release ignoring position (always neutral/0)', async () => {
    await switchApi.emit('uuid-release-with-pos', 'release', { position: 2 })

    expect(updateAccessoryState).toHaveBeenCalledWith(
      'uuid-release-with-pos',
      clusterNames.Switch,
      { currentPosition: 0 },
      undefined,
    )
  })

  it('should pass partId through for composed devices', async () => {
    await switchApi.emit('uuid-composed', 'press', { partId: 'button-top' })

    expect(updateAccessoryState).toHaveBeenCalledWith(
      'uuid-composed',
      clusterNames.Switch,
      { currentPosition: 1 },
      'button-top',
    )
  })

  it('should not call updateAccessoryState for invalid action', async () => {
    await switchApi.emit('uuid-invalid-action', 'invalid' as unknown as 'press')

    expect(updateAccessoryState).not.toHaveBeenCalled()
  })

  it('should not call updateAccessoryState when uuid is missing', async () => {
    await switchApi.emit('', 'press')

    expect(updateAccessoryState).not.toHaveBeenCalled()
  })

  it('should default position to 1 for invalid position on press', async () => {
    await switchApi.emit('uuid-invalid-position', 'press', { position: 0 })

    expect(updateAccessoryState).toHaveBeenCalledWith(
      'uuid-invalid-position',
      clusterNames.Switch,
      { currentPosition: 1 },
      undefined,
    )
  })

  it('should default position to 1 for non-integer position on press', async () => {
    await switchApi.emit('uuid-float-position', 'press', { position: 1.5 })

    expect(updateAccessoryState).toHaveBeenCalledWith(
      'uuid-float-position',
      clusterNames.Switch,
      { currentPosition: 1 },
      undefined,
    )
  })
})

describe('switchAPIImpl.emitGesture', () => {
  let updateAccessoryState: ReturnType<typeof vi.fn>
  let switchApi: SwitchAPIImpl

  beforeEach(() => {
    vi.useFakeTimers()
    updateAccessoryState = vi.fn().mockResolvedValue(undefined)
    switchApi = new SwitchAPIImpl({ updateAccessoryState } as unknown as Pick<MatterAPI, 'updateAccessoryState'>)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should emit singlePress as press then release', async () => {
    await switchApi.emitGesture('uuid-single', 'singlePress')

    expect(updateAccessoryState).toHaveBeenCalledTimes(2)
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      1, 'uuid-single', clusterNames.Switch, { currentPosition: 1 }, undefined,
    )
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      2, 'uuid-single', clusterNames.Switch, { currentPosition: 0 }, undefined,
    )
  })

  it('should emit doublePress as press/release/press/release', async () => {
    const promise = switchApi.emitGesture('uuid-double', 'doublePress')
    await vi.runAllTimersAsync()
    await promise

    expect(updateAccessoryState).toHaveBeenCalledTimes(4)
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      1, 'uuid-double', clusterNames.Switch, { currentPosition: 1 }, undefined,
    )
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      2, 'uuid-double', clusterNames.Switch, { currentPosition: 0 }, undefined,
    )
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      3, 'uuid-double', clusterNames.Switch, { currentPosition: 1 }, undefined,
    )
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      4, 'uuid-double', clusterNames.Switch, { currentPosition: 0 }, undefined,
    )
  })

  it('should emit longPress as press then release after delay', async () => {
    const promise = switchApi.emitGesture('uuid-long', 'longPress')
    await vi.runAllTimersAsync()
    await promise

    expect(updateAccessoryState).toHaveBeenCalledTimes(2)
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      1, 'uuid-long', clusterNames.Switch, { currentPosition: 1 }, undefined,
    )
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      2, 'uuid-long', clusterNames.Switch, { currentPosition: 0 }, undefined,
    )
  })

  it('should use default longPressDelayMs of 2500', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const promise = switchApi.emitGesture('uuid-long-default', 'longPress')
    await vi.runAllTimersAsync()
    await promise

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2500)
  })

  it('should use custom longPressDelayMs', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const promise = switchApi.emitGesture('uuid-long-custom', 'longPress', { longPressDelayMs: 3000 })
    await vi.runAllTimersAsync()
    await promise

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000)
  })

  it('should use default multiPressDelayMs of 100 for doublePress', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const promise = switchApi.emitGesture('uuid-double-default', 'doublePress')
    await vi.runAllTimersAsync()
    await promise

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100)
  })

  it('should use custom multiPressDelayMs for doublePress', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const promise = switchApi.emitGesture('uuid-double-custom', 'doublePress', { multiPressDelayMs: 50 })
    await vi.runAllTimersAsync()
    await promise

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 50)
  })

  it('should forward position and partId for singlePress', async () => {
    await switchApi.emitGesture('uuid-opts', 'singlePress', { position: 2, partId: 'btn' })

    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      1, 'uuid-opts', clusterNames.Switch, { currentPosition: 2 }, 'btn',
    )
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      2, 'uuid-opts', clusterNames.Switch, { currentPosition: 0 }, 'btn',
    )
  })

  it('should forward position and partId for doublePress', async () => {
    const promise = switchApi.emitGesture('uuid-double-opts', 'doublePress', { position: 3, partId: 'top' })
    await vi.runAllTimersAsync()
    await promise

    expect(updateAccessoryState).toHaveBeenCalledTimes(4)
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      1, 'uuid-double-opts', clusterNames.Switch, { currentPosition: 3 }, 'top',
    )
    expect(updateAccessoryState).toHaveBeenNthCalledWith(
      3, 'uuid-double-opts', clusterNames.Switch, { currentPosition: 3 }, 'top',
    )
  })

  it('should not call updateAccessoryState when uuid is missing', async () => {
    await switchApi.emitGesture('', 'singlePress')

    expect(updateAccessoryState).not.toHaveBeenCalled()
  })

  it('should not call updateAccessoryState for invalid gesture', async () => {
    await switchApi.emitGesture('uuid-bad-gesture', 'triplePress' as unknown as 'singlePress')

    expect(updateAccessoryState).not.toHaveBeenCalled()
  })
})
