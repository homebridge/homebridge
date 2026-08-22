import type { InternalMatterAccessory, MatterAccessory } from '../types.js'
import type { AccessoryManagerDeps } from './AccessoryManager.js'

import { DescriptorServer, FixedLabelServer } from '@matter/main/behaviors'
import { PowerSourceServer } from '@matter/node/behaviors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../../logger.js'
import {
  applyElectricalMeasurementClusters,
  applyElectricalMeasurementDefaults,
  applyLevelControlLightingFloor,
  applyThermostatFeatures,
  applyWindowCoveringFeatures,
  detectBehaviorFeatures,
  detectElectricalMeasurementClusters,
  detectThermostatFeatures,
  detectWindowCoveringFeatures,
  determineColorControlFeaturesFromClusters,
  determineColorControlFeaturesFromHandlers,
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
    // Device types advertised through the descriptor, so tests can assert WHICH
    // type was added rather than only how many times act() ran.
    advertisedDeviceTypes: string[] = []
    act = vi.fn(async (fn: any) => fn({
      get: vi.fn(() => ({
        addDeviceTypes: vi.fn((name: string) => {
          this.advertisedDeviceTypes.push(name)
        }),
      })),
    }))

    constructor(deviceType: any, options: any) {
      this.deviceType = deviceType
      this.options = options
      this.id = options?.id
    }
  }
  return { Endpoint: MockEndpoint, VendorId: vi.fn((id: number) => id) }
})
vi.mock('@matter/main/behaviors', () => ({
  BasicInformationServer: { name: 'BasicInformationServer' },
  BridgedDeviceBasicInformationServer: {
    name: 'BridgedDeviceBasicInformationServer',
    enable: vi.fn(() => ({ name: 'BridgedDeviceBasicInformationServer.enable' })),
  },
  DescriptorServer: {
    name: 'DescriptorServer',
    with: vi.fn((...args: any[]) => ({ name: `DescriptorServer.with(${args.join(',')})` })),
  },
  FixedLabelServer: { name: 'FixedLabelServer' },
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
  detectThermostatFeatures: vi.fn(() => ['Heating']),
  applyThermostatFeatures: vi.fn((dt: any) => dt),
  detectElectricalMeasurementClusters: vi.fn(() => ({ hasPowerMeasurement: false, energyFeatures: [] })),
  applyElectricalMeasurementDefaults: vi.fn(),
  applyLevelControlLightingFloor: vi.fn(),
  applyElectricalMeasurementClusters: vi.fn((dt: any) => dt),
  detectBehaviorFeatures: vi.fn(() => null),
  extractColorControlFeatures: vi.fn(() => []),
  extractLevelControlFeatures: vi.fn(() => []),
  extractThermostatFeatures: vi.fn(() => []),
  extractDeclaredFeatures: vi.fn(() => []),
  determineColorControlFeaturesFromHandlers: vi.fn(() => []),
  determineColorControlFeaturesFromClusters: vi.fn(() => []),
  CLUSTER_IDS: {
    CLOSURE_CONTROL: 0x0104,
    COLOR_CONTROL: 0x0300,
    LEVEL_CONTROL: 0x0008,
    MEDIA_PLAYBACK: 0x0506,
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

// Composed (parts-bearing) accessories chain several `.with()` calls on the
// parent device type (BridgedDeviceBasicInformation, FixedLabel, PowerSource),
// so the mock must stay chainable at any depth.
function createChainableDeviceType(props: Record<string, unknown>): any {
  return { ...props, with: vi.fn(() => createChainableDeviceType(props)) }
}

// A parent device type whose `.with()` is a single self-returning spy, so a
// test can assert exactly which behaviors (FixedLabel, wired PowerSource) were
// composed onto it across the several chained `.with()` calls registerAccessory
// makes on the parent.
function createSpyDeviceType(props: Record<string, unknown>): any {
  const deviceType: any = { ...props }
  deviceType.with = vi.fn(() => deviceType)
  return deviceType
}

// A composed-device part: a plain device type plus a cluster, no handlers.
function createComposedPart(id = 'part-1'): any {
  return {
    id,
    displayName: `Part ${id}`,
    deviceType: createChainableDeviceType({ deviceType: 0x0100, name: 'OnOffLight' }),
    clusters: { onOff: { onOff: false } },
  }
}

function createMockAccessory(overrides: Partial<MatterAccessory> = {}): MatterAccessory {
  return {
    UUID: 'test-uuid-001',
    displayName: 'Test Light',
    deviceType: createChainableDeviceType({ deviceType: 0x0100, name: 'OnOffLight' }),
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

      // ⚠️ The cache stores a device type as {name, code} only, so composed
      // features do not survive it - a restore rebuilds the BASE type. A plugin
      // that used api.matter.deviceRequirements to compose the cluster itself
      // (say a thermostat that heats and cools but has no auto mode) hands back
      // a type whose name is identical, so a name-only shape check attached in
      // place and kept the restored endpoint - silently reverting to detected
      // features on every restart. Compare what is composed, not just the name.
      it('re-registers when the plugin composed a cluster the restored type lacks', async () => {
        const deps = createMockDeps()
        deps.accessories.set('test-uuid-001', {
          ...createMockAccessory({
            // what a restore rebuilds: deviceTypes.Thermostat, no thermostat behavior
            deviceType: createChainableDeviceType({ deviceType: 0x0301, name: 'Thermostat' }),
          }),
          endpoint: { marker: 'restored-endpoint', close: vi.fn() },
          registered: false,
          _restoredFromCache: true,
        } as any)

        const pluginAccessory = createMockAccessory({
          deviceType: createChainableDeviceType({
            deviceType: 0x0301,
            name: 'Thermostat',
            behaviors: { thermostat: {} },
          }),
        })

        await manager.registerAccessory('homebridge-test', 'TestPlatform', pluginAccessory, deps)

        const stored = deps.accessories.get('test-uuid-001') as any
        expect(stored.endpoint).not.toEqual({ marker: 'restored-endpoint', close: expect.anything() })
        expect(stored.registered).toBe(true)
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

  /**
   * ⚠️ Handlers are functions, so they are not cached. The cache restore synthesizes
   * empty stubs in their place, which meant ColorControl came back with no features
   * at all — and a persisted colorTemperatureMireds or currentHue then failed Matter's
   * conformance check ("Matter does not allow you to set this attribute"), taking the
   * whole accessory registration down on every single restart.
   */
  describe('colorControl features on a cache restore', () => {
    it('falls back to the cluster attributes when the handlers are empty stubs', async () => {
      vi.mocked(detectBehaviorFeatures).mockReturnValueOnce(['ColorTemperature'])
      vi.mocked(determineColorControlFeaturesFromHandlers).mockReturnValueOnce([])
      vi.mocked(determineColorControlFeaturesFromClusters).mockReturnValueOnce(['ColorTemperature'])

      const deps = createMockDeps()
      const accessory = createMockAccessory({
        // exactly what the restore builds: a stub per cached cluster, no logic names
        handlers: { colorControl: {} },
        clusters: { onOff: { onOff: false }, colorControl: { colorTemperatureMireds: 370 } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(determineColorControlFeaturesFromClusters).toHaveBeenCalledWith(accessory.clusters)
    })

    it('prefers the handlers when the plugin has supplied real ones', async () => {
      vi.mocked(detectBehaviorFeatures).mockReturnValueOnce(['ColorTemperature'])
      vi.mocked(determineColorControlFeaturesFromHandlers).mockReturnValueOnce(['ColorTemperature'])

      const deps = createMockDeps()
      const accessory = createMockAccessory({
        handlers: { colorControl: { moveToColorTemperatureLogic: vi.fn() } },
        clusters: { onOff: { onOff: false }, colorControl: { colorTemperatureMireds: 370 } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      // the handlers are the authority on what the plugin can actually do
      expect(determineColorControlFeaturesFromClusters).not.toHaveBeenCalled()
    })
  })

  describe('windowCovering composed by the plugin', () => {
    const wcClusters = {
      windowCovering: {
        currentPositionLiftPercent100ths: 0,
        targetPositionLiftPercent100ths: 0,
      },
    }

    it('still detects features for a plugin that did not compose the cluster', async () => {
      vi.mocked(detectWindowCoveringFeatures).mockReturnValueOnce(['Lift'])

      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: createChainableDeviceType({ deviceType: 0x0202, name: 'WindowCovering' }),
        clusters: wcClusters,
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(applyWindowCoveringFeatures).toHaveBeenCalled()
    })

    it('leaves the plugin\'s own composition alone', async () => {
      vi.mocked(detectWindowCoveringFeatures).mockReturnValueOnce(['Lift'])

      const deps = createMockDeps()
      const accessory = createMockAccessory({
        // what a plugin gets from deviceTypes.WindowCovering.with(
        //   deviceRequirements.WindowCovering.WindowCoveringServer.with('Lift'))
        deviceType: createChainableDeviceType({
          deviceType: 0x0202,
          name: 'WindowCovering',
          behaviors: { windowCovering: {} },
        }),
        clusters: wcClusters,
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(applyWindowCoveringFeatures).not.toHaveBeenCalled()
    })

    // ⚠️ The trap: applyWindowCoveringFeatures is also what sets this flag, and
    // the flag is what stops the behavior loop layering the custom
    // WindowCovering server (with NO features) over the plugin's composition.
    // Skipping the call without setting the flag moves the bug rather than
    // fixing it, so pin the flag, not just the skipped call.
    it('still marks the custom behavior as handled, so nothing is layered on top', async () => {
      vi.mocked(detectWindowCoveringFeatures).mockReturnValueOnce(['Lift'])

      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: createChainableDeviceType({
          deviceType: 0x0202,
          name: 'WindowCovering',
          behaviors: { windowCovering: {} },
        }),
        clusters: wcClusters,
        handlers: { windowCovering: { upOrOpenLogic: vi.fn() } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect((accessory.context as Record<string, unknown>)._skipWindowCoveringBehavior).toBe(true)
    })
  })

  describe('warning about a cluster with no custom behavior', () => {
    function warnings() {
      return vi.mocked(Logger.withPrefix('Matter/Server')).warn.mock.calls.map((call: any[]) => String(call[0]))
    }

    // The cache restore synthesizes an empty handler stub per cached cluster, because
    // functions cannot be cached. Warning on those meant complaining about clusters the
    // plugin never intended to handle - nine lines on a restart for a plugin that had
    // done nothing wrong.
    it('stays quiet for a cluster whose handlers are an empty stub', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        handlers: { smokeCoAlarm: {}, temperatureMeasurement: {} },
        clusters: { smokeCoAlarm: { smokeState: 0 }, temperatureMeasurement: { measuredValue: 2000 } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(warnings().filter(message => message.includes('No custom behavior class'))).toEqual([])
    })

    // Still worth saying when it is real: a handler that can never be routed is a gap.
    it('warns when the plugin really did supply a handler we cannot route', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        handlers: { smokeCoAlarm: { selfTestRequestLogic: vi.fn() } },
        clusters: { smokeCoAlarm: { smokeState: 0 } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(warnings().some(message => message.includes('smokeCoAlarm'))).toBe(true)
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

    /**
     * ⚠️ A battery is invisible to a controller unless the endpoint advertises
     * the PowerSource device type as well as carrying the cluster. Apple Home
     * showed no battery at all while every attribute was present and correct
     * (homebridge-sharkiq#88).
     */
    it('advertises the PowerSource device type for a declared battery', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        clusters: {
          onOff: { onOff: false },
          powerSource: { batPercentRemaining: 180, batChargeLevel: 0, batChargeState: 1 },
        },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.advertisedDeviceTypes).toContain('PowerSource')
    })

    it('advertises PowerSource for a non-battery power source too', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        clusters: { onOff: { onOff: false }, powerSource: { status: 1, order: 0, description: 'AC Power' } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.advertisedDeviceTypes).toContain('PowerSource')
    })

    it('does not advertise PowerSource when the accessory declares none', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.advertisedDeviceTypes).not.toContain('PowerSource')
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
      // The part runs through the parent's preparation pipeline as an
      // accessory-shaped view of itself. `clusters` must be the part's own
      // object, not a copy, or the defaults written here would be applied to
      // something that is then thrown away.
      const [target, detection] = vi.mocked(applyElectricalMeasurementDefaults).mock.calls[0]
      expect(target.displayName).toBe('Metered Outlet 1')
      expect(target.clusters).toBe(accessory.parts![0].clusters)
      expect(detection).toEqual(expect.objectContaining({ hasPowerMeasurement: true }))
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

      // Every battery composes Rechargeable, with batChargeState seeded, so a
      // device that starts reporting a charge state later is not rejected by
      // conformance (#3982)
      expect(PowerSourceServer.with).toHaveBeenCalledWith('Battery', 'Rechargeable')
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
      expect(PowerSourceServer.with).toHaveBeenCalledWith('Battery', 'Rechargeable')
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

    it('seeds batChargeState to Unknown for a battery that has not reported one yet (#3982)', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: { deviceType: 0x000A, name: 'DoorLock', with: vi.fn(() => ({ deviceType: 0x000A, with: vi.fn() })) } as any,
        clusters: {
          doorLock: { lockState: 1 },
          // asleep at startup: a battery, but no charge state reported yet
          powerSource: { batPercentRemaining: 180, batChargeLevel: 0 },
        },
        handlers: { doorLock: { lockDoor: vi.fn(), unlockDoor: vi.fn() } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      // The seed must reach the endpoint's registration-time state - the
      // Rechargeable feature's conformance requires the attribute to exist
      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.options.powerSource.batChargeState).toBe(0)
      // 0 = PowerSource.BatChargeState.Unknown; the device's first real report
      // replaces it through a normal state update instead of being rejected
    })

    it('keeps a plugin-reported batChargeState instead of overwriting it with the seed', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: { deviceType: 0x000A, name: 'DoorLock', with: vi.fn(() => ({ deviceType: 0x000A, with: vi.fn() })) } as any,
        clusters: {
          doorLock: { lockState: 1 },
          powerSource: { batPercentRemaining: 180, batChargeLevel: 0, batChargeState: 1 },
        },
        handlers: { doorLock: { lockDoor: vi.fn(), unlockDoor: vi.fn() } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.options.powerSource.batChargeState).toBe(1)
    })

    it('seeds batFunctionalWhileCharging, which Rechargeable also requires (#3982)', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: { deviceType: 0x000A, name: 'DoorLock', with: vi.fn(() => ({ deviceType: 0x000A, with: vi.fn() })) } as any,
        clusters: {
          doorLock: { lockState: 1 },
          powerSource: { batPercentRemaining: 180, batChargeLevel: 0 },
        },
        handlers: { doorLock: { lockDoor: vi.fn(), unlockDoor: vi.fn() } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      // matter.js defaults this to false, so registration would succeed without
      // it - seeding it keeps the feature and both required attributes together
      // rather than depending on that default
      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.options.powerSource.batFunctionalWhileCharging).toBe(false)
    })

    it('keeps a plugin-reported batFunctionalWhileCharging', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: { deviceType: 0x000A, name: 'DoorLock', with: vi.fn(() => ({ deviceType: 0x000A, with: vi.fn() })) } as any,
        clusters: {
          doorLock: { lockState: 1 },
          powerSource: { batPercentRemaining: 180, batFunctionalWhileCharging: true },
        },
        handlers: { doorLock: { lockDoor: vi.fn(), unlockDoor: vi.fn() } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.options.powerSource.batFunctionalWhileCharging).toBe(true)
    })

    it('composes Battery from static battery facts alone, before any reading arrives (#3982)', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: { deviceType: 0x000A, name: 'DoorLock', with: vi.fn(() => ({ deviceType: 0x000A, with: vi.fn() })) } as any,
        clusters: {
          doorLock: { lockState: 1 },
          // a sleeping device: the plugin knows the battery facts but has no
          // level or percentage yet. Gating on the live values would compose no
          // Battery feature, and the first real reading would then be rejected
          // for the life of the process - #3982 one level up.
          powerSource: { status: 0, order: 0, description: 'Battery', batReplaceability: 2, batPresent: true },
        },
        handlers: { doorLock: { lockDoor: vi.fn(), unlockDoor: vi.fn() } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(PowerSourceServer.with).toHaveBeenCalledWith('Battery', 'Rechargeable')
    })

    it('leaves a power source with no battery attributes as a plain PowerSource', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: { deviceType: 0x000A, name: 'DoorLock', with: vi.fn(() => ({ deviceType: 0x000A, with: vi.fn() })) } as any,
        clusters: {
          doorLock: { lockState: 1 },
          // indistinguishable from a wired source - do not guess a battery
          powerSource: { status: 0, order: 0, description: 'AC Power' },
        },
        handlers: { doorLock: { lockDoor: vi.fn(), unlockDoor: vi.fn() } },
      })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(PowerSourceServer.with).not.toHaveBeenCalled()
    })
  })

  describe('parts get the same preparation as their parent', () => {
    // Child endpoints used to run a cut-down pipeline that only looked up
    // behaviors by cluster name. Everything the parent's preparation decides
    // was skipped, silently: a composed battery was never exposed, a
    // thermostat part had no thermostat cluster at all, and a dimmable part
    // declaring minLevel 0 still failed to register.

    function partsAccessory(part: Record<string, unknown>) {
      return createMockAccessory({
        deviceType: createChainableDeviceType({ deviceType: 0x000E, name: 'Aggregator' }),
        clusters: {},
        parts: [{
          id: 'child-1',
          displayName: 'Child One',
          deviceType: createChainableDeviceType({ deviceType: 0x0101, name: 'DimmableLight' }),
          ...part,
        }],
      } as any)
    }

    it('composes a battery PowerSource declared on a part', async () => {
      const deps = createMockDeps()

      await manager.registerAccessory(
        'homebridge-test',
        'TestPlatform',
        partsAccessory({ clusters: { onOff: { onOff: false }, powerSource: { batPercentRemaining: 150 } } }),
        deps,
      )

      expect(PowerSourceServer.with).toHaveBeenCalledWith('Battery', 'Rechargeable')
    })

    it('advertises the PowerSource device type on the part endpoint', async () => {
      const deps = createMockDeps()

      await manager.registerAccessory(
        'homebridge-test',
        'TestPlatform',
        partsAccessory({ clusters: { onOff: { onOff: false }, powerSource: { batPercentRemaining: 150 } } }),
        deps,
      )

      // Composing the cluster is not enough - without the device type in the
      // descriptor no controller has a reason to read the battery.
      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal._parts[0].endpoint.advertisedDeviceTypes).toContain('PowerSource')
    })

    it('seeds the batChargeState of a part battery, as it does for the parent', async () => {
      const deps = createMockDeps()
      const accessory = partsAccessory({ clusters: { powerSource: { batPercentRemaining: 150 } } })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect((accessory.parts![0].clusters as any).powerSource.batChargeState).toBe(0)
    })

    it('adds the feature-gated Thermostat cluster to a thermostat part', async () => {
      const deps = createMockDeps()

      await manager.registerAccessory(
        'homebridge-test',
        'TestPlatform',
        partsAccessory({
          deviceType: createChainableDeviceType({ deviceType: 0x0301, name: 'Thermostat' }),
          clusters: { thermostat: { occupiedHeatingSetpoint: 2000 } },
        }),
        deps,
      )

      // matter.js gates the cluster behind features, so the base device type
      // carries none - skipping this dropped the part's thermostat entirely.
      expect(applyThermostatFeatures).toHaveBeenCalledTimes(1)
      expect(detectThermostatFeatures).toHaveBeenCalledTimes(1)
    })

    it('applies the LevelControl lighting floor to a part', async () => {
      const deps = createMockDeps()

      await manager.registerAccessory(
        'homebridge-test',
        'TestPlatform',
        partsAccessory({
          clusters: { levelControl: { currentLevel: 0, minLevel: 0 } },
          handlers: { levelControl: { moveToLevel: vi.fn() } },
        }),
        deps,
      )

      // Two calls: once for the parent, once for the part.
      expect(applyLevelControlLightingFloor).toHaveBeenCalledTimes(2)
    })
  })

  describe('composed parent (FixedLabel + wired PowerSource + tag list)', () => {
    // A parts-bearing (composed/BridgedNode) parent must carry a FixedLabel and,
    // unless the accessory declared its own PowerSource, a wired (AC) PowerSource
    // — Apple's controller needs both to finish per-accessory session setup.
    // Flat accessories get neither, and part endpoints carry a semantic tag list.

    it('a composed accessory gets a FixedLabel and a wired PowerSource on the parent', async () => {
      const deps = createMockDeps()
      const deviceType = createSpyDeviceType({ deviceType: 0x0100, name: 'OnOffLight' })
      const accessory = createMockAccessory({
        deviceType,
        parts: [createComposedPart()],
      } as any)

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      // FixedLabelServer is composed onto the parent device type...
      expect(deviceType.with).toHaveBeenCalledWith(FixedLabelServer)
      // ...and a wired PowerSource is synthesized.
      expect(PowerSourceServer.with).toHaveBeenCalledWith('Wired')

      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.options.fixedLabel).toEqual({
        labelList: [{ label: 'composed', value: 'true' }],
      })
      // wiredCurrentType 0 = AC.
      expect(internal.endpoint.options.powerSource.wiredCurrentType).toBe(0)
    })

    it('a composed accessory that declares its own PowerSource (battery) keeps it and gets no wired PowerSource', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: createSpyDeviceType({ deviceType: 0x0100, name: 'OnOffLight' }),
        clusters: {
          onOff: { onOff: false },
          powerSource: { batPercentRemaining: 200, batChargeLevel: 0 },
        },
        parts: [createComposedPart()],
      } as any)

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      // The plugin's battery PowerSource is composed...
      expect(PowerSourceServer.with).toHaveBeenCalledWith('Battery', 'Rechargeable')
      // ...and our wired PowerSource must never overwrite it.
      expect(PowerSourceServer.with).not.toHaveBeenCalledWith('Wired')
      const internal = deps.accessories.get('test-uuid-001') as any
      // The plugin's battery cluster state survives, untouched by a wired override.
      expect(internal.endpoint.options.powerSource.batPercentRemaining).toBe(200)
      expect(internal.endpoint.options.powerSource.wiredCurrentType).toBeUndefined()
    })

    it('a flat accessory (no parts) gets no FixedLabel or synthesized PowerSource', async () => {
      const deps = createMockDeps()
      const deviceType = createSpyDeviceType({ deviceType: 0x0100, name: 'OnOffLight' })
      const accessory = createMockAccessory({ deviceType })

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      expect(deviceType.with).not.toHaveBeenCalledWith(FixedLabelServer)
      expect(PowerSourceServer.with).not.toHaveBeenCalledWith('Wired')
      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal.endpoint.options.fixedLabel).toBeUndefined()
      expect(internal.endpoint.options.powerSource).toBeUndefined()
    })

    it('part endpoints carry a tag list', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({
        deviceType: createSpyDeviceType({ deviceType: 0x0100, name: 'OnOffLight' }),
        parts: [createComposedPart('outlet-1')],
      } as any)

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      // The part's Descriptor gains the TagList feature...
      expect(DescriptorServer.with).toHaveBeenCalledWith('TagList')
      // ...and the part endpoint carries a Number-namespace (7) tag per part index.
      const internal = deps.accessories.get('test-uuid-001') as any
      expect(internal._parts[0].endpoint.options.descriptor.tagList).toEqual([{
        mfgCode: null,
        namespaceId: 7,
        tag: 0,
        label: 'Part outlet-1',
      }])
    })
  })

  describe('bridged firmware version (BDBI software version)', () => {
    // The firmwareRevision every plugin already provides is surfaced to
    // controllers via BridgedDeviceBasicInformation, so e.g. Apple Home can
    // show the bridged device's firmware in the accessory details.

    it('maps firmwareRevision to softwareVersionString with a derived numeric softwareVersion', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({ firmwareRevision: '1.7.5-g9979d16' } as any)

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const bdbi = (deps.accessories.get('test-uuid-001') as any).endpoint.options.bridgedDeviceBasicInformation
      expect(bdbi.softwareVersionString).toBe('1.7.5-g9979d16')
      // (1 << 16) | (7 << 8) | 5
      expect(bdbi.softwareVersion).toBe(67333)
    })

    it('keeps the string but omits the numeric version when no semver triplet leads the string', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({ firmwareRevision: 'build-2026' } as any)

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const bdbi = (deps.accessories.get('test-uuid-001') as any).endpoint.options.bridgedDeviceBasicInformation
      expect(bdbi.softwareVersionString).toBe('build-2026')
      expect(bdbi.softwareVersion).toBeUndefined()
    })

    it('encodes a large major that still fits 16 bits as an unsigned value', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({ firmwareRevision: '40000.0.0' } as any)

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const bdbi = (deps.accessories.get('test-uuid-001') as any).endpoint.options.bridgedDeviceBasicInformation
      expect(bdbi.softwareVersionString).toBe('40000.0.0')
      // 40000 sets the sign bit under a plain 32-bit shift; the value must stay unsigned
      expect(bdbi.softwareVersion).toBe(40000 * 0x10000)
    })

    it('omits the numeric version when the major does not fit 16 bits', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({ firmwareRevision: '70000.0.0' } as any)

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const bdbi = (deps.accessories.get('test-uuid-001') as any).endpoint.options.bridgedDeviceBasicInformation
      expect(bdbi.softwareVersionString).toBe('70000.0.0')
      expect(bdbi.softwareVersion).toBeUndefined()
    })

    it('omits the numeric version when minor or patch exceeds 255', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory({ firmwareRevision: '1.7.300' } as any)

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const bdbi = (deps.accessories.get('test-uuid-001') as any).endpoint.options.bridgedDeviceBasicInformation
      expect(bdbi.softwareVersionString).toBe('1.7.300')
      expect(bdbi.softwareVersion).toBeUndefined()
    })

    it('truncates softwareVersionString to the 64-character spec limit', async () => {
      const deps = createMockDeps()
      const longRevision = `1.2.3+${'a'.repeat(80)}`
      const accessory = createMockAccessory({ firmwareRevision: longRevision } as any)

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const bdbi = (deps.accessories.get('test-uuid-001') as any).endpoint.options.bridgedDeviceBasicInformation
      expect(bdbi.softwareVersionString).toBe(longRevision.slice(0, 64))
      expect(bdbi.softwareVersionString).toHaveLength(64)
      expect(bdbi.softwareVersion).toBe((1 << 16) | (2 << 8) | 3)
    })

    it('sets neither field when the accessory has no firmwareRevision', async () => {
      const deps = createMockDeps()
      const accessory = createMockAccessory()

      await manager.registerAccessory('homebridge-test', 'TestPlatform', accessory, deps)

      const bdbi = (deps.accessories.get('test-uuid-001') as any).endpoint.options.bridgedDeviceBasicInformation
      expect(bdbi.softwareVersionString).toBeUndefined()
      expect(bdbi.softwareVersion).toBeUndefined()
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
