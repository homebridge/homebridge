import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { ModeBase } from '@matter/main/clusters'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'
import {
  DefaultWaterHeaterManagementServer,
  HomebridgeWaterHeaterManagementServer,
  HomebridgeWaterHeaterModeServer,
} from './WaterHeaterBehavior.js'

interface ManagementState {
  boostState: number
}

function makeBehavior<T>(prototype: object, state: ManagementState, extras: Record<string, unknown> = {}): T {
  const behavior = Object.create(prototype)
  Object.defineProperty(behavior, 'state', {
    get: () => state,
    configurable: true,
  })
  const events = {
    boostStarted: {
      emit: vi.fn(),
    },
    boostEnded: {
      emit: vi.fn(),
    },
  }
  Object.defineProperty(behavior, 'events', {
    get: () => events,
    configurable: true,
  })
  Object.defineProperty(behavior, 'context', {
    get: () => ({}),
    configurable: true,
  })
  for (const [key, value] of Object.entries(extras)) {
    Object.defineProperty(behavior, key, {
      get: () => value,
      configurable: true,
    })
  }
  return behavior as T
}

const boostRequest = {
  boostInfo: { duration: 1800 },
} as any

/**
 * matter.js's base WaterHeaterManagement server leaves boost and cancelBoost
 * unimplemented, so every water heater would fail them. The default server
 * records the boost and raises the events the spec requires.
 */
describe('defaultWaterHeaterManagementServer', () => {
  let state: ManagementState
  let behavior: DefaultWaterHeaterManagementServer

  beforeEach(() => {
    state = { boostState: 0 }
    behavior = makeBehavior(DefaultWaterHeaterManagementServer.prototype, state)
  })

  it('records a boost and announces it', async () => {
    await behavior.boost(boostRequest)

    expect(state.boostState).toBe(1) // BoostState.Active
    expect((behavior as any).events.boostStarted.emit).toHaveBeenCalledWith({ boostInfo: boostRequest.boostInfo }, expect.anything())
  })

  it('ends a boost and announces it', async () => {
    state.boostState = 1

    await behavior.cancelBoost()

    expect(state.boostState).toBe(0) // BoostState.Inactive
    expect((behavior as any).events.boostEnded.emit).toHaveBeenCalled()
  })

  it('does not announce the end of a boost that was not running', async () => {
    await behavior.cancelBoost()

    expect((behavior as any).events.boostEnded.emit).not.toHaveBeenCalled()
  })
})

describe('homebridgeWaterHeaterManagementServer', () => {
  let registry: BehaviorRegistry
  let state: ManagementState
  let behavior: HomebridgeWaterHeaterManagementServer
  const endpointId = 'test-endpoint-water-heater'

  beforeEach(() => {
    registry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any
    state = { boostState: 0 }
    const endpoint = { id: endpointId }
    const registryManager = new RegistryManager()
    setRegistryManager(endpoint, registryManager)
    registryManager.registerEndpoint(endpointId, registry)
    behavior = makeBehavior(HomebridgeWaterHeaterManagementServer.prototype, state, { endpoint })
  })

  it('asks the plugin first, then records the boost', async () => {
    await behavior.boost(boostRequest)

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'waterHeaterManagement', 'boost', boostRequest)
    expect(state.boostState).toBe(1)
    expect(registry.syncStateToCache).toHaveBeenCalledWith(endpointId, 'waterHeaterManagement', { boostState: 1 })
  })

  it('leaves the state alone when the plugin refuses', async () => {
    registry.executeHandler = vi.fn().mockRejectedValue(new Error('tank is cold'))

    await expect(behavior.boost(boostRequest)).rejects.toThrow('Failed to boost water heater: tank is cold')
    expect(state.boostState).toBe(0)
    expect(registry.syncStateToCache).not.toHaveBeenCalled()
  })

  it('asks the plugin to cancel a boost', async () => {
    state.boostState = 1

    await behavior.cancelBoost()

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'waterHeaterManagement', 'cancelBoost')
    expect(state.boostState).toBe(0)
  })
})

/**
 * The plugin must only hear about a mode the device lists - matter.js checks
 * the mode in its own changeToMode, which runs after the plugin's handler.
 */
describe('homebridgeWaterHeaterModeServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeWaterHeaterModeServer
  let state: { currentMode: number, supportedModes: { label: string, mode: number, modeTags: [] }[] }
  const endpointId = 'water-heater-1'

  beforeEach(() => {
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any
    const endpoint = { id: endpointId }
    const registryManager = new RegistryManager()
    setRegistryManager(endpoint, registryManager)
    registryManager.registerEndpoint(endpointId, mockRegistry)

    state = {
      currentMode: 0,
      supportedModes: [
        { label: 'First', mode: 0, modeTags: [] },
        { label: 'Second', mode: 1, modeTags: [] },
      ],
    }
    behavior = Object.create(HomebridgeWaterHeaterModeServer.prototype)
    for (const [key, value] of Object.entries({ endpoint, state })) {
      Object.defineProperty(behavior, key, {
        get: () => value,
        configurable: true,
      })
    }
  })

  it('asks the plugin first, then records a supported mode', async () => {
    const result = await behavior.changeToMode({ newMode: 1 })

    expect(mockRegistry.executeHandler).toHaveBeenCalledWith(endpointId, 'waterHeaterMode', 'changeToMode', { newMode: 1 })
    expect(result.status).toBe(ModeBase.ModeChangeStatus.Success)
    expect(state.currentMode).toBe(1)
  })

  it('refuses a mode the device does not list, without asking the plugin', async () => {
    const result = await behavior.changeToMode({ newMode: 7 })

    expect(result.status).toBe(ModeBase.ModeChangeStatus.UnsupportedMode)
    expect(mockRegistry.executeHandler).not.toHaveBeenCalled()
    expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    expect(state.currentMode).toBe(0)
  })
})
