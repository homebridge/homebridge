import type { StaticPlatformPlugin } from './api.js'
import type { Plugin } from './plugin.js'
import type { PluginManager } from './pluginManager.js'

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AccessoryEventTypes, Characteristic, CharacteristicWarningType, Service, uuid } from '@homebridge/hap-nodejs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeAPI } from './api.js'
import { BridgeService } from './bridgeService.js'
import { ExternalPortService } from './externalPortService.js'
import { Logger } from './logger.js'
import { PlatformAccessory } from './platformAccessory.js'
import { StorageService } from './storageService.js'

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
  // only the timers, so the tests can let the time between two cache saves pass
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout'],
  })
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
  vi.useRealTimers()
  vi.restoreAllMocks()
  rmSync(storageDir, { recursive: true, force: true })
})

/** What the cache file holds once the save a plugin's call asked for has been written. */
function savedCache(): { displayName: string, context: unknown }[] {
  // saves that follow one another within a second are written together, when the second is over
  vi.advanceTimersByTime(1000)
  return JSON.parse(readFileSync(join(storageDir, 'cachedAccessories'), 'utf-8')) as { displayName: string, context: unknown }[]
}
const savedNames = () => savedCache().map(entry => entry.displayName)

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

describe('registerPlatformAccessories on the real bridge', () => {
  /** Fill the bridge up to the most accessories HAP-NodeJS allows on it. */
  function fillBridge(): void {
    api.registerPlatformAccessories(PLUGIN, PLATFORM, Array.from({ length: 149 }, (_, index) => accessory(`Filler ${index}`)))
  }

  it('keeps an accessory the bridge refuses out of the cache, and does not throw into the plugin', () => {
    fillBridge()
    const errors = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})

    // one more than the bridge can hold
    expect(() => api.registerPlatformAccessories(PLUGIN, PLATFORM, [
      accessory('One Too Many'),
    ])).not.toThrow()

    expect(bridged()).toHaveLength(149)
    expect(cached()).toHaveLength(149)
    expect(cached()).not.toContain('One Too Many')
    // the log line names the accessory and the limit
    const logged = errors.mock.calls.map(call => call.join(' ')).join('\n')
    expect(logged).toContain('One Too Many')
    expect(logged).toContain('149 accessories at most')
  })

  it('registers the others of a batch when the bridge refuses one', () => {
    const [lamp, published, fan] = [
      accessory('Lamp'),
      accessory('Published'),
      accessory('Fan'),
    ]
    // HAP-NodeJS refuses to bridge an accessory that was published on its own before
    ;(published._associatedHAPAccessory as unknown as { initialized: boolean }).initialized = true

    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp, published, fan])

    expect(bridged()).toEqual(['Lamp', 'Fan'])
    expect(cached()).toEqual(['Lamp', 'Fan'])
  })

  it('tells HomeKit about a batch of new accessories once', () => {
    const update = vi.spyOn(service.bridge as unknown as { enqueueConfigurationUpdate: () => void }, 'enqueueConfigurationUpdate')

    api.registerPlatformAccessories(PLUGIN, PLATFORM, [
      accessory('Lamp'),
      accessory('Fan'),
    ])

    expect(update).toHaveBeenCalledTimes(1)
  })
})

describe('restoring a cache that holds one UUID twice', () => {
  it('gives the plugin the first accessory only, and drops the second', () => {
    const first = accessory('First')
    const twin = new PlatformAccessory('Twin', first.UUID)
    const last = accessory('Last')
    cache(first, twin, last)

    service.restoreCachedPlatformAccessories()

    expect(configureAccessory.mock.calls.map(([configured]) => (configured as PlatformAccessory).displayName)).toEqual(['First', 'Last'])
    expect(bridged()).toEqual(['First', 'Last'])
    expect(cached()).toEqual(['First', 'Last'])
  })
})

