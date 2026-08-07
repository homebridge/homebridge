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
  Object.defineProperty(behavior, 'state', { get: () => state, configurable: true })
  if (endpoint) {
    Object.defineProperty(behavior, 'endpoint', { get: () => endpoint, configurable: true })
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
    expect(state.overallCurrentState).toEqual({ position: 1 })
  })

  it('should keep fields the request did not mention', async () => {
    state.overallTargetState = { position: 0, latch: true }

    await behavior.moveTo({ position: 1 } as any)

    expect(state.overallTargetState).toEqual({ position: 1, latch: true })
  })

  it('should pull the target back to the current position on stop', async () => {
    state.overallCurrentState = { position: 2 }
    state.overallTargetState = { position: 1 }

    await behavior.stop()

    expect(state.overallTargetState).toEqual({ position: 2 })
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

    await expect(behavior.moveTo({ position: 1 } as any)).rejects.toThrow('Failed to move closure')
    expect(state.overallTargetState).toBeUndefined()
  })

  it('should sync the new state to the cache', async () => {
    await behavior.moveTo({ position: 1 } as any)

    expect(registry.syncStateToCache).toHaveBeenCalledWith(
      endpointId,
      'closureControl',
      expect.objectContaining({ overallTargetState: { position: 1 } }),
    )
  })

  it('should execute the plugin handler for stop', async () => {
    await behavior.stop()

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'closureControl', 'stop')
  })

  it('should wrap a handler failure so the endpoint stays online', async () => {
    vi.mocked(registry.executeHandler).mockRejectedValueOnce(new Error('no response'))

    await expect(behavior.stop()).rejects.toThrow('Failed to stop closure: no response')
  })
})
