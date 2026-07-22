import type { InternalMatterAccessory, MatterAccessory } from '../types.js'
import type { AccessoryManagerDeps } from './AccessoryManager.js'

import { PowerSourceServer } from '@matter/node/behaviors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyElectricalMeasurementClusters,
  applyElectricalMeasurementDefaults,
  detectElectricalMeasurementClusters,
} from '../serverHelpers.js'
import { AccessoryManager } from './AccessoryManager.js'

// Mock all heavy dependencies
vi.mock('@matter/main', () => {
  class MockEndpoint {
    deviceType: any
    options: any
    id: string | undefined
    close = vi.fn()
    add = vi.fn()
    act = vi.fn(async (fn: any) => fn({ get: vi.fn(() => ({ addDeviceTypes: vi.fn() })) }))
    constructor(deviceType: any, options: any) {
      this.deviceType = deviceType
      this.options = options
      this.id = options?.id
    }
  }
  return { Endpoint: MockEndpoint }
})
vi.mock('@matter/main/behaviors', () => ({
  BasicInformationServer: { name: 'BasicInformationServer' },
  BridgedDeviceBasicInformationServer: { name: 'BridgedDeviceBasicInformationServer' },
  DescriptorServer: { name: 'DescriptorServer' },
}))
vi.mock('@matter/node/behaviors', () => ({
  PowerSourceServer: { name: 'PowerSourceServer', with: vi.fn((...args: any[]) => ({ name: `PowerSourceServer.with(${args.join(',')})` })) },
}))
vi.mock('../behaviors/EndpointContext.js', () => ({
  setRegistryManager: vi.fn(),
}))
vi.mock('../behaviors/RvcCleanModeBehavior.js', () => ({
  HomebridgeRvcCleanModeServer: { name: 'HomebridgeRvcCleanModeServer' },
}))
vi.mock('../behaviors/ServiceAreaBehavior.js', () => ({
  HomebridgeServiceAreaServer: {
    name: 'HomebridgeServiceAreaServer',
    with: vi.fn((...args: any[]) => ({ name: `HomebridgeServiceAreaServer.with(${args.join(',')})` })),
  },
}))
vi.mock('../serverHelpers.js', () => ({
  validateAccessoryRequiredFields: vi.fn(),
  detectWindowCoveringFeatures: vi.fn(() => []),
  applyWindowCoveringFeatures: vi.fn((dt: any) => dt),
  detectSmokeCoAlarmFeatures: vi.fn(() => ['SmokeAlarm']),
  applySmokeCoAlarmFeatures: vi.fn((dt: any) => dt),
  detectElectricalMeasurementClusters: vi.fn(() => ({ hasPowerMeasurement: false, energyFeatures: [] })),
  applyElectricalMeasurementDefaults: vi.fn(),
  applyLevelControlLightingFloor: vi.fn(),
  applyElectricalMeasurementClusters: vi.fn((dt: any) => dt),
  detectBehaviorFeatures: vi.fn(() => null),
  extractColorControlFeatures: vi.fn(() => []),
  extractLevelControlFeatures: vi.fn(() => []),
  extractThermostatFeatures: vi.fn(() => []),
  determineColorControlFeaturesFromHandlers: vi.fn(() => []),
  CLUSTER_IDS: {
    COLOR_CONTROL: 0x0300,
    LEVEL_CONTROL: 0x0008,
    THERMOSTAT: 0x0201,
  },
}))
vi.mock('../types.js', () => {
  class MatterDeviceError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'MatterDeviceError'
    }
  }
  return {
    MatterDeviceError,
    devices: {
      RoboticVacuumCleanerDevice: { deviceType: 0x0074 },
      SmokeCoAlarmDevice: { deviceType: 0x0076 },
      ThermostatDevice: { deviceType: 0x0301 },
      ElectricalSensorEndpoint: { deviceType: 0x0510 },
      RoboticVacuumCleanerRequirements: {
        RvcCleanModeServer: { name: 'RvcCleanModeServer' },
        ServiceAreaServer: {
          name: 'ServiceAreaServer',
          with: vi.fn((...args: any[]) => ({ name: `ServiceAreaServer.with(${args.join(',')})` })),
        },
      },
    },
  }
})
vi.mock('./BehaviorMap.js', () => ({
  CORE_CLUSTER_BEHAVIOR_MAP: {
    onOff: { name: 'HomebridgeOnOffServer' },
    levelControl: {
      name: 'HomebridgeLevelControlServer',
      with: vi.fn((...args: any[]) => ({ name: `HomebridgeLevelControlServer.with(${args.join(',')})` })),
    },
    colorControl: {
      name: 'HomebridgeColorControlServer',
      with: vi.fn((...args: any[]) => ({ name: `HomebridgeColorControlServer.with(${args.join(',')})` })),
    },
    thermostat: {
      name: 'HomebridgeThermostatServer',
      with: vi.fn((...args: any[]) => ({ name: `HomebridgeThermostatServer.with(${args.join(',')})` })),
    },
    windowCovering: {
      name: 'HomebridgeWindowCoveringServer',
      with: vi.fn((...args: any[]) => ({ name: `HomebridgeWindowCoveringServer.with(${args.join(',')})` })),
    },
    doorLock: { name: 'HomebridgeDoorLockServer' },
    fanControl: { name: 'HomebridgeFanControlServer' },
    identify: { name: 'HomebridgeIdentifyServer' },
    rvcOperationalState: { name: 'HomebridgeRvcOperationalStateServer' },
    rvcRunMode: { name: 'HomebridgeRvcRunModeServer' },
  },
}))
vi.mock('../../logger.js', () => {
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }
  return { Logger: { withPrefix: vi.fn(() => mockLogger) } }
})
vi.mock('../../ipcService.js', () => ({
  IpcOutgoingEvent: { MATTER_EVENT: 'matterEvent' },
}))