describe('a platform that only does Matter, on the real bridge', () => {
  it('gets its cached HAP accessories on the bridge without a configureAccessory method', () => {
    const pluginManager = (service as unknown as { pluginManager: { getPlugin: () => unknown } }).pluginManager
    pluginManager.getPlugin = () => ({
      getPluginIdentifier: () => PLUGIN,
      getActiveDynamicPlatform: () => ({
        configureMatterAccessory: () => {},
      }),
    })
    cache(accessory('Old'))

    service.restoreCachedPlatformAccessories()

    expect(bridged()).toEqual(['Old'])
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

describe('characteristic warnings that reach the bridge', () => {
  /** Every log line, at any level, that holds the text. */
  function logged(text: string): string[] {
    return (['info', 'warn', 'error', 'debug'] as const)
      .flatMap(level => vi.mocked(Logger.internal[level]).mock.calls)
      .map(call => call.join(' '))
      .filter(line => line.includes(text))
  }

  beforeEach(() => {
    for (const level of ['info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(Logger.internal, level).mockImplementation(() => {})
    }
  })

  /** Send a warning from a characteristic the way HAP-NodeJS does, and let the bridge look at it. */
  async function warn(characteristic: Characteristic, type: CharacteristicWarningType, message: string): Promise<void> {
    (characteristic as unknown as { characteristicWarning: (message: string, type: CharacteristicWarningType) => void }).characteristicWarning(message, type)
    await Promise.resolve()
  }

  it('prints one from a service of the bridge itself', async () => {
    const manufacturer = service.bridge.getService(Service.AccessoryInformation)!.getCharacteristic(Characteristic.Manufacturer)

    await warn(manufacturer, CharacteristicWarningType.WARN_MESSAGE, 'bridge warning')

    expect(logged('bridge warning')).toHaveLength(1)
    expect(logged('bridge warning')[0]).toContain('[Test Bridge@')
    expect(vi.mocked(Logger.internal.warn)).toHaveBeenCalledTimes(1)
  })

  it('prints an error from the bridge itself as an error', async () => {
    const manufacturer = service.bridge.getService(Service.AccessoryInformation)!.getCharacteristic(Characteristic.Manufacturer)

    await warn(manufacturer, CharacteristicWarningType.ERROR_MESSAGE, 'bridge error')

    expect(vi.mocked(Logger.internal.error).mock.calls.map(call => call.join(' ')).join('\n')).toContain('bridge error')
  })

  it('prints one from an accessory whose plugin is not loaded', async () => {
    const pluginManager = (service as unknown as { pluginManager: { getPlugin: () => unknown } }).pluginManager
    pluginManager.getPlugin = () => undefined
    const lamp = accessory('Lamp')
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])

    await warn(lamp.getService(Service.Switch)!.getCharacteristic(Characteristic.On), CharacteristicWarningType.WARN_MESSAGE, 'orphan warning')

    expect(logged('orphan warning')).toHaveLength(1)
    expect(logged('orphan warning')[0]).toContain('Lamp')
  })

  it('prints one from an accessory of a loaded plugin once, under the name of the plugin', async () => {
    const lamp = accessory('Lamp')
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])
    const restored = accessory('Restored')
    cache(restored)
    service.restoreCachedPlatformAccessories()

    await warn(lamp.getService(Service.Switch)!.getCharacteristic(Characteristic.On), CharacteristicWarningType.WARN_MESSAGE, 'registered warning')
    await warn(restored.getService(Service.Switch)!.getCharacteristic(Characteristic.On), CharacteristicWarningType.WARN_MESSAGE, 'restored warning')

    expect(logged('registered warning')).toHaveLength(1)
    expect(logged('registered warning')[0]).toContain(PLUGIN)
    expect(logged('restored warning')).toHaveLength(1)
    expect(logged('restored warning')[0]).toContain(PLUGIN)
  })
})

describe('loading the cached accessories from disk', () => {
  const cacheFile = () => join(storageDir, 'cachedAccessories')
  const backupFile = () => join(storageDir, '.cachedAccessories.bak')
  /** The cache file content for these accessories, as a real save writes it. */
  function serialized(...accessories: PlatformAccessory[]): unknown[] {
    for (const cachedAccessory of accessories) {
      cachedAccessory._associatedPlugin = PLUGIN
      cachedAccessory._associatedPlatform = PLATFORM
    }
    return accessories.map(cachedAccessory => PlatformAccessory.serialize(cachedAccessory))
  }

  it('skips an entry it can not read and keeps the others', async () => {
    const [good, other] = serialized(accessory('Good'), accessory('Other'))
    writeFileSync(cacheFile(), JSON.stringify([
      good,
      null,
      { ...(other as object), displayName: '' },
    ]))

    await service.loadCachedPlatformAccessoriesFromDisk()

    expect(cached()).toEqual(['Good'])
  })

  it.each([
    { content: '{}', what: 'an object' },
    { content: '"text"', what: 'a text' },
    { content: 'null and more', what: 'not JSON' },
  ])('falls back to the backup when the file holds $what', async ({ content }) => {
    writeFileSync(cacheFile(), content)
    writeFileSync(backupFile(), JSON.stringify(serialized(accessory('From Backup'))))

    await service.loadCachedPlatformAccessoriesFromDisk()

    expect(cached()).toEqual(['From Backup'])
  })

  it('starts with no cached accessories when the file and the backup are both unusable', async () => {
    writeFileSync(cacheFile(), '{}')
    writeFileSync(backupFile(), '[{"displayName": ""}]')

    await expect(service.loadCachedPlatformAccessoriesFromDisk()).resolves.toBeUndefined()

    expect(cached()).toEqual([])
  })

  it('leaves the good backup alone after restoring from it', async () => {
    const backup = JSON.stringify(serialized(accessory('From Backup')))
    writeFileSync(cacheFile(), '[{"displayName": "cut off')
    writeFileSync(backupFile(), backup)

    await service.loadCachedPlatformAccessoriesFromDisk()

    expect(cached()).toEqual(['From Backup'])
    expect(readFileSync(backupFile(), 'utf-8')).toBe(backup)
  })

  it('leaves a cache file alone that could not be read for a reason other than its content', async () => {
    const content = JSON.stringify(serialized(accessory('Good')))
    writeFileSync(cacheFile(), content)
    vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
    // a one-off failure of the read itself; the file on disk is fine
    vi.spyOn(StorageService.prototype, 'getItem').mockRejectedValueOnce(Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }))

    await service.loadCachedPlatformAccessoriesFromDisk()
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [
      accessory('New'),
    ])
    await service.teardown()

    expect(readFileSync(cacheFile(), 'utf-8')).toBe(content)
  })

  it('backs up a cache file that was read without a problem', async () => {
    const content = JSON.stringify(serialized(accessory('Good')))
    writeFileSync(cacheFile(), content)

    await service.loadCachedPlatformAccessoriesFromDisk()

    expect(readFileSync(backupFile(), 'utf-8')).toBe(content)
  })
})

