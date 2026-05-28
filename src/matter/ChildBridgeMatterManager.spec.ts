import type { HomebridgeAPI } from '../api.js'
import type { BridgeConfiguration, BridgeOptions } from '../bridgeService.js'
import type { ChildBridgeExternalPortService } from '../externalPortService.js'
import type { MatterConfig } from './types.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InternalAPIEvent } from '../api.js'
import { Logger } from '../logger.js'
import { PluginManager } from '../pluginManager.js'
import { ChildBridgeMatterManager } from './ChildBridgeMatterManager.js'
import { MatterAccessoryNotOnBridgeError } from './MatterError.js'

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

  describe('initialize — three-state (disabled, externalsOnly, normal)', () => {
    function createManager(matter: MatterConfig | undefined) {
      const cfg = { ...mockBridgeConfig, matter } as BridgeConfiguration
      return new ChildBridgeMatterManager(
        cfg,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )
    }

    it('returns early without attaching listeners when matter is not configured', async () => {
      const m = createManager(undefined)
      await m.initialize()
      expect(mockApi.on).not.toHaveBeenCalled()
      expect((m as any).matterServer).toBeUndefined()
    })

    it('returns early without attaching listeners when matter is fully disabled (enabled: false, no externalsOnly)', async () => {
      const m = createManager({ enabled: false } as MatterConfig)
      await m.initialize()
      expect(mockApi.on).not.toHaveBeenCalled()
      expect((m as any).matterServer).toBeUndefined()
    })

    it('externalsOnly mode: attaches external listeners + bridged drop stubs, does NOT start the bridge server', async () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      await m.initialize()

      // No bridge server started.
      expect((m as any).matterServer).toBeUndefined()
      expect(mockExternalPortService.requestPort).not.toHaveBeenCalled()

      // External listeners attached.
      const attached = vi.mocked(mockApi.on).mock.calls.map(c => c[0])
      expect(attached).toContain(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES)
      expect(attached).toContain(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES)

      // Bridged drop stubs attached.
      expect(attached).toContain(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(attached).toContain(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES)
      expect(attached).toContain(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(attached).toContain(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE)

      // externalsOnlyMode flag set.
      expect((m as any).externalsOnlyMode).toBe(true)
    })

    it('externalsOnly mode: bridged drop stub logs at debug level (does not call base handler)', () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      const handleRegisterSpy = vi.spyOn(m as any, 'handleRegisterPlatformAccessories')

      // Directly invoke the drop stub (would normally be wired up by setupBridgedDropStubs).
      ;(m as any)._onRegisterMatterPlatformAccessoriesDropped('homebridge-test', 'TestPlatform', [{ displayName: 'x' }])

      // The base handler must NOT be called — drop stub logs only.
      expect(handleRegisterSpy).not.toHaveBeenCalled()
    })

    it('externalsOnly mode: external publish listener is fully wired (not a drop stub)', () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      const handlePublishSpy = vi.spyOn(m as any, 'handlePublishExternalAccessories').mockResolvedValue(undefined)

      // Invoke the external publish handler directly.
      ;(m as any)._onPublishExternalMatterAccessories([{ displayName: 'x' }], 'reg-1')

      expect(handlePublishSpy).toHaveBeenCalledWith([{ displayName: 'x' }], 'reg-1')
    })

    it('externalsOnly mode: routes accessory state updates to external servers (not dropped)', async () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      await m.initialize()

      // A published external accessory in externalsOnly mode.
      const extServer = { updateAccessoryState: vi.fn().mockResolvedValue(undefined) }
      ;(m as any).externalMatterServers.set('ext-uuid', extServer)

      // The UPDATE_MATTER_ACCESSORY_STATE listener must be the real handler, not a
      // drop stub — so the external accessory's state actually gets updated.
      ;(m as any)._onUpdateMatterAccessoryState('ext-uuid', 'OnOff', { on: true })
      await Promise.resolve()

      expect(extServer.updateAccessoryState).toHaveBeenCalledWith('ext-uuid', 'OnOff', { on: true }, undefined)
    })

    it('externalsOnly mode: routes platform-accessory updates to external servers (not dropped)', async () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      await m.initialize()

      const extServer = { updatePlatformAccessories: vi.fn().mockResolvedValue(undefined) }
      ;(m as any).externalMatterServers.set('ext-uuid', extServer)

      ;(m as any)._onUpdateMatterPlatformAccessories([{ UUID: 'ext-uuid', displayName: 'Vac' }])
      await Promise.resolve()

      expect(extServer.updatePlatformAccessories).toHaveBeenCalledWith([{ UUID: 'ext-uuid', displayName: 'Vac' }])
    })

    it('hasActiveMatter() is true in externalsOnly mode even though the bridge server never starts', async () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      await m.initialize()

      expect(m.isMatterEnabled()).toBe(false) // no bridge server
      expect(m.hasActiveMatter()).toBe(true) // but external accessories can still be served
    })

    it('hasActiveMatter() is false when matter is fully disabled', () => {
      const m = createManager({ enabled: false } as MatterConfig)
      expect(m.hasActiveMatter()).toBe(false)
    })
  })

  describe('_onUpdateMatterAccessoryState — sentinel routing error is debug, not error (#3944)', () => {
    function createManager(matter: MatterConfig | undefined) {
      const cfg = { ...mockBridgeConfig, matter } as BridgeConfiguration
      return new ChildBridgeMatterManager(cfg, mockBridgeOptions, mockApi, mockExternalPortService, mockPluginManager)
    }

    it('logs at debug (not error) when the accessory is not on this child bridge', async () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      await m.initialize()

      const logging = Logger.withPrefix('Matter/ChildManager')
      const debugSpy = vi.spyOn(logging, 'debug')
      const errorSpy = vi.spyOn(logging, 'error')

      ;(m as any)._onUpdateMatterAccessoryState('not-on-this-bridge', 'OnOff', { on: true })
      await new Promise(resolve => setTimeout(resolve, 0))

      const sawSentinelDebug = debugSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('not on this bridge'))
      expect(sawSentinelDebug).toBe(true)
      const sawError = errorSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('Failed to update Matter accessory state'))
      expect(sawError).toBe(false)

      debugSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it('still logs at error for an unexpected (non-sentinel) failure', async () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      await m.initialize()
      vi.spyOn(m as any, 'handleUpdateAccessoryState').mockRejectedValue(new Error('boom'))

      const logging = Logger.withPrefix('Matter/ChildManager')
      const errorSpy = vi.spyOn(logging, 'error')

      ;(m as any)._onUpdateMatterAccessoryState('uuid-x', 'OnOff', { on: true })
      await new Promise(resolve => setTimeout(resolve, 0))

      const sawError = errorSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('Failed to update Matter accessory state'))
      expect(sawError).toBe(true)

      errorSpy.mockRestore()
    })

    it('handleUpdateAccessoryState throws the sentinel when the bridge does not own the uuid', async () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      await m.initialize()
      await expect((m as any).handleUpdateAccessoryState('nope', 'OnOff', { on: true }))
        .rejects
        .toBeInstanceOf(MatterAccessoryNotOnBridgeError)
    })
  })

  describe('teardown — listener removal', () => {
    it('removes both external + bridged + drop-stub listeners safely (no-op when never attached)', async () => {
      mockApi.removeListener = vi.fn() as any
      const m = new ChildBridgeMatterManager(
        mockBridgeConfig,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )

      await m.teardown()

      const removed = vi.mocked(mockApi.removeListener as any).mock.calls.map((c: any) => c[0])
      // Both normal listeners and drop stubs are removed defensively.
      expect(removed).toContain(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE)
      // REGISTER and UPDATE etc. appear at least twice — once for the normal listener, once for the drop stub.
      const registerRemovals = removed.filter((e: any) => e === InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(registerRemovals.length).toBe(2)
    })
  })
})
