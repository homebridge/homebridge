import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { HomebridgeIdentifyServer } from './IdentifyBehavior.js'
import { RegistryManager } from './RegistryManager.js'

describe('homebridgeIdentifyServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeIdentifyServer
  let mockEndpoint: any
  const testEndpointId = 'test-endpoint-123'

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
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
    behavior = Object.create(HomebridgeIdentifyServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })

    // Mock super method to prevent actual execution
    vi.spyOn(Object.getPrototypeOf(HomebridgeIdentifyServer.prototype), 'identify').mockReturnValue(undefined)
  })

  describe('identify', () => {
    it('should execute handler with identify request', async () => {
      const request = { identifyTime: 10 }

      await behavior.identify(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'identify',
        'identify',
        request,
      )
    })

    it('should handle identify time of 0 (stop identifying)', async () => {
      const request = { identifyTime: 0 }

      await behavior.identify(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'identify',
        'identify',
        request,
      )
    })

    it('should handle long identify times', async () => {
      const request = { identifyTime: 65535 } // Max uint16

      await behavior.identify(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'identify',
        'identify',
        request,
      )
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { identifyTime: 5 }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.identify(request)).rejects.toThrow('Failed to identify: Handler failed')
    })

    it('should call identify even if handler is not registered', () => {
      mockRegistry.executeHandler = vi.fn().mockResolvedValue(false)
      const request = { identifyTime: 5 }

      // Should not throw
      expect(() => behavior.identify(request)).not.toThrow()
    })
  })
})