describe('updatePlatformAccessories on the real bridge', () => {
  beforeEach(async () => {
    // the cache is only written once it has been loaded
    await service.loadCachedPlatformAccessoriesFromDisk()
  })

  it('saves the new details of a registered accessory', () => {
    const lamp = accessory('Lamp')
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])

    lamp.context.room = 'hall'
    api.updatePlatformAccessories([lamp])

    expect(cached()).toEqual(['Lamp'])
    expect(savedCache()[0].context).toEqual({ room: 'hall' })
  })

  it('does not add an accessory that was never registered, or was unregistered, to the cache', () => {
    const [lamp, gone, never] = [
      accessory('Lamp'),
      accessory('Gone'),
      accessory('Never'),
    ]
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp, gone])
    api.unregisterPlatformAccessories(PLUGIN, PLATFORM, [gone])

    // a late update for an accessory the plugin already removed, and one it never registered
    api.updatePlatformAccessories([gone, never, lamp])

    expect(cached()).toEqual(['Lamp'])
    expect(savedNames()).toEqual(['Lamp'])
  })

  it('keeps saving the cache after it was given an external accessory', () => {
    const [lamp, fan] = [
      accessory('Lamp'),
      accessory('Fan'),
    ]
    // an external accessory has a plugin but no platform, and can not be saved in the cache
    const external = accessory('External')
    external._associatedPlugin = PLUGIN
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])

    api.updatePlatformAccessories([external])
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [fan])

    expect(savedNames()).toEqual(['Lamp', 'Fan'])
  })

  it('saves an accessory once when it is given twice', () => {
    const lamp = accessory('Lamp')
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])

    api.updatePlatformAccessories([lamp, lamp])

    expect(savedNames()).toEqual(['Lamp'])
  })
})

