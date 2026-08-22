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
