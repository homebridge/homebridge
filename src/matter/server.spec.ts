import type { InternalMatterAccessory, MatterAccessory } from './types.js'

import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MatterServer } from './server.js'

/**
 * A plugin holds a plain accessory object - the one it built, or the one
 * Homebridge handed back to configureMatterAccessory() from the cache. It has
 * no endpoint, no parts and no emitter, because those only exist once the
 * accessory has been registered with matter.js.
 */
function pluginCopy(uuid: string): MatterAccessory {
  return {
    UUID: uuid,
    displayName: 'Renamed By Plugin',
    deviceType: { name: 'ContactSensor' } as any,
    serialNumber: 'new-serial',
    manufacturer: 'No-IP',
    model: 'DUC',
    context: { device: { hostname: 'example.ddns.net' } },
    clusters: { booleanState: { stateValue: true } },
  } as unknown as MatterAccessory
}

/** What the map holds after a successful registration. */
function registeredCopy(uuid: string): InternalMatterAccessory {
  return {
    UUID: uuid,
    displayName: 'Original Name',
    deviceType: { name: 'ContactSensor' } as any,
    serialNumber: 'old-serial',
    context: {},
    clusters: { booleanState: { stateValue: false } },
    endpoint: { id: uuid, set: vi.fn() } as any,
    registered: true,
    _parts: [{ id: 'part-1' }] as any,
    _eventEmitter: new EventEmitter() as any,
    _restoredFromCache: true,
    // Stamped by registerPlatformAccessories (MatterAPIImpl) and by nothing
    // else - see the persistence test below.
    _associatedPlugin: '@homebridge-plugins/homebridge-noip',
    _associatedPlatform: 'NoIP',
  } as unknown as InternalMatterAccessory
}

describe('matterServer restore-from-cache attribution', () => {
  /**
   * ⚠️ The oscillation behind homebridge-plugins/homebridge-updater#278. The
   * pre-online restore built its map entry without `_associatedPlugin`
   * (registerAccessory ignores its plugin/platform arguments), so the next
   * cache save wrote blanks to disk. That start then warned "Failed to find
   * plugin ... (plugin: , platform: )" and the plugin re-registered from
   * scratch, which re-stamped the owner - so every OTHER restart healed and
   * the one after blanked it again, for ever.
   */
  it('carries the cached owner onto the restored accessory', async () => {
    const server = new MatterServer({ uniqueId: 'AA:BB:CC:DD:EE:FF' })
    const registered: any[] = []
    ;(server as any).accessoryManager = {
      registerAccessory: vi.fn(async (_p: string, _n: string, accessory: any) => {
        registered.push(accessory)
      }),
    }
    ;(server as any).accessoryCache = {
      load: async () => new Map([[
        '48a2212f-8f39-4854-ac61-fa84b4113451',
        {
          uuid: '48a2212f-8f39-4854-ac61-fa84b4113451',
          displayName: 'homebridge',
          plugin: '@homebridge-plugins/homebridge-updater',
          platform: 'Updater',
          deviceType: { name: 'ContactSensor' },
          serialNumber: 'ABC123',
          clusters: { booleanState: { stateValue: false } },
        },
      ]]),
    }

    await (server as any).getLifecycleDeps().restoreAccessoriesFromCache()

    expect(registered).toHaveLength(1)
    expect(registered[0]._associatedPlugin).toBe('@homebridge-plugins/homebridge-updater')
    expect(registered[0]._associatedPlatform).toBe('Updater')
  })
})

describe('matterServer.updatePlatformAccessories', () => {
  const uuid = '48a2212f-8f39-4854-ac61-fa84b4113451'
  let server: MatterServer
  let accessories: Map<string, InternalMatterAccessory>

  beforeEach(() => {
    server = new MatterServer({ uniqueId: 'AA:BB:CC:DD:EE:FF' })
    accessories = (server as any).accessories
    accessories.set(uuid, registeredCopy(uuid))
    ;(server as any).accessoryCache = {
      hasCached: () => true,
      requestSave: vi.fn(),
    }
  })

  // The bug behind homebridge-plugins/homebridge-noip#190: the map entry was
  // replaced wholesale with the plugin's object, so the endpoint vanished and
  // every later state update threw "not registered or missing endpoint".
  it('keeps the runtime state that registration built', async () => {
    const before = accessories.get(uuid)!

    await server.updatePlatformAccessories([pluginCopy(uuid)])

    const after = accessories.get(uuid)!
    expect(after.endpoint).toBe(before.endpoint)
    expect(after._parts).toBe(before._parts)
    expect(after._eventEmitter).toBe(before._eventEmitter)
    expect(after.registered).toBe(true)
    expect(after._restoredFromCache).toBe(true)
  })

  // The lasting half of the same bug. Only registerPlatformAccessories stamps
  // _associatedPlugin/_associatedPlatform, and the accessory cache serializes
  // them as `plugin`/`platform`. Replacing the map entry with the plugin's
  // object dropped them, and the requestSave() below then wrote the blanks to
  // disk - so on the NEXT start the accessory had no owner, logged
  // "Failed to find plugin to handle Matter accessory X (plugin: , platform: )"
  // and was unregistered as an orphan.
  it('keeps the plugin attribution that the accessory cache persists', async () => {
    const saved: Array<Map<string, InternalMatterAccessory>> = []
    ;(server as any).accessoryCache.requestSave = (map: Map<string, InternalMatterAccessory>) => {
      saved.push(new Map(map))
    }

    await server.updatePlatformAccessories([pluginCopy(uuid)])

    const after = accessories.get(uuid)!
    expect(after._associatedPlugin).toBe('@homebridge-plugins/homebridge-noip')
    expect(after._associatedPlatform).toBe('NoIP')
    // and what gets written to the cache carries it too
    expect(saved.at(-1)!.get(uuid)!._associatedPlugin).toBe('@homebridge-plugins/homebridge-noip')
  })

  it('still applies the metadata and context the plugin passed', async () => {
    await server.updatePlatformAccessories([pluginCopy(uuid)])

    const after = accessories.get(uuid)!
    expect(after.displayName).toBe('Renamed By Plugin')
    expect(after.serialNumber).toBe('new-serial')
    expect(after.manufacturer).toBe('No-IP')
    expect(after.context).toEqual({ device: { hostname: 'example.ddns.net' } })
  })

  it('leaves an accessory that was never registered alone', async () => {
    await server.updatePlatformAccessories([pluginCopy('not-registered')])

    expect(accessories.has('not-registered')).toBe(false)
    expect(accessories.size).toBe(1)
  })

  it('leaves an accessory that is not in the cache alone', async () => {
    ;(server as any).accessoryCache.hasCached = () => false
    const before = accessories.get(uuid)!

    await server.updatePlatformAccessories([pluginCopy(uuid)])

    expect(accessories.get(uuid)).toBe(before)
  })
})