describe('saving the cached accessories', () => {
  beforeEach(async () => {
    await service.loadCachedPlatformAccessoriesFromDisk()
  })

  it.each([
    {
      what: 'a value that refers to itself',
      spoil: (context: Record<string, unknown>) => {
        context.self = context
      },
    },
    {
      what: 'a BigInt',
      spoil: (context: Record<string, unknown>) => {
        context.big = 10n
      },
    },
  ])('saves the other accessories when the context of one holds $what', ({ spoil }) => {
    const errors = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
    const [lamp, broken, fan] = [
      accessory('Lamp'),
      accessory('Broken'),
      accessory('Fan'),
    ]
    spoil(broken.context)

    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp, broken])
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [fan])

    expect(savedNames()).toEqual(['Lamp', 'Fan'])
    // named once, with its plugin, however often the cache is saved
    const aboutBroken = errors.mock.calls.filter(call => call.includes('Broken'))
    expect(aboutBroken).toHaveLength(1)
    expect(aboutBroken[0].join(' ')).toContain(PLUGIN)
  })

  it('saves an accessory again once its context can be written', () => {
    vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})
    const broken = accessory('Broken')
    broken.context.self = broken.context
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [broken])
    expect(savedNames()).toEqual([])

    delete broken.context.self
    api.updatePlatformAccessories([broken])

    expect(savedNames()).toEqual(['Broken'])
  })
})

describe('how often the cache is written', () => {
  let writes: ReturnType<typeof vi.spyOn>
  const lastWrite = () => (writes.mock.calls.at(-1)![1] as { context: { state: number } }[])[0].context.state

  beforeEach(async () => {
    await service.loadCachedPlatformAccessoriesFromDisk()
    writes = vi.spyOn(StorageService.prototype, 'setItemSync')
  })

  it('writes the first change at once, and the many that follow within a second together', () => {
    const lamp = accessory('Lamp')
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])
    expect(writes).toHaveBeenCalledTimes(1)

    // a plugin that saves its accessory on every change of state
    for (let state = 1; state <= 50; state++) {
      lamp.context.state = state
      api.updatePlatformAccessories([lamp])
    }
    expect(writes).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    expect(writes).toHaveBeenCalledTimes(2)
    expect(lastWrite()).toBe(50)

    // nothing more to write: the timer does not keep writing
    vi.advanceTimersByTime(5000)
    expect(writes).toHaveBeenCalledTimes(2)
  })

  it('writes again at once after a quiet second', () => {
    const lamp = accessory('Lamp')
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])
    vi.advanceTimersByTime(1000)

    lamp.context.state = 7
    api.updatePlatformAccessories([lamp])

    expect(writes).toHaveBeenCalledTimes(2)
    expect(lastWrite()).toBe(7)
  })

  it('writes what is waiting when Homebridge shuts down, without the timer', async () => {
    vi.spyOn(service.bridge, 'unpublish').mockResolvedValue(undefined)
    const lamp = accessory('Lamp')
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])
    lamp.context.state = 3
    api.updatePlatformAccessories([lamp])
    expect(writes).toHaveBeenCalledTimes(1)

    await service.teardown()

    expect(writes).toHaveBeenCalledTimes(2)
    expect(lastWrite()).toBe(3)
  })

  it('writes at once what a plugin saves from its shutdown listener', async () => {
    vi.spyOn(service.bridge, 'unpublish').mockResolvedValue(undefined)
    const lamp = accessory('Lamp')
    api.registerPlatformAccessories(PLUGIN, PLATFORM, [lamp])
    api.on('shutdown', () => {
      lamp.context.state = 1
      api.updatePlatformAccessories([lamp])
      lamp.context.state = 2
      api.updatePlatformAccessories([lamp])
    })

    await service.teardown()

    // no timer has run
    expect(JSON.parse(readFileSync(join(storageDir, 'cachedAccessories'), 'utf-8'))[0].context).toEqual({ state: 2 })
  })
})

