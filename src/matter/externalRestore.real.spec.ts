import type { ServerNode } from '@matter/main'

import type { DynamicPlatformPlugin } from '../api.js'
import type { PluginManager } from '../pluginManager.js'
import type { InternalMatterAccessory } from './types.js'

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'

import { CommissioningServer } from '@matter/node'
import { FabricManager as MatterFabricManager, TestFabric } from '@matter/protocol'
import { FabricIndex } from '@matter/types'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { User } from '../user.js'
import { generate } from '../util/mac.js'
import { BaseMatterManager } from './BaseMatterManager.js'
import { MatterServer } from './server.js'
import { deviceRequirements, deviceTypes } from './types.js'

/** Actual matter.js endpoints, disk storage and synthetic fabrics; never online. */
describe('external restoration on real Matter nodes', () => {
  let root: string
  let sequence = 0
  const servers: MatterServer[] = []

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'hb-external-restore-'))
    User.setStoragePath(root)
  })

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => server.stop()))
    vi.restoreAllMocks()
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function fixture(optIn?: boolean) {
    const uuid = `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
    const uniqueId = generate(uuid).replaceAll(':', '')
    const bridgeOwner = `synthetic-${uniqueId}`
    const folder = join(User.matterPath(), uniqueId)
    const onCommand = vi.fn(async () => {})
    const configureMatterAccessory = vi.fn()
    const instance = { configureMatterAccessory, restoreExternalMatterAccessories: optIn } as unknown as DynamicPlatformPlugin

    function accessory(composed = false): InternalMatterAccessory {
      return {
        UUID: uuid,
        displayName: 'Synthetic vacuum',
        serialNumber: uniqueId,
        manufacturer: 'Test',
        model: 'Test',
        context: {},
        deviceType: composed
          ? deviceTypes.RoboticVacuumCleaner.with(deviceRequirements.RoboticVacuumCleaner.ServiceAreaServer)
          : deviceTypes.RoboticVacuumCleaner,
        clusters: {
          rvcRunMode: {
            supportedModes: [
              {
                label: 'Idle',
                mode: 0,
                modeTags: [
                  { value: 0x4000 },
                ],
              },
              {
                label: 'Cleaning',
                mode: 1,
                modeTags: [
                  { value: 0x4001 },
                ],
              },
            ],
            currentMode: 0,
          },
          rvcOperationalState: {
            operationalState: 0,
            operationalStateList: [
              { operationalStateId: 0 },
              { operationalStateId: 1 },
              { operationalStateId: 2 },
              { operationalStateId: 3 },
            ],
            operationalError: { errorStateId: 0 },
          },
        },
        handlers: {
          rvcRunMode: { changeToMode: onCommand },
        },
        _associatedPlugin: 'synthetic-plugin',
        _associatedPlatform: 'SyntheticPlatform',
        registered: false,
      }
    }

    function createServer(): MatterServer {
      const server = new MatterServer({
        port: 55991,
        uniqueId,
        storagePath: User.matterPath(),
        externalAccessory: true,
        displayName: 'Synthetic restore test',
        networkInterfaces: [
          platform() === 'darwin'
            ? 'lo0'
            : 'lo',
        ],
      })
      servers.push(server)
      return server
    }

    class Manager extends BaseMatterManager {
      override hasActiveMatter(): boolean {
        return true
      }

      protected override getExternalCacheOwner(): string {
        return bridgeOwner
      }

      protected override async publishRestoredExternalAccessory(a: InternalMatterAccessory): Promise<void> {
        const server = createServer()
        await server.start()
        await server.registerAccessory('synthetic-plugin', 'SyntheticPlatform', a)
        this.addExternalMatterServer(a.UUID, server)
      }

      attach(a: InternalMatterAccessory): Promise<boolean> {
        return this.attachRestoredExternalAccessory(a)
      }
    }

    function manager(): Manager {
      return new Manager({
        getPlugin: () => ({
          getActiveDynamicPlatform: () => instance,
        }),
      } as unknown as PluginManager)
    }

    const node = (server: MatterServer) => (server as unknown as { serverNode: ServerNode }).serverNode
    async function save(server: MatterServer): Promise<void> {
      const live = server as unknown as {
        accessoryCache: { save: (accessories: Map<string, InternalMatterAccessory>) => Promise<void> }
        accessories: Map<string, InternalMatterAccessory>
      }
      await live.accessoryCache.save(live.accessories)
    }

    async function seed(composed = false): Promise<void> {
      const server = createServer()
      await server.start()
      await server.registerAccessory('synthetic-plugin', 'SyntheticPlatform', accessory(composed))
      await TestFabric({
        fabrics: node(server).env.get(MatterFabricManager),
        index: 1,
      })
      await node(server).act(agent => agent.get(CommissioningServer).handleFabricChange(FabricIndex(1), 'added'))
      expect(server.isCommissioned()).toBe(true)
      await save(server)
      await server.stop()
      writeFileSync(join(folder, 'homebridge-owner.json'), JSON.stringify({
        bridge: bridgeOwner,
        uuid,
        plugin: 'synthetic-plugin',
        platform: 'SyntheticPlatform',
      }))
    }

    return {
      uuid,
      folder,
      accessory,
      configureMatterAccessory,
      onCommand,
      manager,
      seed,
      save,
      node,
    }
  }

  it('replaces the external endpoint on three disk restores without collisions or losing the fabric', async () => {
    const f = fixture(true)
    await f.seed(true)
    for (let restart = 0; restart < 3; restart++) {
      const manager = f.manager()
      await manager.restoreCachedAccessories(false)
      const server = manager.getExternalServer(f.uuid)!
      expect(server).toBeDefined()
      const oldEndpoint = [
        ...f.node(server).parts,
      ].find(part => part.id === f.uuid)
      expect(oldEndpoint).toBeDefined()
      const endpointNumber = oldEndpoint!.number
      expect(typeof endpointNumber).toBe('number')
      const fabrics = server.getFabricInfo()
      expect(fabrics).toHaveLength(1)

      await expect(manager.attach(f.accessory(true))).resolves.toBe(true)

      const endpoints = [
        ...f.node(server).parts,
      ].filter(part => part.id === f.uuid)
      expect(endpoints).toHaveLength(1)
      expect(endpoints[0]).not.toBe(oldEndpoint)
      expect(endpoints[0].number).toBe(endpointNumber)
      expect(server.getAccessory(f.uuid)).toBeDefined()
      await server.triggerCommand(f.uuid, 'rvcRunMode', 'changeToMode', { newMode: 1 })
      expect(f.onCommand).toHaveBeenCalledTimes(restart + 1)
      expect(server.getLiveState(f.uuid).rvcRunMode?.currentMode).toBe(1)
      expect(server.getFabricInfo()).toEqual(fabrics)
      await f.save(server)
      await server.stop()
    }
  }, 30000)

  it.each([false, undefined])('does not call legacy plugins or touch their external pairing without opt-in (%s)', async (optIn) => {
    const f = fixture(optIn)
    await f.seed()
    const cacheFile = join(f.folder, 'accessories.json')
    const credentials = readFileSync(join(f.folder, 'commissioning.json'), 'utf8')
    const cache = readFileSync(cacheFile, 'utf8')
    const manager = f.manager()
    await manager.restoreCachedAccessories(false)
    expect(f.configureMatterAccessory).not.toHaveBeenCalled()
    expect(manager.getExternalServer(f.uuid)).toBeUndefined()
    expect(existsSync(f.folder)).toBe(true)
    expect(readFileSync(cacheFile, 'utf8')).toBe(cache)
    expect(readFileSync(join(f.folder, 'commissioning.json'), 'utf8')).toBe(credentials)
  })

  it('dispatches opted-in handlers supplied on the cached object and later replaced', async () => {
    const f = fixture(true)
    await f.seed()
    const manager = f.manager()
    await manager.restoreCachedAccessories(false)
    const cached = f.configureMatterAccessory.mock.calls[0][0] as InternalMatterAccessory
    cached.handlers = f.accessory().handlers
    await manager.attach(cached)
    const server = manager.getExternalServer(f.uuid)!
    const registry = (server as unknown as { behaviorRegistry: { getHandler: (id: string, cluster: string, command: string) => unknown } }).behaviorRegistry
    expect(registry.getHandler(f.uuid, 'rvcRunMode', 'changeToMode'), 'restored handler source').toBe(f.onCommand)
    expect(server.getLiveState(f.uuid).rvcRunMode?.currentMode, 'restored idle mode').toBe(0)
    await server.triggerCommand(f.uuid, 'rvcRunMode', 'changeToMode', { newMode: 1 })
    expect(f.onCommand, 'first command reaches the restored handler').toHaveBeenCalledOnce()
    const replacement = vi.fn(async () => {})
    cached.handlers = {
      rvcRunMode: { changeToMode: replacement },
    }
    await server.triggerCommand(f.uuid, 'rvcRunMode', 'changeToMode', { newMode: 0 })
    expect(replacement, 'second command reaches the replacement handler').toHaveBeenCalledOnce()
    expect(f.onCommand).toHaveBeenCalledOnce()
    expect(server.getFabricInfo()).toHaveLength(1)
  })

  it('keeps the fabric and permits retry after a replacement cannot be registered', async () => {
    const f = fixture(true)
    await f.seed()
    const manager = f.manager()
    await manager.restoreCachedAccessories(false)
    const server = manager.getExternalServer(f.uuid)!
    const fabrics = server.getFabricInfo()
    const credentialsFile = join(f.folder, 'credentials.json')
    const credentials = readFileSync(credentialsFile, 'utf8')
    const invalid = f.accessory(true)
    invalid.clusters!.rvcOperationalState!.operationalError = { errorStateId: 999 }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(manager.attach(invalid)).rejects.toThrow()
    expect(server.getFabricInfo()).toEqual(fabrics)
    expect(readFileSync(credentialsFile, 'utf8')).toBe(credentials)
    await expect(manager.attach(f.accessory(true))).resolves.toBe(true)
    await server.triggerCommand(f.uuid, 'rvcRunMode', 'changeToMode', { newMode: 1 })
    expect(f.onCommand).toHaveBeenCalledOnce()
    expect(server.getFabricInfo()).toEqual(fabrics)
    errors.mockRestore()
  })
})
