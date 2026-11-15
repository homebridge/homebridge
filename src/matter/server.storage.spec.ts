import type { ServerNode } from '@matter/main'

import type { MatterAccessory } from './types.js'

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { CommissioningServer } from '@matter/node'
import { FabricManager as MatterFabricManager, TestFabric } from '@matter/protocol'
import { FabricIndex } from '@matter/types'
import { ManualPairingCodeCodec, QrPairingCodeCodec } from '@matter/types/schema'
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

  it('keeps the saved state and the plugin context when an accessory comes back with a new structure', async () => {
    const light = (deviceType: MatterAccessory['deviceType'], clusters: MatterAccessory['clusters'], context?: Record<string, unknown>): MatterAccessory => ({
      UUID: 'uuid-shape',
      displayName: 'Shape',
      deviceType,
      serialNumber: 'S',
      manufacturer: 'Test',
      model: 'Test',
      context: context as MatterAccessory['context'],
      clusters,
    })
    const before = bridgeServer('ABABABABABAB', 55987)
    await before.start()
    await before.registerPlatformAccessories('plugin', 'Platform', [
      light(deviceTypes.OnOffLight, {
        onOff: { onOff: false },
      }, { room: 'hall' }),
    ])
    await before.updateAccessoryState('uuid-shape', 'onOff', { onOff: true })
    const cacheFile = join(matterPath, 'ABABABABABAB', 'accessories.json')
    await vi.waitFor(() => expect(existsSync(cacheFile) && readFileSync(cacheFile, 'utf-8')).toMatch(/"onOff":\s*true/), { timeout: 5000, interval: 100 })
    await before.stop()

    // The plugin update turns the light into a dimmable one.
    const after = bridgeServer('ABABABABABAB', 55987)
    await after.start()
    const dimmable = light(deviceTypes.DimmableLight, {
      onOff: { onOff: false },
      levelControl: { currentLevel: 10, minLevel: 1, maxLevel: 254 },
    })
    await after.registerPlatformAccessories('plugin', 'Platform', [dimmable])

    expect(after.getLiveState('uuid-shape').onOff?.onOff).toBe(true)
    expect(after.getLiveState('uuid-shape').levelControl?.currentLevel).toBe(10)
    expect(dimmable.context).toEqual({ room: 'hall' })
  }, 30000)

  describe('which controllers a bridge is paired with', () => {
    /** Pair the server with a matter.js test controller (a real fabric with made-up keys). */
    async function pair(server: MatterServer): Promise<void> {
      const node = (server as unknown as { serverNode: ServerNode }).serverNode
      await TestFabric({
        fabrics: node.env.get(MatterFabricManager),
      })
    }

    it('reports none for a bridge that was never paired', async () => {
      const server = bridgeServer('ADADADADADA1', 55989)
      await server.start()
      await server.registerPlatformAccessories('plugin', 'Platform', [
        {
          UUID: 'uuid-any',
          displayName: 'Any',
          deviceType: deviceTypes.OnOffLight,
          serialNumber: 'S',
          manufacturer: 'Test',
          model: 'Test',
          context: {},
          clusters: {
            onOff: { onOff: false },
          },
        },
      ])

      expect(server.getCommissioningSnapshot()).toEqual({ commissioned: false, fabricCount: 0, fabrics: [] })
      expect(server.isCommissioned()).toBe(false)
    }, 30000)

    it('reports the controller as soon as it is paired, and again after a restart before going online', async () => {
      const before = bridgeServer('ADADADADADA2', 55990)
      await before.start()
      await pair(before)

      const paired = {
        commissioned: true,
        fabricCount: 1,
        fabrics: [
          expect.objectContaining({ fabricIndex: 1, label: 'mock-fabric-1', rootVendorId: 0xFFF1 }),
        ],
      }
      expect(before.getCommissioningSnapshot()).toEqual(paired)
      expect(before.isCommissioned()).toBe(true)
      expect(before.hasFabric(1)).toBe(true)
      expect(before.hasFabric(2)).toBe(false)
      await before.stop()

      // built from storage, and not online yet (#4009)
      const after = bridgeServer('ADADADADADA2', 55990)
      await after.start()

      expect(after.getCommissioningSnapshot()).toEqual(paired)
      expect(after.getFabricInfo()[0]).toMatchObject({
        fabricId: expect.any(String),
        nodeId: expect.any(String),
      })
    }, 30000)
  })

  it('gives the pairing codes matter.js builds for the passcode and discriminator in use', async () => {
    const server = bridgeServer('AEAEAEAEAEAE', 55991)
    await server.start()

    const { manualPairingCode, qrCode, passcode, discriminator } = server.getCommissioningInfo()

    // the same codes the matter.js codecs give for these values
    const manualCode = ManualPairingCodeCodec.encode({ discriminator: discriminator!, passcode: passcode! })
    expect(manualPairingCode).toBe(`${manualCode.slice(0, 4)}-${manualCode.slice(4, 7)}-${manualCode.slice(7, 11)}`)
    expect(QrPairingCodeCodec.decode(qrCode!)).toEqual([
      expect.objectContaining({
        passcode,
        discriminator,
        vendorId: 0xFFF1,
        productId: 0x8001,
      }),
    ])
  }, 30000)

  it('tells the ui once for each controller that is paired or removed', async () => {
    const server = bridgeServer('AFAFAFAFAFAF', 55992)
    await server.start()
    const changes: unknown[][] = []
    server.on('commissioning-status-changed', (...status: unknown[]) => changes.push(status))
    const node = (server as unknown as { serverNode: ServerNode }).serverNode
    const fabrics = node.env.get(MatterFabricManager)
    const commissioningFile = () => JSON.parse(readFileSync(join(matterPath, 'AFAFAFAFAFAF', 'commissioning.json'), 'utf-8'))
    // What matter.js does itself for a fabric change once the node is online
    // (this node is not, so the test stands in for it).
    const fabricChanged = (index: number, action: 'added' | 'deleted') =>
      node.act(agent => agent.get(CommissioningServer).handleFabricChange(FabricIndex(index), action))

    await TestFabric({ fabrics, index: 1 })
    await fabricChanged(1, 'added')
    const second = await TestFabric({ fabrics, index: 2 })
    await fabricChanged(2, 'added')
    await vi.waitFor(() => expect(commissioningFile()).toMatchObject({ commissioned: true, fabricCount: 2 }), { timeout: 5000, interval: 50 })

    await second.leave()
    await fabricChanged(2, 'deleted')
    await vi.waitFor(() => expect(commissioningFile()).toMatchObject({ commissioned: true, fabricCount: 1 }), { timeout: 5000, interval: 50 })

    expect(changes).toEqual([
      [true, 1],
      [true, 2],
      [true, 1],
    ])
  }, 30000)

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

  it('adds no SIGINT or SIGTERM listener for a server', async () => {
    const before = {
      sigint: process.listenerCount('SIGINT'),
      sigterm: process.listenerCount('SIGTERM'),
    }

    await externalServer('ACACACACACAC', 55988).start()

    expect({
      sigint: process.listenerCount('SIGINT'),
      sigterm: process.listenerCount('SIGTERM'),
    }).toEqual(before)
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
