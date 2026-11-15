import type { PluginManager } from './pluginManager.js'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AccessoryEventTypes, Characteristic, CharacteristicWarningType, Service, uuid } from '@homebridge/hap-nodejs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI } from './api.js'
import { BridgeService } from './bridgeService.js'
import { ExternalPortService } from './externalPortService.js'
import { Logger } from './logger.js'
import { PlatformAccessory } from './platformAccessory.js'

/**
 * BridgeService against the real HAP-NodeJS bridge and a real cache folder.
 *
 * bridgeService.spec.ts replaces the bridge's add and remove calls with
 * mocks, so it can not see what HAP-NodeJS does with them (it throws for an
 * accessory that is not on the bridge, for one). These tests leave them real.
 */

const PLUGIN = 'homebridge-test'
const PLATFORM = 'TestPlatform'

let storageDir: string
let api: HomebridgeAPI
let service: BridgeService
let configureAccessory: ReturnType<typeof vi.fn>

beforeEach(() => {
  for (const level of ['info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(() => {})
  }
  storageDir = mkdtempSync(join(tmpdir(), 'hb-bridge-service-'))
  api = new HomebridgeAPI()
  configureAccessory = vi.fn()
  const plugin = {
    getPluginIdentifier: () => PLUGIN,
    getActiveDynamicPlatform: () => ({ configureAccessory }),
  }
  const pluginManager = {
    getPlugin: () => plugin,
    getPluginByActiveDynamicPlatform: () => plugin,
  } as unknown as PluginManager
  service = new BridgeService(api, pluginManager, new ExternalPortService(), {
    cachedAccessoriesDir: storageDir,
    cachedAccessoriesItemName: 'cachedAccessories',
    externalAccessoriesItemName: 'externalAccessories',
  }, { name: 'Test Bridge', username: 'CC:22:3D:E3:CE:30', pin: '031-45-154' })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(storageDir, { recursive: true, force: true })
})

/** A platform accessory with one switch service. */
function accessory(name: string): PlatformAccessory {
  const platformAccessory = new PlatformAccessory(name, uuid.generate(`bridge-service-real.${name}`))
  platformAccessory.addService(Service.Switch, name)
  return platformAccessory
}

/** Put accessories in the cache as if they had been loaded from disk. */
function cache(...accessories: PlatformAccessory[]): void {
  for (const cached of accessories) {
    cached._associatedPlugin = PLUGIN
    cached._associatedPlatform = PLATFORM
  }
  ;(service as unknown as { cachedPlatformAccessories: PlatformAccessory[] }).cachedPlatformAccessories = accessories
}

const bridged = () => service.bridge.bridgedAccessories.map(bridgedAccessory => bridgedAccessory.displayName)
const cached = () => (service as unknown as { cachedPlatformAccessories: PlatformAccessory[] }).cachedPlatformAccessories.map(cachedAccessory => cachedAccessory.displayName)

describe('unregisterPlatformAccessories on the real bridge', () => {
  it('lets a plugin unregister a later cached accessory from configureAccessory', () => {
    const [first, stale, last] = [
      accessory('First'),
      accessory('Stale'),
      accessory('Last'),
    ]
    cache(first, stale, last)
    configureAccessory.mockImplementation((configured: PlatformAccessory) => {
      if (configured === first) {
        api.unregisterPlatformAccessories(PLUGIN, PLATFORM, [stale])
      }
    })

    service.restoreCachedPlatformAccessories()

    expect(bridged()).toEqual(['First', 'Last'])
    expect(cached()).toEqual(['First', 'Last'])
  })

  it('lets a plugin unregister the accessory that is being configured', () => {
    const [stale, kept] = [
      accessory('Stale'),
      accessory('Kept'),
    ]
    cache(stale, kept)
    configureAccessory.mockImplementation((configured: PlatformAccessory) => {
      if (configured === stale) {
        api.unregisterPlatformAccessories(PLUGIN, PLATFORM, [configured])
      }
    })

    service.restoreCachedPlatformAccessories()

    expect(bridged()).toEqual(['Kept'])
    expect(cached()).toEqual(['Kept'])
  })

  it('does not throw when an accessory is unregistered twice, or was never registered', () => {
    const [registered, other, never] = [
      accessory('Registered'),
      accessory('Other'),
      accessory('Never'),
    ]
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [registered, other])

    api.unregisterPlatformAccessories(PLUGIN, PLATFORM, [registered])
    expect(() => api.unregisterPlatformAccessories(PLUGIN, PLATFORM, [registered])).not.toThrow()
    // one that is not on the bridge must not stop the others in the same call
    expect(() => api.unregisterPlatformAccessories(PLUGIN, PLATFORM, [never, other])).not.toThrow()

    expect(bridged()).toEqual([])
    expect(cached()).toEqual([])
  })
})

describe('characteristic warnings of a platform accessory', () => {
  it('are printed once, however often the same accessory is registered again', () => {
    const lamp = accessory('Lamp')
    const hapAccessory = lamp._associatedHAPAccessory
    // HAP-NodeJS from v2.3.1 keeps a removed accessory's listeners; older
    // versions wiped them all, which hid a listener added per registration.
    vi.spyOn(hapAccessory, 'removeAllListeners').mockReturnValue(hapAccessory)
    const printed = vi.spyOn(BridgeService, 'printCharacteristicWriteWarning').mockImplementation(() => {})

    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])
    for (let round = 0; round < 3; round++) {
      api.unregisterPlatformAccessories(PLUGIN, PLATFORM, [lamp])
      api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])
    }
    hapAccessory.emit(AccessoryEventTypes.CHARACTERISTIC_WARNING, {
      characteristic: lamp.getService(Service.Switch)!.getCharacteristic(Characteristic.On),
      type: CharacteristicWarningType.WARN_MESSAGE,
      message: 'test warning',
      originatorChain: [],
    })

    expect(printed).toHaveBeenCalledTimes(1)
  })
})
