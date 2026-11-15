import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DefaultClosureControlServer, HomebridgeClosureControlServer } from './ClosureControlBehavior.js'
import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'

interface ClosureState {
  overallCurrentState?: Record<string, unknown>
  overallTargetState?: Record<string, unknown>
  mainState?: number
}

function makeBehavior<T>(prototype: object, state: ClosureState, endpoint?: unknown): T {
  const behavior = Object.create(prototype)
  Object.defineProperty(behavior, 'state', {
    get: () => state,
    configurable: true,
  })
  if (endpoint) {
    Object.defineProperty(behavior, 'endpoint', {
      get: () => endpoint,
      configurable: true,
    })
  }
  return behavior as T
}

describe('defaultClosureControlServer', () => {
  let state: ClosureState
  let behavior: DefaultClosureControlServer

  beforeEach(() => {
    state = {}
    behavior = makeBehavior(DefaultClosureControlServer.prototype, state)
  })

  it('should record the requested position as both target and current', async () => {
    // The matter.js base server leaves every command unimplemented (it throws
    // NotImplementedError), so the default server must record the move itself.
    await behavior.moveTo({ position: 1 } as any)

    expect(state.overallTargetState).toEqual({ position: 1 })
    expect(state.overallCurrentState).toEqual({ position: 1, secureState: false })
  })

  // The target and the current position are two different lists in Matter
  it.each([
    [0, 0],
    [1, 1],
    [2, 3],
    [3, 4],
    [4, 5],
  ])('should store target position %i as current position %i', async (target, current) => {
    await behavior.moveTo({ position: target } as any)

    expect(state.overallTargetState).toEqual({ position: target })
    expect(state.overallCurrentState).toMatchObject({ position: current })
  })

  it('should say the closure is secure only when it is fully closed, and latched if it has a latch', async () => {
    await behavior.moveTo({ position: 0 } as any)
    expect(state.overallCurrentState).toEqual({ position: 0, secureState: true })

    await behavior.moveTo({ latch: false } as any)
    expect(state.overallCurrentState).toEqual({ position: 0, latch: false, secureState: false })

    await behavior.moveTo({ latch: true } as any)
    expect(state.overallCurrentState).toEqual({ position: 0, latch: true, secureState: true })

    await behavior.moveTo({ position: 1 } as any)
    expect(state.overallCurrentState).toEqual({ position: 1, latch: true, secureState: false })
  })

  it('should keep fields the request did not mention', async () => {
    state.overallTargetState = { position: 0, latch: true }
    state.overallCurrentState = {
      position: 0,
      latch: true,
      speed: 2,
      secureState: true,
    }

    await behavior.moveTo({ position: 1 } as any)

    expect(state.overallTargetState).toEqual({ position: 1, latch: true })
    expect(state.overallCurrentState).toEqual({
      position: 1,
      latch: true,
      speed: 2,
      secureState: false,
    })
  })

  it('should pull the target back to the current position on stop', async () => {
    // current 3 = opened for pedestrians, which is target 2
    state.overallCurrentState = { position: 3, secureState: false }
    state.overallTargetState = { position: 1 }

    await behavior.stop()

    expect(state.overallTargetState).toEqual({ position: 2 })
  })

  it('should leave no target position on stop when the closure is partially opened', async () => {
    state.overallCurrentState = { position: 2, secureState: false }
    state.overallTargetState = { position: 1 }

    await behavior.stop()

    expect(state.overallTargetState).toEqual({ position: null })
  })
})

describe('homebridgeClosureControlServer', () => {
  let registry: BehaviorRegistry
  let behavior: HomebridgeClosureControlServer
  let state: ClosureState
  const endpointId = 'test-endpoint-closure'

  beforeEach(() => {
    registry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any

    state = {}
    const endpoint = { id: endpointId }
    const registryManager = new RegistryManager()
    setRegistryManager(endpoint, registryManager)
    registryManager.registerEndpoint(endpointId, registry)

    behavior = makeBehavior(HomebridgeClosureControlServer.prototype, state, endpoint)
  })

  it('should execute the plugin handler for moveTo', async () => {
    const request = { position: 1 } as any

    await behavior.moveTo(request)

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'closureControl', 'moveTo', request)
  })

  it('should record the state only after the handler succeeds', async () => {
    vi.mocked(registry.executeHandler).mockRejectedValueOnce(new Error('gate jammed'))

    await expect(behavior.moveTo({ position: 1 } as any)).rejects.toThrow('gate jammed')
    expect(state.overallTargetState).toBeUndefined()
  })

  it('should sync the new state to the cache', async () => {
    await behavior.moveTo({ position: 1 } as any)

    expect(registry.syncStateToCache).toHaveBeenCalledWith(
      endpointId,
      'closureControl',
      expect.objectContaining({
        overallTargetState: { position: 1 },
      }),
    )
  })

  it('should execute the plugin handler for stop', async () => {
    await behavior.stop()

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'closureControl', 'stop')
  })

  it('should pass a handler failure on to matter.js', async () => {
    vi.mocked(registry.executeHandler).mockRejectedValueOnce(new Error('no response'))

    await expect(behavior.stop()).rejects.toThrow('no response')
  })
})
