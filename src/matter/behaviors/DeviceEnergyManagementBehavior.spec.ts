import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { ModeBase } from '@matter/main/clusters'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DefaultDeviceEnergyManagementServer,
  HomebridgeDeviceEnergyManagementModeServer,
  HomebridgeDeviceEnergyManagementServer,
} from './DeviceEnergyManagementBehavior.js'
import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'

interface EnergyState {
  esaState: number
  powerAdjustmentCapability?: { powerAdjustCapability: unknown[] | null, cause: number } | null
}

const Online = 1
const PowerAdjustActive = 3
const Paused = 4

function makeBehavior<T>(prototype: object, state: EnergyState, extras: Record<string, unknown> = {}): T {
  const behavior = Object.create(prototype)
  Object.defineProperty(behavior, 'state', {
    get: () => state,
    configurable: true,
  })
  const events = {
    powerAdjustStart: {
      emit: vi.fn(),
    },
    powerAdjustEnd: {
      emit: vi.fn(),
    },
    paused: {
      emit: vi.fn(),
    },
    resumed: {
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

const powerAdjustRequest = { power: 1000000, duration: 600, cause: 0 } as any
const pauseRequest = { duration: 600, cause: 0 } as any

/**
 * matter.js's base DeviceEnergyManagement server implements none of the
 * commands, so every one failed. The default server records each request.
 */
describe('defaultDeviceEnergyManagementServer', () => {
  let state: EnergyState
  let behavior: DefaultDeviceEnergyManagementServer

  beforeEach(() => {
    state = { esaState: Online }
    behavior = makeBehavior(DefaultDeviceEnergyManagementServer.prototype, state)
  })

  it('records a power adjustment and announces it', async () => {
    await behavior.powerAdjustRequest(powerAdjustRequest)

    expect(state.esaState).toBe(PowerAdjustActive)
    expect((behavior as any).events.powerAdjustStart.emit).toHaveBeenCalled()
  })

  it('ends a power adjustment and announces it', async () => {
    state.esaState = PowerAdjustActive

    await behavior.cancelPowerAdjustRequest()

    expect(state.esaState).toBe(Online)
    expect((behavior as any).events.powerAdjustEnd.emit).toHaveBeenCalledWith(expect.objectContaining({ cause: 4 }), expect.anything())
  })

  it('says why the power is being adjusted, and stops saying so when it ends', async () => {
    state.powerAdjustmentCapability = { powerAdjustCapability: [], cause: 0 }

    await behavior.powerAdjustRequest({ ...powerAdjustRequest, cause: 1 }) // GridOptimization
    expect(state.powerAdjustmentCapability.cause).toBe(2) // GridOptimizationAdjustment

    await behavior.cancelPowerAdjustRequest()
    expect(state.powerAdjustmentCapability.cause).toBe(0) // NoAdjustment
  })

  it('leaves a capability the device has not declared alone', async () => {
    state.powerAdjustmentCapability = null

    await behavior.powerAdjustRequest(powerAdjustRequest)

    expect(state.powerAdjustmentCapability).toBeNull()
  })

  it('does not announce the end of an adjustment that was not running', async () => {
    await behavior.cancelPowerAdjustRequest()

    expect((behavior as any).events.powerAdjustEnd.emit).not.toHaveBeenCalled()
  })

  it('pauses and resumes', async () => {
    await behavior.pauseRequest(pauseRequest)
    expect(state.esaState).toBe(Paused)
    expect((behavior as any).events.paused.emit).toHaveBeenCalled()

    await behavior.resumeRequest()
    expect(state.esaState).toBe(Online)
    expect((behavior as any).events.resumed.emit).toHaveBeenCalled()
  })

  it('cancels whichever adjustment is running', async () => {
    state.esaState = Paused

    await behavior.cancelRequest()

    expect(state.esaState).toBe(Online)
  })

  it('accepts the forecast commands without changing the state', async () => {
    await behavior.startTimeAdjustRequest({ requestedStartTime: 0, cause: 0 } as any)
    await behavior.modifyForecastRequest({ forecastId: 1, slotAdjustments: [], cause: 0 } as any)
    await behavior.requestConstraintBasedForecast({ constraints: [], cause: 0 } as any)

    expect(state.esaState).toBe(Online)
  })
})

describe('homebridgeDeviceEnergyManagementServer', () => {
  let registry: BehaviorRegistry
  let state: EnergyState
  let behavior: HomebridgeDeviceEnergyManagementServer
  const endpointId = 'test-endpoint-energy'

  beforeEach(() => {
    registry = {
      getHandler: vi.fn().mockReturnValue(vi.fn()),
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any
    state = { esaState: Online }
    const endpoint = { id: endpointId }
    const registryManager = new RegistryManager()
    setRegistryManager(endpoint, registryManager)
    registryManager.registerEndpoint(endpointId, registry)
    behavior = makeBehavior(HomebridgeDeviceEnergyManagementServer.prototype, state, { endpoint })
  })

  it('asks the plugin first, then records the adjustment', async () => {
    await behavior.powerAdjustRequest(powerAdjustRequest)

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'deviceEnergyManagement', 'powerAdjustRequest', powerAdjustRequest)
    expect(state.esaState).toBe(PowerAdjustActive)
    expect(registry.syncStateToCache).toHaveBeenCalledWith(endpointId, 'deviceEnergyManagement', { esaState: PowerAdjustActive })
  })

  it('leaves the state alone when the plugin refuses', async () => {
    registry.executeHandler = vi.fn().mockRejectedValue(new Error('battery is full'))

    await expect(behavior.powerAdjustRequest(powerAdjustRequest)).rejects.toThrow('Failed to adjust power: battery is full')
    expect(state.esaState).toBe(Online)
    expect(registry.syncStateToCache).not.toHaveBeenCalled()
  })

  it('still answers a command the plugin has no handler for', async () => {
    // Every handler is optional - a missing one used to fail the command
    registry.getHandler = vi.fn().mockReturnValue(undefined)

    await behavior.pauseRequest(pauseRequest)

    expect(registry.executeHandler).not.toHaveBeenCalled()
    expect(state.esaState).toBe(Paused)
  })
})

/**
 * The plugin must only hear about a mode the device lists - matter.js checks
 * the mode in its own changeToMode, which runs after the plugin's handler.
 */
describe('homebridgeDeviceEnergyManagementModeServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeDeviceEnergyManagementModeServer
  let state: { currentMode: number, supportedModes: { label: string, mode: number, modeTags: [] }[] }
  const endpointId = 'device-1'

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
    behavior = Object.create(HomebridgeDeviceEnergyManagementModeServer.prototype)
    for (const [key, value] of Object.entries({ endpoint, state })) {
      Object.defineProperty(behavior, key, {
        get: () => value,
        configurable: true,
      })
    }
  })

  it('asks the plugin first, then records a supported mode', async () => {
    const result = await behavior.changeToMode({ newMode: 1 })

    expect(mockRegistry.executeHandler).toHaveBeenCalledWith(endpointId, 'deviceEnergyManagementMode', 'changeToMode', { newMode: 1 })
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
