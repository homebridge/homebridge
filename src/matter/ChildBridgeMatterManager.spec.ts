import type { HomebridgeAPI } from '../api.js'
import type { BridgeConfiguration, BridgeOptions } from '../bridgeService.js'
import type { ChildBridgeExternalPortService } from '../externalPortService.js'
import type { MatterConfig } from './types.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginManager } from '../pluginManager.js'
import { ChildBridgeMatterManager } from './ChildBridgeMatterManager.js'

describe('childBridgeMatterManager', () => {
  let manager: ChildBridgeMatterManager
  let mockBridgeConfig: BridgeConfiguration
  let mockBridgeOptions: BridgeOptions
  let mockApi: HomebridgeAPI
  let mockExternalPortService: ChildBridgeExternalPortService
  let mockPluginManager: PluginManager

  beforeEach(() => {
    // Create mock bridge config
    mockBridgeConfig = {
      username: '0E:DC:5D:BE:D6:75',
      pin: '031-45-154',
      name: 'Test Child Bridge',
      port: 51826,
    } as BridgeConfiguration

    // Create mock bridge options
    mockBridgeOptions = {
      debugModeEnabled: false,
    } as BridgeOptions

    // Create mock API
    mockApi = {
      _setMatterEnabled: vi.fn(),
      _setMatterServer: vi.fn(),
      on: vi.fn(),
      _resolveExternalRegistration: vi.fn(),
    } as any

    // Create mock external port service
    mockExternalPortService = {
      requestPort: vi.fn(),
    } as any

    // Create mock plugin manager
    mockPluginManager = {
      getPlugin: vi.fn(),
      getPluginByActiveDynamicPlatform: vi.fn(),
    } as any
  })

  describe('isMatterEnabled', () => {
    it('should return false when Matter is not configured', () => {
      manager = new ChildBridgeMatterManager(
        mockBridgeConfig,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      expect(manager.isMatterEnabled()).toBe(false)
    })

    it('should return false when Matter config exists but server not initialized', () => {
      const configWithMatter = {
        ...mockBridgeConfig,
        matter: { port: 5540 } as MatterConfig,
      }

      manager = new ChildBridgeMatterManager(
        configWithMatter,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      expect(manager.isMatterEnabled()).toBe(false)
    })

    it('should return true when Matter server is initialized', async () => {
      const configWithMatter = {
        ...mockBridgeConfig,
        matter: { port: 5540 } as MatterConfig,
      }

      manager = new ChildBridgeMatterManager(
        configWithMatter,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      // Mock the Matter server initialization
      const mockMatterServer = {
        start: vi.fn().mockResolvedValue(undefined),
        getCommissioningInfo: vi.fn().mockReturnValue({
          qrCode: 'MT:Y.K9000ABC1234567890',
          manualPairingCode: '12345678900',
          serialNumber: '0EDC5DBED675',
        }),
        on: vi.fn(),
      } as any

      // Directly set the matterServer for testing
      ;(manager as any).matterServer = mockMatterServer

      expect(manager.isMatterEnabled()).toBe(true)
    })
  })

  describe('enableStateMonitoring', () => {
    it('should log with bridge username when enabling monitoring', () => {
      const configWithMatter = {
        ...mockBridgeConfig,
        matter: { port: 5540 } as MatterConfig,
      }

      manager = new ChildBridgeMatterManager(
        configWithMatter,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      const mockMatterServer = {
        enableStateMonitoring: vi.fn(),
      } as any

      ;(manager as any).matterServer = mockMatterServer

      // Should not throw when calling enableStateMonitoring
      expect(() => manager.enableStateMonitoring()).not.toThrow()
      expect(mockMatterServer.enableStateMonitoring).toHaveBeenCalled()
    })

    it('should not throw when called without Matter server', () => {
      manager = new ChildBridgeMatterManager(
        mockBridgeConfig,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      expect(() => manager.enableStateMonitoring()).not.toThrow()
    })
  })

  describe('disableStateMonitoring', () => {
    it('should log with bridge username when disabling monitoring', () => {
      const configWithMatter = {
        ...mockBridgeConfig,
        matter: { port: 5540 } as MatterConfig,
      }

      manager = new ChildBridgeMatterManager(
        configWithMatter,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      const mockMatterServer = {
        disableStateMonitoring: vi.fn(),
      } as any

      ;(manager as any).matterServer = mockMatterServer

      // Should not throw when calling disableStateMonitoring
      expect(() => manager.disableStateMonitoring()).not.toThrow()
      expect(mockMatterServer.disableStateMonitoring).toHaveBeenCalled()
    })

    it('should not throw when called without Matter server', () => {
      manager = new ChildBridgeMatterManager(
        mockBridgeConfig,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      expect(() => manager.disableStateMonitoring()).not.toThrow()
    })
  })

  describe('getMatterStatusInfo', () => {
    it('should return undefined when Matter is not enabled', () => {
      manager = new ChildBridgeMatterManager(
        mockBridgeConfig,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      expect(manager.getMatterStatusInfo()).toBeUndefined()
    })

    it('should return status info when Matter is enabled', () => {
      const configWithMatter = {
        ...mockBridgeConfig,
        matter: { port: 5540 } as MatterConfig,
      }

      manager = new ChildBridgeMatterManager(
        configWithMatter,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      const mockMatterServer = {
        getCommissioningInfo: vi.fn().mockReturnValue({
          qrCode: 'MT:Y.K9000ABC1234567890',
          manualPairingCode: '12345678900',
          serialNumber: '0EDC5DBED675',
          commissioned: true,
        }),
        getAccessories: vi.fn().mockReturnValue([{ UUID: 'test' }]),
      } as any

      ;(manager as any).matterServer = mockMatterServer
      ;(manager as any).matterSerialNumber = '0EDC5DBED675'

      const statusInfo = manager.getMatterStatusInfo()
      expect(statusInfo).toBeDefined()
      expect(statusInfo?.serialNumber).toBe('0EDC5DBED675')
      expect(statusInfo?.commissioned).toBe(true)
      expect(statusInfo?.deviceCount).toBe(1)
    })
  })

  describe('collectAllAccessories', () => {
    it('should return empty array when Matter is not enabled', () => {
      manager = new ChildBridgeMatterManager(
        mockBridgeConfig,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      const accessories = manager.collectAllAccessories()
      expect(accessories).toEqual([])
    })

    it('should collect accessories from Matter server when enabled', () => {
      const configWithMatter = {
        ...mockBridgeConfig,
        matter: { port: 5540 } as MatterConfig,
      }

      manager = new ChildBridgeMatterManager(
        configWithMatter,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      const mockAccessories = [
        { UUID: 'acc-1', displayName: 'Light 1' },
        { UUID: 'acc-2', displayName: 'Light 2' },
      ]

      const mockMatterServer = {
        collectAccessories: vi.fn().mockReturnValue(mockAccessories),
      } as any

      ;(manager as any).matterServer = mockMatterServer

      const accessories = manager.collectAllAccessories()
      expect(accessories).toEqual(mockAccessories)
      expect(mockMatterServer.collectAccessories).toHaveBeenCalledWith(
        mockBridgeConfig.username,
        'child',
        mockBridgeConfig.name,
      )
    })
  })

  describe('getAccessoryInfo', () => {
    it('should return undefined when Matter is not enabled', () => {
      manager = new ChildBridgeMatterManager(
        mockBridgeConfig,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      const info = manager.getAccessoryInfo('test-uuid')
      expect(info).toBeUndefined()
    })

    it('should get accessory info from server when enabled', () => {
      const configWithMatter = {
        ...mockBridgeConfig,
        matter: { port: 5540 } as MatterConfig,
      }

      manager = new ChildBridgeMatterManager(
        configWithMatter,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      const mockAccessoryInfo = {
        uuid: 'test-uuid',
        displayName: 'Test Light',
        parts: [],
      }

      const mockMatterServer = {
        getAccessoryInfo: vi.fn().mockReturnValue(mockAccessoryInfo),
      } as any

      ;(manager as any).matterServer = mockMatterServer

      const info = manager.getAccessoryInfo('test-uuid')
      expect(info).toEqual(mockAccessoryInfo)
      expect(mockMatterServer.getAccessoryInfo).toHaveBeenCalledWith('test-uuid')
    })
  })
})
