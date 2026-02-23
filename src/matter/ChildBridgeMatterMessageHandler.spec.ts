import type { MatterEvent } from './ipc-types.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ChildBridgeMatterMessageHandler } from './ChildBridgeMatterMessageHandler.js'

describe('childBridgeMatterMessageHandler', () => {
  let handler: ChildBridgeMatterMessageHandler
  let mockMatterManager: any
  let mockSendMessage: ReturnType<typeof vi.fn>
  const testBridgeUsername = '0E:DC:5D:BE:D6:75'

  beforeEach(() => {
    mockMatterManager = {
      isMatterEnabled: vi.fn(),
      enableStateMonitoring: vi.fn(),
      disableStateMonitoring: vi.fn(),
      collectAllAccessories: vi.fn(),
      getAccessoryInfo: vi.fn(),
      handleTriggerCommand: vi.fn(),
    }

    mockSendMessage = vi.fn()

    handler = new ChildBridgeMatterMessageHandler(
      mockMatterManager,
      testBridgeUsername,
      mockSendMessage,
    )
  })

  describe('handleStartMatterMonitoring', () => {
    it('should enable monitoring when Matter is enabled', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)

      handler.handleStartMatterMonitoring()

      expect(mockMatterManager.isMatterEnabled).toHaveBeenCalled()
      expect(mockMatterManager.enableStateMonitoring).toHaveBeenCalled()
    })

    it('should not enable monitoring when Matter is disabled', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(false)

      handler.handleStartMatterMonitoring()

      expect(mockMatterManager.isMatterEnabled).toHaveBeenCalled()
      expect(mockMatterManager.enableStateMonitoring).not.toHaveBeenCalled()
    })

    it('should handle undefined matter manager gracefully', () => {
      handler = new ChildBridgeMatterMessageHandler(
        undefined,
        testBridgeUsername,
        mockSendMessage,
      )

      expect(() => handler.handleStartMatterMonitoring()).not.toThrow()
    })
  })

  describe('handleStopMatterMonitoring', () => {
    it('should disable monitoring when Matter is enabled', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)

      handler.handleStopMatterMonitoring()

      expect(mockMatterManager.isMatterEnabled).toHaveBeenCalled()
      expect(mockMatterManager.disableStateMonitoring).toHaveBeenCalled()
    })

    it('should not disable monitoring when Matter is disabled', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(false)

      handler.handleStopMatterMonitoring()

      expect(mockMatterManager.isMatterEnabled).toHaveBeenCalled()
      expect(mockMatterManager.disableStateMonitoring).not.toHaveBeenCalled()
    })
  })

  describe('handleGetMatterAccessories', () => {
    it('should return empty array when Matter is not enabled', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(false)

      handler.handleGetMatterAccessories()

      expect(mockMatterManager.isMatterEnabled).toHaveBeenCalled()
      expect(mockMatterManager.collectAllAccessories).not.toHaveBeenCalled()

      const expectedEvent: MatterEvent = {
        type: 'accessoriesData',
        data: {
          bridgeUsername: testBridgeUsername,
          accessories: [],
        },
      }
      expect(mockSendMessage).toHaveBeenCalledWith('matterEvent', expectedEvent)
    })

    it('should collect and send accessories when Matter is enabled', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      const mockAccessories = [
        { uuid: 'acc-1', displayName: 'Light 1' },
        { uuid: 'acc-2', displayName: 'Light 2' },
      ]
      mockMatterManager.collectAllAccessories.mockReturnValue(mockAccessories)

      handler.handleGetMatterAccessories()

      expect(mockMatterManager.collectAllAccessories).toHaveBeenCalled()

      const expectedEvent: MatterEvent = {
        type: 'accessoriesData',
        data: {
          bridgeUsername: testBridgeUsername,
          accessories: mockAccessories,
        },
      }
      expect(mockSendMessage).toHaveBeenCalledWith('matterEvent', expectedEvent)
    })

    it('should send error event on exception', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      mockMatterManager.collectAllAccessories.mockImplementation(() => {
        throw new Error('Collection failed')
      })

      handler.handleGetMatterAccessories()

      const expectedEvent: MatterEvent = {
        type: 'accessoriesData',
        data: {
          bridgeUsername: testBridgeUsername,
          error: 'Collection failed',
        },
      }
      expect(mockSendMessage).toHaveBeenCalledWith('matterEvent', expectedEvent)
    })

    it('should handle non-Error exceptions', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      mockMatterManager.collectAllAccessories.mockImplementation(() => {
        throw 'string error' // eslint-disable-line no-throw-literal
      })

      handler.handleGetMatterAccessories()

      const expectedEvent: MatterEvent = {
        type: 'accessoriesData',
        data: {
          bridgeUsername: testBridgeUsername,
          error: 'Unknown error',
        },
      }
      expect(mockSendMessage).toHaveBeenCalledWith('matterEvent', expectedEvent)
    })
  })

  describe('handleGetMatterAccessoryInfo', () => {
    it('should not respond when Matter is disabled', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(false)

      handler.handleGetMatterAccessoryInfo({ uuid: 'test-uuid' })

      expect(mockMatterManager.getAccessoryInfo).not.toHaveBeenCalled()
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should send accessory info when found', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      const mockInfo = {
        uuid: 'test-uuid',
        displayName: 'Test Light',
        parts: [],
      }
      mockMatterManager.getAccessoryInfo.mockReturnValue(mockInfo)

      handler.handleGetMatterAccessoryInfo({ uuid: 'test-uuid' })

      expect(mockMatterManager.getAccessoryInfo).toHaveBeenCalledWith('test-uuid')

      const expectedEvent: MatterEvent = {
        type: 'accessoryInfoData',
        data: mockInfo,
      }
      expect(mockSendMessage).toHaveBeenCalledWith('matterEvent', expectedEvent)
    })

    it('should not respond when accessory not found', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      mockMatterManager.getAccessoryInfo.mockReturnValue(undefined)

      handler.handleGetMatterAccessoryInfo({ uuid: 'unknown-uuid' })

      expect(mockMatterManager.getAccessoryInfo).toHaveBeenCalledWith('unknown-uuid')
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should send error event on exception', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      mockMatterManager.getAccessoryInfo.mockImplementation(() => {
        throw new Error('Failed to get info')
      })

      handler.handleGetMatterAccessoryInfo({ uuid: 'test-uuid' })

      const expectedEvent: MatterEvent = {
        type: 'accessoryInfoData',
        data: {
          error: 'Failed to get info',
        },
      }
      expect(mockSendMessage).toHaveBeenCalledWith('matterEvent', expectedEvent)
    })
  })

  describe('handleMatterAccessoryControl', () => {
    const mockControlData = {
      uuid: 'test-uuid',
      cluster: 'onOff',
      attributes: { onOff: true },
    }

    it('should ignore when Matter is not enabled', () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(false)

      handler.handleMatterAccessoryControl(mockControlData)

      expect(mockMatterManager.handleTriggerCommand).not.toHaveBeenCalled()
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should control accessory and send success response', async () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      mockMatterManager.handleTriggerCommand.mockResolvedValue(undefined)

      handler.handleMatterAccessoryControl(mockControlData)

      // Wait for promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockMatterManager.handleTriggerCommand).toHaveBeenCalledWith(
        mockControlData.uuid,
        mockControlData.cluster,
        mockControlData.attributes,
        undefined,
      )

      const expectedEvent: MatterEvent = {
        type: 'accessoryControlResponse',
        data: {
          success: true,
          uuid: mockControlData.uuid,
        },
      }
      expect(mockSendMessage).toHaveBeenCalledWith('matterEvent', expectedEvent)
    })

    it('should handle partId parameter', async () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      mockMatterManager.handleTriggerCommand.mockResolvedValue(undefined)

      const dataWithPart = { ...mockControlData, partId: 'outlet-2' }
      handler.handleMatterAccessoryControl(dataWithPart)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockMatterManager.handleTriggerCommand).toHaveBeenCalledWith(
        mockControlData.uuid,
        mockControlData.cluster,
        mockControlData.attributes,
        'outlet-2',
      )
    })

    it('should silently ignore "not found on this bridge" errors', async () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      mockMatterManager.handleTriggerCommand.mockRejectedValue(
        new Error('Accessory not found on this bridge'),
      )

      handler.handleMatterAccessoryControl(mockControlData)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Should not send error response for "not found" errors
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should send error response for other errors', async () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      mockMatterManager.handleTriggerCommand.mockRejectedValue(
        new Error('Command execution failed'),
      )

      handler.handleMatterAccessoryControl(mockControlData)

      await new Promise(resolve => setTimeout(resolve, 10))

      const expectedEvent: MatterEvent = {
        type: 'accessoryControlResponse',
        data: {
          success: false,
          error: 'Command execution failed',
          uuid: mockControlData.uuid,
        },
      }
      expect(mockSendMessage).toHaveBeenCalledWith('matterEvent', expectedEvent)
    })

    it('should handle non-Error exceptions', async () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      // Use a non-standard error to test the fallback
      mockMatterManager.handleTriggerCommand.mockRejectedValue({ message: 'Non-standard error' })

      handler.handleMatterAccessoryControl(mockControlData)

      await new Promise(resolve => setTimeout(resolve, 20))

      const expectedEvent: MatterEvent = {
        type: 'accessoryControlResponse',
        data: {
          success: false,
          error: 'Unknown error',
          uuid: mockControlData.uuid,
        },
      }
      expect(mockSendMessage).toHaveBeenCalledWith('matterEvent', expectedEvent)
    })
  })

  describe('integration scenarios', () => {
    it('should handle rapid sequential calls', async () => {
      mockMatterManager.isMatterEnabled.mockReturnValue(true)
      mockMatterManager.handleTriggerCommand.mockResolvedValue(undefined)

      const data1 = { uuid: 'uuid-1', cluster: 'onOff', attributes: { onOff: true } }
      const data2 = { uuid: 'uuid-2', cluster: 'levelControl', attributes: { currentLevel: 100 } }
      const data3 = { uuid: 'uuid-3', cluster: 'colorControl', attributes: { hue: 200 } }

      handler.handleMatterAccessoryControl(data1)
      handler.handleMatterAccessoryControl(data2)
      handler.handleMatterAccessoryControl(data3)

      await new Promise(resolve => setTimeout(resolve, 20))

      expect(mockMatterManager.handleTriggerCommand).toHaveBeenCalledTimes(3)
      expect(mockSendMessage).toHaveBeenCalledTimes(3)
    })

    it('should handle undefined matter manager in all methods', () => {
      handler = new ChildBridgeMatterMessageHandler(
        undefined,
        testBridgeUsername,
        mockSendMessage,
      )

      expect(() => handler.handleStartMatterMonitoring()).not.toThrow()
      expect(() => handler.handleStopMatterMonitoring()).not.toThrow()
      expect(() => handler.handleGetMatterAccessories()).not.toThrow()
      expect(() => handler.handleGetMatterAccessoryInfo({ uuid: 'test' })).not.toThrow()
      expect(() => handler.handleMatterAccessoryControl({
        uuid: 'test',
        cluster: 'onOff',
        attributes: {},
      })).not.toThrow()
    })
  })
})
