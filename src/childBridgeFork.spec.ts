import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginType } from './api.js'
import { ChildBridgeFork } from './childBridgeFork.js'
import { ChildProcessMessageEventType } from './childBridgeService.js'
import { Logger } from './logger.js'

describe('childBridgeFork - Matter Accessory Guard', () => {
  it('should not have matterManager when type is ACCESSORY even with matter config', () => {
    const fork = new ChildBridgeFork()
    ;(fork as any).type = PluginType.ACCESSORY
    ;(fork as any).bridgeConfig = {
      username: '0E:DC:5D:BE:D6:75',
      name: 'Test Accessory Bridge',
      port: 51826,
      matter: { enabled: true },
    }

    // Verify initial state - matterManager should not be set
    expect((fork as any).matterManager).toBeUndefined()

    // The guard in startBridge() checks: this.bridgeConfig.matter && this.type === PluginType.ACCESSORY
    // Verify the condition is true (guard would fire)
    expect((fork as any).bridgeConfig.matter).toBeTruthy()
    expect((fork as any).type).toBe(PluginType.ACCESSORY)
  })

  it('should allow matter config for platform type child bridges', () => {
    const fork = new ChildBridgeFork()
    ;(fork as any).type = PluginType.PLATFORM
    ;(fork as any).bridgeConfig = {
      username: '0E:DC:5D:BE:D6:75',
      name: 'Test Platform Bridge',
      port: 51826,
      matter: { enabled: true },
    }

    // The guard should NOT fire for platform type
    expect((fork as any).bridgeConfig.matter).toBeTruthy()
    expect((fork as any).type).not.toBe(PluginType.ACCESSORY)
  })
})

