import type { AccessoryPlugin, DynamicPlatformPlugin } from './api.js'
import type { MatterAccessory } from './matter/index.js'

import { Service } from '@homebridge/hap-nodejs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI, InternalAPIEvent } from './api.js'

const api = new HomebridgeAPI()
const emitSpy = vi.spyOn(api, 'emit')

class ExampleAccessory implements AccessoryPlugin {
  getServices(): Service[] {
    return [new Service.Switch('TestSwitch')]
  }
}

class ExamplePlatform implements DynamicPlatformPlugin {
  configureAccessory(): void {
    // do nothing
  }
}

const pluginName = 'homebridge-example'
const accessoryName = 'MyCoolAccessory'
const platformName = 'MyCoolPlatform'

describe('homebridgeAPI', () => {
  describe('homebridgeAPI.prototype.registerAccessory', () => {
    it('should register accessory with legacy style signature', () => {
      api.registerAccessory(pluginName, accessoryName, ExampleAccessory)
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, ExampleAccessory, pluginName)
    })

    it('should register accessory without passing plugin name', () => {
      api.registerAccessory(accessoryName, ExampleAccessory)
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, ExampleAccessory)
    })
  })

  describe('homebridgeAPI.prototype.registerPlatform', () => {
    it('should register platform with legacy style signature', () => {
      api.registerPlatform(pluginName, platformName, ExamplePlatform)
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_PLATFORM, platformName, ExamplePlatform, pluginName)
    })

    it('should register platform without passing plugin name', () => {
      api.registerPlatform(platformName, ExamplePlatform)
      expect(emitSpy).toHaveBeenLastCalledWith(InternalAPIEvent.REGISTER_PLATFORM, platformName, ExamplePlatform)
    })
  })

  describe('matter API', () => {
    const matterPluginName = 'homebridge-matter-example'
    const matterPlatformName = 'MatterExamplePlatform'

    // Captured non-null reference to api.matter, established in beforeEach.
    // api.matter is now `MatterAPI | undefined`; tests that exercise its
    // methods use this local for terseness (one ! per beforeEach instead of
    // one ! per assertion). Tests that exercise the api.matter *property*
    // itself continue to use api.matter directly.
    let matter: NonNullable<typeof api.matter>

    // Ensure Matter API is loaded before running tests.
    // Matter uses lazy loading to improve startup performance.
    beforeEach(async () => {
      await api.loadMatterAPI()
      matter = api.matter!
      // registerPlatformAccessories now guards on the Matter manager being
      // attached AND having active Matter on this bridge (it only is once
      // Homebridge has finished launching). The unit tests below exercise the
      // API directly, so stand in a manager stub to satisfy that precondition.
      // getExternalServer is included because getAccessoryState consults it;
      // hasActiveMatter returns true so the register/update guards pass.
      ;(api as any)._matterManager = { getExternalServer: () => undefined, hasActiveMatter: () => true }
    })

    describe('loadMatterAPI lifecycle', () => {
      it('flips isMatterEnabled() to true once the api is loaded', async () => {
        // Fresh API instance — beforeEach already loaded one, so build a new
        // one to observe the pre-load state.
        const fresh = new HomebridgeAPI()
        expect(fresh.isMatterEnabled()).toBe(false)
        expect(fresh.matter).toBeUndefined()

        await fresh.loadMatterAPI()

        // Plugins reading either form during init must observe consistent
        // values — `api.matter` defined ⇔ `api.isMatterEnabled()` true.
        expect(fresh.matter).toBeDefined()
        expect(fresh.isMatterEnabled()).toBe(true)
      })

      it('coalesces concurrent loads into a single MatterAPIImpl instance', async () => {
        const fresh = new HomebridgeAPI()

        // Two callers race the lazy import. Both must observe the same
        // _matterAPI reference; otherwise pending external-registration
        // resolvers wired into the first instance would be lost on the
        // second instance and the corresponding promises would hang.
        await Promise.all([
          fresh.loadMatterAPI(),
          fresh.loadMatterAPI(),
          fresh.loadMatterAPI(),
        ])

        const ref = fresh.matter
        expect(ref).toBeDefined()
        // A subsequent call must be a no-op against the same instance.
        await fresh.loadMatterAPI()
        expect(fresh.matter).toBe(ref)
      })
    })

    describe('api.matter property access', () => {
      it('should expose matter API', () => {
        expect(api.matter).toBeDefined()
        expect(typeof api.matter).toBe('object')
      })

      it('should expose uuid generator (alias of hap.uuid)', () => {
        expect(matter.uuid).toBeDefined()
        expect(matter.uuid).toBe(api.hap.uuid)
      })

      it('should expose deviceTypes', () => {
        expect(matter.deviceTypes).toBeDefined()
        expect(typeof matter.deviceTypes).toBe('object')
      })

      it('should expose clusters', () => {
        expect(matter.clusters).toBeDefined()
        expect(typeof matter.clusters).toBe('object')
      })

      it('should expose clusterNames', () => {
        expect(matter.clusterNames).toBeDefined()
        expect(typeof matter.clusterNames).toBe('object')
      })

      it('should expose types', () => {
        expect(matter.types).toBeDefined()
        expect(typeof matter.types).toBe('object')
      })
    })

    describe('matter.registerPlatformAccessories', () => {
      it('should register Matter platform accessories', () => {
        const matterAccessories: MatterAccessory[] = [
          {
            UUID: matter.uuid.generate('test-light-1'),
            displayName: 'Test Light 1',
            deviceType: matter.deviceTypes.OnOffLight,
            serialNumber: 'SN-001',
            manufacturer: 'Test Manufacturer',
            model: 'Test Model',
            clusters: {
              onOff: {
                onOff: false,
              },
            },
            context: {},
          },
        ]

        matter.registerPlatformAccessories(matterPluginName, matterPlatformName, matterAccessories)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES,
          matterPluginName,
          matterPlatformName,
          matterAccessories,
        )
      })

      it('should register stateless switch accessories using GenericSwitch device type', () => {
        const matterAccessories: MatterAccessory[] = [
          {
            UUID: matter.uuid.generate('test-remote-1'),
            displayName: 'Test Remote 1',
            deviceType: matter.deviceTypes.GenericSwitch,
            serialNumber: 'SN-REMOTE-001',
            manufacturer: 'Test Manufacturer',
            model: 'Test Remote',
            clusters: {
              switch: {
                currentPosition: 0,
                numberOfPositions: 3,
              },
            },
            context: {},
          },
        ]

        matter.registerPlatformAccessories(matterPluginName, matterPlatformName, matterAccessories)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES,
          matterPluginName,
          matterPlatformName,
          matterAccessories,
        )
      })

      it('should register multiple Matter platform accessories', () => {
        const matterAccessories: MatterAccessory[] = [
          {
            UUID: matter.uuid.generate('test-light-1'),
            displayName: 'Test Light 1',
            deviceType: matter.deviceTypes.OnOffLight,
            serialNumber: 'SN-001',
            manufacturer: 'Test',
            model: 'Test',
            clusters: { onOff: { onOff: false } },
            context: {},
          },
          {
            UUID: matter.uuid.generate('test-light-2'),
            displayName: 'Test Light 2',
            deviceType: matter.deviceTypes.DimmableLight,
            serialNumber: 'SN-002',
            manufacturer: 'Test',
            model: 'Test',
            clusters: {
              onOff: { onOff: true },
              levelControl: { currentLevel: 100 },
            },
            context: {},
          },
        ]

        matter.registerPlatformAccessories(matterPluginName, matterPlatformName, matterAccessories)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES,
          matterPluginName,
          matterPlatformName,
          matterAccessories,
        )
      })
    })

    describe('matter.updatePlatformAccessories', () => {
      it('should update Matter platform accessories', () => {
        const matterAccessories: MatterAccessory[] = [
          {
            UUID: matter.uuid.generate('test-light-1'),
            displayName: 'Updated Light Name',
            deviceType: matter.deviceTypes.OnOffLight,
            serialNumber: 'SN-001',
            manufacturer: 'Updated Manufacturer',
            model: 'Updated Model',
            firmwareRevision: '2.0.0',
            clusters: { onOff: { onOff: true } },
            context: {},
          },
        ]

        matter.updatePlatformAccessories(matterAccessories)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES,
          matterAccessories,
        )
      })

      it('should update multiple Matter platform accessories', () => {
        const matterAccessories: MatterAccessory[] = [
          {
            UUID: matter.uuid.generate('test-light-1'),
            displayName: 'Light 1 - Updated',
            deviceType: matter.deviceTypes.OnOffLight,
            serialNumber: 'SN-001',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
          {
            UUID: matter.uuid.generate('test-light-2'),
            displayName: 'Light 2 - Updated',
            deviceType: matter.deviceTypes.DimmableLight,
            serialNumber: 'SN-002',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
        ]

        matter.updatePlatformAccessories(matterAccessories)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES,
          matterAccessories,
        )
      })

      it('should handle updating single accessory', () => {
        const accessory: MatterAccessory = {
          UUID: matter.uuid.generate('test-vacuum'),
          displayName: 'Kitchen Vacuum - Renamed',
          deviceType: matter.deviceTypes.RoboticVacuumCleaner,
          serialNumber: 'VAC-001',
          manufacturer: 'Test',
          model: 'V2',
          firmwareRevision: '3.1.0',
          context: {},
        }

        matter.updatePlatformAccessories([accessory])

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES,
          [accessory],
        )
      })
    })

    describe('matter.unregisterPlatformAccessories', () => {
      it('should unregister Matter platform accessories', () => {
        const matterAccessories: MatterAccessory[] = [
          {
            UUID: matter.uuid.generate('test-light-1'),
            displayName: 'Test Light 1',
            deviceType: matter.deviceTypes.OnOffLight,
            serialNumber: 'SN-001',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
        ]

        matter.unregisterPlatformAccessories(matterPluginName, matterPlatformName, matterAccessories)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES,
          matterPluginName,
          matterPlatformName,
          matterAccessories,
        )
      })

      it('should unregister multiple Matter platform accessories', () => {
        const matterAccessories: MatterAccessory[] = [
          {
            UUID: matter.uuid.generate('test-light-1'),
            displayName: 'Light 1',
            deviceType: matter.deviceTypes.OnOffLight,
            serialNumber: 'SN-001',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
          {
            UUID: matter.uuid.generate('test-light-2'),
            displayName: 'Light 2',
            deviceType: matter.deviceTypes.OnOffLight,
            serialNumber: 'SN-002',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
        ]

        matter.unregisterPlatformAccessories(matterPluginName, matterPlatformName, matterAccessories)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES,
          matterPluginName,
          matterPlatformName,
          matterAccessories,
        )
      })

      it('should automatically unregister RoboticVacuumCleaner as external accessory', () => {
        const vacuumAccessory: MatterAccessory = {
          UUID: matter.uuid.generate('test-vacuum-1'),
          displayName: 'Test Vacuum',
          deviceType: matter.deviceTypes.RoboticVacuumCleaner,
          serialNumber: 'SN-VAC-001',
          manufacturer: 'Test Manufacturer',
          model: 'Vacuum Model',
          context: {},
        }

        matter.unregisterPlatformAccessories(matterPluginName, matterPlatformName, [vacuumAccessory])

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES,
          [vacuumAccessory],
        )
      })

      it('should split unregister into normal and external based on device type', () => {
        emitSpy.mockClear()

        const mixedAccessories: MatterAccessory[] = [
          {
            UUID: matter.uuid.generate('test-light-1'),
            displayName: 'Light 1',
            deviceType: matter.deviceTypes.OnOffLight,
            serialNumber: 'SN-001',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
          {
            UUID: matter.uuid.generate('test-vacuum-1'),
            displayName: 'Vacuum 1',
            deviceType: matter.deviceTypes.RoboticVacuumCleaner,
            serialNumber: 'SN-002',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
          {
            UUID: matter.uuid.generate('test-light-2'),
            displayName: 'Light 2',
            deviceType: matter.deviceTypes.DimmableLight,
            serialNumber: 'SN-003',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
        ]

        matter.unregisterPlatformAccessories(matterPluginName, matterPlatformName, mixedAccessories)

        expect(emitSpy).toHaveBeenCalledTimes(2)

        const calls = emitSpy.mock.calls as any[]
        const unregisterCall = calls.find(call => call[0] === InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES) as any[]
        const unregisterExternalCall = calls.find(call => call[0] === InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES) as any[]

        expect(unregisterCall).toBeDefined()
        expect(unregisterCall[3]).toHaveLength(2)
        expect(unregisterCall[3][0].displayName).toBe('Light 1')
        expect(unregisterCall[3][1].displayName).toBe('Light 2')

        expect(unregisterExternalCall).toBeDefined()
        expect(unregisterExternalCall[1]).toHaveLength(1)
        expect(unregisterExternalCall[1][0].displayName).toBe('Vacuum 1')
      })
    })

    describe('registerPlatformAccessories - external device handling', () => {
      it('should automatically publish RoboticVacuumCleaner as external accessory', () => {
        const vacuumAccessory: MatterAccessory = {
          UUID: matter.uuid.generate('test-vacuum-1'),
          displayName: 'Test Vacuum',
          deviceType: matter.deviceTypes.RoboticVacuumCleaner,
          serialNumber: 'SN-VAC-001',
          manufacturer: 'Test Manufacturer',
          model: 'Vacuum Model',
          context: {},
          clusters: {
            onOff: { onOff: false },
            rvcRunMode: { currentMode: 0 },
          },
        }

        matter.registerPlatformAccessories(matterPluginName, matterPlatformName, [vacuumAccessory])

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES,
          expect.arrayContaining([
            expect.objectContaining({
              UUID: vacuumAccessory.UUID,
              displayName: 'Test Vacuum',
              _associatedPlugin: matterPluginName,
            }),
          ]),
          expect.any(String), // registrationId for async tracking
        )
      })

      it('should split accessories into normal and external based on device type', () => {
        emitSpy.mockClear()

        const mixedAccessories: MatterAccessory[] = [
          {
            UUID: matter.uuid.generate('test-light-1'),
            displayName: 'Light 1',
            deviceType: matter.deviceTypes.OnOffLight,
            serialNumber: 'SN-001',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
          {
            UUID: matter.uuid.generate('test-vacuum-1'),
            displayName: 'Vacuum 1',
            deviceType: matter.deviceTypes.RoboticVacuumCleaner,
            serialNumber: 'SN-002',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
          {
            UUID: matter.uuid.generate('test-light-2'),
            displayName: 'Light 2',
            deviceType: matter.deviceTypes.DimmableLight,
            serialNumber: 'SN-003',
            manufacturer: 'Test',
            model: 'Test',
            context: {},
          },
        ]

        matter.registerPlatformAccessories(matterPluginName, matterPlatformName, mixedAccessories)

        expect(emitSpy).toHaveBeenCalledTimes(2)

        const calls = emitSpy.mock.calls as any[]
        const registerCall = calls.find(call => call[0] === InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES) as any[]
        const publishCall = calls.find(call => call[0] === InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES) as any[]

        expect(registerCall).toBeDefined()
        expect(registerCall[3]).toHaveLength(2)
        expect(registerCall[3][0].displayName).toBe('Light 1')
        expect(registerCall[3][1].displayName).toBe('Light 2')

        expect(publishCall).toBeDefined()
        expect(publishCall[1]).toHaveLength(1)
        expect(publishCall[1][0].displayName).toBe('Vacuum 1')
      })
    })

    describe('matter.updateAccessoryState', () => {
      beforeEach(() => {
        emitSpy.mockClear()
      })

      it('should update Matter accessory state', () => {
        const uuid = matter.uuid.generate('test-light-update')
        const cluster = matter.clusterNames.OnOff
        const attributes = { onOff: true }

        matter.updateAccessoryState(uuid, cluster, attributes)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE,
          uuid,
          cluster,
          attributes,
          undefined, // no partId
        )
      })

      it('should update Matter accessory state for specific part', () => {
        const uuid = matter.uuid.generate('test-power-strip')
        const cluster = matter.clusterNames.OnOff
        const attributes = { onOff: true }
        const partId = 'outlet-2'

        matter.updateAccessoryState(uuid, cluster, attributes, partId)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE,
          uuid,
          cluster,
          attributes,
          partId,
        )
      })

      it('should update different cluster types', () => {
        const uuid = matter.uuid.generate('test-dimmable-light')

        // Update OnOff cluster
        matter.updateAccessoryState(uuid, matter.clusterNames.OnOff, { onOff: true })
        expect(emitSpy).toHaveBeenCalledWith(
          InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE,
          uuid,
          matter.clusterNames.OnOff,
          { onOff: true },
          undefined,
        )

        // Update LevelControl cluster
        matter.updateAccessoryState(uuid, matter.clusterNames.LevelControl, { currentLevel: 200 })
        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE,
          uuid,
          matter.clusterNames.LevelControl,
          { currentLevel: 200 },
          undefined,
        )
      })
    })

    describe('matter.getAccessoryState', () => {
      it('should have getAccessoryState method', () => {
        expect(typeof matter.getAccessoryState).toBe('function')
      })

      it('should accept uuid and cluster parameters', () => {
        const uuid = matter.uuid.generate('test-light-get')
        const cluster = matter.clusterNames.OnOff

        // Just verify it can be called without error
        // Actual state retrieval requires MatterServer to be running
        expect(() => matter.getAccessoryState(uuid, cluster)).not.toThrow()
      })

      it('should accept optional partId parameter', () => {
        const uuid = matter.uuid.generate('test-power-strip-get')
        const cluster = matter.clusterNames.OnOff
        const partId = 'outlet-1'

        expect(() => matter.getAccessoryState(uuid, cluster, partId)).not.toThrow()
      })
    })

    describe('matter cluster names', () => {
      it('should include common cluster names', () => {
        expect(matter.clusterNames.OnOff).toBe('onOff')
        expect(matter.clusterNames.LevelControl).toBe('levelControl')
        expect(matter.clusterNames.ColorControl).toBe('colorControl')
        expect(matter.clusterNames.DoorLock).toBe('doorLock')
        expect(matter.clusterNames.Thermostat).toBe('thermostat')
        expect(matter.clusterNames.WindowCovering).toBe('windowCovering')
        expect(matter.clusterNames.FanControl).toBe('fanControl')
      })

      it('should include RVC cluster names', () => {
        expect(matter.clusterNames.RvcRunMode).toBe('rvcRunMode')
        expect(matter.clusterNames.RvcCleanMode).toBe('rvcCleanMode')
        expect(matter.clusterNames.RvcOperationalState).toBe('rvcOperationalState')
        expect(matter.clusterNames.ServiceArea).toBe('serviceArea')
      })

      it('should include Switch cluster name', () => {
        expect(matter.clusterNames.Switch).toBe('switch')
      })
    })

    describe('matter device types', () => {
      it('should include common device types', () => {
        expect(matter.deviceTypes.OnOffLight).toBeDefined()
        expect(matter.deviceTypes.DimmableLight).toBeDefined()
        expect(matter.deviceTypes.ColorTemperatureLight).toBeDefined()
        expect(matter.deviceTypes.ExtendedColorLight).toBeDefined()
        expect(matter.deviceTypes.OnOffOutlet).toBeDefined()
        expect(matter.deviceTypes.OnOffSwitch).toBeDefined()
        expect(matter.deviceTypes.GenericSwitch).toBeDefined()
        expect(matter.deviceTypes.DoorLock).toBeDefined()
        expect(matter.deviceTypes.Thermostat).toBeDefined()
        expect(matter.deviceTypes.WindowCovering).toBeDefined()
        expect(matter.deviceTypes.Fan).toBeDefined()
      })

      it('should expose GenericSwitch as a Matter EndpointType object', () => {
        expect(typeof matter.deviceTypes.GenericSwitch).toBe('object')
        expect(Array.isArray(matter.deviceTypes.GenericSwitch)).toBe(false)
        expect(typeof matter.deviceTypes.GenericSwitch.deviceType).toBe('number')
      })

      it('should include specialized device types', () => {
        expect(matter.deviceTypes.RoboticVacuumCleaner).toBeDefined()
        expect(matter.deviceTypes.ContactSensor).toBeDefined()
        expect(matter.deviceTypes.LightSensor).toBeDefined()
        expect(matter.deviceTypes.MotionSensor).toBeDefined()
        expect(matter.deviceTypes.TemperatureSensor).toBeDefined()
        expect(matter.deviceTypes.HumiditySensor).toBeDefined()
        expect(matter.deviceTypes.LeakSensor).toBeDefined()
        expect(matter.deviceTypes.SmokeSensor).toBeDefined()
      })
    })
  })
})
