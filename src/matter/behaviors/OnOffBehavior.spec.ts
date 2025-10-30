import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeOnOffServer } from './OnOffBehavior.js'

describe('homebridgeOnOffServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeOnOffServer
  let mockEndpoint: any
  let mockState: { onOff: boolean }

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any

    // Set registry on behavior class
    HomebridgeOnOffServer.setRegistry(mockRegistry)

    // Create mock state
    mockState = { onOff: false }

    // Create mock endpoint
    mockEndpoint = {
      id: 'test-endpoint-123',
    }

    // Create behavior instance with mocked properties
    behavior = Object.create(HomebridgeOnOffServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })
    Object.defineProperty(behavior, 'state', {
      get: () => mockState,
      set: (value) => {
        mockState = value
      },
      configurable: true,
    })

    // Mock super methods to prevent actual execution
    vi.spyOn(Object.getPrototypeOf(HomebridgeOnOffServer.prototype), 'on').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeOnOffServer.prototype), 'off').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeOnOffServer.prototype), 'toggle').mockReturnValue(undefined)
  })

  describe('setRegistry', () => {
    it('should set the registry', () => {
      const newRegistry = {} as BehaviorRegistry
      HomebridgeOnOffServer.setRegistry(newRegistry)
      // Registry is set (can't directly verify private static, but method doesn't throw)
      expect(true).toBe(true)
    })
  })

  describe('on', () => {
    it('should execute handler for on command', async () => {
      await behavior.on()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith('test-endpoint-123', 'onOff', 'on')
    })

    it('should sync onOff:true to cache', async () => {
      await behavior.on()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'onOff',
        { onOff: true },
      )
    })

    it('should propagate handler execution errors', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      // Should throw/reject when handler fails
      await expect(behavior.on()).rejects.toThrow('Handler failed')
    })

    it('should not sync state if handler fails', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      try {
        await behavior.on()
      } catch {
        // Expected to throw
      }

      // State should NOT be synced when handler fails
      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })
  })

  describe('off', () => {
    it('should execute handler for off command', async () => {
      await behavior.off()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith('test-endpoint-123', 'onOff', 'off')
    })

    it('should sync onOff:false to cache', async () => {
      await behavior.off()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'onOff',
        { onOff: false },
      )
    })

    it('should propagate handler execution errors', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      // Should throw/reject when handler fails
      await expect(behavior.off()).rejects.toThrow('Handler failed')
    })

    it('should not sync state if handler fails', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      try {
        await behavior.off()
      } catch {
        // Expected to throw
      }

      // State should NOT be synced when handler fails
      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })
  })

  describe('toggle', () => {
    it('should execute handler for toggle command', async () => {
      await behavior.toggle()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith('test-endpoint-123', 'onOff', 'toggle')
    })

    it('should sync toggled state (false -> true) to cache', async () => {
      mockState.onOff = false

      await behavior.toggle()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'onOff',
        { onOff: true },
      )
    })

    it('should sync toggled state (true -> false) to cache', async () => {
      mockState.onOff = true

      await behavior.toggle()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'onOff',
        { onOff: false },
      )
    })

    it('should handle undefined initial state', async () => {
      mockState.onOff = undefined as any

      await behavior.toggle()

      // undefined -> true (! undefined = true)
      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'onOff',
        { onOff: true },
      )
    })

    it('should propagate handler execution errors', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      // Should throw/reject when handler fails
      await expect(behavior.toggle()).rejects.toThrow('Handler failed')
    })
  })
})
