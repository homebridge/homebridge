import type { MatterAccessory } from './types.js'

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { User } from '../user.js'
import { MatterServer } from './server.js'
import { deviceTypes } from './types.js'

/**
 * Runs real matter.js nodes (never online: an external server does not run
 * until runServer() is called), with their storage in a temporary folder.
 */
describe('matterServer storage on real matter.js nodes', () => {
  let storageRoot: string
  let matterPath: string
  const servers: MatterServer[] = []

  // User.setStoragePath() can be called once only, so all tests share one root.
  beforeAll(() => {
    storageRoot = mkdtempSync(join(tmpdir(), 'hb-matter-storage-'))
    matterPath = join(storageRoot, 'matter')
    User.setStoragePath(storageRoot)
  })

  beforeEach(() => {
    // The servers print their pairing codes; keep the test output clean.
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    await Promise.allSettled(servers.splice(0).map(server => server.stop()))
    vi.restoreAllMocks()
  })

  afterAll(() => {
    rmSync(storageRoot, { recursive: true, force: true })
  })

  function externalServer(uniqueId: string, port: number): MatterServer {
    const server = new MatterServer({
      port,
      uniqueId,
      storagePath: matterPath,
      displayName: uniqueId,
      serialNumber: uniqueId,
      manufacturer: 'Test',
      model: 'Test',
      externalAccessory: true,
    })
    servers.push(server)
    return server
  }

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

  it('still calls the handler of a cluster with no state after a restart', async () => {
    const calls: string[] = []
    const mediaPlayer = (session: string): MatterAccessory => ({
      UUID: 'uuid-media-player',
      displayName: 'TV',
      deviceType: deviceTypes.MediaPlayer,
      serialNumber: 'S',
      manufacturer: 'Test',
      model: 'Test',
      context: {},
      clusters: {
        onOff: { onOff: false },
        mediaPlayback: { currentState: 0 },
      },
      // keypadInput has commands only: there is no state for the cache to keep
      handlers: {
        keypadInput: {
          sendKey: async () => {
            calls.push(session)
          },
        },
      },
    })

    const before = bridgeServer('CCCCCCCCCCCC', 55983)
    await before.start()
    await before.registerPlatformAccessories('plugin', 'Platform', [
      mediaPlayer('before restart'),
    ])
    await before.triggerCommand('uuid-media-player', 'keypadInput', 'sendKey', { keyCode: 1 })
    // The cache is written two seconds after a registration.
    await vi.waitFor(() => expect(existsSync(join(matterPath, 'CCCCCCCCCCCC', 'accessories.json'))).toBe(true), { timeout: 5000, interval: 100 })
    await before.stop()

    const after = bridgeServer('CCCCCCCCCCCC', 55983)
    await after.start()
    await after.registerPlatformAccessories('plugin', 'Platform', [
      mediaPlayer('after restart'),
    ])
    await after.triggerCommand('uuid-media-player', 'keypadInput', 'sendKey', { keyCode: 1 })

    expect(calls).toEqual(['before restart', 'after restart'])
  }, 30000)

  describe('a restored accessory the plugin registers again', () => {
    const lamp = (overrides: Partial<MatterAccessory> = {}): MatterAccessory => ({
      UUID: 'uuid-lamp',
      displayName: 'Lamp',
      deviceType: deviceTypes.OnOffLight,
      serialNumber: 'S',
      manufacturer: 'Test',
      model: 'Test',
      firmwareRevision: '1.0.0',
      context: {},
      // the plugin declares "off" at every start, whatever the lamp is doing
      clusters: {
        onOff: { onOff: false },
      },
      handlers: {
        onOff: {
          on: async () => {},
          off: async () => {},
        },
      },
      ...overrides,
    })

    /** Run a first session that leaves the lamp switched on in the cache. */
    async function firstSession(uniqueId: string, port: number): Promise<void> {
      const before = bridgeServer(uniqueId, port)
      await before.start()
      await before.registerPlatformAccessories('plugin', 'Platform', [
        lamp(),
      ])
      await before.updateAccessoryState('uuid-lamp', 'onOff', { onOff: true })
      const cacheFile = join(matterPath, uniqueId, 'accessories.json')
      await vi.waitFor(() => expect(existsSync(cacheFile) && readFileSync(cacheFile, 'utf-8')).toMatch(/"onOff":\s*true/), { timeout: 5000, interval: 100 })
      await before.stop()
    }

    it('keeps the saved state in the record, not the defaults the plugin declares', async () => {
      await firstSession('FFFFFFFFFFF1', 55985)
      const after = bridgeServer('FFFFFFFFFFF1', 55985)
      await after.start()

      await after.registerPlatformAccessories('plugin', 'Platform', [
        lamp(),
      ])

      // the endpoint (what controllers see) and the record (what the ui and the cache see) agree
      expect(after.getLiveState('uuid-lamp').onOff?.onOff).toBe(true)
      expect(after.getAccessory('uuid-lamp')?.clusters?.onOff).toEqual({ onOff: true })
    }, 30000)

    it('puts a new name and firmware version on the live accessory', async () => {
      await firstSession('FFFFFFFFFFF2', 55986)
      const after = bridgeServer('FFFFFFFFFFF2', 55986)
      await after.start()

      await after.registerPlatformAccessories('plugin', 'Platform', [
        lamp({ displayName: 'Lamp renamed', firmwareRevision: '2.0.0' }),
      ])

      expect(after.getLiveState('uuid-lamp').bridgedDeviceBasicInformation).toMatchObject({
        nodeLabel: 'Lamp renamed',
        softwareVersionString: '2.0.0',
      })
    }, 30000)
  })

  // #4047: a container killed hard leaves matter.js's lock files behind, and
  // in the next container the process id they name belongs to another program.
  it('starts when the storage lock was left behind by an earlier run whose process id is in use again', async () => {
    const first = bridgeServer('DDDDDDDDDDDD', 55984)
    await first.start()
    await first.stop()
    // The lock an earlier run left a day ago. The process id is a live process
    // (the test runner's parent), and it started long after that.
    const nodeFolder = join(matterPath, 'DDDDDDDDDDDD', 'DDDDDDDDDDDD')
    const aDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    writeFileSync(join(nodeFolder, 'matter.lock'), '')
    writeFileSync(join(nodeFolder, 'matter.pid'), `${process.ppid} 0123456789abcdef`)
    utimesSync(join(nodeFolder, 'matter.pid'), aDayAgo, aDayAgo)

    const second = bridgeServer('DDDDDDDDDDDD', 55984)

    await expect(second.start()).resolves.toBeUndefined()
  }, 30000)

  it('keeps the node storage of two servers that start together in their own folders', async () => {
    const first = externalServer('AAAAAAAAAAAA', 55981)
    const second = externalServer('BBBBBBBBBBBB', 55982)

    await Promise.all([
      first.start(),
      second.start(),
    ])

    // matter.js stores a node under <server folder>/<node id>/
    const nodeFolders = (uniqueId: string): string[] => readdirSync(join(matterPath, uniqueId), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
    expect(nodeFolders('AAAAAAAAAAAA')).toEqual(['AAAAAAAAAAAA'])
    expect(nodeFolders('BBBBBBBBBBBB')).toEqual(['BBBBBBBBBBBB'])
  }, 30000)
})
