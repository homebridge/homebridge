import type { HomebridgeAPI } from '../api.js'
import type { BridgeConfiguration, BridgeOptions } from '../bridgeService.js'
import type { ChildBridgeExternalPortService } from '../externalPortService.js'
import type { MatterConfig } from './types.js'

import { AddressInUseError } from '@matter/main'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      requestMatterPort: vi.fn(),
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

      const fabrics = [
        {
          fabricIndex: 1,
          fabricId: '1',
          nodeId: '10',
          rootVendorId: 0x1349,
          label: 'My Home',
        },
        {
          fabricIndex: 2,
          fabricId: '2',
          nodeId: '11',
          rootVendorId: 0x1384,
          label: '',
        },
      ]

      const mockMatterServer = {
        getCommissioningInfo: vi.fn().mockReturnValue({
          qrCode: 'MT:Y.K9000ABC1234567890',
          manualPairingCode: '12345678900',
          serialNumber: '0EDC5DBED675',
          commissioned: true,
        }),
        getCommissioningSnapshot: vi.fn().mockReturnValue({ commissioned: true, fabricCount: 2, fabrics }),
        getAccessories: vi.fn().mockReturnValue([
          { UUID: 'test' },
        ]),
      } as any

      ;(manager as any).matterServer = mockMatterServer
      ;(manager as any).matterSerialNumber = '0EDC5DBED675'

      const statusInfo = manager.getMatterStatusInfo()
      expect(statusInfo).toBeDefined()
      expect(statusInfo?.serialNumber).toBe('0EDC5DBED675')
      expect(statusInfo?.commissioned).toBe(true)
      expect(statusInfo?.deviceCount).toBe(1)
      expect(statusInfo?.fabricCount).toBe(2)
      expect(statusInfo?.fabrics).toEqual(fabrics)
    })

    it('takes commissioned from the fabric snapshot, not the lagging serverNode flag', () => {
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

      // After a controller-side removal of the last fabric, the serverNode's
      // commissioning flag (surfaced via getCommissioningInfo) can stay true
      // until restart, while the fabric list is already empty. The status
      // payload must follow the fabric list (#3974).
      const mockMatterServer = {
        getCommissioningInfo: vi.fn().mockReturnValue({
          qrCode: 'MT:Y.K9000ABC1234567890',
          manualPairingCode: '12345678900',
          serialNumber: '0EDC5DBED675',
          commissioned: true,
        }),
        getCommissioningSnapshot: vi.fn().mockReturnValue({ commissioned: false, fabricCount: 0, fabrics: [] }),
        getAccessories: vi.fn().mockReturnValue([]),
      } as any

      ;(manager as any).matterServer = mockMatterServer

      const statusInfo = manager.getMatterStatusInfo()
      expect(statusInfo?.commissioned).toBe(false)
      expect(statusInfo?.fabricCount).toBe(0)
      expect(statusInfo?.fabrics).toEqual([])
    })
  })

  // A server as the manager sees it: its own accessory object has the identity
  // and state only; plugin, platform and context are in the accessory cache,
  // and the commissioning state in the fabric snapshot.
  function makeAccessoryServer(uuid: string, overrides: Record<string, unknown> = {}): any {
    const data = {
      uuid,
      displayName: `Light ${uuid}`,
      deviceType: 'OnOffLight',
      manufacturer: 'M',
      model: 'X',
      serialNumber: 'S',
      clusters: {},
      parts: [],
    }
    return {
      username: 'EE:00:00:00:00:01',
      bridgeName: 'Vacuum',
      collectAccessories: vi.fn((username: string, type: string, name: string) => [
        {
          ...data,
          bridge: { username, type, name },
        },
      ]),
      getAccessoryInfo: vi.fn((id: string) => (id === uuid
        ? data
        : undefined)),
      getCachedAccessory: vi.fn(() => ({
        plugin: 'homebridge-test',
        platform: 'TestPlatform',
        context: { room: 'hall' },
      })),
      getCommissioningSnapshot: vi.fn(() => ({
        commissioned: true,
        fabricCount: 1,
        fabrics: [
          {
            fabricIndex: 1,
            fabricId: '1',
            nodeId: '10',
            rootVendorId: 0x1349,
            label: 'My Home',
          },
        ],
      })),
      ...overrides,
    }
  }

  // What the main bridge sends for every accessory, and a child bridge left out.
  const mainBridgeFields = {
    plugin: 'homebridge-test',
    platform: 'TestPlatform',
    context: { room: 'hall' },
    commissioned: true,
    fabricCount: 1,
    fabrics: [
      {
        fabricIndex: 1,
        fabricId: '1',
        nodeId: '10',
        vendorId: 0x1349,
        label: 'My Home',
      },
    ],
  }

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

    it('sends the same fields as the main bridge for each accessory', () => {
      manager = new ChildBridgeMatterManager(
        {
          ...mockBridgeConfig,
          matter: { port: 5540 } as MatterConfig,
        },
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )
      const bridgeServer = makeAccessoryServer('acc-1')
      const externalServer = makeAccessoryServer('ext-1')
      ;(manager as any).matterServer = bridgeServer
      ;(manager as any).externalMatterServers.set('ext-1', externalServer)

      const accessories = manager.collectAllAccessories()

      expect(bridgeServer.collectAccessories).toHaveBeenCalledWith(mockBridgeConfig.username, 'child', mockBridgeConfig.name)
      expect(accessories).toHaveLength(2)
      expect(accessories[0]).toMatchObject({
        uuid: 'acc-1',
        displayName: 'Light acc-1',
        bridge: { username: mockBridgeConfig.username, type: 'child', name: mockBridgeConfig.name },
        ...mainBridgeFields,
      })
      expect(accessories[1]).toMatchObject({
        uuid: 'ext-1',
        bridge: { username: 'EE:00:00:00:00:01', type: 'external', name: 'Vacuum' },
        ...mainBridgeFields,
      })
      // the commissioning state is read once per server, not once per accessory
      expect(bridgeServer.getCommissioningSnapshot).toHaveBeenCalledTimes(1)
    })

    it('still lists an accessory that is not in the cache', () => {
      manager = new ChildBridgeMatterManager(
        {
          ...mockBridgeConfig,
          matter: { port: 5540 } as MatterConfig,
        },
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )
      ;(manager as any).matterServer = makeAccessoryServer('acc-1', {
        getCachedAccessory: vi.fn(() => undefined),
      })

      expect(manager.collectAllAccessories()[0]).toMatchObject({ uuid: 'acc-1', plugin: '', platform: '' })
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

    it('sends the same fields as the main bridge, the bridge included', () => {
      manager = new ChildBridgeMatterManager(
        {
          ...mockBridgeConfig,
          matter: { port: 5540 } as MatterConfig,
        },
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )
      const bridgeServer = makeAccessoryServer('acc-1')
      ;(manager as any).matterServer = bridgeServer
      ;(manager as any).externalMatterServers.set('ext-1', makeAccessoryServer('ext-1'))

      expect(manager.getAccessoryInfo('acc-1')).toMatchObject({
        uuid: 'acc-1',
        displayName: 'Light acc-1',
        bridge: { username: mockBridgeConfig.username, type: 'child', name: mockBridgeConfig.name },
        ...mainBridgeFields,
      })
      expect(bridgeServer.getAccessoryInfo).toHaveBeenCalledWith('acc-1')
      expect(manager.getAccessoryInfo('ext-1')).toMatchObject({
        uuid: 'ext-1',
        bridge: { username: 'EE:00:00:00:00:01', type: 'external', name: 'Vacuum' },
        ...mainBridgeFields,
      })
      expect(manager.getAccessoryInfo('nobody')).toBeUndefined()
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

    it('allocates a Matter port via requestMatterPort (not the HAP requestPort) when none is configured', async () => {
      vi.mocked(mockExternalPortService.requestMatterPort).mockResolvedValue(5530)
      const m = createManager({} as MatterConfig)
      // Stub the actual server startup — we only care about port allocation here.
      vi.spyOn(m as any, 'startMatterServer').mockResolvedValue(undefined)

      await m.initialize()

      expect(mockExternalPortService.requestMatterPort).toHaveBeenCalledTimes(1)
      expect(mockExternalPortService.requestPort).not.toHaveBeenCalled()
      // The allocated port is written back onto the config for the server start.
      expect((m as any).matterConfig.port).toBe(5530)
    })

    it('keeps the child bridge running when no Matter port can be allocated, and records why', async () => {
      vi.mocked(mockExternalPortService.requestMatterPort).mockResolvedValue(undefined)
      const m = createManager({} as MatterConfig)
      vi.spyOn(m as any, 'startMatterServer').mockResolvedValue(undefined)

      // Before this the error ended the child process, HAP included.
      await expect(m.initialize()).resolves.toBeUndefined()

      expect(m.getBridgeStartFailure()).toContain('Failed to allocate Matter port')
      expect(m.getMatterStatusInfo()).toEqual({
        commissioned: false,
        deviceCount: 0,
        fabricCount: 0,
        fabrics: [],
        startFailed: true,
      })
    })

    it('keeps the child bridge running when the Matter server fails to start', async () => {
      const m = createManager({ port: 5540 } as MatterConfig)
      const failedServer = {
        stop: vi.fn().mockResolvedValue(undefined),
      }
      vi.spyOn(m as any, 'startMatterServer').mockImplementation(async () => {
        ;(m as any).matterServer = failedServer
        throw Object.assign(new Error('listen EADDRINUSE: address already in use :::5540'), { code: 'EADDRINUSE' })
      })
      const errorSpy = vi.spyOn(Logger.withPrefix('Matter/ChildManager'), 'error')

      await expect(m.initialize()).resolves.toBeUndefined()

      // The server that never ran is stopped and dropped, and the reason kept:
      // a plugin registering a Matter accessory is told why it can not.
      expect(failedServer.stop).toHaveBeenCalledTimes(1)
      expect((m as any).matterServer).toBeUndefined()
      expect(m.isMatterEnabled()).toBe(false)
      expect(m.getBridgeStartFailure()).toContain('EADDRINUSE')
      expect(m.isBridgeServerStarting()).toBe(false)
      // Still "active": external accessories have a server of their own.
      expect(m.hasActiveMatter()).toBe(true)
      const attached = vi.mocked(mockApi.on).mock.calls.map(c => c[0])
      expect(attached).toContain(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES)
      expect(attached).toContain(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE)
      // The status sent to the parent says the start failed.
      expect(m.getMatterStatusInfo()?.startFailed).toBe(true)
      expect(errorSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('Matter port 5540 is already in use'))).toBe(true)
      expect(mockApi._setMatterEnabled).not.toHaveBeenCalled()

      errorSpy.mockRestore()
    })

    it('externalsOnly mode: attaches external listeners + bridged drop stubs, does NOT start the bridge server', async () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      await m.initialize()

      // No bridge server started.
      expect((m as any).matterServer).toBeUndefined()
      expect(mockExternalPortService.requestPort).not.toHaveBeenCalled()
      expect(mockExternalPortService.requestMatterPort).not.toHaveBeenCalled()

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

    it.each([
      [
        '_onRegisterMatterPlatformAccessories',
        'handleRegisterPlatformAccessories',
        [
          'homebridge-test',
          'TestPlatform',
          [
            { displayName: 'x' },
          ],
        ],
      ],
      [
        '_onUnregisterMatterPlatformAccessories',
        'handleUnregisterPlatformAccessories',
        [
          'homebridge-test',
          'TestPlatform',
          [
            { displayName: 'x' },
          ],
        ],
      ],
      [
        '_onUnregisterExternalMatterAccessories',
        'handleUnregisterExternalAccessories',
        [
          [
            { displayName: 'x' },
          ],
        ],
      ],
    ] as const)('%s reports its work so the plugin call can wait for it (#4033)', async (listener, handler, args) => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      let finish!: () => void
      vi.spyOn(m as any, handler).mockReturnValue(new Promise<void>((resolve) => {
        finish = resolve
      }))
      const track = vi.fn()

      ;(m as any)[listener](...args, track)

      expect(track).toHaveBeenCalledOnce()
      let settled = false
      void track.mock.calls[0][0].then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)
      finish()
      await track.mock.calls[0][0]
      expect(settled).toBe(true)
    })

    it('externalsOnly mode: bridged drop stub logs at debug level (does not call base handler)', () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      const handleRegisterSpy = vi.spyOn(m as any, 'handleRegisterPlatformAccessories')

      // Directly invoke the drop stub (would normally be wired up by setupBridgedDropStubs).
      ;(m as any)._onRegisterMatterPlatformAccessoriesDropped('homebridge-test', 'TestPlatform', [
        { displayName: 'x' },
      ])

      // The base handler must NOT be called — drop stub logs only.
      expect(handleRegisterSpy).not.toHaveBeenCalled()
    })

    it('externalsOnly mode: external publish listener is fully wired (not a drop stub)', () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      const handlePublishSpy = vi.spyOn(m as any, 'handlePublishExternalAccessories').mockResolvedValue(undefined)

      // Invoke the external publish handler directly.
      ;(m as any)._onPublishExternalMatterAccessories([
        { displayName: 'x' },
      ], 'reg-1')

      expect(handlePublishSpy).toHaveBeenCalledWith([
        { displayName: 'x' },
      ], 'reg-1')
    })

    it('externalsOnly mode: routes accessory state updates to external servers (not dropped)', async () => {
      const m = createManager({ enabled: false, externalsOnly: true } as MatterConfig)
      await m.initialize()

      // A published external accessory in externalsOnly mode.
      const extServer = {
        updateAccessoryState: vi.fn().mockResolvedValue(undefined),
      }
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

      const extServer = {
        updatePlatformAccessories: vi.fn().mockResolvedValue(undefined),
      }
      ;(m as any).externalMatterServers.set('ext-uuid', extServer)

      ;(m as any)._onUpdateMatterPlatformAccessories([
        { UUID: 'ext-uuid', displayName: 'Vac' },
      ])
      await Promise.resolve()

      expect(extServer.updatePlatformAccessories).toHaveBeenCalledWith([
        { UUID: 'ext-uuid', displayName: 'Vac' },
      ])
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

  describe('runServerWhenSettled (deferred online)', () => {
    const SETTLE_MS = 2000
    const CAP_MS = 45000

    function makeManager(): ChildBridgeMatterManager {
      return new ChildBridgeMatterManager(
        {
          ...mockBridgeConfig,
          matter: { enabled: true },
        } as any,
        mockBridgeOptions,
        mockApi,
        mockExternalPortService,
        mockPluginManager,
      )
    }

    function makeServer(overrides: Partial<{ inFlight: number, lastRegistrationAt: number }> = {}): any {
      return {
        getRegistrationsInFlight: vi.fn(() => overrides.inFlight ?? 0),
        getLastRegistrationAt: vi.fn(() => overrides.lastRegistrationAt ?? 0),
        runServer: vi.fn().mockResolvedValue(undefined),
      }
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('brings the node online once registrations settle', async () => {
      const manager = makeManager()
      const server = makeServer({
        lastRegistrationAt: Date.now(),
      })
      ;(manager as any).matterServer = server
      ;(manager as any).runServerWhenSettled(server)

      // Still within the settle window after the last registration.
      await vi.advanceTimersByTimeAsync(SETTLE_MS - 100)
      expect(server.runServer).not.toHaveBeenCalled()

      // Past the settle window -> online.
      await vi.advanceTimersByTimeAsync(600)
      expect(server.runServer).toHaveBeenCalledTimes(1)
    })

    it('reports a failed start when the port is in use as the node goes online', async () => {
      const manager = makeManager()
      const server = {
        ...makeServer(),
        // what matter.js throws for a port another program holds
        runServer: vi.fn().mockRejectedValue(new AddressInUseError('Cannot bind {::}:5677 because port is already in use')),
        stop: vi.fn().mockResolvedValue(undefined),
      }
      const statusChanged = vi.fn()
      ;(manager as any).onStatusChanged = statusChanged
      ;(manager as any).matterConfig = { port: 5677 }
      ;(manager as any).matterServer = server
      const errorSpy = vi.spyOn(Logger.withPrefix('Matter/ChildManager'), 'error').mockImplementation(() => {})
      ;(manager as any).runServerWhenSettled(server)

      await vi.advanceTimersByTimeAsync(SETTLE_MS + 600)

      expect(manager.getBridgeStartFailure()).toContain('port is already in use')
      expect(manager.getMatterStatusInfo()?.startFailed).toBe(true)
      expect((manager as any).matterServer).toBeUndefined()
      expect(server.stop).toHaveBeenCalledTimes(1)
      expect(statusChanged).toHaveBeenCalledTimes(1)
      expect(mockApi._setMatterServer).toHaveBeenCalledWith(null)
      expect(errorSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('Matter port 5677 is already in use'))).toBe(true)
    })

    it('goes online promptly when no registrations ever arrive', async () => {
      const manager = makeManager()
      const server = makeServer({ lastRegistrationAt: 0, inFlight: 0 })
      ;(manager as any).matterServer = server
      ;(manager as any).runServerWhenSettled(server)

      // Online just after the settle window, long before the 45s cap - if it
      // waited for the cap it would not have fired at 2.6s.
      await vi.advanceTimersByTimeAsync(SETTLE_MS + 600)
      expect(server.runServer).toHaveBeenCalledTimes(1)
    })

    it('does not go online while a registration is still in flight', async () => {
      const manager = makeManager()
      const server = makeServer({
        inFlight: 1,
        lastRegistrationAt: Date.now(),
      })
      ;(manager as any).matterServer = server
      ;(manager as any).runServerWhenSettled(server)

      await vi.advanceTimersByTimeAsync(SETTLE_MS + 2000)
      expect(server.runServer).not.toHaveBeenCalled()

      // Once in flight drains and the window passes, it comes online.
      server.getRegistrationsInFlight.mockReturnValue(0)
      server.getLastRegistrationAt.mockReturnValue(Date.now())
      await vi.advanceTimersByTimeAsync(SETTLE_MS + 600)
      expect(server.runServer).toHaveBeenCalledTimes(1)
    })

    it('stops polling when the manager is torn down mid-wait', async () => {
      mockApi.removeListener = vi.fn() as any
      const manager = makeManager()
      const server = makeServer({ inFlight: 1 })
      server.removeListener = vi.fn()
      server.stop = vi.fn().mockResolvedValue(undefined)
      ;(manager as any).matterServer = server
      ;(manager as any).runServerWhenSettled(server)

      // A quick restart: the signal arrives while the node is still offline.
      await manager.teardown()
      expect(server.stop).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)

      await vi.advanceTimersByTimeAsync(SETTLE_MS + CAP_MS)
      expect(server.runServer).not.toHaveBeenCalled()
      expect(manager.isMatterEnabled()).toBe(false)
    })

    it('stops polling if the server is replaced mid-wait', async () => {
      const manager = makeManager()
      const server = makeServer()
      ;(manager as any).matterServer = server
      ;(manager as any).runServerWhenSettled(server)

      ;(manager as any).matterServer = makeServer()
      await vi.advanceTimersByTimeAsync(SETTLE_MS + CAP_MS)
      expect(server.runServer).not.toHaveBeenCalled()
    })

    it('goes online at the cap if registrations never drain', async () => {
      const manager = makeManager()
      const server = makeServer({
        inFlight: 1,
        lastRegistrationAt: Date.now(),
      })
      ;(manager as any).matterServer = server
      ;(manager as any).runServerWhenSettled(server)

      // Never settles (in flight stuck), so it only comes online at the cap.
      await vi.advanceTimersByTimeAsync(CAP_MS - 1000)
      expect(server.runServer).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1600)
      expect(server.runServer).toHaveBeenCalledTimes(1)
    })
  })
})
