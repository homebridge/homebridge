import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { ModeBase } from '@matter/main/clusters'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import {
  DefaultEnergyEvseServer,
  HomebridgeEnergyEvseModeServer,
  HomebridgeEnergyEvseServer,
} from './EnergyEvseBehavior.js'
import { RegistryManager } from './RegistryManager.js'

interface ChargerState {
  supplyState: number
  chargingEnabledUntil: number | null
  minimumChargeCurrent: number
  maximumChargeCurrent: number
  dischargingEnabledUntil?: number | null
  maximumDischargeCurrent?: number
}

const Disabled = 0
const ChargingEnabled = 1
const DischargingEnabled = 2
const DisabledDiagnostics = 4
const Enabled = 5

function makeBehavior<T>(prototype: object, state: ChargerState, extras: Record<string, unknown> = {}): T {
  const behavior = Object.create(prototype)
  const values: Record<string, unknown> = {
    state,
    features: { v2X: 'maximumDischargeCurrent' in state },
    endpoint: {},
    ...extras,
  }
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(behavior, key, {
      get: () => value,
      configurable: true,
    })
  }
  return behavior as T
}

const enableChargingRequest = { chargingEnabledUntil: null, minimumChargeCurrent: 6000, maximumChargeCurrent: 16000 } as any

/**
 * matter.js's base EnergyEvse server implements none of the commands - not even
 * Disable and EnableCharging, which every charger must support. The default
 * server records each command in the charger's state.
 */
describe('defaultEnergyEvseServer', () => {
  let state: ChargerState
  let behavior: DefaultEnergyEvseServer

  beforeEach(() => {
    state = {
      supplyState: Disabled,
      chargingEnabledUntil: null,
      minimumChargeCurrent: 0,
      maximumChargeCurrent: 0,
    }
    behavior = makeBehavior(DefaultEnergyEvseServer.prototype, state)
  })

  it('enables charging with the currents asked for', async () => {
    await behavior.enableCharging(enableChargingRequest)

    expect(state.supplyState).toBe(ChargingEnabled)
    expect(state.minimumChargeCurrent).toBe(6000)
    expect(state.maximumChargeCurrent).toBe(16000)
  })

  it('disables charging until now, which matter.js accepts where it refuses 0', async () => {
    await behavior.enableCharging(enableChargingRequest)
    const before = Math.floor(Date.now() / 1000)

    await behavior.disable()

    expect(state.supplyState).toBe(Disabled)
    expect(state.maximumChargeCurrent).toBe(0)
    expect(state.chargingEnabledUntil).toBeGreaterThanOrEqual(before)
  })

  it('allows both directions once a bidirectional charger is enabled both ways', async () => {
    state.dischargingEnabledUntil = null
    state.maximumDischargeCurrent = 0
    behavior = makeBehavior(DefaultEnergyEvseServer.prototype, state)

    await behavior.enableDischarging({ dischargingEnabledUntil: null, maximumDischargeCurrent: 10000 } as any)
    expect(state.supplyState).toBe(DischargingEnabled)

    await behavior.enableCharging(enableChargingRequest)
    expect(state.supplyState).toBe(Enabled)
  })

  it('only starts diagnostics on a disabled charger', async () => {
    await behavior.startDiagnostics()
    expect(state.supplyState).toBe(DisabledDiagnostics)

    state.supplyState = ChargingEnabled
    await expect(behavior.startDiagnostics()).rejects.toThrow('only start when the charger is disabled')
  })

  it('gives back the charging targets it was set, until they are cleared', async () => {
    const schedules = [
      {
        dayOfWeekForSequence: { monday: true },
        chargingTargets: [
          { targetTimeMinutesPastMidnight: 420, targetSoC: 80 },
        ],
      },
    ]

    expect(await behavior.getTargets()).toEqual({ chargingTargetSchedules: [] })
    await behavior.setTargets({ chargingTargetSchedules: schedules } as any)
    expect(await behavior.getTargets()).toEqual({ chargingTargetSchedules: schedules })
    await behavior.clearTargets()
    expect(await behavior.getTargets()).toEqual({ chargingTargetSchedules: [] })
  })
})

describe('homebridgeEnergyEvseServer', () => {
  let registry: BehaviorRegistry
  let state: ChargerState
  let behavior: HomebridgeEnergyEvseServer
  const endpointId = 'test-endpoint-charger'

  beforeEach(() => {
    registry = {
      getHandler: vi.fn().mockReturnValue(vi.fn()),
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any
    state = {
      supplyState: Disabled,
      chargingEnabledUntil: null,
      minimumChargeCurrent: 0,
      maximumChargeCurrent: 0,
    }
    const endpoint = { id: endpointId }
    const registryManager = new RegistryManager()
    setRegistryManager(endpoint, registryManager)
    registryManager.registerEndpoint(endpointId, registry)
    behavior = makeBehavior(HomebridgeEnergyEvseServer.prototype, state, { endpoint })
  })

  it('asks the plugin first, then records the command', async () => {
    await behavior.enableCharging(enableChargingRequest)

    expect(registry.executeHandler).toHaveBeenCalledWith(endpointId, 'energyEvse', 'enableCharging', enableChargingRequest)
    expect(state.supplyState).toBe(ChargingEnabled)
    expect(registry.syncStateToCache).toHaveBeenCalledWith(endpointId, 'energyEvse', expect.objectContaining({ supplyState: ChargingEnabled, maximumChargeCurrent: 16000 }))
  })

  it('leaves the state alone when the plugin refuses', async () => {
    registry.executeHandler = vi.fn().mockRejectedValue(new Error('no car'))

    await expect(behavior.enableCharging(enableChargingRequest)).rejects.toThrow('Failed to enable charging: no car')
    expect(state.supplyState).toBe(Disabled)
    expect(registry.syncStateToCache).not.toHaveBeenCalled()
  })

  it('still answers a command the plugin has no handler for', async () => {
    registry.getHandler = vi.fn().mockReturnValue(undefined)
    state.supplyState = ChargingEnabled

    await behavior.disable()

    expect(registry.executeHandler).not.toHaveBeenCalled()
    expect(state.supplyState).toBe(Disabled)
  })
})

/**
 * The plugin must only hear about a mode the device lists - matter.js checks
 * the mode in its own changeToMode, which runs after the plugin's handler.
 */
describe('homebridgeEnergyEvseModeServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeEnergyEvseModeServer
  let state: { currentMode: number, supportedModes: { label: string, mode: number, modeTags: [] }[] }
  const endpointId = 'charger-1'

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
    behavior = Object.create(HomebridgeEnergyEvseModeServer.prototype)
    for (const [key, value] of Object.entries({ endpoint, state })) {
      Object.defineProperty(behavior, key, {
        get: () => value,
        configurable: true,
      })
    }
  })

  it('asks the plugin first, then records a supported mode', async () => {
    const result = await behavior.changeToMode({ newMode: 1 })

    expect(mockRegistry.executeHandler).toHaveBeenCalledWith(endpointId, 'energyEvseMode', 'changeToMode', { newMode: 1 })
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
