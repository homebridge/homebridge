import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'
import { HomebridgeRvcOperationalStateServer } from './RvcOperationalStateBehavior.js'

describe('homebridgeRvcOperationalStateServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeRvcOperationalStateServer
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
    behavior = Object.create(HomebridgeRvcOperationalStateServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })
    Object.defineProperty(behavior, 'state', {
      get: () => ({ operationalState: 0 }),
      configurable: true,
    })
  })

  describe('pause', () => {
    it('should execute handler for pause command', async () => {
      await behavior.pause()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'rvcOperationalState',
        'pause',
      )
    })
  })

  describe('resume', () => {
    it('should execute handler for resume command', async () => {
      await behavior.resume()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'rvcOperationalState',
        'resume',
      )
    })
  })

  describe('goHome', () => {
    it('should execute handler for goHome command', async () => {
      await behavior.goHome()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(
        testEndpointId,
        'rvcOperationalState',
        'goHome',
      )
    })
  })
})
