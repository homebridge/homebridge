import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { ModeBase } from '@matter/main/clusters'
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

    // Modes 0-3 are supported, the device starts in mode 0
    const state = {
      currentMode: 0,
      supportedModes: [0, 1, 2, 3].map(mode => ({ label: `Mode ${mode}`, mode, modeTags: [] })),
    }
    Object.defineProperty(behavior, 'state', {
      get: () => state,
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

    it('should refuse a mode the device does not list, without calling the handler', async () => {
      const result = await behavior.changeToMode({ newMode: 7 })

      expect(result.status).toBe(ModeBase.ModeChangeStatus.UnsupportedMode)
      expect(mockRegistry.executeHandler).not.toHaveBeenCalled()
      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })
  })
})
