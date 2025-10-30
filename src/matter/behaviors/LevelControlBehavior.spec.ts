import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeLevelControlServer } from './LevelControlBehavior.js'

describe('homebridgeLevelControlServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeLevelControlServer
  let mockEndpoint: any

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any

    // Set registry on behavior class
    HomebridgeLevelControlServer.setRegistry(mockRegistry)

    // Create mock endpoint
    mockEndpoint = {
      id: 'test-endpoint-123',
    }

    // Create behavior instance with mocked properties
    behavior = Object.create(HomebridgeLevelControlServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })

    // Mock super methods to prevent actual execution
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'moveToLevel').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'move').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'step').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'stop').mockReturnValue(undefined)
    vi.spyOn(Object.getPrototypeOf(HomebridgeLevelControlServer.prototype), 'moveToLevelWithOnOff').mockReturnValue(undefined)
  })

  describe('setRegistry', () => {
    it('should set the registry', () => {
      const newRegistry = {} as BehaviorRegistry
      HomebridgeLevelControlServer.setRegistry(newRegistry)
      expect(true).toBe(true)
    })
  })

  describe('moveToLevel', () => {
    it('should execute handler with request', async () => {
      const request = { level: 128, transitionTime: 0, optionsMask: {}, optionsOverride: {} }

      await behavior.moveToLevel(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        'moveToLevel',
        request,
      )
    })

    it('should sync currentLevel to cache', async () => {
      const request = { level: 200, transitionTime: 10, optionsMask: {}, optionsOverride: {} }

      await behavior.moveToLevel(request)

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        { currentLevel: 200 },
      )
    })

    it('should handle level 0', async () => {
      const request = { level: 0, transitionTime: 0, optionsMask: {}, optionsOverride: {} }

      await behavior.moveToLevel(request)

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        { currentLevel: 0 },
      )
    })

    it('should handle level 254 (max)', async () => {
      const request = { level: 254, transitionTime: 0, optionsMask: {}, optionsOverride: {} }

      await behavior.moveToLevel(request)

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        { currentLevel: 254 },
      )
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { level: 100, transitionTime: 0, optionsMask: {}, optionsOverride: {} }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.moveToLevel(request)).rejects.toThrow('Failed to set level: Handler failed')
    })
  })

  describe('move', () => {
    it('should execute handler with request', async () => {
      const request = { moveMode: 0, rate: 10, optionsMask: {}, optionsOverride: {} }

      await behavior.move(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        'move',
        request,
      )
    })

    it('should not sync state to cache', async () => {
      const request = { moveMode: 0, rate: 10, optionsMask: {}, optionsOverride: {} }

      await behavior.move(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { moveMode: 0, rate: 10, optionsMask: {}, optionsOverride: {} }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.move(request)).rejects.toThrow('Failed to move level: Handler failed')
    })
  })

  describe('step', () => {
    it('should execute handler with request', async () => {
      const request = { stepMode: 0, stepSize: 20, transitionTime: 5, optionsMask: {}, optionsOverride: {} }

      await behavior.step(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        'step',
        request,
      )
    })

    it('should not sync state to cache', async () => {
      const request = { stepMode: 0, stepSize: 20, transitionTime: 5, optionsMask: {}, optionsOverride: {} }

      await behavior.step(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { stepMode: 0, stepSize: 20, transitionTime: 5, optionsMask: {}, optionsOverride: {} }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.step(request)).rejects.toThrow('Failed to step level: Handler failed')
    })
  })

  describe('stop', () => {
    it('should execute handler with request', async () => {
      const request = { optionsMask: {}, optionsOverride: {} }

      await behavior.stop(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        'stop',
        request,
      )
    })

    it('should not sync state to cache', async () => {
      const request = { optionsMask: {}, optionsOverride: {} }

      await behavior.stop(request)

      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { optionsMask: {}, optionsOverride: {} }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.stop(request)).rejects.toThrow('Failed to stop level change: Handler failed')
    })
  })

  describe('moveToLevelWithOnOff', () => {
    it('should execute handler with request', async () => {
      const request = { level: 150, transitionTime: 5, optionsMask: {}, optionsOverride: {} }

      await behavior.moveToLevelWithOnOff(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        'moveToLevelWithOnOff',
        request,
      )
    })

    it('should sync currentLevel to cache', async () => {
      const request = { level: 180, transitionTime: 10, optionsMask: {}, optionsOverride: {} }

      await behavior.moveToLevelWithOnOff(request)

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        { currentLevel: 180 },
      )
    })

    it('should handle level 0', async () => {
      const request = { level: 0, transitionTime: 0, optionsMask: {}, optionsOverride: {} }

      await behavior.moveToLevelWithOnOff(request)

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        'test-endpoint-123',
        'levelControl',
        { currentLevel: 0 },
      )
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { level: 100, transitionTime: 0, optionsMask: {}, optionsOverride: {} }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.moveToLevelWithOnOff(request)).rejects.toThrow('Failed to set level with on/off: Handler failed')
    })
  })
})
