import type { PluginManager } from '../pluginManager.js'
import type { InternalMatterAccessory } from './types.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BaseMatterManager } from './BaseMatterManager.js'
import { MatterServer } from './server.js'

// Concrete implementation for testing abstract class
class TestMatterManager extends BaseMatterManager {
  constructor(pluginManager: PluginManager) {
    super(pluginManager)
  }

  // Expose protected members for testing
  public getMatterServer(): MatterServer | undefined {
    return this.matterServer
  }

  public getExternalMatterServers(): Map<string, MatterServer> {
    return this.externalMatterServers
  }

  public setMatterServer(server: MatterServer): void {
    this.matterServer = server
  }

  public addExternalServer(uuid: string, server: MatterServer): void {
    this.externalMatterServers.set(uuid, server)
  }
}

describe('baseMatterManager', () => {
  let manager: TestMatterManager
  let mockPluginManager: PluginManager
  let mockMatterServer: MatterServer
  let mockExternalServer: MatterServer

  beforeEach(() => {
    // Create mock plugin manager
    mockPluginManager = {
      getPlugin: vi.fn(),
      getPluginByActiveDynamicPlatform: vi.fn(),
    } as any

    // Create mock Matter servers
    mockMatterServer = {
      triggerCommand: vi.fn().mockResolvedValue(undefined),
      updateAccessoryState: vi.fn().mockResolvedValue(undefined),
      getAccessoryState: vi.fn().mockReturnValue(undefined),
      notifyStateChange: vi.fn(),
      enableStateMonitoring: vi.fn(),
      disableStateMonitoring: vi.fn(),
      registerPlatformAccessories: vi.fn().mockResolvedValue(undefined),
      updatePlatformAccessories: vi.fn().mockResolvedValue(undefined),
      unregisterPlatformAccessories: vi.fn().mockResolvedValue(undefined),
      unregisterAccessory: vi.fn().mockResolvedValue(undefined),
      getAllCachedAccessories: vi.fn().mockReturnValue([]),
      stop: vi.fn().mockResolvedValue(undefined),
    } as any

    mockExternalServer = {
      triggerCommand: vi.fn().mockResolvedValue(undefined),
      updateAccessoryState: vi.fn().mockResolvedValue(undefined),
      getAccessoryState: vi.fn().mockReturnValue(undefined),
      notifyStateChange: vi.fn(),
      enableStateMonitoring: vi.fn(),
      disableStateMonitoring: vi.fn(),
      updatePlatformAccessories: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    } as any

    manager = new TestMatterManager(mockPluginManager)
  })

  describe('handleTriggerCommand', () => {
    it('should route commands to external server if accessory is external', async () => {
      const uuid = 'test-uuid'
      manager.addExternalServer(uuid, mockExternalServer)

      await manager.handleTriggerCommand(uuid, 'onOff', { onOff: true })

      expect(mockExternalServer.triggerCommand).toHaveBeenCalledWith(uuid, 'onOff', 'on', undefined, undefined)
    })

    it('should route commands to main server if accessory is not external', async () => {
      const uuid = 'test-uuid'
      manager.setMatterServer(mockMatterServer)

      await manager.handleTriggerCommand(uuid, 'onOff', { onOff: true })

      expect(mockMatterServer.triggerCommand).toHaveBeenCalledWith(uuid, 'onOff', 'on', undefined, undefined)
    })

    it('should throw error if accessory not found on any server', async () => {
      await expect(manager.handleTriggerCommand('unknown-uuid', 'onOff', { onOff: true }))
        .rejects
        .toThrow('Accessory unknown-uuid not found on this bridge')
    })

    it('should support partId parameter', async () => {
      const uuid = 'test-uuid'
      manager.setMatterServer(mockMatterServer)

      await manager.handleTriggerCommand(uuid, 'onOff', { onOff: true }, 'outlet-2')

      expect(mockMatterServer.triggerCommand).toHaveBeenCalledWith(uuid, 'onOff', 'on', undefined, 'outlet-2')
    })
  })

  describe('handleUpdateAccessoryState', () => {
    it('should route state updates to external server', async () => {
      const uuid = 'test-uuid'
      manager.addExternalServer(uuid, mockExternalServer)

      await manager.handleUpdateAccessoryState(uuid, 'levelControl', { currentLevel: 200 })

      expect(mockExternalServer.updateAccessoryState).toHaveBeenCalledWith(uuid, 'levelControl', { currentLevel: 200 }, undefined)
    })

    it('should route state updates to main server', async () => {
      const uuid = 'test-uuid'
      manager.setMatterServer(mockMatterServer)

      await manager.handleUpdateAccessoryState(uuid, 'levelControl', { currentLevel: 200 })

      expect(mockMatterServer.updateAccessoryState).toHaveBeenCalledWith(uuid, 'levelControl', { currentLevel: 200 }, undefined)
    })

    it('should throw error if accessory not found', async () => {
      await expect(manager.handleUpdateAccessoryState('unknown-uuid', 'onOff', { onOff: true }))
        .rejects
        .toThrow('Accessory unknown-uuid not found on this bridge')
    })
  })

  describe('enableStateMonitoring', () => {
    it('should enable monitoring on main server', () => {
      manager.setMatterServer(mockMatterServer)
      manager.enableStateMonitoring()
      expect(mockMatterServer.enableStateMonitoring).toHaveBeenCalled()
    })

    it('should enable monitoring on all external servers', () => {
      manager.addExternalServer('uuid-1', mockExternalServer)
      manager.addExternalServer('uuid-2', mockExternalServer)

      manager.enableStateMonitoring()

      expect(mockExternalServer.enableStateMonitoring).toHaveBeenCalledTimes(2)
    })

    it('should not throw if no servers exist', () => {
      expect(() => manager.enableStateMonitoring()).not.toThrow()
    })
  })

  describe('disableStateMonitoring', () => {
    it('should disable monitoring on main server', () => {
      manager.setMatterServer(mockMatterServer)
      manager.disableStateMonitoring()
      expect(mockMatterServer.disableStateMonitoring).toHaveBeenCalled()
    })

    it('should disable monitoring on all external servers', () => {
      manager.addExternalServer('uuid-1', mockExternalServer)
      manager.addExternalServer('uuid-2', mockExternalServer)

      manager.disableStateMonitoring()

      expect(mockExternalServer.disableStateMonitoring).toHaveBeenCalledTimes(2)
    })
  })

  describe('handleRegisterPlatformAccessories', () => {
    it('should register accessories on main server', async () => {
      manager.setMatterServer(mockMatterServer)

      const accessories: InternalMatterAccessory[] = [
        { UUID: 'test-1', displayName: 'Test 1' } as any,
        { UUID: 'test-2', displayName: 'Test 2' } as any,
      ]

      await manager.handleRegisterPlatformAccessories('test-plugin', 'TestPlatform', accessories)

      expect(mockMatterServer.registerPlatformAccessories).toHaveBeenCalledWith('test-plugin', 'TestPlatform', accessories)
    })

    it('should log warning if server not running', async () => {
      const accessories: InternalMatterAccessory[] = [{ UUID: 'test-1', displayName: 'Test 1' } as any]
      await manager.handleRegisterPlatformAccessories('test-plugin', 'TestPlatform', accessories)
      // Should not throw, just log warning
    })
  })

  describe('handleUpdatePlatformAccessories', () => {
    it('should route accessories to external servers', async () => {
      const externalUuid = 'external-1'
      manager.addExternalServer(externalUuid, mockExternalServer)
      manager.setMatterServer(mockMatterServer)

      const accessories: InternalMatterAccessory[] = [
        { UUID: externalUuid, displayName: 'External' } as any,
        { UUID: 'bridge-1', displayName: 'Bridge' } as any,
      ]

      await manager.handleUpdatePlatformAccessories(accessories)

      expect(mockExternalServer.updatePlatformAccessories).toHaveBeenCalledWith([accessories[0]])
      expect(mockMatterServer.updatePlatformAccessories).toHaveBeenCalledWith([accessories[1]])
    })

    it('should handle all external accessories', async () => {
      manager.addExternalServer('ext-1', mockExternalServer)

      const accessories: InternalMatterAccessory[] = [
        { UUID: 'ext-1', displayName: 'External 1' } as any,
      ]

      await manager.handleUpdatePlatformAccessories(accessories)

      expect(mockExternalServer.updatePlatformAccessories).toHaveBeenCalledWith(accessories)
    })

    it('should handle all bridge accessories', async () => {
      manager.setMatterServer(mockMatterServer)

      const accessories: InternalMatterAccessory[] = [
        { UUID: 'bridge-1', displayName: 'Bridge 1' } as any,
        { UUID: 'bridge-2', displayName: 'Bridge 2' } as any,
      ]

      await manager.handleUpdatePlatformAccessories(accessories)

      expect(mockMatterServer.updatePlatformAccessories).toHaveBeenCalledWith(accessories)
    })
  })

  describe('handleUnregisterPlatformAccessories', () => {
    it('should unregister accessories from main server', async () => {
      manager.setMatterServer(mockMatterServer)

      const accessories: InternalMatterAccessory[] = [
        { UUID: 'test-1', displayName: 'Test 1' } as any,
      ]

      await manager.handleUnregisterPlatformAccessories('test-plugin', 'TestPlatform', accessories)

      expect(mockMatterServer.unregisterPlatformAccessories).toHaveBeenCalledWith('test-plugin', 'TestPlatform', accessories)
    })
  })

  describe('handleUnregisterExternalAccessories', () => {
    it('should stop external servers and clean up storage', async () => {
      const uuid = 'external-1'
      manager.addExternalServer(uuid, mockExternalServer)

      const accessories: InternalMatterAccessory[] = [
        { UUID: uuid, displayName: 'External 1' } as any,
      ]

      await manager.handleUnregisterExternalAccessories(accessories)

      expect(mockExternalServer.stop).toHaveBeenCalled()
      expect(manager.getExternalMatterServers().has(uuid)).toBe(false)
    })

    it('should handle non-existent accessories gracefully', async () => {
      const accessories: InternalMatterAccessory[] = [
        { UUID: 'non-existent', displayName: 'Non-existent' } as any,
      ]

      await manager.handleUnregisterExternalAccessories(accessories)
      // Should not throw
    })

    it('should continue unregistering if one fails', async () => {
      const uuid1 = 'external-1'
      const uuid2 = 'external-2'

      const failingServer = {
        stop: vi.fn().mockRejectedValue(new Error('Stop failed')),
      } as any

      manager.addExternalServer(uuid1, failingServer)
      manager.addExternalServer(uuid2, mockExternalServer)

      const accessories: InternalMatterAccessory[] = [
        { UUID: uuid1, displayName: 'External 1' } as any,
        { UUID: uuid2, displayName: 'External 2' } as any,
      ]

      await manager.handleUnregisterExternalAccessories(accessories)

      expect(mockExternalServer.stop).toHaveBeenCalled()
    })
  })

  describe('restoreCachedAccessories', () => {
    it('should restore cached accessories', () => {
      const mockPlugin = {
        getPluginIdentifier: vi.fn().mockReturnValue('test-plugin'),
        getActiveDynamicPlatform: vi.fn().mockReturnValue({
          configureMatterAccessory: vi.fn(),
        }),
      }

      mockPluginManager.getPlugin = vi.fn().mockReturnValue(mockPlugin)

      const cachedAccessories = [
        {
          uuid: 'cached-1',
          displayName: 'Cached Light',
          plugin: 'test-plugin',
          platform: 'TestPlatform',
        },
      ]

      mockMatterServer.getAllCachedAccessories = vi.fn().mockReturnValue(cachedAccessories)
      manager.setMatterServer(mockMatterServer)

      manager.restoreCachedAccessories(false)

      expect(mockMatterServer.getAllCachedAccessories).toHaveBeenCalled()
      expect(mockPluginManager.getPlugin).toHaveBeenCalledWith('test-plugin')
    })

    it('should remove orphaned accessories when keepOrphaned is false', () => {
      mockPluginManager.getPlugin = vi.fn().mockReturnValue(null)
      mockPluginManager.getPluginByActiveDynamicPlatform = vi.fn().mockImplementation(() => {
        throw new Error('Plugin not found')
      })

      const cachedAccessories = [
        {
          uuid: 'orphaned-1',
          displayName: 'Orphaned Light',
          plugin: 'missing-plugin',
          platform: 'MissingPlatform',
        },
      ]

      mockMatterServer.getAllCachedAccessories = vi.fn().mockReturnValue(cachedAccessories)
      manager.setMatterServer(mockMatterServer)

      manager.restoreCachedAccessories(false)

      expect(mockMatterServer.unregisterAccessory).toHaveBeenCalledWith('orphaned-1')
    })

    it('should keep orphaned accessories when keepOrphaned is true', () => {
      mockPluginManager.getPlugin = vi.fn().mockReturnValue(null)
      mockPluginManager.getPluginByActiveDynamicPlatform = vi.fn().mockImplementation(() => {
        throw new Error('Plugin not found')
      })

      const cachedAccessories = [
        {
          uuid: 'orphaned-1',
          displayName: 'Orphaned Light',
          plugin: 'missing-plugin',
          platform: 'MissingPlatform',
        },
      ]

      mockMatterServer.getAllCachedAccessories = vi.fn().mockReturnValue(cachedAccessories)
      manager.setMatterServer(mockMatterServer)

      manager.restoreCachedAccessories(true)

      expect(mockMatterServer.unregisterAccessory).not.toHaveBeenCalled()
    })
  })
})