function createMockDeps(overrides: Partial<AccessoryManagerDeps> = {}): AccessoryManagerDeps {
  const mockServerNode = {
    add: vi.fn(),
    act: vi.fn(async (fn: any) => fn({ get: vi.fn(() => ({ increaseConfigurationVersion: vi.fn() })) })),
  }
  const mockAggregator = {
    add: vi.fn(),
    set: vi.fn(),
    state: { descriptor: { partsList: [] } },
  }

  return {
    config: {
      uniqueId: 'test-bridge',
      port: 5540,
      externalAccessory: false,
      debugModeEnabled: false,
    },
    accessories: new Map<string, InternalMatterAccessory>(),
    behaviorRegistry: {
      registerHandler: vi.fn(),
      registerPartEndpoint: vi.fn(),
      removeEndpoint: vi.fn((endpointId: string) => [endpointId]),
    } as any,
    registryManager: {
      registerEndpoint: vi.fn(),
      unregisterEndpoint: vi.fn(),
    } as any,
    accessoryCache: null,
    getServerNode: () => mockServerNode as any,
    getAggregator: () => mockAggregator as any,
    getIsRunning: () => true,
    getMonitoringEnabled: () => false,
    isCommissioned: () => false,
    ...overrides,
  }
}

function createMockAccessory(overrides: Partial<MatterAccessory> = {}): MatterAccessory {
  return {
    UUID: 'test-uuid-001',
    displayName: 'Test Light',
    deviceType: { deviceType: 0x0100, name: 'OnOffLight', with: vi.fn(() => ({ deviceType: 0x0100, with: vi.fn() })) } as any,
    serialNumber: 'SN-001',
    manufacturer: 'Test Mfg',
    model: 'Test Model',
    context: {},
    clusters: {
      onOff: { onOff: false },
    },
    ...overrides,
  }
}

