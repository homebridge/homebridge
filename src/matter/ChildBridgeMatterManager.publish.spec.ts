import type { HomebridgeAPI } from '../api.js'
import type { BridgeConfiguration, BridgeOptions } from '../bridgeService.js'
import type { ChildBridgeExternalPortService } from '../externalPortService.js'
import type { PluginManager } from '../pluginManager.js'
import type { InternalMatterAccessory } from './types.js'

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChildBridgeMatterManager } from './ChildBridgeMatterManager.js'
import { publishExternalMatterAccessory } from './ExternalMatterAccessoryPublisher.js'

// The real publisher starts a matter.js server. Here it hands back a stand-in
// server, so the manager's own part of a publish can be checked: what it does
// with the server it is given.
vi.mock('./ExternalMatterAccessoryPublisher.js', () => ({
  publishExternalMatterAccessory: vi.fn(),
}))

const sendToParent = vi.hoisted(() => vi.fn())
vi.mock('../util/ipc.js', () => ({ sendToParent }))

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

describe('childBridgeMatterManager: publishing an external accessory', () => {
  const username = '0E:DC:5D:BE:D6:75'
  let api: { on: ReturnType<typeof vi.fn>, removeListener: ReturnType<typeof vi.fn>, _resolveExternalRegistration: ReturnType<typeof vi.fn> }
  let manager: ChildBridgeMatterManager

  function publishResult(server: FakeExternalServer) {
    return {
      server,
      port: 5531,
      username: server.username,
      commissioningInfo: { qrCode: 'MT:EXT', manualPairingCode: '1234', commissioned: false },
    } as any
  }

  function accessory(uuid: string): InternalMatterAccessory {
    return { UUID: uuid, displayName: `Vacuum ${uuid}` } as InternalMatterAccessory
  }

  beforeEach(() => {
    vi.mocked(publishExternalMatterAccessory).mockReset()
    sendToParent.mockReset()
    api = {
      on: vi.fn(),
      removeListener: vi.fn(),
      _resolveExternalRegistration: vi.fn(),
    }
    manager = new ChildBridgeMatterManager(
      {
        username,
        pin: '031-45-154',
        name: 'Child',
        matter: { enabled: false, externalsOnly: true },
      } as BridgeConfiguration,
      { debugModeEnabled: false } as BridgeOptions,
      api as unknown as HomebridgeAPI,
      {
        requestMatterPort: vi.fn(),
        releaseMatterPort: vi.fn(),
      } as unknown as ChildBridgeExternalPortService,
      {
        getPlugin: vi.fn(),
      } as unknown as PluginManager,
    )
  })

  afterEach(async () => {
    await manager.teardown()
  })

  it('keeps the server, tells the parent which bridge owns it, and resolves the registration', async () => {
    const server = new FakeExternalServer()
    vi.mocked(publishExternalMatterAccessory).mockResolvedValue(publishResult(server))

    await manager.handlePublishExternalAccessories([
      accessory('ext-1'),
    ], 'registration-1')

    expect(manager.getExternalServer('ext-1')).toBe(server)
    expect(sendToParent).toHaveBeenCalledWith({
      id: 'matterEvent',
      data: {
        type: 'externalBridgeRegistration',
        data: { externalBridgeUsername: 'EE:00:00:00:00:01', childBridgeUsername: username },
      },
    })
    expect(api._resolveExternalRegistration).toHaveBeenCalledWith('registration-1')
  })

  it('forwards a state change of the external accessory to the parent', async () => {
    const server = new FakeExternalServer()
    vi.mocked(publishExternalMatterAccessory).mockResolvedValue(publishResult(server))
    await manager.handlePublishExternalAccessories([
      accessory('ext-1'),
    ], 'registration-1')
    sendToParent.mockClear()

    server.emit('stateChange', {
      uuid: 'ext-1',
      cluster: 'rvcRunMode',
      state: { currentMode: 1 },
    })

    expect(sendToParent).toHaveBeenCalledWith({
      id: 'matterEvent',
      data: {
        type: 'accessoryUpdate',
        data: {
          uuid: 'ext-1',
          cluster: 'rvcRunMode',
          state: { currentMode: 1 },
          partId: undefined,
        },
      },
    })
  })

  it('does not publish the same accessory twice', async () => {
    const server = new FakeExternalServer()
    vi.mocked(publishExternalMatterAccessory).mockResolvedValue(publishResult(server))

    await manager.handlePublishExternalAccessories([
      accessory('ext-1'),
    ], 'registration-1')
    await manager.handlePublishExternalAccessories([
      accessory('ext-1'),
    ], 'registration-2')

    expect(publishExternalMatterAccessory).toHaveBeenCalledTimes(1)
    expect(api._resolveExternalRegistration).toHaveBeenCalledWith('registration-2')
  })

  it('resolves the registration when the publish fails, and goes on to the next accessory', async () => {
    const server = new FakeExternalServer()
    vi.mocked(publishExternalMatterAccessory)
      .mockRejectedValueOnce(new Error('port in use'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(publishResult(server))

    await manager.handlePublishExternalAccessories([
      accessory('ext-1'),
      accessory('ext-2'),
      accessory('ext-3'),
    ], 'registration-1')

    expect(manager.getExternalServer('ext-1')).toBeUndefined()
    expect(manager.getExternalServer('ext-2')).toBeUndefined()
    expect(manager.getExternalServer('ext-3')).toBe(server)
    expect(api._resolveExternalRegistration).toHaveBeenCalledWith('registration-1')
  })

  // The UI switches monitoring on once, for the servers that exist then. A
  // child bridge that restarts with the accessories page open is told again
  // when it reports ONLINE, which is before its external accessories publish.
  describe('state monitoring', () => {
    it('is on for an accessory published after the UI switched it on', async () => {
      const server = new FakeExternalServer()
      vi.mocked(publishExternalMatterAccessory).mockResolvedValue(publishResult(server))

      manager.enableStateMonitoring()
      await manager.handlePublishExternalAccessories([
        accessory('ext-1'),
      ], 'registration-1')

      expect(server.monitoring).toBe(true)
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
