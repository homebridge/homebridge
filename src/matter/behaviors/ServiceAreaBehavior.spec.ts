import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'
import { HomebridgeServiceAreaServer } from './ServiceAreaBehavior.js'

describe('homebridgeServiceAreaServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeServiceAreaServer
  let mockEndpoint: any
  const testEndpointId = 'test-endpoint-123'

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any

    // Create mock endpoint
    mockEndpoint = {
      id: testEndpointId,
    }

    // Register the endpoint with RegistryManager
    const registryManager = new RegistryManager()
    setRegistryManager(mockEndpoint, registryManager)
    registryManager.registerEndpoint(testEndpointId, mockRegistry)

    // Create behavior instance with mocked properties
    behavior = Object.create(HomebridgeServiceAreaServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })
    Object.defineProperty(behavior, 'state', {
      get: () => ({ selectedAreas: [] }),
      configurable: true,
    })

    // Mock super method
    vi.spyOn(Object.getPrototypeOf(HomebridgeServiceAreaServer.prototype), 'selectAreas').mockResolvedValue({
      status: 0,
      statusText: 'Success',
    } as any)
  })

  describe('selectAreas', () => {
    it('should execute handler with request', async () => {
      const request = { newAreas: [0, 1, 2] }

      await behavior.selectAreas(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'serviceArea',
        'selectAreas',
        request,
      )
    })

    it('should handle empty area selection', async () => {
      const request = { newAreas: [] }

      await behavior.selectAreas(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
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
