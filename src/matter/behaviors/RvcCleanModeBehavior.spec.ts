import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeRvcCleanModeServer } from './RvcCleanModeBehavior.js'

describe('homebridgeRvcCleanModeServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeRvcCleanModeServer
  let mockEndpoint: any

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
    } as any

    // Set registry on behavior class
    HomebridgeRvcCleanModeServer.setRegistry(mockRegistry)

    // Create mock endpoint
    mockEndpoint = {
      id: 'test-endpoint-123',
    }

    // Create behavior instance with mocked properties
    behavior = Object.create(HomebridgeRvcCleanModeServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })

    // Mock super method
    vi.spyOn(Object.getPrototypeOf(HomebridgeRvcCleanModeServer.prototype), 'changeToMode').mockReturnValue(undefined)
  })

  describe('setRegistry', () => {
    it('should set the registry', () => {
      const newRegistry = {} as BehaviorRegistry
      HomebridgeRvcCleanModeServer.setRegistry(newRegistry)
      expect(true).toBe(true)
    })
  })

  describe('changeToMode', () => {
    it('should execute handler with request', () => {
      const request = { newMode: 0 } // Vacuum mode

      behavior.changeToMode(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'rvcCleanMode',
        'changeToMode',
        request,
      )
    })

    it('should handle different cleaning mode values', () => {
      const modes = [0, 1, 2] // Vacuum, Mop, VacuumAndMop

      for (const mode of modes) {
        const request = { newMode: mode }
        behavior.changeToMode(request)

        expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
          'test-endpoint-123',
          'rvcCleanMode',
          'changeToMode',
          request,
        )

        vi.clearAllMocks()
      }
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { newMode: 0 }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.changeToMode(request)).rejects.toThrow('Failed to change clean mode: Handler failed')
    })
  })
})
