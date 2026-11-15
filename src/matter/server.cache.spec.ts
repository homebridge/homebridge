import type { SerializedMatterAccessory } from './accessoryCache.js'
import type { MatterAccessory } from './types.js'

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { User } from '../user.js'
import { sanitizeUniqueId } from './configValidator.js'
import { MatterServer } from './server.js'
import { deviceTypes } from './types.js'

/**
 * The accessory cache of real matter.js bridges. The nodes are built but never
 * put on the network (deferOnline), with their storage in a temporary folder.
 */
describe('matterServer accessory cache on real matter.js nodes', () => {
  let storageRoot: string
  let matterPath: string
  const servers: MatterServer[] = []

  // User.setStoragePath() can be called once only, so all tests share one root.
  beforeAll(() => {
    storageRoot = mkdtempSync(join(tmpdir(), 'hb-matter-cache-'))
    matterPath = join(storageRoot, 'matter')
    User.setStoragePath(storageRoot)
  })

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    await Promise.allSettled(servers.splice(0).map(server => server.stop()))
    vi.restoreAllMocks()
  })

  afterAll(() => {
    rmSync(storageRoot, { recursive: true, force: true })
  })

  function bridgeServer(uniqueId: string, port: number): MatterServer {
    const server = new MatterServer({
      port,
      uniqueId,
      storagePath: matterPath,
      displayName: uniqueId,
      // built, but not put on the network
      deferOnline: true,
    })
    servers.push(server)
    return server
  }

  const light = (uuid: string, extra: Partial<MatterAccessory> = {}): MatterAccessory => ({
    UUID: uuid,
    displayName: `Light ${uuid}`,
    deviceType: deviceTypes.OnOffLight,
    serialNumber: 'S',
    manufacturer: 'Test',
    model: 'Test',
    context: {},
    clusters: {
      onOff: { onOff: false },
    },
    ...extra,
  })

  // The server keeps a bridge's files under its id as the server tidies it (upper case). A
  // file system that tells upper and lower case apart, as on Linux, needs that exact name
  const storedId = (uniqueId: string): string => sanitizeUniqueId(uniqueId).value
  const bridgeFolder = (uniqueId: string): string => join(matterPath, storedId(uniqueId))
  const cacheFile = (uniqueId: string): string => join(bridgeFolder(uniqueId), 'accessories.json')
  const cachedEntries = (uniqueId: string): SerializedMatterAccessory[] => JSON.parse(readFileSync(cacheFile(uniqueId), 'utf-8'))
  const cachedUuids = (uniqueId: string): string[] => cachedEntries(uniqueId).map(entry => entry.uuid).sort()

  /** Register on a bridge, and stop it once the cache file is written. */
  async function sessionWith(uniqueId: string, port: number, accessories: MatterAccessory[]): Promise<void> {
    const server = bridgeServer(uniqueId, port)
    await server.start()
    await server.registerPlatformAccessories('homebridge-test', 'Test', accessories)
    await server.stop()
    expect(existsSync(cacheFile(uniqueId))).toBe(true)
  }

  it('writes the removal of the last accessory when the bridge stops straight after it', async () => {
    await sessionWith('cache-last-bridge', 5600, [
      light('last-1'),
    ])
    expect(cachedUuids('cache-last-bridge')).toEqual(['last-1'])

    const server = bridgeServer('cache-last-bridge', 5600)
    await server.start()
    await server.unregisterAccessory('last-1')
    // the cache is written two seconds after a change: stop before that
    await server.stop()

    expect(cachedUuids('cache-last-bridge')).toEqual([])
  }, 30000)

  it('saves the other accessories when one has a context that can not be written as json', async () => {
    await sessionWith('cache-bigint-bridge', 5601, [
      light('bigint-1'),
      light('bigint-2', {
        context: { room: 'hall' },
      }),
    ])

    const server = bridgeServer('cache-bigint-bridge', 5601)
    await server.start()
    await server.registerPlatformAccessories('homebridge-test', 'Test', [
      light('bigint-1', { displayName: 'Renamed' }),
      // a bigint, for an energy counter say: JSON has no way to write one
      light('bigint-2', {
        context: { counter: 10n },
      }),
      light('bigint-3'),
    ])
    await server.stop()

    const entries = cachedEntries('cache-bigint-bridge')
    expect(entries.map(entry => entry.uuid).sort()).toEqual(['bigint-1', 'bigint-2', 'bigint-3'])
    expect(entries.find(entry => entry.uuid === 'bigint-1')?.displayName).toBe('Renamed')
    // the entry of the last good save is kept for the one that can not be written
    expect(entries.find(entry => entry.uuid === 'bigint-2')?.context).toEqual({ room: 'hall' })
  }, 30000)
})
