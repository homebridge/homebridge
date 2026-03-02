import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChildBridgeFork } from './childBridgeFork.js'

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
})