describe('a static platform on the real bridge', () => {
  /** An old-style accessory with one switch service. */
  const staticAccessory = (name: string) => ({
    name,
    getServices: () => [
      new Service.Switch(name),
    ],
  })

  it('loads the other accessories when the bridge refuses one', async () => {
    const platform = {
      accessories: (callback: (accessories: unknown[]) => void) => callback([
        staticAccessory('Lamp'),
        staticAccessory('Refused'),
        staticAccessory('Fan'),
      ]),
    }
    // HAP-NodeJS from v2.3.1 refuses a second accessory with the same UUID
    const add = service.bridge.addBridgedAccessory.bind(service.bridge)
    vi.spyOn(service.bridge, 'addBridgedAccessory').mockImplementation((hapAccessory, deferUpdate) => {
      if (hapAccessory.displayName === 'Refused') {
        throw new Error('Cannot bridge Refused: an accessory with the same UUID is already bridged')
      }
      return add(hapAccessory, deferUpdate)
    })
    const errors: unknown[][] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args)
    })

    await expect(service.loadPlatformAccessories(
      {
        getPluginIdentifier: () => PLUGIN,
      } as Plugin,
      platform as unknown as StaticPlatformPlugin,
      PLATFORM,
      Logger.withPrefix('Static'),
    )).resolves.toBeUndefined()

    expect(bridged()).toEqual(['Lamp', 'Fan'])
  })
})

describe('publishExternalAccessories on the real bridge', () => {
  /** An external accessory whose network publish is replaced, so nothing is advertised. */
  function external(name: string): { accessory: PlatformAccessory, publish: ReturnType<typeof vi.fn> } {
    const externalAccessory = accessory(name)
    externalAccessory._associatedPlugin = PLUGIN
    const publish = vi.fn(async () => {})
    vi.spyOn(externalAccessory._associatedHAPAccessory, 'publish').mockImplementation(publish)
    return { accessory: externalAccessory, publish }
  }

  it('publishes the others when one accessory of the batch is published already', async () => {
    const [tv, speaker] = [
      external('TV'),
      external('Speaker'),
    ]
    await service.handlePublishExternalAccessories([tv.accessory])

    // the plugin publishes the tv a second time, together with a new accessory
    await expect(service.handlePublishExternalAccessories([tv.accessory, speaker.accessory])).resolves.toBeUndefined()

    expect(tv.publish).toHaveBeenCalledTimes(1)
    expect(speaker.publish).toHaveBeenCalledTimes(1)
  })

  it('publishes the others when no port can be had for one accessory', async () => {
    const [tv, speaker] = [
      external('TV'),
      external('Speaker'),
    ]
    const requestPort = vi.spyOn(ExternalPortService.prototype, 'requestPort')
    requestPort.mockRejectedValueOnce(new Error('parent did not answer'))

    await expect(service.handlePublishExternalAccessories([tv.accessory, speaker.accessory])).resolves.toBeUndefined()

    expect(tv.publish).not.toHaveBeenCalled()
    expect(speaker.publish).toHaveBeenCalledTimes(1)
  })

  it('gives an accessory a random port when its port from the pool is in use by another program', async () => {
    const { port, close } = await holdPort()
    const tv = external('TV')
    vi.spyOn(ExternalPortService.prototype, 'requestPort').mockResolvedValue(port)
    const warnings = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})

    try {
      await service.handlePublishExternalAccessories([tv.accessory])
    } finally {
      await close()
    }

    // HAP-NodeJS picks a free port itself when it is given none
    expect(tv.publish.mock.calls[0][0]).toMatchObject({ port: undefined })
    expect(warnings.mock.calls[0][0]).toContain('in use by another program')
    expect(warnings.mock.calls[0]).toContain(port)
  })

  it('keeps the port from the pool when it is free', async () => {
    const { port, close } = await holdPort()
    await close()
    const tv = external('TV')
    vi.spyOn(ExternalPortService.prototype, 'requestPort').mockResolvedValue(port)

    await service.handlePublishExternalAccessories([tv.accessory])

    expect(tv.publish.mock.calls[0][0]).toMatchObject({ port })
  })
})

