import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'
import { HomebridgeRvcRunModeServer } from './RvcRunModeBehavior.js'

describe('homebridgeRvcRunModeServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeRvcRunModeServer
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
    behavior = Object.create(HomebridgeRvcRunModeServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })

    // Mock super method
    vi.spyOn(Object.getPrototypeOf(HomebridgeRvcRunModeServer.prototype), 'changeToMode').mockReturnValue(undefined)
  })

  describe('changeToMode', () => {
    it('should execute handler with request', async () => {
      const request = { newMode: 1 }

      await behavior.changeToMode(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'rvcRunMode',
        'changeToMode',
        request,
      )
    })

    it('should handle different mode values', async () => {
      const modes = [0, 1, 2, 3]

      for (const mode of modes) {
        const request = { newMode: mode }
        await behavior.changeToMode(request)

        expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
          testEndpointId,
          'rvcRunMode',
          'changeToMode',
          request,
        )

        vi.clearAllMocks()
      }
    })

    it('should handle handler execution errors gracefully', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      const request = { newMode: 1 }

      // Errors are wrapped in StatusResponseError and propagated to Matter.js
      await expect(behavior.changeToMode(request)).rejects.toThrow('Failed to change run mode: Handler failed')
    })
  })
})
