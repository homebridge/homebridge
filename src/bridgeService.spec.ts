import type { MockInstance } from 'vitest'

import type { BridgeConfiguration } from './bridgeService.js'

import { Accessory, Categories, CharacteristicWarningType, uuid } from '@homebridge/hap-nodejs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI, InternalAPIEvent } from './api.js'
import { BridgeService, isHapConfigEnabled, isHapExternalsOnly, validateHapConfig } from './bridgeService.js'
import { Logger } from './logger.js'
import { PlatformAccessory } from './platformAccessory.js'

// Track mock StorageService instances so tests can assert on their methods.
const storageInstances = vi.hoisted(() => ({ list: [] as any[] }))

vi.mock('./storageService.js', () => {
  return {
    StorageService: class MockStorageService {
      public initSync = vi.fn()
      public getItem = vi.fn().mockResolvedValue(null)
      public copyItem = vi.fn().mockResolvedValue(undefined)
      public setItemSync = vi.fn()
      public removeItemSync = vi.fn()
      // eslint-disable-next-line unused-imports/no-unused-vars
      constructor(_baseDir?: string) {
        storageInstances.list.push(this)
      }
    },
  }
})

function makeBridgeConfig(overrides: any = {}): any {
  return {
    name: 'TestBridge',
    username: 'CC:22:3D:E3:CE:30',
    pin: '031-45-154',
    ...overrides,
  }
}

function makeBridgeOptions(overrides: any = {}): any {
  return {
    cachedAccessoriesDir: '/tmp/test-cache-dir',
    cachedAccessoriesItemName: 'cachedAccessories',
    externalAccessoriesItemName: 'externalAccessories',
    keepOrphanedCachedAccessories: false,
    ...overrides,
  }
}

function makePluginManager(overrides: any = {}): any {
  return {
    getPlugin: vi.fn().mockReturnValue(undefined),
    getPluginByActiveDynamicPlatform: vi.fn().mockReturnValue(undefined),
    ...overrides,
  }
}