describe('the port of the bridge', () => {
  /** A bridge service like the one of every test, with a port set for the bridge. */
  function serviceOnPort(port: number): BridgeService {
    return new BridgeService(api, {} as PluginManager, new ExternalPortService(), {
      cachedAccessoriesDir: storageDir,
      cachedAccessoriesItemName: 'cachedAccessories',
      externalAccessoriesItemName: 'externalAccessories',
    }, {
      name: 'Port Bridge',
      username: 'CC:22:3D:E3:CE:31',
      pin: '031-45-154',
      port,
    })
  }

  it('is named in an error when another program is using it', async () => {
    const { port, close } = await holdPort()
    const errors = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})

    try {
      await serviceOnPort(port).checkBridgePort()
    } finally {
      await close()
    }

    const logged = errors.mock.calls.map(call => call.join(' ')).join('\n')
    expect(logged).toContain('in use by another program')
    expect(errors.mock.calls[0]).toContain(port)
  })

  it('gives no error when it is free, or when none is set', async () => {
    const { port, close } = await holdPort()
    await close()
    const errors = vi.spyOn(Logger.internal, 'error').mockImplementation(() => {})

    await serviceOnPort(port).checkBridgePort()
    await service.checkBridgePort()

    expect(errors).not.toHaveBeenCalled()
  })
})

describe('teardown on the real bridge', () => {
  /** An external accessory that is published, with its unpublish replaced. */
  async function publishedExternal(name: string, unpublish: () => Promise<void>): Promise<void> {
    const externalAccessory = accessory(name)
    externalAccessory._associatedPlugin = PLUGIN
    vi.spyOn(externalAccessory._associatedHAPAccessory, 'publish').mockResolvedValue(undefined)
    vi.spyOn(externalAccessory._associatedHAPAccessory, 'unpublish').mockImplementation(unpublish)
    await service.handlePublishExternalAccessories([externalAccessory])
  }

  it('waits until the bridge and the external accessories are off the network', async () => {
    let finishBridge = () => {}
    let finishExternal = () => {}
    vi.spyOn(service.bridge, 'unpublish').mockImplementation(() => new Promise<void>((resolve) => {
      finishBridge = resolve
    }))
    await publishedExternal('TV', () => new Promise<void>((resolve) => {
      finishExternal = resolve
    }))
    let done = false

    const teardown = Promise.resolve(service.teardown()).then(() => {
      done = true
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(done).toBe(false)
    finishBridge()
    await new Promise(resolve => setImmediate(resolve))
    expect(done).toBe(false)
    finishExternal()
    await teardown

    expect(done).toBe(true)
  })

  it('logs an accessory that could not be unpublished, and still resolves', async () => {
    vi.spyOn(service.bridge, 'unpublish').mockResolvedValue(undefined)
    await publishedExternal('TV', () => Promise.reject(new Error('advertiser is gone')))
    const warnings = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})

    await expect(service.teardown()).resolves.toBeUndefined()

    expect(warnings.mock.calls.map(call => call.join(' ')).join('\n')).toContain('advertiser is gone')
  })

  it('stops waiting after two seconds', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(service.bridge, 'unpublish').mockImplementation(() => new Promise<void>(() => {}))
      let done = false
      const teardown = service.teardown().then(() => {
        done = true
      })

      await vi.advanceTimersByTimeAsync(1999)
      expect(done).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await teardown
      expect(done).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('saves the cache and signals the plugins before it returns', () => {
    vi.spyOn(service.bridge, 'unpublish').mockImplementation(() => new Promise<void>(() => {}))
    const shutdown = vi.fn()
    api.on('shutdown', shutdown)

    void service.teardown()

    expect(shutdown).toHaveBeenCalledTimes(1)
  })
})

/** Listen on a free port, as another program would, until `close` is called. */
function holdPort(): Promise<{ port: number, close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, () => {
      resolve({
        port: (server.address() as { port: number }).port,
        close: () => new Promise<void>(done => server.close(() => done())),
      })
    })
  })
}
