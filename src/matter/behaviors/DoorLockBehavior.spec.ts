import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomebridgeDoorLockServer } from './DoorLockBehavior.js'
import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'

describe('homebridgeDoorLockServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeDoorLockServer
  let mockEndpoint: any
  let mockState: { lockState: number }
  const testEndpointId = 'test-endpoint-123'

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any

    // Create mock state
    mockState = { lockState: 1 } // 1 = locked, 2 = unlocked

    // Create mock endpoint
    mockEndpoint = {
      id: testEndpointId,
    }

    // Register the endpoint with RegistryManager
    const registryManager = new RegistryManager()
    setRegistryManager(mockEndpoint, registryManager)
    registryManager.registerEndpoint(testEndpointId, mockRegistry)

    // Create behavior instance with mocked properties
    behavior = Object.create(HomebridgeDoorLockServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })
    Object.defineProperty(behavior, 'state', {
      get: () => mockState,
      set: (value) => {
        mockState = value
      },
      configurable: true,
    })
  })

  describe('lockDoor', () => {
    it('should execute handler for lockDoor command', async () => {
      await behavior.lockDoor()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(testEndpointId, 'doorLock', 'lockDoor')
    })

    it('should sync lockState to cache after locking', async () => {
      mockState.lockState = 1 // locked

      await behavior.lockDoor()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        testEndpointId,
        'doorLock',
        { lockState: 1 },
      )
    })

    it('should propagate handler execution errors', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      // Should throw/reject when handler fails
      await expect(behavior.lockDoor()).rejects.toThrow('Handler failed')
    })

    it('should not sync state if handler fails', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      mockState.lockState = 1

      try {
        await behavior.lockDoor()
      } catch {
        // Expected to throw
      }

      // State should NOT be synced when handler fails
      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should check lockState before syncing', async () => {
      // When lockState is defined, it syncs
      mockState.lockState = 1

      await behavior.lockDoor()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalled()
    })
  })

  describe('unlockDoor', () => {
    it('should execute handler for unlockDoor command', async () => {
      await behavior.unlockDoor()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(testEndpointId, 'doorLock', 'unlockDoor')
    })

    it('should sync lockState to cache after unlocking', async () => {
      mockState.lockState = 2 // unlocked

      await behavior.unlockDoor()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        testEndpointId,
        'doorLock',
        { lockState: 2 },
      )
    })

    it('should propagate handler execution errors', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      // Should throw/reject when handler fails
      await expect(behavior.unlockDoor()).rejects.toThrow('Handler failed')
    })

    it('should not sync state if handler fails', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))
      mockState.lockState = 2

      try {
        await behavior.unlockDoor()
      } catch {
        // Expected to throw
      }

      // State should NOT be synced when handler fails
      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })

    it('should check lockState before syncing', async () => {
      // When lockState is defined, it syncs
      mockState.lockState = 2

      await behavior.unlockDoor()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalled()
    })
  })

  describe('lock states', () => {
    it('should sync whatever lockState is set after command', async () => {
      // Test that we sync the current state after lock command
      mockState.lockState = 1

      await behavior.lockDoor()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        testEndpointId,
        'doorLock',
        { lockState: 1 },
      )
    })
  })
})
