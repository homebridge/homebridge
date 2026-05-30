import type { HomebridgeAPI } from '../api.js'
import type { HomebridgeConfig } from '../bridgeService.js'
import type { ExternalPortService } from '../externalPortService.js'
import type { PluginManager } from '../pluginManager.js'
import type { HomebridgeOptions } from '../server.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InternalAPIEvent } from '../api.js'
import { Logger } from '../logger.js'
import { MatterBridgeManager } from './MatterBridgeManager.js'
import { MatterAccessoryNotOnBridgeError } from './MatterError.js'

describe('matterBridgeManager', () => {
  let mockConfig: HomebridgeConfig
  let mockApi: HomebridgeAPI
  let mockExternalPortService: ExternalPortService
  let mockPluginManager: PluginManager
  let mockOptions: HomebridgeOptions
  let mockServer: { registerExternalMatterBridge: any, ipcService: any }

  beforeEach(() => {
    mockConfig = {
      bridge: {
        name: 'Test Bridge',
        username: 'CC:22:3D:E3:CE:30',
        pin: '031-45-154',
      },
      platforms: [],
      accessories: [],
    } as HomebridgeConfig

    mockApi = {
      on: vi.fn(),
      removeListener: vi.fn(),
      _setMatterEnabled: vi.fn(),
      _setMatterServer: vi.fn(),
      _resolveExternalRegistration: vi.fn(),
    } as any

    mockExternalPortService = {
      requestPort: vi.fn(),
      releaseMatterPort: vi.fn(),
    } as any

    mockPluginManager = {
      getPlugin: vi.fn(),
      getPluginByActiveDynamicPlatform: vi.fn(),
    } as any

    mockOptions = { debugModeEnabled: false } as HomebridgeOptions

    mockServer = {
      registerExternalMatterBridge: vi.fn(),
      ipcService: { sendMessage: vi.fn() },
    }
  })

  function buildManager(matterCfg?: any): MatterBridgeManager {
    const cfg = matterCfg !== undefined
      ? { ...mockConfig, bridge: { ...mockConfig.bridge, matter: matterCfg } }
      : mockConfig
    return new MatterBridgeManager(
      cfg,
      mockApi,
      mockExternalPortService,
      mockPluginManager,
      mockOptions,
      mockServer,
    )
  }

  describe('constructor', () => {
    it('does NOT attach API listeners during construction (deferred to initialize)', () => {
      buildManager({ enabled: true })
      // Before initialize(), no listeners are wired up. This avoids spurious
      // warn-level logs from the existing handlers in modes where the server
      // is not running (externalsOnly or disabled).
      expect(mockApi.on).not.toHaveBeenCalled()
    })
  })

  describe('initialize — three-state (disabled, externalsOnly, normal)', () => {
    it('returns early when matter is not configured', async () => {
      const m = buildManager(undefined)
      await m.initialize()
      expect(mockApi.on).not.toHaveBeenCalled()
    })

    it('returns early when matter is fully disabled (enabled: false, no externalsOnly)', async () => {
      const m = buildManager({ enabled: false })
      await m.initialize()
      expect(mockApi.on).not.toHaveBeenCalled()
      expect(mockExternalPortService.requestPort).not.toHaveBeenCalled()
    })

    it('externalsOnly mode: attaches external + drop-stub listeners, does NOT start the bridge server', async () => {
      const m = buildManager({ enabled: false, externalsOnly: true })
      await m.initialize()

      // No matter server created.
      expect(mockExternalPortService.requestPort).not.toHaveBeenCalled()
      expect(mockApi._setMatterServer).not.toHaveBeenCalled()

      // External-side listeners attached.
      const attached = vi.mocked(mockApi.on).mock.calls.map((c: any) => c[0])
      expect(attached).toContain(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES)
      expect(attached).toContain(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES)

      // Bridged drop-stub listeners attached.
      expect(attached).toContain(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(attached).toContain(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES)
      expect(attached).toContain(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(attached).toContain(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE)

      // externalsOnlyMode flag set.
      expect((m as any).externalsOnlyMode).toBe(true)
    })

    it('externalsOnly mode: bridged drop stub logs at debug level (does not call base handler)', () => {
      const m = buildManager({ enabled: false, externalsOnly: true })
      const handleRegisterSpy = vi.spyOn(m as any, 'handleRegisterPlatformAccessories')

      // Directly invoke the drop stub — the base handler must NOT be called.
      ;(m as any)._onRegisterMatterPlatformAccessoriesDropped('homebridge-test', 'TestPlatform', [{ displayName: 'x' }])

      expect(handleRegisterSpy).not.toHaveBeenCalled()
    })

    it('externalsOnly mode: external publish handler delegates to handlePublishExternalAccessories', () => {
      const m = buildManager({ enabled: false, externalsOnly: true })
      const handlePublishSpy = vi.spyOn(m as any, 'handlePublishExternalAccessories').mockResolvedValue(undefined)

      ;(m as any)._onPublishExternalMatterAccessories([{ displayName: 'x' }], 'reg-1')

      expect(handlePublishSpy).toHaveBeenCalledWith([{ displayName: 'x' }], 'reg-1')
    })
  })

  describe('hasActiveMatter — drives the MatterAPIImpl guard (#3944)', () => {
    it('is false when matter is disabled/absent (no listeners attached)', async () => {
      // This is the case the API guard relies on: api.matter may be exposed on
      // the main bridge because a child bridge uses Matter, but the main manager
      // attached no listeners — so register/update/publish must be rejected.
      const m = buildManager(undefined)
      await m.initialize()
      expect(m.hasActiveMatter()).toBe(false)

      const disabled = buildManager({ enabled: false })
      await disabled.initialize()
      expect(disabled.hasActiveMatter()).toBe(false)
    })

    it('is true in externalsOnly mode (external listeners attached)', async () => {
      const m = buildManager({ enabled: false, externalsOnly: true })
      await m.initialize()
      expect(m.hasActiveMatter()).toBe(true)
    })

    it('is true once a bridge MatterServer exists (normal mode listeners attached)', () => {
      // Normal-mode startup pulls in matter.js; emulate the post-setup state by
      // setting the server reference the way initialize() does on success.
      const m = buildManager({})
      ;(m as any).matterServer = {} // a created server ⇒ listeners were attached
      expect(m.hasActiveMatter()).toBe(true)
    })
  })

  describe('_onUpdateMatterAccessoryState — sentinel routing error is debug, not error (#3944)', () => {
    it('logs at debug (not error) when the accessory is not on this bridge', async () => {
      // In externalsOnly mode the real update handler is attached but no bridge
      // node ran, so a state update for a non-external accessory throws the
      // routing sentinel. That is an expected "wrong target", not a failure —
      // it must not surface as a red error line.
      const m = buildManager({ enabled: false, externalsOnly: true })
      await m.initialize()

      // No matterServer + uuid not external ⇒ handleUpdateAccessoryState throws
      // MatterAccessoryNotOnBridgeError.
      const logging = Logger.withPrefix('Matter/MainManager')
      const debugSpy = vi.spyOn(logging, 'debug')
      const errorSpy = vi.spyOn(logging, 'error')

      ;(m as any)._onUpdateMatterAccessoryState('not-on-this-bridge', 'OnOff', { on: true })
      // Let the fire-and-forget .catch settle.
      await new Promise(resolve => setTimeout(resolve, 0))

      const sawSentinelDebug = debugSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('not on this bridge'))
      expect(sawSentinelDebug).toBe(true)
      const sawError = errorSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('Failed to update Matter accessory state'))
      expect(sawError).toBe(false)

      debugSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it('still logs at error for an unexpected (non-sentinel) failure', async () => {
      const m = buildManager({ enabled: false, externalsOnly: true })
      await m.initialize()

      // Force a non-sentinel rejection from the handler.
      vi.spyOn(m as any, 'handleUpdateAccessoryState').mockRejectedValue(new Error('boom'))

      const logging = Logger.withPrefix('Matter/MainManager')
      const errorSpy = vi.spyOn(logging, 'error')

      ;(m as any)._onUpdateMatterAccessoryState('uuid-x', 'OnOff', { on: true })
      await new Promise(resolve => setTimeout(resolve, 0))

      const sawError = errorSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('Failed to update Matter accessory state'))
      expect(sawError).toBe(true)

      errorSpy.mockRestore()
    })

    it('handleUpdateAccessoryState throws the sentinel when the bridge does not own the uuid', async () => {
      const m = buildManager({ enabled: false, externalsOnly: true })
      await m.initialize()
      await expect((m as any).handleUpdateAccessoryState('nope', 'OnOff', { on: true }))
        .rejects
        .toBeInstanceOf(MatterAccessoryNotOnBridgeError)
    })
  })

  describe('getMatterStatus — externalsOnly surfaced to IPC', () => {
    it('surfaces externalsOnly: true when in externalsOnly mode and server not started', async () => {
      const m = buildManager({ enabled: false, externalsOnly: true })
      await m.initialize()

      const status = m.getMatterStatus()

      expect(status.enabled).toBe(false)
      expect(status.externalsOnly).toBe(true)
    })

    it('surfaces externalsOnly: false when matter is just disabled in place (no externalsOnly)', async () => {
      const m = buildManager({ enabled: false })
      await m.initialize()

      const status = m.getMatterStatus()

      expect(status.enabled).toBe(false)
      expect(status.externalsOnly).toBe(false)
    })

    it('omits externalsOnly entirely when matter is not configured', async () => {
      const m = buildManager(undefined)
      await m.initialize()

      const status = m.getMatterStatus()

      expect(status.enabled).toBe(false)
      expect(status.externalsOnly).toBeUndefined()
    })
  })

  describe('teardown — listener removal', () => {
    it('removes both external + bridged + drop-stub listeners safely', async () => {
      const m = buildManager()
      await m.teardown()

      const removed = vi.mocked(mockApi.removeListener as any).mock.calls.map((c: any) => c[0])
      expect(removed).toContain(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(removed).toContain(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE)

      // REGISTER appears twice — once for the normal handler, once for the drop stub.
      const registerRemovals = removed.filter((e: any) => e === InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES)
      expect(registerRemovals.length).toBe(2)
    })
  })
})
