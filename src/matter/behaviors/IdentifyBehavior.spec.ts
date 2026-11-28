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

    it('should pass a handler error on to matter.js', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { identifyTime: 5 }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.identify(request)).rejects.toThrow('Handler failed')
    })

    it('should still start identifying in matter.js when the plugin has no identify handler', async () => {
      // the registry answers false for a command with no handler; it does not throw
      mockRegistry.executeHandler = vi.fn().mockResolvedValue(false)
      const request = { identifyTime: 5 }

      await expect(behavior.identify(request)).resolves.toBeUndefined()

      expect(Object.getPrototypeOf(HomebridgeIdentifyServer.prototype).identify).toHaveBeenCalledWith(request)
    })

    it('should not start identifying in matter.js when the handler fails', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      await expect(behavior.identify({ identifyTime: 5 })).rejects.toThrow('Handler failed')

      expect(Object.getPrototypeOf(HomebridgeIdentifyServer.prototype).identify).not.toHaveBeenCalled()
    })
  })
})
