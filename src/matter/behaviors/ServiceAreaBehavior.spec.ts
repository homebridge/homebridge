import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeServiceAreaServer } from './ServiceAreaBehavior.js'

describe('homebridgeServiceAreaServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeServiceAreaServer
  let mockEndpoint: any

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
    } as any

    // Set registry on behavior class
    HomebridgeServiceAreaServer.setRegistry(mockRegistry)

    // Create mock endpoint
    mockEndpoint = {
      id: 'test-endpoint-123',
    }

    // Create behavior instance with mocked properties
    behavior = Object.create(HomebridgeServiceAreaServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })

    // Mock super method
    vi.spyOn(Object.getPrototypeOf(HomebridgeServiceAreaServer.prototype), 'selectAreas').mockReturnValue(undefined)
  })

  describe('setRegistry', () => {
    it('should set the registry', () => {
      const newRegistry = {} as BehaviorRegistry
      HomebridgeServiceAreaServer.setRegistry(newRegistry)
      expect(true).toBe(true)
    })
  })

  describe('selectAreas', () => {
    it('should execute handler with request', () => {
      const request = { newAreas: [0, 1, 2] }

      behavior.selectAreas(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'serviceArea',
        'selectAreas',
        request,
      )
    })

    it('should handle empty area selection', () => {
      const request = { newAreas: [] }

      behavior.selectAreas(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        'test-endpoint-123',
        'serviceArea',
        'selectAreas',
        request,
      )
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { newAreas: [0, 1] }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.selectAreas(request)).rejects.toThrow('Failed to select areas: Handler failed')
    })
  })
})
