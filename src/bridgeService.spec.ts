import type { MockInstance } from 'vitest'

import type { BridgeConfiguration } from './bridgeService.js'

import { Accessory, AccessoryEventTypes, Categories, Characteristic, CharacteristicWarningType, RemoteController, Service, uuid } from '@homebridge/hap-nodejs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI, InternalAPIEvent } from './api.js'
import {
  BridgeService,
  isHapConfigEnabled,
  isHapExternalsOnly,
  shouldAddIdentifyingMaterial,
  validateHapConfig,
} from './bridgeService.js'
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

// No real socket is opened to ask whether a port is free.
vi.mock('./util/port.js', () => ({
  isPortInUse: vi.fn().mockResolvedValue(false),
}))

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

    it.each([
      { insecureAccess: true, expected: true },
      { insecureAccess: false, expected: false },
      { insecureAccess: undefined, expected: false },
    ])('publishes the bridge and external accessories with insecure access $expected for the option $insecureAccess', async ({ insecureAccess, expected }) => {
      const opts = makeBridgeOptions({ insecureAccess })
      const service = new BridgeService(api, pluginManager, externalPortService, opts, makeBridgeConfig())
      const publishBridge = vi.spyOn(service.bridge, 'publish').mockResolvedValue(undefined)
      const external = makePlatformAccessory('External')
      const publishExternal = vi.spyOn(external._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)

      service.publishBridge()
      await service.handlePublishExternalAccessories([external])

      expect(publishBridge.mock.calls[0][1]).toBe(expected)
      expect(publishExternal.mock.calls[0][1]).toBe(expected)
    })

    it('creates a Bridge with the configured name', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig({ name: 'MyBridge' }))
      expect(service.bridge.displayName).toBe('MyBridge')
    })
  })

  describe('handleRegisterPlatformAccessories', () => {
    it('registers a new accessory and adds it to the bridge', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const accessory = makePlatformAccessory('Light')
      service.handleRegisterPlatformAccessories([accessory])
      expect(service.bridge.bridgedAccessories).toEqual([accessory._associatedHAPAccessory])
      expect((service as any).cachedPlatformAccessories).toEqual([accessory])
    })

    it('skips a duplicate-UUID accessory and logs a warning', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
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

    it('skips duplicate UUIDs within the same registration batch', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const original = makePlatformAccessory('Original')
      const duplicate = makePlatformAccessory('Duplicate')
      ;(duplicate as any)._associatedHAPAccessory.UUID = original._associatedHAPAccessory.UUID
      ;(duplicate as any).UUID = original._associatedHAPAccessory.UUID

      service.handleRegisterPlatformAccessories([original, duplicate])

      expect(service.bridge.bridgedAccessories).toEqual([original._associatedHAPAccessory])
      expect((service as any).cachedPlatformAccessories).toEqual([original])
    })

    it('warns when the registering plugin is not loaded', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      pluginManager.getPlugin.mockReturnValue(undefined)
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

      service.handleRegisterPlatformAccessories([
        makePlatformAccessory('Orphan'),
      ])

      const warned = warnSpy.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes('no loaded plugin'),
      )
      expect(warned).toBe(true)
    })

    it('also rejects collisions with accessories already on the bridge from the legacy load path', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})

      // An accessory already on the bridge — the legacy
      // \`config.accessories[]\` flow adds via \`addBridgedAccessory\` directly,
      // so it lives on \`bridge.bridgedAccessories\` but not in the cache map.
      const staticAccessory = makePlatformAccessory('Static')
      service.bridge.addBridgedAccessory(staticAccessory._associatedHAPAccessory)

      const dynamic = makePlatformAccessory('Dynamic')
      ;(dynamic as any)._associatedHAPAccessory.UUID = staticAccessory._associatedHAPAccessory.UUID
      ;(dynamic as any).UUID = staticAccessory._associatedHAPAccessory.UUID

      service.handleRegisterPlatformAccessories([dynamic])

      // Filtered out before it reaches the bridge (which is what threw deep
      // in HAP-NodeJS before the fix).
      expect(service.bridge.bridgedAccessories).toEqual([staticAccessory._associatedHAPAccessory])
      expect((service as any).cachedPlatformAccessories).toEqual([])
      const warned = warnSpy.mock.calls.some(call =>
        typeof call[0] === 'string' && call[0].includes('existing bridged accessory'),
      )
      expect(warned).toBe(true)
    })
  })

  describe('handleUpdatePlatformAccessories', () => {
    it('is a no-op for non-array input', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

      // Cast through unknown to bypass the type system; the runtime guard is the contract.
      service.handleUpdatePlatformAccessories('not-an-array' as unknown as PlatformAccessory[])

      // No throw, no crash. cachedPlatformAccessories should be untouched.
      expect((service as any).cachedPlatformAccessories).toEqual([])
    })

    it('replaces matching cached accessories by UUID', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

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

      const a = makePlatformAccessory('A')
      service.handleRegisterPlatformAccessories([a])
      expect((service as any).cachedPlatformAccessories).toHaveLength(1)
      expect(service.bridge.bridgedAccessories).toHaveLength(1)

      service.handleUnregisterPlatformAccessories([a])
      expect((service as any).cachedPlatformAccessories).toHaveLength(0)
      expect(service.bridge.bridgedAccessories).toHaveLength(0)
    })
  })

  describe('restoreCachedPlatformAccessories', () => {
    it('does not discard a registerPlatformAccessories() call made synchronously from configureAccessory()', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

      // The real bridge: HAP-NodeJS refuses an accessory that is bridged
      // already. If the restore loop wrongly re-visits an accessory registered
      // mid-restore, that shows as a "Could not restore" warning and as the
      // accessory dropping out of the cache.
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cachedA = makePlatformAccessory('A')
      const cachedB = makePlatformAccessory('B')
      ;(service as any).cachedPlatformAccessories = [cachedA, cachedB]

      // A dynamic platform commonly registers a brand new companion accessory
      // (e.g. a linked sensor) from within its configureAccessory() callback,
      // which restoreCachedPlatformAccessories() invokes synchronously while
      // it is still iterating the cached accessory list.
      const companion = makePlatformAccessory('Companion')
      const platform = {
        configureAccessory: vi.fn((accessory: any) => {
          if (accessory === cachedA) {
            service.handleRegisterPlatformAccessories([companion])
          }
        }),
      }
      pluginManager.getPlugin.mockReturnValue({
        getActiveDynamicPlatform: () => platform,
      })

      service.restoreCachedPlatformAccessories()

      const cached = (service as any).cachedPlatformAccessories
      expect(cached).toContain(cachedA)
      expect(cached).toContain(cachedB)
      expect(cached).toContain(companion)

      // configureAccessory is only for restoring cached accessories — the
      // companion was registered by the plugin itself and must not be handed
      // back through configureAccessory or bridged a second time.
      expect(platform.configureAccessory).toHaveBeenCalledTimes(2)
      expect(platform.configureAccessory).not.toHaveBeenCalledWith(companion)
      expect(service.bridge.bridgedAccessories).toEqual([
        companion._associatedHAPAccessory,
        cachedA._associatedHAPAccessory,
        cachedB._associatedHAPAccessory,
      ])
      expect(warnSpy.mock.calls.flat().join(' ')).not.toMatch(/Could not restore/)
    })

    it('does not restore an accessory unregistered synchronously from an earlier configureAccessory()', () => {
      // nothing of the bridge is replaced: HAP-NodeJS throws when it is asked
      // to remove an accessory that is not on the bridge
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

      const cachedA = makePlatformAccessory('A')
      const cachedB = makePlatformAccessory('B')
      const cachedC = makePlatformAccessory('C')
      ;(service as any).cachedPlatformAccessories = [cachedA, cachedB, cachedC]

      // A plugin may decide during restore that a cached accessory is stale and
      // unregister it before the loop reaches it. The loop must neither
      // configure/bridge the removed accessory nor skip over its neighbours.
      const platform = {
        configureAccessory: vi.fn((accessory: any) => {
          if (accessory === cachedA) {
            service.handleUnregisterPlatformAccessories([cachedB])
          }
        }),
      }
      pluginManager.getPlugin.mockReturnValue({
        getActiveDynamicPlatform: () => platform,
      })

      service.restoreCachedPlatformAccessories()

      const cached = (service as any).cachedPlatformAccessories
      expect(cached).toContain(cachedA)
      expect(cached).not.toContain(cachedB)
      expect(cached).toContain(cachedC)
      expect(platform.configureAccessory).toHaveBeenCalledWith(cachedA)
      expect(platform.configureAccessory).toHaveBeenCalledWith(cachedC)
      expect(platform.configureAccessory).not.toHaveBeenCalledWith(cachedB)
      expect(service.bridge.bridgedAccessories).toEqual([
        cachedA._associatedHAPAccessory,
        cachedC._associatedHAPAccessory,
      ])
    })

    it('does not discard an updatePlatformAccessories() call made synchronously from configureAccessory()', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

      const cachedA = makePlatformAccessory('A')
      const cachedB = makePlatformAccessory('B')
      ;(service as any).cachedPlatformAccessories = [cachedA, cachedB]

      // A dynamic platform may replace a cached accessory wholesale (e.g. to
      // add/remove a service) by handing a new PlatformAccessory instance to
      // api.updatePlatformAccessories() with the same UUID, from within
      // configureAccessory().
      const replacementA = makePlatformAccessory('A-updated')
      ;(replacementA as any)._associatedHAPAccessory.UUID = cachedA._associatedHAPAccessory.UUID
      ;(replacementA as any).UUID = cachedA._associatedHAPAccessory.UUID
      const platform = {
        configureAccessory: vi.fn((accessory: any) => {
          if (accessory === cachedA) {
            service.handleUpdatePlatformAccessories([replacementA])
          }
        }),
      }
      pluginManager.getPlugin.mockReturnValue({
        getActiveDynamicPlatform: () => platform,
      })

      service.restoreCachedPlatformAccessories()

      const cached = (service as any).cachedPlatformAccessories
      expect(cached).toContain(replacementA)
      expect(cached).not.toContain(cachedA)
      expect(cached).toContain(cachedB)
    })

    it('still drops orphaned accessories when keepOrphanedCachedAccessories is false', () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions({ keepOrphanedCachedAccessories: false }), makeBridgeConfig())
      pluginManager.getPlugin.mockReturnValue(undefined)
      pluginManager.getPluginByActiveDynamicPlatform.mockReturnValue(undefined)

      const orphan = makePlatformAccessory('Orphan')
      ;(service as any).cachedPlatformAccessories = [orphan]

      service.restoreCachedPlatformAccessories()

      expect((service as any).cachedPlatformAccessories).toHaveLength(0)
    })
  })

  describe('handlePublishExternalAccessories', () => {
    it('publishes each external accessory on the port it was given, under its own username', async () => {
      externalPortService.requestPort.mockResolvedValueOnce(50000).mockResolvedValueOnce(50001)
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

      const a = makePlatformAccessory('External-A')
      const b = makePlatformAccessory('External-B')
      // Stub publish so it doesn't actually try to bind a port.
      const publishA = vi.spyOn(a._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)
      const publishB = vi.spyOn(b._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)

      await service.handlePublishExternalAccessories([a, b])

      expect(externalPortService.requestPort).toHaveBeenCalledTimes(2)
      const [infoA, infoB] = [publishA.mock.calls[0][0], publishB.mock.calls[0][0]]
      expect(infoA).toMatchObject({ port: 50000, pincode: '031-45-154', category: Categories.OTHER })
      expect(infoB).toMatchObject({ port: 50001, pincode: '031-45-154', category: Categories.OTHER })
      // the port is asked for under the username the accessory is published with
      expect(externalPortService.requestPort.mock.calls.map((call: unknown[]) => call[0])).toEqual([infoA.username, infoB.username])
      expect(infoA.username).not.toBe(infoB.username)
      // the metadata file for the UI names both, with their ports
      const storage = storageInstances.list.at(-1)
      expect(storage.setItemSync).toHaveBeenLastCalledWith('externalAccessories', [
        expect.objectContaining({
          username: infoA.username,
          displayName: 'External-A',
          plugin: 'homebridge-test',
          port: 50000,
        }),
        expect.objectContaining({
          username: infoB.username,
          displayName: 'External-B',
          plugin: 'homebridge-test',
          port: 50001,
        }),
      ])
    })

    it('logs an external accessory that could not be published, and publishes the next one', async () => {
      const errorSpy = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const a = makePlatformAccessory('External-A')
      const b = makePlatformAccessory('External-B')
      vi.spyOn(a._associatedHAPAccessory, 'publish').mockRejectedValue(new Error('no advertiser'))
      const publishB = vi.spyOn(b._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)

      await service.handlePublishExternalAccessories([a, b])
      await Promise.resolve()

      expect(errorSpy).toHaveBeenCalledWith('Failed to publish external accessory \'%s\': %s', 'External-A', 'no advertiser')
      expect(publishB).toHaveBeenCalledTimes(1)
    })

    it('forwards hap.disableIdentifyingMaterial to external accessories', async () => {
      externalPortService.requestPort.mockResolvedValue(50002)
      const service = new BridgeService(
        api,
        pluginManager,
        externalPortService,
        makeBridgeOptions(),
        makeBridgeConfig({
          hap: { disableIdentifyingMaterial: true },
        }),
      )

      const accessory = makePlatformAccessory('External-Exact-Name')
      const publishSpy = vi.spyOn(accessory._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)

      await service.handlePublishExternalAccessories([accessory])

      const publishInfo = publishSpy.mock.calls[0][0] as any
      expect(publishInfo.addIdentifyingMaterial).toBe(false)
    })

    it('does not publish an accessory a second time, and does not throw for it', async () => {
      externalPortService.requestPort.mockResolvedValue(50000)
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())

      const a = makePlatformAccessory('External-A')
      const publish = vi.spyOn(a._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)
      await service.handlePublishExternalAccessories([a])

      // Re-publish the same accessory — same UUID → same advertise-address.
      // The handler runs from an event, so a throw here could not be caught by
      // the plugin and would end the process as an unhandled rejection.
      await expect(service.handlePublishExternalAccessories([a])).resolves.toBeUndefined()
      expect(publish).toHaveBeenCalledTimes(1)
    })

    it('skips publishing external accessories when HAP is disabled (no externalsOnly)', async () => {
      const service = new BridgeService(
        api,
        pluginManager,
        externalPortService,
        makeBridgeOptions(),
        makeBridgeConfig({
          hap: { enabled: false },
        }),
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
        makeBridgeConfig({
          hap: { enabled: false, externalsOnly: true },
        }),
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
      const plugin = {
        getPluginIdentifier: () => 'homebridge-test',
      } as any
      const accessoryInstance = {
        getServices: () => [],
      } as any
      const result = service.createHAPAccessory(plugin, accessoryInstance, 'Empty', 'EmptyAccessory')
      expect(result).toBeUndefined()
    })

    it('builds an Accessory from getServices()', async () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const plugin = {
        getPluginIdentifier: () => 'homebridge-test',
      } as any
      const { Service } = await import('@homebridge/hap-nodejs')
      const accessoryInstance = {
        getServices: () => [
          new Service.Switch('TestSwitch'),
        ],
      } as any
      const result = service.createHAPAccessory(plugin, accessoryInstance, 'TestName', 'TestAccessory')
      expect(result).toBeInstanceOf(Accessory)
      expect(result?.displayName).toBe('TestName')
    })
  })

  describe('createHAPAccessory with real services', () => {
    const plugin = {
      getPluginIdentifier: () => 'homebridge-test',
    } as any

    function makeService(): BridgeService {
      return new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
    }

    it('gives nothing for an accessory with no services and no controllers', () => {
      const none = {
        getServices: () => [],
      }
      const onlyUndefined = {
        getServices: () => [undefined],
        getControllers: () => [undefined],
      }

      expect(makeService().createHAPAccessory(plugin, none, 'Empty', 'Example')).toBeUndefined()
      expect(makeService().createHAPAccessory(plugin, onlyUndefined as any, 'Empty', 'Example')).toBeUndefined()
    })

    it('makes the UUID from the accessory type and the name, or the uuid base when there is one', () => {
      const instance = {
        getServices: () => [
          new Service.Switch('Lamp'),
        ],
      }
      const service = makeService()

      expect(service.createHAPAccessory(plugin, instance, 'Lamp', 'Example')!.UUID).toBe(uuid.generate('Example:Lamp'))
      expect(service.createHAPAccessory(plugin, {
        getServices: () => [
          new Service.Switch('Lamp'),
        ],
      }, 'Lamp', 'Example', 'base')!.UUID).toBe(uuid.generate('Example:base'))
    })

    it('adds the services, and merges the plugin\'s AccessoryInformation into the one of the accessory', () => {
      const information = new Service.AccessoryInformation()
      information.setCharacteristic(Characteristic.Manufacturer, 'Acme')
      information.setCharacteristic(Characteristic.Model, 'Lamp 2000')
      // a listener some plugins put on Identify, which would take the place of the one of HAP-NodeJS
      const pluginIdentify = vi.fn()
      information.getCharacteristic(Characteristic.Identify).on('set', pluginIdentify)
      const lamp = new Service.Switch('Lamp')

      const accessory = makeService().createHAPAccessory(plugin, {
        getServices: () => [information, lamp],
      }, 'Lamp', 'Example')!

      // one AccessoryInformation service (the one HAP-NodeJS made), plus the switch
      expect(accessory.services.filter(service => service instanceof Service.AccessoryInformation)).toHaveLength(1)
      expect(accessory.services).toContain(lamp)
      expect(accessory.services).not.toContain(information)
      const merged = accessory.getService(Service.AccessoryInformation)!
      expect(merged.getCharacteristic(Characteristic.Manufacturer).value).toBe('Acme')
      expect(merged.getCharacteristic(Characteristic.Model).value).toBe('Lamp 2000')
      expect(merged.getCharacteristic(Characteristic.Name).value).toBe('Lamp')
      expect(information.getCharacteristic(Characteristic.Identify).listenerCount('set')).toBe(0)
    })

    it('calls identify() of the accessory with a callback, and answers HomeKit itself', () => {
      const identify = vi.fn()
      const instance = {
        identify,
        getServices: () => [
          new Service.Switch('Lamp'),
        ],
      }
      const accessory = makeService().createHAPAccessory(plugin, instance, 'Lamp', 'Example')!
      const answered = vi.fn()

      accessory.emit(AccessoryEventTypes.IDENTIFY, true, answered)

      expect(identify).toHaveBeenCalledTimes(1)
      // old plugins wait for a callback; called on the instance, so `this` works in the plugin
      expect(identify.mock.calls[0][0]).toBeTypeOf('function')
      expect(identify.mock.contexts[0]).toBe(instance)
      expect(answered).toHaveBeenCalledTimes(1)
    })

    it('configures the controllers the accessory returns', () => {
      const controller = new RemoteController()
      const instance = {
        getServices: () => [],
        getControllers: () => [controller],
      }
      const configure = vi.spyOn(Accessory.prototype, 'configureController')

      const accessory = makeService().createHAPAccessory(plugin, instance, 'Remote', 'Example')

      expect(accessory).toBeDefined()
      expect(configure).toHaveBeenCalledExactlyOnceWith(controller)
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
      return {
        getPluginIdentifier: () => 'homebridge-test',
      } as any
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

    const WIKI = 'See https://homebridge.io/w/JtMGR for more info.'
    const PREFIX = expect.stringContaining('homebridge-test')

    it('names the plugin, the characteristic and the accessory for a warning, at info level', () => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, makeWarning(CharacteristicWarningType.WARN_MESSAGE, 'value is out of range'))

      expect(logSpy).toHaveBeenCalledExactlyOnceWith(
        PREFIX,
        'This plugin generated a warning from the characteristic \'FakeCharacteristic\' of the accessory \'FakeAccessory\':',
        'value is out of range.',
        WIKI,
      )
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('names the accessory for an error, at error level', () => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, makeWarning(CharacteristicWarningType.ERROR_MESSAGE, 'handler threw'))

      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        PREFIX,
        'This plugin threw an error from the characteristic \'FakeCharacteristic\' of the accessory \'FakeAccessory\':',
        'handler threw.',
        WIKI,
      )
    })

    it.each(['Adding anyway.', 'Is that right?', 'Fix it!'])('does not add a second full stop to "%s"', (message) => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, makeWarning(CharacteristicWarningType.WARN_MESSAGE, message))

      expect(logSpy.mock.calls[0][2]).toBe(message)
    })

    it('prints a type it does not know as a warning, at info level', () => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, makeWarning('some-new-type' as CharacteristicWarningType, 'new'))

      expect(logSpy).toHaveBeenCalledExactlyOnceWith(PREFIX, expect.stringContaining('generated a warning'), 'new.', WIKI)
    })

    it.each([
      CharacteristicWarningType.SLOW_READ,
      CharacteristicWarningType.SLOW_WRITE,
    ])('says the plugin slows down Homebridge for %s, at info level', (type) => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), {}, makeWarning(type, 'took 4 seconds'))

      expect(logSpy).toHaveBeenCalledExactlyOnceWith(PREFIX, 'This plugin slows down Homebridge.', 'took 4 seconds', WIKI)
    })

    it.each([
      CharacteristicWarningType.TIMEOUT_READ,
      CharacteristicWarningType.TIMEOUT_WRITE,
    ])('says the plugin did not answer in time for %s, at error level', (type) => {
      BridgeService.printCharacteristicWriteWarning(fakePlugin(), fakeAccessory(), { ignoreSlow: true }, makeWarning(type, 'gave no answer'))

      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(PREFIX, 'This plugin did not answer in time, which slows down Homebridge.', 'gave no answer', WIKI)
      expect(logSpy).not.toHaveBeenCalled()
    })

    it('emits a debug log when warning.stack is present', () => {
      const warning = {
        ...makeWarning(CharacteristicWarningType.WARN_MESSAGE),
        stack: 'Error stack here',
      }
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
      service.handleRegisterPlatformAccessories([
        makePlatformAccessory('A'),
      ])

      // setItemSync should not have been called because cachedAccessoriesFileLoaded is still false
      expect(storage.setItemSync).not.toHaveBeenCalled()
    })

    it('saves to disk after loadCachedPlatformAccessoriesFromDisk has run', async () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const storage = storageInstances.list[storageInstances.list.length - 1]

      await service.loadCachedPlatformAccessoriesFromDisk()
      vi.spyOn(service.bridge, 'addBridgedAccessories').mockImplementation(() => {})
      service.handleRegisterPlatformAccessories([
        makePlatformAccessory('A'),
      ])

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
        .mockResolvedValueOnce([
          PlatformAccessory.serialize(cached),
        ])

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

    it('disables identifying material when configured in the HAP block', () => {
      const config = makeBridgeConfig({
        hap: { disableIdentifyingMaterial: true },
      })
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), config)
      const publishSpy = vi.spyOn(service.bridge, 'publish').mockResolvedValue(undefined)

      service.publishBridge()

      const publishInfo = publishSpy.mock.calls[0][0] as any
      expect(publishInfo.addIdentifyingMaterial).toBe(false)
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

    it.each([
      { setupID: 'TOOLONG', warning: /not 4 characters long/ },
      { setupID: 1234, warning: /not 4 characters long/ },
      { setupID: 'ab-1', warning: /should be 4 characters from 0-9 and A-Z/ },
    ])('warns about the setupID $setupID', ({ setupID, warning }) => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig({ setupID }))
      vi.spyOn(service.bridge, 'publish').mockResolvedValue(undefined)

      service.publishBridge()

      expect(warnSpy.mock.calls.flat().join(' ')).toMatch(warning)
    })

    it('gives no warning for a good setupID, or for none', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      for (const setupID of ['AB12', undefined]) {
        const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig({ setupID }))
        vi.spyOn(service.bridge, 'publish').mockResolvedValue(undefined)
        service.publishBridge()
      }

      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('logs an error when bridge.publish() rejects (e.g. mDNS bring-up failure)', async () => {
      const service = new BridgeService(api, pluginManager, externalPortService, makeBridgeOptions(), makeBridgeConfig())
      const errorSpy = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
      vi.spyOn(service.bridge, 'publish').mockRejectedValue(new Error('mDNS port already in use'))

      service.publishBridge()
      // Let the rejected promise reach its catch handler.
      await new Promise(resolve => setImmediate(resolve))

      const loggedTheFailure = errorSpy.mock.calls.some(call =>
        typeof call[0] === 'string'
        && call[0].includes('Failed to publish bridge')
        && call.some(arg => typeof arg === 'string' && arg.includes('mDNS port already in use')),
      )
      expect(loggedTheFailure).toBe(true)
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

  describe('shouldAddIdentifyingMaterial', () => {
    it('defaults to true when disabling identifying material is omitted or false', () => {
      expect(shouldAddIdentifyingMaterial(undefined)).toBe(true)
      expect(shouldAddIdentifyingMaterial({})).toBe(true)
      expect(shouldAddIdentifyingMaterial(false)).toBe(true)
      expect(shouldAddIdentifyingMaterial(true)).toBe(true)
      expect(shouldAddIdentifyingMaterial(null as any)).toBe(true)
      expect(shouldAddIdentifyingMaterial({ disableIdentifyingMaterial: false })).toBe(true)
    })

    it('honours an explicit true value', () => {
      expect(shouldAddIdentifyingMaterial({ disableIdentifyingMaterial: true })).toBe(false)
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

    it.each([
      {
        hap: { enabled: 'false' },
        key: 'enabled',
      },
      {
        hap: { enabled: 0 },
        key: 'enabled',
      },
      {
        hap: { externalsOnly: 'true' },
        key: 'externalsOnly',
      },
    ])('warns about $hap and leaves the value out, so the bridge does what it did before', ({ hap, key }) => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({ hap })

      validateHapConfig(cfg, { bridgeLabel: 'main bridge' })

      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`'hap\\.${key}' must be true or false`)))
      expect(cfg.hap).toEqual({})
      // unchanged: a value that is not the boolean false never turned HAP off, and only true turns externalsOnly on
      expect(isHapConfigEnabled(cfg.hap)).toBe(true)
      expect(isHapExternalsOnly(cfg.hap)).toBe(false)
    })

    it('rejects a non-boolean hap.disableIdentifyingMaterial value', () => {
      const cfg = makeBridgeConfig({
        hap: { disableIdentifyingMaterial: 'true' },
      })
      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).toThrow(/disableIdentifyingMaterial.*boolean/)
    })

    it('warns about mDNS collisions when hap.disableIdentifyingMaterial is true', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({
        hap: { disableIdentifyingMaterial: true },
      })

      validateHapConfig(cfg, { bridgeLabel: 'main bridge' })

      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/^main bridge:/))
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/identifying material is disabled/i))
    })

    it('does not warn when hap.disableIdentifyingMaterial is omitted or false', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})

      validateHapConfig(makeBridgeConfig({ hap: {} }), { bridgeLabel: 'main bridge' })
      validateHapConfig(
        makeBridgeConfig({
          hap: { disableIdentifyingMaterial: false },
        }),
        { bridgeLabel: 'main bridge' },
      )

      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('accepts hap.enabled: false on its own', () => {
      const cfg = makeBridgeConfig({
        hap: { enabled: false },
      })
      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
    })

    it('accepts hap.enabled: false + externalsOnly: true (the canonical form)', () => {
      const cfg = makeBridgeConfig({
        hap: { enabled: false, externalsOnly: true },
      })
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
      const cfg = makeBridgeConfig({
        hap: { externalsOnly: true },
      })

      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
      expect(cfg.hap.enabled).toBe(false) // normalised in place to the canonical form
      expect(cfg.hap.externalsOnly).toBe(true) // preserved
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/externalsOnly.*without.*enabled: false/))
      warnSpy.mockRestore()
    })

    it('honours externalsOnly: true with enabled: true (warns + flips enabled to false)', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({
        hap: { enabled: true, externalsOnly: true },
      })

      expect(() => validateHapConfig(cfg, { bridgeLabel: 'main' })).not.toThrow()
      expect(cfg.hap.enabled).toBe(false)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('strips externalsOnly with a warn log on accessory child bridges', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({
        hap: { enabled: false, externalsOnly: true },
      })

      validateHapConfig(cfg, { bridgeLabel: 'accessory child', isAccessoryPlugin: true })

      expect(cfg.hap.externalsOnly).toBeUndefined()
      expect(cfg.hap.enabled).toBe(false) // enabled left intact
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/externalsOnly.*not supported.*accessory/))
    })

    it('does not throw on accessory child bridges with mismatched externalsOnly/enabled — strips externalsOnly instead', () => {
      // Even if accessory plugins set externalsOnly without enabled: false (which would normally throw),
      // the accessory-plugin path strips the field first and never reaches the conflict check.
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      const cfg = makeBridgeConfig({
        hap: { externalsOnly: true },
      })

      expect(() => validateHapConfig(cfg, { bridgeLabel: 'accessory child', isAccessoryPlugin: true })).not.toThrow()
      expect(cfg.hap.externalsOnly).toBeUndefined()
      expect(warnSpy).toHaveBeenCalled()
    })
  })
})
