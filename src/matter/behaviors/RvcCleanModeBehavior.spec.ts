import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'
import { HomebridgeRvcCleanModeServer } from './RvcCleanModeBehavior.js'

describe('homebridgeRvcCleanModeServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeRvcCleanModeServer
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
    behavior = Object.create(HomebridgeRvcCleanModeServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })

    // Mock super method
    vi.spyOn(Object.getPrototypeOf(HomebridgeRvcCleanModeServer.prototype), 'changeToMode').mockReturnValue(undefined)
  })

  describe('changeToMode', () => {
    it('should execute handler with request', async () => {
      const request = { newMode: 0 } // Vacuum mode

      await behavior.changeToMode(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'rvcCleanMode',
        'changeToMode',
        request,
      )
    })

    it('should handle different cleaning mode values', async () => {
      const modes = [0, 1, 2] // Vacuum, Mop, VacuumAndMop

      for (const mode of modes) {
        const request = { newMode: mode }
        await behavior.changeToMode(request)

        expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
          testEndpointId,
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