function makeExternalPortService(overrides: any = {}): any {
  return {
    requestPort: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makePlatformAccessory(name = 'TestAccessory', plugin = 'homebridge-test', platform = 'TestPlatform'): PlatformAccessory {
  const accessory = new PlatformAccessory(name, uuid.generate(`bridgeService.test.${name}`))
  accessory._associatedPlugin = plugin
  accessory._associatedPlatform = platform
  return accessory
}

describe('bridgeService', () => {
  let api: HomebridgeAPI
  let pluginManager: any
  let externalPortService: any

  beforeEach(() => {
    vi.clearAllMocks()
    api = new HomebridgeAPI()
    pluginManager = makePluginManager()
    externalPortService = makeExternalPortService()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('registers four InternalAPIEvent listeners on the api', () => {
      const onSpy = vi.spyOn(api, 'on')
      // eslint-disable-next-line no-new
      new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const events = onSpy.mock.calls.map(call => call[0])
      expect(events).toContain(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES)
      expect(events).toContain(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES)
      expect(events).toContain(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES)
      expect(events).toContain(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES)
    })

    it('initialises StorageService against the configured cache directory', () => {
      const opts = makeBridgeOptions({ cachedAccessoriesDir: '/tmp/custom-cache' })
      const before = storageInstances.list.length
      // eslint-disable-next-line no-new
      new BridgeService(api, pluginManager, externalPortService, opts, makeBridgeConfig())
      const after = storageInstances.list.length
      expect(after).toBe(before + 1)
      // Verify initSync was called on the new instance
      expect(storageInstances.list[after - 1].initSync).toHaveBeenCalled()
    })

    it('respects insecureAccess option from bridgeOptions', () => {
      const opts = makeBridgeOptions({ insecureAccess: true })
      const service = new BridgeService(api, pluginManager, externalPortService, opts, makeBridgeConfig())
      // allowInsecureAccess is private but observable through bridge.publish behavior;
      // smoke-test by reading the internal field.
      expect((service as any).allowInsecureAccess).toBe(true)
    })

    it('creates a Bridge with the configured name', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig({ name: 'MyBridge' }))
      expect(service.bridge.displayName).toBe('MyBridge')
    })
  })

  describe('handleRegisterPlatformAccessories', () => {
    it('registers a new accessory and adds it to the bridge', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const addBridgedAccessoriesSpy = vi.spyOn(service.bridge, 'addBridgedAccessories').mockImplementation(() => {})
      const accessory = makePlatformAccessory('Light')
      service.handleRegisterPlatformAccessories([accessory])
      expect(addBridgedAccessoriesSpy).toHaveBeenCalledTimes(1)
      const passed = addBridgedAccessoriesSpy.mock.calls[0][0] as Accessory[]
      expect(passed).toHaveLength(1)
      expect(passed[0]).toBe(accessory._associatedHAPAccessory)
    })

    it('skips a duplicate-UUID accessory and logs a warning', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      vi.spyOn(service.bridge, 'addBridgedAccessories').mockImplementation(() => {})
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const original = makePlatformAccessory('Original')
      const duplicate = makePlatformAccessory('Duplicate')
      // Force the same UUID on both the inner HAP accessory and the wrapper
      ;(duplicate as any)._associatedHAPAccessory.UUID = original._associatedHAPAccessory.UUID
      ;(duplicate as any).UUID = original._associatedHAPAccessory.UUID

      service.handleRegisterPlatformAccessories([original])
      service.handleRegisterPlatformAccessories([duplicate])

      // Second call should have warned about duplicate UUID
      expect(warnSpy).toHaveBeenCalled()
      const warnedAboutDuplicate = warnSpy.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes('same UUID'),
      )
      expect(warnedAboutDuplicate).toBe(true)
    })

    it('warns when the registering plugin is not loaded', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      pluginManager.getPlugin.mockReturnValue(undefined)
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      vi.spyOn(service.bridge, 'addBridgedAccessories').mockImplementation(() => {})

      service.handleRegisterPlatformAccessories([makePlatformAccessory('Orphan')])

      const warned = warnSpy.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes('no loaded plugin'),
      )
      expect(warned).toBe(true)
    })
  })

  describe('handleUpdatePlatformAccessories', () => {
    it('is a no-op for non-array input', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      vi.spyOn(service.bridge, 'addBridgedAccessories').mockImplementation(() => {})

      // Cast through unknown to bypass the type system; the runtime guard is the contract.
      service.handleUpdatePlatformAccessories('not-an-array' as unknown as PlatformAccessory[])

      // No throw, no crash. cachedPlatformAccessories should be untouched.
      expect((service as any).cachedPlatformAccessories).toEqual([])
    })

    it('replaces matching cached accessories by UUID', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      vi.spyOn(service.bridge, 'addBridgedAccessories').mockImplementation(() => {})

      const a = makePlatformAccessory('A')
      const b = makePlatformAccessory('B')
      service.handleRegisterPlatformAccessories([a, b])

      // Update b. PlatformAccessory.UUID and _associatedHAPAccessory.UUID are
      // both keyed off in handleUpdatePlatformAccessories — set both so the
      // filter recognises this as an update of b rather than a new accessory.
      const newB = makePlatformAccessory('B-renamed')
      ;(newB as any)._associatedHAPAccessory.UUID = b._associatedHAPAccessory.UUID
      ;(newB as any).UUID = b._associatedHAPAccessory.UUID
      service.handleUpdatePlatformAccessories([newB])

      const cached = (service as any).cachedPlatformAccessories
      expect(cached).toHaveLength(2)
      // a stays, b gets replaced by newB
      expect(cached.find((x: any) => x === a)).toBe(a)
      expect(cached.find((x: any) => x === newB)).toBe(newB)
      expect(cached.find((x: any) => x === b)).toBeUndefined()
    })
  })

  describe('handleUnregisterPlatformAccessories', () => {
    it('removes accessories from the cache and the bridge', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      vi.spyOn(service.bridge, 'addBridgedAccessories').mockImplementation(() => {})
      const removeSpy = vi.spyOn(service.bridge, 'removeBridgedAccessories').mockImplementation(() => {})

      const a = makePlatformAccessory('A')
      service.handleRegisterPlatformAccessories([a])
      expect((service as any).cachedPlatformAccessories).toHaveLength(1)

      service.handleUnregisterPlatformAccessories([a])
      expect((service as any).cachedPlatformAccessories).toHaveLength(0)
      expect(removeSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('handlePublishExternalAccessories', () => {
    it('allocates a port for each external accessory', async () => {
      externalPortService.requestPort.mockResolvedValue(50000)
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

      const a = makePlatformAccessory('External-A')
      // Stub publish so it doesn't actually try to bind a port.
      vi.spyOn(a._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)

      await service.handlePublishExternalAccessories([a])

      expect(externalPortService.requestPort).toHaveBeenCalledTimes(1)
    })

    it('throws when an accessory address collides with an existing one', async () => {
      externalPortService.requestPort.mockResolvedValue(50000)
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

      const a = makePlatformAccessory('External-A')
      vi.spyOn(a._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)
      await service.handlePublishExternalAccessories([a])

      // Re-publish the same accessory — same UUID → same advertise-address → collision
      await expect(service.handlePublishExternalAccessories([a])).rejects.toThrow(/address collision/)
    })

    it('skips publishing external accessories when HAP is disabled (no externalsOnly)', async () => {
      const service = new BridgeService(
        api,
        pluginManager,
        externalPortService,
        makeBridgeOptions(),
        makeBridgeConfig({ hap: { enabled: false } }),
      )

      const a = makePlatformAccessory('External-A')
      const publishSpy = vi.spyOn(a._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)

      await service.handlePublishExternalAccessories([a])

      // Should not attempt to publish when hap is disabled and externalsOnly is not set
      expect(publishSpy).not.toHaveBeenCalled()
      // Should not request a port either
      expect(externalPortService.requestPort).not.toHaveBeenCalled()
    })

    it('publishes external accessories in externalsOnly mode (hap.enabled:false + externalsOnly:true)', async () => {
      externalPortService.requestPort.mockResolvedValue(50001)
      const service = new BridgeService(
        api,
        pluginManager,
        externalPortService,
        makeBridgeOptions(),
        makeBridgeConfig({ hap: { enabled: false, externalsOnly: true } }),
      )

      const a = makePlatformAccessory('External-A')
      const publishSpy = vi.spyOn(a._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)

      await service.handlePublishExternalAccessories([a])

      // Bridge itself is not published, but externals are
      expect(publishSpy).toHaveBeenCalledOnce()
      expect(externalPortService.requestPort).toHaveBeenCalledOnce()
    })

    it('clears any stale external accessories metadata file on construction', () => {
      // eslint-disable-next-line no-new
      new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const storage = storageInstances.list.at(-1)
      expect(storage.removeItemSync).toHaveBeenCalledWith('externalAccessories')
    })

    it('writes plugin-attribution metadata for each published external accessory', async () => {
      externalPortService.requestPort.mockResolvedValue(50000)
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const storage = storageInstances.list.at(-1)

      const a = makePlatformAccessory('External-A', 'homebridge-foo')
      vi.spyOn(a._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)

      await service.handlePublishExternalAccessories([a])

      const writes = storage.setItemSync.mock.calls.filter((call: any[]) => call[0] === 'externalAccessories')
      expect(writes).toHaveLength(1)
      const [, entries] = writes[0]
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        plugin: 'homebridge-foo',
        displayName: 'External-A',
        port: 50000,
      })
      expect(entries[0].username).toMatch(/^[\dA-F]{2}(:[\dA-F]{2}){5}$/)
    })

    it('rewrites the metadata file with the full set on subsequent publish calls', async () => {
      externalPortService.requestPort.mockResolvedValueOnce(50000).mockResolvedValueOnce(50001)
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const storage = storageInstances.list.at(-1)

      const a = makePlatformAccessory('External-A', 'homebridge-foo')
      const b = makePlatformAccessory('External-B', 'homebridge-bar')
      vi.spyOn(a._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)
      vi.spyOn(b._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)

      await service.handlePublishExternalAccessories([a])
      await service.handlePublishExternalAccessories([b])

      const writes = storage.setItemSync.mock.calls.filter((call: any[]) => call[0] === 'externalAccessories')
      expect(writes).toHaveLength(2)
      // Second write must contain both accessories so the file reflects the current full set.
      const [, secondEntries] = writes[1]
      expect(secondEntries.map((e: any) => e.displayName).sort()).toEqual(['External-A', 'External-B'])
      expect(secondEntries.map((e: any) => e.plugin).sort()).toEqual(['homebridge-bar', 'homebridge-foo'])
    })
  })

  describe('createHAPAccessory', () => {
    it('returns undefined when accessory has no services and no controllers', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const plugin = { getPluginIdentifier: () => 'homebridge-test' } as any
      const accessoryInstance = { getServices: () => [] } as any
      const result = service.createHAPAccessory(plugin, accessoryInstance, 'Empty', 'EmptyAccessory')
      expect(result).toBeUndefined()
    })

    it('builds an Accessory from getServices()', async () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const plugin = { getPluginIdentifier: () => 'homebridge-test' } as any
      const { Service } = await import('@homebridge/hap-nodejs')
      const accessoryInstance = {
        getServices: () => [new Service.Switch('TestSwitch')],
      } as any
      const result = service.createHAPAccessory(plugin, accessoryInstance, 'TestName', 'TestAccessory')
      expect(result).toBeInstanceOf(Accessory)
      expect(result?.displayName).toBe('TestName')
    })
  })

  describe('teardown', () => {
    it('keeps the four InternalAPIEvent listeners attached so plugin shutdown handlers can still persist updates', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      // Stub the network-touching parts of teardown.
      vi.spyOn(service.bridge, 'unpublish').mockResolvedValue(undefined)

      const before = {
        register: api.listenerCount(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES),
        update: api.listenerCount(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES),
        unregister: api.listenerCount(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES),
        publishExt: api.listenerCount(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES),
      }
      expect(before.register).toBeGreaterThan(0)

      service.teardown()

      // Listeners must remain attached: plugins commonly call
      // api.updatePlatformAccessories() from inside their `shutdown`
      // listener (often after async cleanup), and that call relies on
      // handleUpdatePlatformAccessories firing to write context updates
      // to disk.
      expect(api.listenerCount(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES)).toBe(before.register)
      expect(api.listenerCount(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES)).toBe(before.update)
      expect(api.listenerCount(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES)).toBe(before.unregister)
      expect(api.listenerCount(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES)).toBe(before.publishExt)
    })

    it('signals shutdown on the api', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      vi.spyOn(service.bridge, 'unpublish').mockResolvedValue(undefined)
      const signalSpy = vi.spyOn(api, 'signalShutdown')

      service.teardown()

      expect(signalSpy).toHaveBeenCalled()
    })

    it('signals shutdown after persisting cached accessories so plugin updatePlatformAccessories calls during shutdown can still write to disk', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      vi.spyOn(service.bridge, 'unpublish').mockResolvedValue(undefined)

      const order: string[] = []
      vi.spyOn(service, 'saveCachedPlatformAccessoriesOnDisk').mockImplementation(() => {
        order.push('save')
      })
      vi.spyOn(api, 'signalShutdown').mockImplementation(() => {
        order.push('signal')
        return undefined as never
      })

      service.teardown()

      expect(order).toEqual(['save', 'signal'])
    })
  })

  describe('printCharacteristicWriteWarning', () => {
    let logSpy: MockInstance
    let errorSpy: MockInstance
    let debugSpy: MockInstance

    beforeEach(() => {
      logSpy = vi.spyOn(Logger.internal, 'info').mockImplementation(() => {})
      errorSpy = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      debugSpy = vi.spyOn(Logger.internal, 'debug').mockImplementation(() => {})
    })

    function fakePlugin() {
      return { getPluginIdentifier: () => 'homebridge-test' } as any
    }
    function fakeAccessory(): Accessory {
      return new Accessory('FakeAccessory', uuid.generate('fake'))
    }
    function makeWarning(type: CharacteristicWarningType, message = 'oops'): any {
      return {
        type,
        message,
        characteristic: { displayName: 'FakeCharacteristic' },
      }
    }

    it('downgrades SLOW_READ to info when ignoreSlow is false', () => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, makeWarning(CharacteristicWarningType.SLOW_READ))
      expect(logSpy).toHaveBeenCalled()
    })

    it('suppresses SLOW_READ when ignoreSlow is true', () => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), { ignoreSlow: true }, makeWarning(CharacteristicWarningType.SLOW_READ))
      expect(logSpy).not.toHaveBeenCalled()
    })

    it('escalates TIMEOUT_WRITE to error', () => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, makeWarning(CharacteristicWarningType.TIMEOUT_WRITE))
      expect(errorSpy).toHaveBeenCalled()
    })

    it('routes ERROR_MESSAGE to error', () => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, makeWarning(CharacteristicWarningType.ERROR_MESSAGE))
      expect(errorSpy).toHaveBeenCalled()
    })

    it('routes DEBUG_MESSAGE to debug', () => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, makeWarning(CharacteristicWarningType.DEBUG_MESSAGE))
      expect(debugSpy).toHaveBeenCalled()
    })

    it('emits a debug log when warning.stack is present', () => {
      const warning = { ...makeWarning(CharacteristicWarningType.WARN_MESSAGE), stack: 'Error stack here' }
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, warning)
      expect(debugSpy).toHaveBeenCalled()
    })
  })

  describe('saveCachedPlatformAccessoriesOnDisk', () => {
    it('does not save before the cache file has been loaded once', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const storage = storageInstances.list[storageInstances.list.length - 1]

      // saveCachedPlatformAccessoriesOnDisk is called by handleRegisterPlatformAccessories etc.,
      // but it should be guarded by cachedAccessoriesFileLoaded === true.
      vi.spyOn(service.bridge, 'addBridgedAccessories').mockImplementation(() => {})
      service.handleRegisterPlatformAccessories([makePlatformAccessory('A')])

      // setItemSync should not have been called because cachedAccessoriesFileLoaded is still false
      expect(storage.setItemSync).not.toHaveBeenCalled()
    })

    it('saves to disk after loadCachedPlatformAccessoriesFromDisk has run', async () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const storage = storageInstances.list[storageInstances.list.length - 1]

      await service.loadCachedPlatformAccessoriesFromDisk()
      vi.spyOn(service.bridge, 'addBridgedAccessories').mockImplementation(() => {})
      service.handleRegisterPlatformAccessories([makePlatformAccessory('A')])

      expect(storage.setItemSync).toHaveBeenCalled()
    })
  })

  describe('loadCachedPlatformAccessoriesFromDisk', () => {
    it('loads cached accessories from disk and creates a backup', async () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const storage = storageInstances.list[storageInstances.list.length - 1]

      const cached = makePlatformAccessory('Cached')
      const serialized = PlatformAccessory.serialize(cached)
      storage.getItem.mockResolvedValueOnce([serialized])

      await service.loadCachedPlatformAccessoriesFromDisk()
      expect((service as any).cachedAccessoriesFileLoaded).toBe(true)
      // Backup is created when at least one accessory was loaded
      expect(storage.copyItem).toHaveBeenCalled()
    })

    it('falls back to backup when getItem throws SyntaxError', async () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const storage = storageInstances.list[storageInstances.list.length - 1]
      const errorSpy = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})

      const cached = makePlatformAccessory('FromBackup')
      storage.getItem
        .mockRejectedValueOnce(new SyntaxError('JSON corrupted'))
        .mockResolvedValueOnce([PlatformAccessory.serialize(cached)])

      await service.loadCachedPlatformAccessoriesFromDisk()

      expect(errorSpy).toHaveBeenCalled()
      expect((service as any).cachedPlatformAccessories).toHaveLength(1)
    })

    it('logs but does not crash when getItem throws a non-SyntaxError', async () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const storage = storageInstances.list[storageInstances.list.length - 1]
      const errorSpy = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})

      storage.getItem.mockRejectedValueOnce(new Error('Disk full'))

      await service.loadCachedPlatformAccessoriesFromDisk()

      expect(errorSpy).toHaveBeenCalled()
      expect((service as any).cachedPlatformAccessories).toEqual([])
    })
  })

  describe('publishBridge', () => {
    it('publishes with addIdentifyingMaterial and the configured pin/username', () => {
      const config = makeBridgeConfig({ name: 'PublishTest' })
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), config)
      const publishSpy = vi.spyOn(service.bridge, 'publish').mockResolvedValue(undefined)

      service.publishBridge()

      expect(publishSpy).toHaveBeenCalledTimes(1)
      const publishInfo = publishSpy.mock.calls[0][0] as any
      expect(publishInfo.username).toBe(config.username)
      expect(publishInfo.pincode).toBe(config.pin)
      expect(publishInfo.category).toBe(Categories.BRIDGE)
      expect(publishInfo.addIdentifyingMaterial).toBe(true)
    })

    it('includes setupID when it is exactly 4 characters', () => {
      const config = makeBridgeConfig({ setupID: 'AB12' })
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), config)
      const publishSpy = vi.spyOn(service.bridge, 'publish').mockResolvedValue(undefined)

      service.publishBridge()

      const publishInfo = publishSpy.mock.calls[0][0] as any
      expect(publishInfo.setupID).toBe('AB12')
    })

    it('omits setupID when length is not 4', () => {
      const config = makeBridgeConfig({ setupID: 'TOOLONG' })
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), config)
      const publishSpy = vi.spyOn(service.bridge, 'publish').mockResolvedValue(undefined)

      service.publishBridge()

      const publishInfo = publishSpy.mock.calls[0][0] as any
      expect(publishInfo.setupID).toBeUndefined()
    })
  })

  describe('isHapConfigEnabled', () => {
    it('returns true for undefined hap (default)', () => {
      expect(isHapConfigEnabled(undefined)).toBe(true)
    })

    it('returns true for an empty hap object (defaults to enabled)', () => {
      expect(isHapConfigEnabled({})).toBe(true)
    })

    it('returns true when enabled is explicitly true', () => {
      expect(isHapConfigEnabled({ enabled: true })).toBe(true)
    })

    it('returns false when enabled is explicitly false', () => {
      expect(isHapConfigEnabled({ enabled: false })).toBe(false)
    })

    it('returns false when enabled is false even alongside externalsOnly', () => {
      expect(isHapConfigEnabled({ enabled: false, externalsOnly: true })).toBe(false)
    })

    it('treats the legacy boolean form correctly (false = disabled, true = enabled)', () => {
      // Back-compat: a raw boolean may reach this helper before
      // validateHapConfig normalizes it. `hap: false` must read as disabled —
      // the old `!hap` logic would have wrongly returned true here.
      expect(isHapConfigEnabled(false)).toBe(false)
      expect(isHapConfigEnabled(true)).toBe(true)
    })
  })

  describe('isHapExternalsOnly', () => {
    it('returns true only for the object form with externalsOnly: true', () => {
      expect(isHapExternalsOnly({ enabled: false, externalsOnly: true })).toBe(true)
    })

    it('returns false for the object form without externalsOnly', () => {
      expect(isHapExternalsOnly({})).toBe(false)
      expect(isHapExternalsOnly({ enabled: false })).toBe(false)
      expect(isHapExternalsOnly({ enabled: true })).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isHapExternalsOnly(undefined)).toBe(false)
    })

    it('returns false for the legacy boolean form (booleans never carry externalsOnly)', () => {
      // The boolean shorthand has no externalsOnly; reading it must be safe and
      // always false, not a property access on a primitive.
      expect(isHapExternalsOnly(false)).toBe(false)
      expect(isHapExternalsOnly(true)).toBe(false)
    })
  })

  describe('validateHapConfig', () => {
    it('is a no-op when hap is undefined', () => {
      const cfg = makeBridgeConfig()
      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
    })

    it('accepts an empty hap object', () => {
      const cfg = makeBridgeConfig({ hap: {} })
      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
    })

    it('accepts hap.enabled: false on its own', () => {
      const cfg = makeBridgeConfig({ hap: { enabled: false } })
      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
    })

    it('accepts hap.enabled: false + externalsOnly: true (the canonical form)', () => {
      const cfg = makeBridgeConfig({ hap: { enabled: false, externalsOnly: true } })
      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
    })

    it('normalizes a legacy boolean hap: false to { enabled: false } (back-compat)', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({ hap: false })

      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
      expect(cfg.hap).toEqual({ enabled: false })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'))
      warnSpy.mockRestore()
    })

    it('normalizes a legacy boolean hap: true to { enabled: true } (back-compat)', () => {
      const cfg = makeBridgeConfig({ hap: true })

      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
      expect(cfg.hap).toEqual({ enabled: true })
    })

    it('accepts the legacy boolean hap form on a strongly-typed BridgeConfiguration', () => {
      // Stable v2.0.x shipped `hap?: boolean`, so a typed config may carry
      // `hap: false`. The type must accept it WITHOUT a cast (this assignment
      // is the regression — it would not compile if the field were object-only)
      // and validateHapConfig must normalize it.
      const cfg: BridgeConfiguration = {
        name: 'Typed',
        username: 'CC:22:3D:E3:CE:F6',
        pin: '031-45-154',
        hap: false,
      }

      validateHapConfig(cfg, { bridgeLabel: 'main' })
      expect(cfg.hap).toEqual({ enabled: false })
    })

    it('rejects an array hap value', () => {
      const cfg = makeBridgeConfig({ hap: [] })
      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).toThrow(/must be a boolean or an object/)
    })

    it('honours standalone externalsOnly: true without enabled: false (warns + normalises, mirrors Matter) (#3944)', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({ hap: { externalsOnly: true } })

      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
      expect(cfg.hap.enabled).toBe(false) // normalised in place to the canonical form
      expect(cfg.hap.externalsOnly).toBe(true) // preserved
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/externalsOnly.*without.*enabled: false/))
      warnSpy.mockRestore()
    })

    it('honours externalsOnly: true with enabled: true (warns + flips enabled to false)', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({ hap: { enabled: true, externalsOnly: true } })

      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
      expect(cfg.hap.enabled).toBe(false)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('strips externalsOnly with a warn log on accessory child bridges', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({ hap: { enabled: false, externalsOnly: true } })

      validateHapConfig(cfg, { bridgeLabel: 'accessory child', isAccessoryPlugin: true })

      expect(cfg.hap.externalsOnly).toBeUndefined()
      expect(cfg.hap.enabled).toBe(false) // enabled left intact
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/externalsOnly.*not supported.*accessory/))
    })

    it('does not throw on accessory child bridges with mismatched externalsOnly/enabled — strips externalsOnly instead', () => {
      // Even if accessory plugins set externalsOnly without enabled: false (which would normally throw),
      // the accessory-plugin path strips the field first and never reaches the conflict check.
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({ hap: { externalsOnly: true } })

      expect(() => validateHapConfig(cfg, { bridgeLabel: 'accessory child', isAccessoryPlugin: true })).not.toThrow()
      expect(cfg.hap.externalsOnly).toBeUndefined()
      expect(warnSpy).toHaveBeenCalled()
    })
  })
})