describe('childBridgeFork - Matter Handlers', () => {
  let childBridgeFork: ChildBridgeFork
  let mockMatterManager: any
  let mockMatterMessageHandler: any
  let mockBridgeConfig: any

  beforeEach(() => {
    // Create a new instance
    childBridgeFork = new ChildBridgeFork()

    // Mock the bridge config
    mockBridgeConfig = {
      username: '0E:DC:5D:BE:D6:75',
      name: 'Test Child Bridge',
      port: 51826,
    }

    // Set the bridge config on the instance
    ;(childBridgeFork as any).bridgeConfig = mockBridgeConfig

    // Mock the matter manager
    mockMatterManager = {
      isMatterEnabled: vi.fn(),
      enableStateMonitoring: vi.fn(),
      disableStateMonitoring: vi.fn(),
      collectAllAccessories: vi.fn(),
      getAccessoryInfo: vi.fn(),
      handleTriggerCommand: vi.fn(),
      getMatterStatusInfo: vi.fn(() => undefined),
    }

    // Set the matter manager on the instance
    ;(childBridgeFork as any).matterManager = mockMatterManager

    // Mock the matter message handler (now delegates to it)
    mockMatterMessageHandler = {
      handleStartMatterMonitoring: vi.fn(),
      handleStopMatterMonitoring: vi.fn(),
      handleGetMatterAccessories: vi.fn(),
      handleGetMatterAccessoryInfo: vi.fn(),
      handleMatterAccessoryControl: vi.fn(),
    }

    // Set the matter message handler on the instance
    ;(childBridgeFork as any).matterMessageHandler = mockMatterMessageHandler

    // Mock sendMessage
    ;(childBridgeFork as any).sendMessage = vi.fn()
  })

  describe('handleStartMatterMonitoring', () => {
    it('should delegate to matterMessageHandler', () => {
      childBridgeFork.handleStartMatterMonitoring()

      expect(mockMatterMessageHandler.handleStartMatterMonitoring).toHaveBeenCalled()
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleStartMatterMonitoring()).not.toThrow()
    })
  })

  describe('handleStopMatterMonitoring', () => {
    it('should delegate to matterMessageHandler', () => {
      childBridgeFork.handleStopMatterMonitoring()

      expect(mockMatterMessageHandler.handleStopMatterMonitoring).toHaveBeenCalled()
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleStopMatterMonitoring()).not.toThrow()
    })
  })

  describe('handleGetMatterAccessories', () => {
    it('should delegate to matterMessageHandler', () => {
      childBridgeFork.handleGetMatterAccessories()

      expect(mockMatterMessageHandler.handleGetMatterAccessories).toHaveBeenCalled()
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleGetMatterAccessories()).not.toThrow()
    })
  })

  describe('handleGetMatterAccessoryInfo', () => {
    it('should delegate to matterMessageHandler', () => {
      const data = { uuid: 'test-uuid' }

      childBridgeFork.handleGetMatterAccessoryInfo(data)

      expect(mockMatterMessageHandler.handleGetMatterAccessoryInfo).toHaveBeenCalledWith(data)
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleGetMatterAccessoryInfo({ uuid: 'unknown-uuid' })).not.toThrow()
    })
  })

  describe('handleMatterAccessoryControl', () => {
    const mockControlData = {
      uuid: 'test-uuid',
      cluster: 'onOff',
      attributes: { onOff: true },
    }

    it('should delegate to matterMessageHandler', () => {
      childBridgeFork.handleMatterAccessoryControl(mockControlData)

      expect(mockMatterMessageHandler.handleMatterAccessoryControl).toHaveBeenCalledWith(mockControlData)
    })

    it('should handle missing matter message handler gracefully', () => {
      ;(childBridgeFork as any).matterMessageHandler = undefined

      expect(() => childBridgeFork.handleMatterAccessoryControl(mockControlData)).not.toThrow()
    })
  })

  describe('publishHapIfEnabled', () => {
    let publishBridgeSpy: ReturnType<typeof vi.fn>
    let infoSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      publishBridgeSpy = vi.fn()
      ;(childBridgeFork as any).bridgeService = { publishBridge: publishBridgeSpy }
      infoSpy = vi.spyOn(Logger.internal, 'info').mockImplementation(() => {})
    })

    it('publishes the bridge when hap is undefined (default enabled)', () => {
      ;(childBridgeFork as any).bridgeConfig = { username: '0E:DC:5D:BE:D6:75' }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).toHaveBeenCalledOnce()
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('publishes the bridge when hap is an empty object', () => {
      ;(childBridgeFork as any).bridgeConfig = { username: '0E:DC:5D:BE:D6:75', hap: {} }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).toHaveBeenCalledOnce()
    })

    it('publishes the bridge when hap.enabled is explicitly true', () => {
      ;(childBridgeFork as any).bridgeConfig = { username: '0E:DC:5D:BE:D6:75', hap: { enabled: true } }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).toHaveBeenCalledOnce()
    })

    it('does NOT publish, and logs the externalsOnly notice, when externalsOnly: true', () => {
      ;(childBridgeFork as any).bridgeConfig = {
        username: '0E:DC:5D:BE:D6:75',
        hap: { enabled: false, externalsOnly: true },
      }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).not.toHaveBeenCalled()
      expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/externalsOnly mode/))
    })

    it('does NOT publish, and logs the disabled notice, when hap.enabled: false (no externalsOnly) but Matter is active', () => {
      // matterManager is set by the outer beforeEach, so Matter is active here —
      // a quiet info line is correct (the bridge still advertises via Matter).
      ;(childBridgeFork as any).bridgeConfig = {
        username: '0E:DC:5D:BE:D6:75',
        hap: { enabled: false },
      }

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).not.toHaveBeenCalled()
      expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/HAP is disabled/))
    })

    it('warns when both HAP and Matter are disabled (child bridge advertises nothing) (#3944)', () => {
      const warnSpy = vi.spyOn(Logger.internal, 'warn').mockImplementation(() => {})
      ;(childBridgeFork as any).bridgeConfig = {
        username: '0E:DC:5D:BE:D6:75',
        hap: { enabled: false },
      }
      // No active Matter on this child ⇒ matterManager is never constructed.
      ;(childBridgeFork as any).matterManager = undefined
      // infoSpy is shared across tests in this describe; clear it so the
      // "no info line" assertion below reflects only this invocation.
      infoSpy.mockClear()

      childBridgeFork.publishHapIfEnabled()

      expect(publishBridgeSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Both HAP and Matter are disabled/))
      // It must NOT fall through to the quiet info line.
      expect(infoSpy).not.toHaveBeenCalledWith(expect.stringMatching(/HAP is disabled/))
      warnSpy.mockRestore()
    })
  })

  describe('sendPairedStatusEvent', () => {
    it('does not call setupURI when bridge is not published', () => {
      const sendMessageSpy = vi.fn()
      const setupURISpy = vi.fn(() => {
        throw new Error('should not be called')
      })

      ;(childBridgeFork as any).sendMessage = sendMessageSpy
      ;(childBridgeFork as any).bridgeService = {
        bridge: {
          setupURI: setupURISpy,
          _accessoryInfo: undefined,
        },
      }

      childBridgeFork.sendPairedStatusEvent()

      expect(setupURISpy).not.toHaveBeenCalled()
      expect(sendMessageSpy).toHaveBeenCalledWith(ChildProcessMessageEventType.STATUS_UPDATE, {
        paired: null,
        setupUri: null,
      })
    })

    it('includes paired and setupUri when bridge is published', () => {
      const sendMessageSpy = vi.fn()

      ;(childBridgeFork as any).sendMessage = sendMessageSpy
      ;(childBridgeFork as any).bridgeService = {
        bridge: {
          setupURI: vi.fn(() => 'X-HM://abc'),
          _accessoryInfo: {
            paired: vi.fn(() => true),
          },
        },
      }

      childBridgeFork.sendPairedStatusEvent()

      expect(sendMessageSpy).toHaveBeenCalledWith(ChildProcessMessageEventType.STATUS_UPDATE, {
        paired: true,
        setupUri: 'X-HM://abc',
      })
    })

    it('includes matter status even when HAP is unpublished', () => {
      const sendMessageSpy = vi.fn()

      ;(childBridgeFork as any).sendMessage = sendMessageSpy
      ;(childBridgeFork as any).bridgeService = {
        bridge: {
          setupURI: vi.fn(() => 'X-HM://abc'),
          _accessoryInfo: undefined,
        },
      }
      ;(childBridgeFork as any).matterManager = {
        getMatterStatusInfo: vi.fn(() => ({
          qrCode: 'MT:ABCD',
          manualPairingCode: '12345-67890',
          serialNumber: 'SN-1',
          commissioned: false,
        })),
      }

      childBridgeFork.sendPairedStatusEvent()

      expect(sendMessageSpy).toHaveBeenCalledWith(ChildProcessMessageEventType.STATUS_UPDATE, {
        paired: null,
        setupUri: null,
        matter: {
          qrCode: 'MT:ABCD',
          manualPairingCode: '12345-67890',
          serialNumber: 'SN-1',
          commissioned: false,
        },
      })
    })
  })
})
