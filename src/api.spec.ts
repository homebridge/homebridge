import type { AccessoryPlugin, API, DynamicPlatformPlugin } from './api.js'
import type { MatterAccessory } from './matter/index.js'

import { Service, uuid } from '@homebridge/hap-nodejs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI, InternalAPIEvent } from './api.js'
import { Logger } from './logger.js'
import { PlatformAccessory } from './platformAccessory.js'

const api = new HomebridgeAPI()
const emitSpy = vi.spyOn(api, 'emit')

class ExampleAccessory implements AccessoryPlugin {
  getServices(): Service[] {
    return [
      new Service.Switch('TestSwitch'),
    ]
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
  describe('tryLoadMatterAPI', () => {
    it('says Matter can be used once the Matter API is loaded', async () => {
      const api = new HomebridgeAPI()

      await expect(api.tryLoadMatterAPI()).resolves.toBe(true)

      expect(api.matter).toBeDefined()
      expect(api.isMatterEnabled()).toBe(true)
    })

    // matter.js can fail to load at all, for example when the installer left
    // out one of its packages. A bridge that also serves HomeKit must still start.
    it('logs the failure and leaves Matter off when matter.js can not be loaded', async () => {
      const api = new HomebridgeAPI()
      const errors = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      const missing = new Error('Cannot find package \'@matter/nodejs\'')
      vi.spyOn(api, 'loadMatterAPI').mockRejectedValue(missing)

      await expect(api.tryLoadMatterAPI()).resolves.toBe(false)

      expect(errors).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Matter could not be loaded'), missing)
      expect(api.matter).toBeUndefined()
      expect(api.isMatterEnabled()).toBe(false)
      errors.mockRestore()
    })
  })

  describe('listener limit', () => {
    // Almost every platform listens for `didFinishLaunching`. Node's default limit of 10 listeners
    // per event made a bridge with 11 platforms print a memory leak warning.
    it('gives no Node warning when more than 10 plugins listen for the same event', () => {
      const api = new HomebridgeAPI()
      const warnings = vi.spyOn(process, 'emitWarning').mockImplementation(() => {})

      for (let i = 0; i < 25; i++) {
        api.on('didFinishLaunching', () => {})
        api.on('shutdown', () => {})
      }

      expect(warnings).not.toHaveBeenCalled()
      expect(api.listenerCount('didFinishLaunching')).toBe(25)
      warnings.mockRestore()
    })

    it('stays unlimited when a child bridge raises and lowers the limit by one', () => {
      const api = new HomebridgeAPI()
      const warnings = vi.spyOn(process, 'emitWarning').mockImplementation(() => {})

      api.setMaxListeners(api.getMaxListeners() + 1)
      api.setMaxListeners(Math.max(0, api.getMaxListeners() - 1))
      for (let i = 0; i < 25; i++) {
        api.on('shutdown', () => {})
      }

      expect(warnings).not.toHaveBeenCalled()
      warnings.mockRestore()
    })
  })

  describe('the event methods of the public API type', () => {
    // `api` is typed as the public `API` here on purpose: this must compile without a cast.
    it('lets a plugin listen once and remove a listener', () => {
      const api: API = new HomebridgeAPI()
      const launched = vi.fn()
      const removed = vi.fn()
      const alsoRemoved = vi.fn()

      api.once('didFinishLaunching', launched)
      api.on('shutdown', removed)
      api.on('didFinishLaunching', alsoRemoved)
      api.off('shutdown', removed)
      api.removeListener('didFinishLaunching', alsoRemoved)

      const homebridgeApi = api as HomebridgeAPI
      homebridgeApi.signalFinished()
      homebridgeApi.signalFinished()
      homebridgeApi.emit('shutdown')

      expect(launched).toHaveBeenCalledOnce()
      expect(removed).not.toHaveBeenCalled()
      expect(alsoRemoved).not.toHaveBeenCalled()
    })
  })

  describe('versionGreaterOrEqual', () => {
    // The public docs promise exactly this, so it is pinned here.
    it('compares a full semver version with the running version', () => {
      const api = new HomebridgeAPI()

      expect(api.versionGreaterOrEqual('1.2.0')).toBe(true)
      expect(api.versionGreaterOrEqual(api.serverVersion)).toBe(true)
      expect(api.versionGreaterOrEqual(`v${api.serverVersion}`)).toBe(true)
      expect(api.versionGreaterOrEqual('999.0.0')).toBe(false)
    })

    it.each(['2', '2.5', 'abc', undefined])('throws a TypeError for %s, which is not a full semver version', (version) => {
      const api = new HomebridgeAPI()

      expect(() => api.versionGreaterOrEqual(version as string)).toThrow(TypeError)
    })
  })

  describe('signalShutdown', () => {
    it('still calls the other shutdown listeners when one throws or rejects', async () => {
      const api = new HomebridgeAPI()
      const errors = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      const called: string[] = []
      api.on('shutdown', () => {
        called.push('first')
        throw new Error('plugin shutdown bug')
      })
      api.on('shutdown', async () => {
        called.push('second')
        throw new Error('late plugin shutdown bug')
      })
      api.once('shutdown', () => {
        called.push('third')
      })

      expect(() => api.signalShutdown()).not.toThrow()
      // let the rejected promise of the second listener settle
      await new Promise(resolve => setImmediate(resolve))

      expect(called).toEqual(['first', 'second', 'third'])
      expect(errors).toHaveBeenCalledTimes(2)
      // a `once` listener is used up, as with a plain emit
      expect(api.listenerCount('shutdown')).toBe(2)
      errors.mockRestore()
    })
  })

  describe('isHapEnabled', () => {
    it('defaults to enabled through the public API interface', () => {
      const pluginAPI: import('./api.js').API = new HomebridgeAPI()
      expect(pluginAPI.isHapEnabled()).toBe(true)
      expect(pluginAPI.isHapExternalsOnly()).toBe(false)
    })

    it('reports externalsOnly mode as enabled, like isMatterEnabled, with its own flag', () => {
      const api = new HomebridgeAPI()
      api._setHapEnabled(true, true)

      expect(api.isHapEnabled()).toBe(true)
      expect(api.isHapExternalsOnly()).toBe(true)
    })

    it('keeps bridge-specific state independent of other API instances and Matter', async () => {
      const disabled = new HomebridgeAPI()
      const enabled = new HomebridgeAPI()
      disabled._setHapEnabled(false)
      await disabled.loadMatterAPI()

      expect(disabled.isHapEnabled()).toBe(false)
      expect(disabled.isMatterEnabled()).toBe(true)
      expect(enabled.isHapEnabled()).toBe(true)
      expect(enabled.isMatterEnabled()).toBe(false)
    })
  })

  describe('isMatterExternalsOnly', () => {
    it('defaults to false', () => {
      const pluginAPI: import('./api.js').API = new HomebridgeAPI()
      expect(pluginAPI.isMatterExternalsOnly()).toBe(false)
    })

    it('only reports externalsOnly once Matter is enabled', async () => {
      const api = new HomebridgeAPI()
      api._setMatterExternalsOnly(true)
      expect(api.isMatterExternalsOnly()).toBe(false)

      await api.loadMatterAPI()
      expect(api.isMatterEnabled()).toBe(true)
      expect(api.isMatterExternalsOnly()).toBe(true)
    })
  })

  describe('signalFinished', () => {
    it('calls every didFinishLaunching listener', () => {
      const api = new HomebridgeAPI()
      const first = vi.fn()
      const second = vi.fn()
      api.on('didFinishLaunching', first)
      api.on('didFinishLaunching', second)

      api.signalFinished()

      expect(first).toHaveBeenCalledOnce()
      expect(second).toHaveBeenCalledOnce()
    })
  })

  describe('platform accessories', () => {
    let api: HomebridgeAPI
    let events: Array<[string, unknown[]]>

    function listenFor(event: InternalAPIEvent): void {
      api.on(event as any, (...args: unknown[]) => events.push([event, args]))
    }

    beforeEach(() => {
      api = new HomebridgeAPI()
      events = []
    })

    it('registerPlatformAccessories notes the plugin and platform on each accessory and passes them on', () => {
      listenFor(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES)
      const accessories = [
        new PlatformAccessory('One', uuid.generate('one')),
        new PlatformAccessory('Two', uuid.generate('two')),
      ]

      api.registerPlatformAccessories(pluginName, platformName, accessories)

      for (const accessory of accessories) {
        expect(accessory._associatedPlugin).toBe(pluginName)
        expect(accessory._associatedPlatform).toBe(platformName)
      }
      expect(events).toEqual([
        [
          InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES,
          [accessories],
        ],
      ])
    })

    it('registerPlatformAccessories refuses something that is not a PlatformAccessory', () => {
      listenFor(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES)

      expect(() => api.registerPlatformAccessories(pluginName, platformName, [
        { displayName: 'Fake' } as any,
      ]))
        .toThrow(new TypeError(`${pluginName} - ${platformName} attempt to register an accessory that isn't PlatformAccessory!`))
      expect(events).toEqual([])
    })

    it('updatePlatformAccessories passes the accessories on', () => {
      listenFor(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES)
      const accessories = [
        new PlatformAccessory('One', uuid.generate('one')),
      ]

      api.updatePlatformAccessories(accessories)

      expect(events).toEqual([
        [
          InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES,
          [accessories],
        ],
      ])
    })

    it('unregisterPlatformAccessories passes the accessories on', () => {
      listenFor(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES)
      const accessories = [
        new PlatformAccessory('One', uuid.generate('one')),
      ]

      api.unregisterPlatformAccessories(pluginName, platformName, accessories)

      expect(events).toEqual([
        [
          InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES,
          [accessories],
        ],
      ])
    })

    it('unregisterPlatformAccessories refuses something that is not a PlatformAccessory', () => {
      listenFor(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES)

      expect(() => api.unregisterPlatformAccessories(pluginName, platformName, [
        { displayName: 'Fake' } as any,
      ]))
        .toThrow(new TypeError(`${pluginName} - ${platformName} attempt to unregister an accessory that isn't PlatformAccessory!`))
      expect(events).toEqual([])
    })

    describe('publishExternalAccessories', () => {
      let infoSpy: ReturnType<typeof vi.spyOn>

      beforeEach(() => {
        infoSpy = vi.spyOn(Logger.internal, 'info').mockImplementation(() => {})
        listenFor(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES)
      })

      afterEach(() => {
        infoSpy.mockRestore()
      })

      it('notes the plugin on each accessory and passes them on', () => {
        const accessories = [
          new PlatformAccessory('Camera', uuid.generate('camera')),
        ]

        api.publishExternalAccessories(pluginName, accessories)

        expect(accessories[0]._associatedPlugin).toBe(pluginName)
        expect(accessories[0]._associatedPlatform).toBeUndefined()
        expect(events).toEqual([
          [
            InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES,
            [accessories],
          ],
        ])
        expect(infoSpy).not.toHaveBeenCalled()
      })

      it('says so when a plugin passes its platform name in place of its plugin identifier, and still publishes', () => {
        const accessories = [
          new PlatformAccessory('Camera', uuid.generate('camera')),
        ]

        api.publishExternalAccessories(platformName, accessories)

        expect(infoSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(`using the platform name (${platformName})`))
        expect(events).toHaveLength(1)
      })

      it('refuses something that is not a PlatformAccessory', () => {
        expect(() => api.publishExternalAccessories(pluginName, [
          { displayName: 'Fake' } as any,
        ]))
          .toThrow(new TypeError(`${pluginName} attempt to register an accessory that isn't PlatformAccessory!`))
        expect(events).toEqual([])
      })
    })
  })

  describe('_resolveExternalRegistration', () => {
    it('calls the waiting resolve function once and forgets it', () => {
      const api = new HomebridgeAPI()
      const resolve = vi.fn()
      ;(api as any)._pendingExternalRegistrations.set('registration-1', resolve)

      api._resolveExternalRegistration('registration-1')
      api._resolveExternalRegistration('registration-1')
      api._resolveExternalRegistration('never-registered')

      expect(resolve).toHaveBeenCalledOnce()
      expect((api as any)._pendingExternalRegistrations.size).toBe(0)
    })
  })

  describe('the kind of a platform', () => {
    it('knows a static platform by its accessories method', () => {
      const platform = {
        accessories: () => {},
      }

      expect(HomebridgeAPI.isStaticPlatformPlugin(platform)).toBe(true)
      expect(HomebridgeAPI.isDynamicPlatformPlugin(platform)).toBe(false)
    })

    it('knows a dynamic platform by its configureAccessory method', () => {
      const platform = new ExamplePlatform()

      expect(HomebridgeAPI.isDynamicPlatformPlugin(platform)).toBe(true)
      expect(HomebridgeAPI.isStaticPlatformPlugin(platform)).toBe(false)
    })

    it('takes a platform with neither method as an independent platform', () => {
      const platform = {}

      expect(HomebridgeAPI.isDynamicPlatformPlugin(platform)).toBe(false)
      expect(HomebridgeAPI.isStaticPlatformPlugin(platform)).toBe(false)
    })
  })

  describe('homebridgeAPI.prototype.registerAccessory', () => {
    // `api` and `emitSpy` are shared by this whole file: start each test with no recorded calls
    beforeEach(() => {
      emitSpy.mockClear()
    })

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
      ;(api as any)._matterManager = {
        getExternalServer: () => undefined,
        hasActiveMatter: () => true,
        isBridgeServerStarting: () => false,
        getBridgeStartFailure: () => undefined,
      }
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
          expect.any(Function),
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
          expect.any(Function),
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
            clusters: {
              onOff: { onOff: false },
            },
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
          expect.any(Function),
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
            clusters: {
              onOff: { onOff: true },
            },
            context: {},
          },
        ]

        matter.updatePlatformAccessories(matterAccessories)

        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES,
          matterAccessories,
          expect.any(Function), // reports the work back, so the call can wait for it
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
          expect.any(Function), // reports the work back, so the call can wait for it
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
          expect.any(Function), // reports the work back, so the call can wait for it
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
          expect.any(Function),
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
          expect.any(Function),
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
          expect.any(Function),
        )
      })

      it('should split unregister into normal and external based on device type', async () => {
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

        // The second event follows once the bridge has finished with the first
        await vi.waitFor(() => expect(emitSpy).toHaveBeenCalledTimes(2))

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

    describe('waiting for the bridge (#4033)', () => {
      const light = (): MatterAccessory => ({
        UUID: matter.uuid.generate('test-light-wait'),
        displayName: 'Light',
        deviceType: matter.deviceTypes.OnOffLight,
        serialNumber: 'SN-WAIT',
        manufacturer: 'Test',
        model: 'Test',
        context: {},
      })

      /**
       * Stand in for the bridge: report work that only finishes when the test says so
       * @param event - the event to listen for
       */
      function slowBridge(event: InternalAPIEvent) {
        let finish!: () => void
        const done = new Promise<void>((resolve) => {
          finish = resolve
        })
        const listener = (...args: unknown[]) => {
          (args.at(-1) as (work: Promise<void>) => void)(done)
        }
        api.on(event as any, listener)
        return {
          finish,
          stop: () => api.removeListener(event, listener),
        }
      }

      it.each([
        ['register', InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES],
        ['unregister', InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES],
      ] as const)('only resolves %s once the bridge has finished', async (method, event) => {
        const bridge = slowBridge(event)
        let resolved = false
        const call = matter[`${method}PlatformAccessories`](matterPluginName, matterPlatformName, [
          light(),
        ]).then(() => {
          resolved = true
        })

        // Give the call every chance to resolve early
        await new Promise(resolve => setTimeout(resolve, 10))
        expect(resolved).toBe(false)

        bridge.finish()
        await call
        expect(resolved).toBe(true)
        bridge.stop()
      })

      it('still resolves, without throwing, when the bridge work fails', async () => {
        // The bridge logs its own failure; the plugin's call behaves as before
        const listener = (...args: unknown[]) => {
          (args.at(-1) as (work: Promise<void>) => void)(Promise.reject(new Error('bridge failed')))
        }
        api.on(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES as any, listener)

        await expect(matter.unregisterPlatformAccessories(matterPluginName, matterPlatformName, [
          light(),
        ])).resolves.toBeUndefined()
        api.removeListener(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, listener)
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

      it('should split accessories into normal and external based on device type', async () => {
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

        // The second event follows once the bridge has finished with the first
        await vi.waitFor(() => expect(emitSpy).toHaveBeenCalledTimes(2))

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
          expect.any(Function), // reports the work back, so the call can wait for it
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
          expect.any(Function), // reports the work back, so the call can wait for it
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
          expect.any(Function), // reports the work back, so the call can wait for it
        )

        // Update LevelControl cluster
        matter.updateAccessoryState(uuid, matter.clusterNames.LevelControl, { currentLevel: 200 })
        expect(emitSpy).toHaveBeenLastCalledWith(
          InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE,
          uuid,
          matter.clusterNames.LevelControl,
          { currentLevel: 200 },
          undefined,
          expect.any(Function), // reports the work back, so the call can wait for it
        )
      })
    })

    describe('matter.getAccessoryState', () => {
      afterEach(() => {
        api._matterServer = null
      })

      it('resolves with undefined while no Matter server is running', async () => {
        const uuid = matter.uuid.generate('test-light-get')

        await expect(matter.getAccessoryState(uuid, matter.clusterNames.OnOff)).resolves.toBeUndefined()
      })

      it('resolves with the state the Matter server of the bridge holds', async () => {
        const uuid = matter.uuid.generate('test-light-get')
        const getAccessoryState = vi.fn().mockReturnValue({ onOff: true })
        api._matterServer = { getAccessoryState } as any

        await expect(matter.getAccessoryState(uuid, matter.clusterNames.OnOff)).resolves.toEqual({ onOff: true })

        expect(getAccessoryState).toHaveBeenCalledExactlyOnceWith(uuid, 'onOff', undefined)
      })

      it('passes the optional partId on', async () => {
        const uuid = matter.uuid.generate('test-power-strip-get')
        const getAccessoryState = vi.fn().mockReturnValue({ onOff: false })
        api._matterServer = { getAccessoryState } as any

        await expect(matter.getAccessoryState(uuid, matter.clusterNames.OnOff, 'outlet-1')).resolves.toEqual({ onOff: false })

        expect(getAccessoryState).toHaveBeenCalledExactlyOnceWith(uuid, 'onOff', 'outlet-1')
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

describe('which platforms get their cached accessories back', () => {
  it('counts a platform that only does Matter as a dynamic platform', () => {
    expect(HomebridgeAPI.isDynamicPlatformPlugin({
      configureMatterAccessory: () => {},
    } as never)).toBe(true)
  })

  it('still counts a platform with configureAccessory, and no other', () => {
    expect(HomebridgeAPI.isDynamicPlatformPlugin({
      configureAccessory: () => {},
    } as never)).toBe(true)
    expect(HomebridgeAPI.isDynamicPlatformPlugin({} as never)).toBe(false)
  })

  it('leaves a static platform static, also when it has configureMatterAccessory', () => {
    const platform = {
      accessories: () => {},
      configureMatterAccessory: () => {},
    } as never

    expect(HomebridgeAPI.isDynamicPlatformPlugin(platform)).toBe(false)
    expect(HomebridgeAPI.isStaticPlatformPlugin(platform)).toBe(true)
  })
})