describe('accessoryManager', () => {
  let manager: AccessoryManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new AccessoryManager()
  })

  describe('registerAccessory', () => {
    it('should register an accessory successfully', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(deps.accessories.size).toBe(1)
      expect(deps.accessories.has('test-uuid-001')).toBe(true)
    })

    it('should bump the bridge configuration version when commissioned', async () => {
      const increaseConfigurationVersion = vi.fn()
      const deps = createMockDeps({ isCommissioned: () => true })
      const serverNode = deps.getServerNode() as any
      serverNode.act = vi.fn(async (fn: any) => fn({ get: vi.fn(() => ({ increaseConfigurationVersion })) }))
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(increaseConfigurationVersion).toHaveBeenCalledTimes(1)
    })

    it('should not bump the configuration version before commissioning', async () => {
      const deps = createMockDeps()
      const serverNode = deps.getServerNode() as any
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(serverNode.act).not.toHaveBeenCalled()
    })

    it('retries the parts-list notification when the config-version bump hits a synchronous lock (#3970)', async () => {
      const increaseConfigurationVersion = vi.fn()
      const deps = createMockDeps({ isCommissioned: () => true })
      const serverNode = deps.getServerNode() as any
      // First act() loses the lock race (matter.js-internal offline transaction),
      // then the lock clears and it succeeds.
      serverNode.act = vi.fn()
        .mockRejectedValueOnce(new Error('Cannot lock test-bridge.basicInformation.state synchronously'))
        .mockImplementation(async (fn: any) => fn({ get: vi.fn(() => ({ increaseConfigurationVersion })) }))
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(serverNode.act).toHaveBeenCalledTimes(2)
      expect(increaseConfigurationVersion).toHaveBeenCalledTimes(1)
    })

    it('gives up without throwing when the lock never clears (#3970)', async () => {
      const deps = createMockDeps({ isCommissioned: () => true })
      const serverNode = deps.getServerNode() as any
      serverNode.act = vi.fn().mockRejectedValue(
        new Error('Cannot lock test-bridge.basicInformation.state synchronously'),
      )
      const accessory = createMockAccessory()

      // The failure must be swallowed — a dropped notification must never fail
      // the accessory registration.
      await expect(
        manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps),
      ).resolves.toBeUndefined()

      // PARTS_LIST_NOTIFY_ATTEMPTS = 5.
      expect(serverNode.act).toHaveBeenCalledTimes(5)
      expect(deps.accessories.has('test-uuid-001')).toBe(true)
    })

    it('does not retry a non-lock notification error (#3970)', async () => {
      const deps = createMockDeps({ isCommissioned: () => true })
      const serverNode = deps.getServerNode() as any
      serverNode.act = vi.fn().mockRejectedValue(new Error('some other failure'))
      const accessory = createMockAccessory()

      await expect(
        manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps),
      ).resolves.toBeUndefined()

      expect(serverNode.act).toHaveBeenCalledTimes(1)
    })

    it('should reject duplicate UUIDs', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory()

      // Register first accessory
      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      // Attempt to register again with same UUID
      await expect(
        manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps),
      ).rejects.toThrow('already registered')
    })

    // Cache-restored accessories are rebuilt into the bridge before going online
    // (#3969). When the plugin later re-registers the same UUID it must attach to
    // the existing endpoint in place (no parts-list churn) rather than hitting the
    // duplicate-UUID error, and a genuine structural change must re-register fresh.
    describe('cache-restored attach-in-place (#3969)', () => {
      it('attaches a plugin registration to a restored accessory in place when the shape is unchanged', async () => {
        const deps = createMockDeps()
        const restored = {
          ...createMockAccessory(),
          endpoint: { marker: 'restored-endpoint' },
          registered: false,
          _restoredFromCache: true,
        } as any
        deps.accessories.set('test-uuid-001', restored)

        // Same UUID, same device type, now carrying the plugin's real handlers.
        const pluginAccessory = createMockAccessory({
          handlers: { onOff: { on: vi.fn(), off: vi.fn() } },
        } as any)

        await manager.registerAccessory('homebridge-test', 'TestPlatform', pluginAccessory, deps)

        const stored = deps.accessories.get('test-uuid-001') as any
        expect(stored.registered).toBe(true)
        expect(stored._restoredFromCache).toBe(false)
        // Kept the endpoint built during restore — no new endpoint, no parts-list churn.
        expect(stored.endpoint).toEqual({ marker: 'restored-endpoint' })
        expect(deps.accessories.size).toBe(1)
        // The plugin's handlers were wired to the existing endpoint.
        expect(deps.behaviorRegistry.registerHandler).toHaveBeenCalledWith('test-uuid-001', 'onOff', 'on', expect.any(Function))
      })

      it('does not throw the duplicate-UUID error for a restored accessory', async () => {
        const deps = createMockDeps()
        deps.accessories.set('test-uuid-001', {
          ...createMockAccessory(),
          endpoint: { close: vi.fn() },
          registered: false,
          _restoredFromCache: true,
        } as any)

        await expect(
          manager.registerAccessory('homebridge-test', 'TestPlatform', createMockAccessory(), deps),
        ).resolves.toBeUndefined()
      })

      it('re-registers fresh when a restored accessory changed device type', async () => {
        const deps = createMockDeps()
        const restored = {
          ...createMockAccessory(),
          deviceType: { deviceType: 0x000A, name: 'DoorLock', with: vi.fn(() => ({ deviceType: 0x000A, with: vi.fn() })) },
          endpoint: { close: vi.fn() },
          registered: false,
          _restoredFromCache: true,
        } as any
        deps.accessories.set('test-uuid-001', restored)
        const unregisterSpy = vi.spyOn(manager, 'unregisterAccessory')

        // Plugin registers the same UUID but as a different device type.
        await manager.registerAccessory('homebridge-test', 'TestPlatform', createMockAccessory(), deps)

        expect(unregisterSpy).toHaveBeenCalledWith('test-uuid-001', deps)
        const stored = deps.accessories.get('test-uuid-001') as any
        expect(stored).toBeDefined()
        expect((stored.deviceType as any).name).toBe('OnOffLight')
        expect(stored._restoredFromCache).toBeFalsy()
      })
    })

    it('should throw when server is not started', async () => {
      const deps = createMockDeps({
        getServerNode: () => null,
      })
      const accessory = createMockAccessory()

      await expect(
        manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps),
      ).rejects.toThrow('not started')
    })

    it('should throw when device limit is reached', async () => {
      const accessories = new Map<string, InternalMatterAccessory>()
      // Fill up to max capacity
      for (let i = 0; i < 1000; i++) {
        accessories.set(`uuid-${i}`, { UUID: `uuid-${i}` } as any)
      }

      const deps = createMockDeps({ accessories })
      const accessory = createMockAccessory({ UUID: 'uuid-overflow' })

      await expect(
        manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps),
      ).rejects.toThrow('Maximum device limit')
    })

    it('should register handlers when provided', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        handlers: {
          onOff: {
            on: vi.fn(),
            off: vi.fn(),
          },
        },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(deps.registryManager.registerEndpoint).toHaveBeenCalledWith('test-uuid-001', deps.behaviorRegistry)
      expect(deps.behaviorRegistry.registerHandler).toHaveBeenCalledWith('test-uuid-001', 'onOff', 'on', expect.any(Function))
      expect(deps.behaviorRegistry.registerHandler).toHaveBeenCalledWith('test-uuid-001', 'onOff', 'off', expect.any(Function))
    })

    it('should save to cache after registration', async () => {
      const mockCache = {
        requestSave: vi.fn(),
        hasCached: vi.fn(() => false),
        getCached: vi.fn(),
      }
      const deps = createMockDeps({ accessoryCache: mockCache as any })
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(mockCache.requestSave).toHaveBeenCalled()
    })

    it('should restore cached state before registration', async () => {
      const cachedData = {
        clusters: {
          onOff: { onOff: true }, // cached as "on"
        },
        context: { savedKey: 'savedValue' },
      }
      const mockCache = {
        hasCached: vi.fn(() => true),
        getCached: vi.fn(() => cachedData),
        requestSave: vi.fn(),
      }
      const deps = createMockDeps({ accessoryCache: mockCache as any })
      const accessory = createMockAccessory({
        clusters: { onOff: { onOff: false } }, // plugin says "off"
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      // Cached state should have been merged (cache overrides plugin defaults)
      expect(accessory.clusters!.onOff!.onOff).toBe(true)
      expect(accessory.context).toEqual({ savedKey: 'savedValue' })
    })
  })

  describe('electrical measurement registration', () => {
    it('applies defaults, behaviors and the descriptor device type when electrical clusters are detected', async () => {
      vi.mocked(detectElectricalMeasurementClusters).mockReturnValueOnce({
        hasPowerMeasurement: true,
        energyFeatures: ['ImportedEnergy', 'CumulativeEnergy'],
      })
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        clusters: { onOff: { onOff: false }, electricalPowerMeasurement: { activePower: 0 } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(applyElectricalMeasurementDefaults).toHaveBeenCalledWith(
        accessory,
        expect.objectContaining({ hasPowerMeasurement: true }),
      )
      expect(applyElectricalMeasurementClusters).toHaveBeenCalled()
      // The ElectricalSensor device type is advertised through the descriptor
      // after the endpoint joins the node.
      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.act).toHaveBeenCalledTimes(1)
    })

    it('runs electrical detection for composed-device parts too', async () => {
      // First call = main accessory (nothing), second call = the part (power)
      vi.mocked(detectElectricalMeasurementClusters)
        .mockReturnValueOnce({ hasPowerMeasurement: false, energyFeatures: [] })
        .mockReturnValueOnce({ hasPowerMeasurement: true, energyFeatures: [] })
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        parts: [{
          id: 'outlet-1',
          displayName: 'Metered Outlet 1',
          deviceType: { deviceType: 0x010A, with: vi.fn(() => ({ deviceType: 0x010A, with: vi.fn() })) } as any,
          clusters: { onOff: { onOff: false }, electricalPowerMeasurement: { activePower: 0 } },
        }],
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(applyElectricalMeasurementDefaults).toHaveBeenCalledTimes(1)
      expect(applyElectricalMeasurementDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'outlet-1' }),
        expect.objectContaining({ hasPowerMeasurement: true }),
      )
      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.act).not.toHaveBeenCalled() // main endpoint unaffected
      expect(internal._parts[0].endpoint.act).toHaveBeenCalledTimes(1) // part advertises 0x0510
    })

    it('skips electrical wiring when no electrical clusters are declared', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(applyElectricalMeasurementDefaults).not.toHaveBeenCalled()
      expect(applyElectricalMeasurementClusters).not.toHaveBeenCalled()
      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.act).not.toHaveBeenCalled()
    })
  })

  describe('powerSource (battery) composition', () => {
    // A battery cluster must compose for any device type, not just
    // RoboticVacuumCleaner, and — since it is read-only — even for accessories
    // that declare no handlers at all (sensors).

    it('composes PowerSource for a non-RVC device type that has handlers (e.g. a lock)', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: { deviceType: 0x000A, name: 'DoorLock', with: vi.fn(() => ({ deviceType: 0x000A, with: vi.fn() })) } as any,
        clusters: {
          doorLock: { lockState: 1 },
          powerSource: { batPercentRemaining: 200, batChargeLevel: 0 },
        },
        handlers: { doorLock: { lockDoor: vi.fn(), unlockDoor: vi.fn() } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(PowerSourceServer.with).toHaveBeenCalledWith('Battery')
    })

    it('composes PowerSource for a non-RVC device with no handlers (e.g. a battery-powered sensor)', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: { deviceType: 0x0015, name: 'ContactSensor', with: vi.fn(() => ({ deviceType: 0x0015, with: vi.fn() })) } as any,
        clusters: {
          // read-only sensor: a battery, and no handlers at all
          powerSource: { batPercentRemaining: 200, batChargeLevel: 0 },
        },
      })
      delete (accessory as any).handlers

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      // Regression guard for the no-handlers early return: without the fix this
      // accessory bails before the battery is ever composed.
      expect(PowerSourceServer.with).toHaveBeenCalledWith('Battery')
    })

    it('composes the Rechargeable feature when a charge state is declared', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: { deviceType: 0x000A, name: 'DoorLock', with: vi.fn(() => ({ deviceType: 0x000A, with: vi.fn() })) } as any,
        clusters: {
          doorLock: { lockState: 1 },
          powerSource: { batPercentRemaining: 200, batChargeLevel: 0, batChargeState: 0 },
        },
        handlers: { doorLock: { lockDoor: vi.fn(), unlockDoor: vi.fn() } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(PowerSourceServer.with).toHaveBeenCalledWith('Battery', 'Rechargeable')
    })
  })

  describe('unregisterAccessory', () => {
    it('should remove an accessory from the map', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory()

      // Register first
      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)
      expect(deps.accessories.size).toBe(1)

      // Unregister
      await manager.unregisterAccessory('test-uuid-001', deps)
      expect(deps.accessories.size).toBe(0)
    })

    it('should bump the bridge configuration version when commissioned', async () => {
      const increaseConfigurationVersion = vi.fn()
      const deps = createMockDeps({ isCommissioned: () => true })
      const serverNode = deps.getServerNode() as any
      serverNode.act = vi.fn(async (fn: any) => fn({ get: vi.fn(() => ({ increaseConfigurationVersion })) }))
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)
      await manager.unregisterAccessory('test-uuid-001', deps)

      // once for register, once for unregister
      expect(increaseConfigurationVersion).toHaveBeenCalledTimes(2)
    })

    it('should handle unregistering a non-existent accessory gracefully', async () => {
      const deps = createMockDeps()

      // Should not throw
      await expect(manager.unregisterAccessory('non-existent', deps)).resolves.not.toThrow()
    })

    it('should close the endpoint when unregistering', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const registered = deps.accessories.get('test-uuid-001')!
      const closeSpy = vi.fn()
      registered.endpoint = { close: closeSpy } as any

      await manager.unregisterAccessory('test-uuid-001', deps)

      expect(closeSpy).toHaveBeenCalled()
    })

    it('should remove from cache when unregistering', async () => {
      const mockCache = {
        hasCached: vi.fn(() => false),
        getCached: vi.fn(),
        removeCached: vi.fn(),
        requestSave: vi.fn(),
      }
      const deps = createMockDeps({ accessoryCache: mockCache as any })
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)
      await manager.unregisterAccessory('test-uuid-001', deps)

      expect(mockCache.removeCached).toHaveBeenCalledWith('test-uuid-001')
      // requestSave called twice: once for register, once for unregister
      expect(mockCache.requestSave).toHaveBeenCalledTimes(2)
    })
  })
})
