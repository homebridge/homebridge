import type { PluginManager } from '../pluginManager.js'
import type { MatterServer } from './server.js'
import type { InternalMatterAccessory } from './types.js'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { User } from '../user.js'
import { generate } from '../util/mac.js'
import { BaseMatterManager } from './BaseMatterManager.js'
import { deviceTypes } from './types.js'

class Manager extends BaseMatterManager {
  enabled = true
  owner = 'main-bridge'
  protected override getExternalCacheOwner(): string {
    return this.owner
  }

  override hasActiveMatter(): boolean {
    return this.enabled
  }

  attach(accessory: InternalMatterAccessory): Promise<boolean> {
    return this.attachRestoredExternalAccessory(accessory)
  }

  published = vi.fn()
  protected override async publishRestoredExternalAccessory(accessory: InternalMatterAccessory): Promise<void> {
    this.published(accessory)
    this.externalMatterServers.set(accessory.UUID, {
      stop: vi.fn().mockResolvedValue(undefined),
      registerPlatformAccessories: vi.fn().mockResolvedValue(undefined),
    } as unknown as MatterServer)
  }
}

describe('external Matter cache restoration', () => {
  const roots: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  function fixture(ambiguous = false) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-external-cache-'))
    roots.push(root)
    vi.spyOn(User, 'matterPath').mockReturnValue(root)
    const uuid = '00000000-0000-4000-8000-000000000001'
    const dir = path.join(root, generate(uuid).replace(/:/g, ''))
    fs.mkdirSync(dir)
    const file = path.join(dir, 'accessories.json')
    fs.writeFileSync(file, JSON.stringify([
      {
        uuid,
        plugin: 'test-plugin',
        platform: '',
        displayName: 'Test vacuum',
        deviceType: { name: 'RoboticVacuumCleaner' },
        context: {},
      },
    ]))
    fs.writeFileSync(path.join(dir, 'credentials.json'), 'preserved')
    fs.writeFileSync(path.join(dir, 'homebridge-owner.json'), JSON.stringify({
      bridge: 'main-bridge',
      uuid,
      plugin: 'test-plugin',
      platform: '',
    }))
    const configureMatterAccessory = vi.fn()
    const plugin = {
      getUniqueActiveDynamicPlatform: () => ambiguous
        ? undefined
        : { configureMatterAccessory },
    }
    const manager = new Manager({
      getPlugin: () => plugin,
    } as unknown as PluginManager)
    return {
      manager,
      file,
      dir,
      configureMatterAccessory,
    }
  }

  it('restores without a main server and removes storage on exclusion like a fresh accessory', async () => {
    const f = fixture()
    await f.manager.restoreCachedAccessories(false)
    expect(f.configureMatterAccessory).toHaveBeenCalledTimes(1)
    const accessory = f.configureMatterAccessory.mock.calls[0][0] as InternalMatterAccessory
    expect(f.manager.published).toHaveBeenCalledWith(accessory)
    expect(accessory).not.toHaveProperty('_externalCacheOnly')
    expect(accessory.deviceType).toBe(deviceTypes.RoboticVacuumCleaner)
    await f.manager.handleUnregisterExternalAccessories([accessory])
    expect(fs.existsSync(f.file)).toBe(false)
    expect(fs.existsSync(f.dir)).toBe(false)
  })

  it('does not deliver metadata when publication fails and allows a later retry', async () => {
    const f = fixture()
    const publish = vi.spyOn(f.manager as any, 'publishRestoredExternalAccessory')
      .mockRejectedValueOnce(new Error('bind failed'))
    await f.manager.restoreCachedAccessories(false)
    expect(f.configureMatterAccessory).not.toHaveBeenCalled()
    expect(f.manager.getExternalServer('00000000-0000-4000-8000-000000000001')).toBeUndefined()
    expect(fs.existsSync(f.file)).toBe(true)
    publish.mockRestore()
    await f.manager.restoreCachedAccessories(false)
    expect(f.configureMatterAccessory).toHaveBeenCalledOnce()
  })

  it('publishes successfully before delivering the cached accessory', async () => {
    const f = fixture()
    await f.manager.restoreCachedAccessories(false)
    expect(f.manager.published.mock.invocationCallOrder[0])
      .toBeLessThan(f.configureMatterAccessory.mock.invocationCallOrder[0])
  })

  it('does not publish or deliver the same cache twice', async () => {
    const f = fixture()
    await f.manager.restoreCachedAccessories(false)
    await f.manager.restoreCachedAccessories(false)
    expect(f.manager.published).toHaveBeenCalledOnce()
    expect(f.configureMatterAccessory).toHaveBeenCalledOnce()
  })

  it('retains the live server for registration if the plugin cache callback throws', async () => {
    const f = fixture()
    f.configureMatterAccessory.mockImplementationOnce(() => {
      throw new Error('plugin failed')
    })
    await f.manager.restoreCachedAccessories(false)
    const accessory = f.manager.published.mock.calls[0][0] as InternalMatterAccessory
    expect(f.manager.getExternalServer(accessory.UUID)).toBeDefined()
    expect(await f.manager.attach(accessory)).toBe(true)
  })

  it('rejects an ownership record that refers to another accessory', async () => {
    const f = fixture()
    const file = path.join(f.dir, 'homebridge-owner.json')
    const owner = JSON.parse(fs.readFileSync(file, 'utf8'))
    owner.uuid = 'another-accessory'
    fs.writeFileSync(file, JSON.stringify(owner))
    await f.manager.restoreCachedAccessories(false)
    expect(f.manager.published).not.toHaveBeenCalled()
    expect(f.configureMatterAccessory).not.toHaveBeenCalled()
  })

  it.each(['child-one', 'child-two'])('does not restore another bridge\'s cache in %s', async (bridge) => {
    const f = fixture()
    const second = new Manager((f.manager as any).pluginManager)
    second.owner = bridge
    await Promise.all([
      f.manager.restoreCachedAccessories(false),
      second.restoreCachedAccessories(false),
    ])
    expect(f.manager.published).toHaveBeenCalledOnce()
    expect(second.published).not.toHaveBeenCalled()
    expect(f.configureMatterAccessory).toHaveBeenCalledOnce()
  })

  it('leaves legacy unowned caches for explicit plugin registration', async () => {
    const f = fixture()
    fs.unlinkSync(path.join(f.dir, 'homebridge-owner.json'))
    await f.manager.restoreCachedAccessories(false)
    expect(f.manager.published).not.toHaveBeenCalled()
    expect(f.configureMatterAccessory).not.toHaveBeenCalled()
    expect(fs.readFileSync(path.join(f.dir, 'credentials.json'), 'utf8')).toBe('preserved')
  })

  it('does not claim a cache with ambiguous platform ownership', async () => {
    const f = fixture(true)
    await f.manager.restoreCachedAccessories(false)
    expect(f.configureMatterAccessory).not.toHaveBeenCalled()
    expect(fs.existsSync(f.file)).toBe(true)
  })

  it('does not restore or publish external caches when Matter is disabled', async () => {
    const f = fixture()
    f.manager.enabled = false
    await f.manager.restoreCachedAccessories(false)
    expect(f.configureMatterAccessory).not.toHaveBeenCalled()
    expect(f.manager.published).not.toHaveBeenCalled()
    expect(fs.existsSync(f.file)).toBe(true)
  })

  it('attaches a replacement registration once through the existing server', async () => {
    const f = fixture()
    await f.manager.restoreCachedAccessories(false)
    const cached = f.configureMatterAccessory.mock.calls[0][0] as InternalMatterAccessory
    const replacement = {
      ...cached,
      handlers: {
        onOff: {
          on: vi.fn(),
        },
      },
    }
    expect(await f.manager.attach(replacement)).toBe(true)
    expect(f.manager.getExternalServer(cached.UUID)?.registerPlatformAccessories).toHaveBeenCalledWith(
      'test-plugin', 'ExternalMatter', [replacement],
    )
    expect(await f.manager.attach(replacement)).toBe(false)
    expect(f.manager.published).toHaveBeenCalledTimes(1)
  })

  it('allows retrying a failed replacement registration without dropping the live server', async () => {
    const f = fixture()
    await f.manager.restoreCachedAccessories(false)
    const accessory = f.configureMatterAccessory.mock.calls[0][0] as InternalMatterAccessory
    const server = f.manager.getExternalServer(accessory.UUID)!
    vi.mocked(server.registerPlatformAccessories).mockRejectedValueOnce(new Error('registration failed'))
    await expect(f.manager.attach(accessory)).rejects.toThrow('registration failed')
    expect(f.manager.getExternalServer(accessory.UUID)).toBe(server)
    expect(await f.manager.attach(accessory)).toBe(true)
    expect(fs.existsSync(f.file)).toBe(true)
  })

  it('restores composed parts and declared features before publishing', async () => {
    const f = fixture()
    const data = JSON.parse(fs.readFileSync(f.file, 'utf8'))
    data[0].features = {
      serviceArea: ['Maps'],
    }
    data[0].parts = [
      {
        id: 'fan',
        deviceType: {
          name: 'Fan',
          clusterFeatures: {
            fanControl: ['Auto'],
          },
        },
        clusters: {},
      },
    ]
    fs.writeFileSync(f.file, JSON.stringify(data))
    await f.manager.restoreCachedAccessories(false)
    expect(f.manager.published).toHaveBeenCalledTimes(1)
    const accessory = f.manager.published.mock.calls[0][0] as InternalMatterAccessory
    expect(accessory.features).toEqual({
      serviceArea: ['Maps'],
    })
    expect(accessory.parts?.[0].id).toBe('fan')
    expect(accessory.parts?.[0].deviceType).not.toBe(deviceTypes.Fan)
  })

  it('leaves malformed metadata unchanged', async () => {
    const f = fixture()
    fs.writeFileSync(f.file, '{invalid')
    await f.manager.restoreCachedAccessories(false)
    expect(f.configureMatterAccessory).not.toHaveBeenCalled()
    expect(fs.readFileSync(f.file, 'utf8')).toBe('{invalid')
  })

  it('does not restore an accessory from a mismatching storage directory', async () => {
    const f = fixture()
    const data = JSON.parse(fs.readFileSync(f.file, 'utf8'))
    data[0].uuid = 'c786c276-cd40-41f1-95d6-1865fb8e5461'
    fs.writeFileSync(f.file, JSON.stringify(data))
    await f.manager.restoreCachedAccessories(false)
    expect(f.configureMatterAccessory).not.toHaveBeenCalled()
    expect(fs.existsSync(f.file)).toBe(true)
  })
})
