import type { HomebridgeAPI } from '../api.js'
import type { HomebridgeConfig } from '../bridgeService.js'
import type { ExternalPortService } from '../externalPortService.js'
import type { PluginManager } from '../pluginManager.js'
import type { HomebridgeOptions } from '../server.js'
import type { InternalMatterAccessory } from './types.js'

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../logger.js'
import { publishExternalMatterAccessory } from './ExternalMatterAccessoryPublisher.js'
import { MatterBridgeManager } from './MatterBridgeManager.js'

// The real publisher starts a matter.js server. Here it hands back a stand-in
// server, so the manager's own part of a publish can be checked: what it does
// with the server it is given.
vi.mock('./ExternalMatterAccessoryPublisher.js', () => ({
  publishExternalMatterAccessory: vi.fn(),
}))

class FakeExternalServer extends EventEmitter {
  public monitoring = false
  public username = 'EE:00:00:00:00:01'
  public bridgeName = 'Vacuum'
  public stop = vi.fn().mockResolvedValue(undefined)

  enableStateMonitoring(): void {
    this.monitoring = true
  }

  disableStateMonitoring(): void {
    this.monitoring = false
  }
}

describe('matterBridgeManager: publishing an external accessory', () => {
  let manager: MatterBridgeManager
  let registerExternalMatterBridge: ReturnType<typeof vi.fn>

  function publishResult(server: FakeExternalServer) {
    return {
      server,
      port: 5531,
      username: server.username,
      commissioningInfo: { commissioned: false },
    } as any
  }

  function accessory(uuid: string): InternalMatterAccessory {
    return { UUID: uuid, displayName: `Vacuum ${uuid}` } as InternalMatterAccessory
  }

  beforeEach(() => {
    vi.mocked(publishExternalMatterAccessory).mockReset()
    vi.spyOn(Logger.withPrefix('Matter/MainManager'), 'info').mockImplementation(() => {})
    registerExternalMatterBridge = vi.fn()
    manager = new MatterBridgeManager(
      {
        bridge: { name: 'Main', username: 'CC:22:3D:E3:CE:30', pin: '031-45-154' },
        platforms: [],
        accessories: [],
      } as HomebridgeConfig,
      {
        on: vi.fn(),
        removeListener: vi.fn(),
        _resolveExternalRegistration: vi.fn(),
      } as unknown as HomebridgeAPI,
      {
        requestPort: vi.fn(),
        releaseMatterPort: vi.fn(),
      } as unknown as ExternalPortService,
      {
        getPlugin: vi.fn(),
      } as unknown as PluginManager,
      { debugModeEnabled: false } as HomebridgeOptions,
      {
        registerExternalMatterBridge,
        ipcService: {
          sendMessage: vi.fn(),
        },
      } as any,
    )
  })

  afterEach(async () => {
    await manager.teardown()
    vi.restoreAllMocks()
  })

  // The UI switches monitoring on once, for the servers that exist then. A
  // plugin can publish an external accessory at any time after that.
  describe('state monitoring', () => {
    it('is on for an accessory published after the UI switched it on', async () => {
      const server = new FakeExternalServer()
      vi.mocked(publishExternalMatterAccessory).mockResolvedValue(publishResult(server))

      manager.enableStateMonitoring()
      await manager.handlePublishExternalAccessories([
        accessory('ext-1'),
      ], 'registration-1')

      expect(server.monitoring).toBe(true)
      expect(registerExternalMatterBridge).toHaveBeenCalledWith('EE:00:00:00:00:01', 'CC:22:3D:E3:CE:30')
    })

    it('stays off for an accessory published while the UI is not watching', async () => {
      const first = new FakeExternalServer()
      const second = new FakeExternalServer()
      vi.mocked(publishExternalMatterAccessory)
        .mockResolvedValueOnce(publishResult(first))
        .mockResolvedValueOnce(publishResult(second))

      await manager.handlePublishExternalAccessories([
        accessory('ext-1'),
      ], 'registration-1')
      expect(first.monitoring).toBe(false)

      manager.enableStateMonitoring()
      manager.disableStateMonitoring()
      await manager.handlePublishExternalAccessories([
        accessory('ext-2'),
      ], 'registration-2')

      expect(first.monitoring).toBe(false)
      expect(second.monitoring).toBe(false)
    })
  })
})
