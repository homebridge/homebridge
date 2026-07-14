import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'
import {
  DefaultValveConfigurationAndControlServer,
  HomebridgeValveConfigurationAndControlServer,
} from './ValveConfigurationAndControlBehavior.js'

describe('defaultValveConfigurationAndControlServer', () => {
  let behavior: DefaultValveConfigurationAndControlServer
  let mockState: { currentState: number | null, targetState: number | null }

  beforeEach(() => {
    mockState = { currentState: 0, targetState: 0 }

    behavior = Object.create(DefaultValveConfigurationAndControlServer.prototype)
    Object.defineProperty(behavior, 'state', {
      get: () => mockState,
      configurable: true,
    })
  })

  it('should set current and target state to Open on open', async () => {
    // The matter.js base server leaves open() unimplemented (throws
    // NotImplementedError), so the default server must set the state itself.
    await behavior.open({} as any)

    expect(mockState.currentState).toBe(1) // ValveState.Open
    expect(mockState.targetState).toBe(1)
  })

  it('should set current and target state to Closed on close', async () => {
    mockState.currentState = 1
    mockState.targetState = 1

    await behavior.close()

    expect(mockState.currentState).toBe(0) // ValveState.Closed
    expect(mockState.targetState).toBe(0)
  })
})

describe('homebridgeValveConfigurationAndControlServer', () => {
  let mockRegistry: BehaviorRegistry
  let behavior: HomebridgeValveConfigurationAndControlServer
  let mockEndpoint: any
  let mockState: { currentState: number | null, targetState: number | null }
  const testEndpointId = 'test-endpoint-valve'

  beforeEach(() => {
    mockRegistry = {
      executeHandler: vi.fn().mockResolvedValue(true),
      syncStateToCache: vi.fn(),
    } as any

    mockState = { currentState: 0, targetState: 0 }

    mockEndpoint = {
      id: testEndpointId,
    }

    const registryManager = new RegistryManager()
    setRegistryManager(mockEndpoint, registryManager)
    registryManager.registerEndpoint(testEndpointId, mockRegistry)

    behavior = Object.create(HomebridgeValveConfigurationAndControlServer.prototype)
    Object.defineProperty(behavior, 'endpoint', {
      get: () => mockEndpoint,
      configurable: true,
    })
    Object.defineProperty(behavior, 'state', {
      get: () => mockState,
      configurable: true,
    })
  })

  describe('open', () => {
    const request = {} as any

    it('should execute handler for open command', async () => {
      await behavior.open(request)

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(testEndpointId, 'valveConfigurationAndControl', 'open', request)
    })

    it('should set the cluster state to Open after the handler succeeds', async () => {
      await behavior.open(request)

      expect(mockState.currentState).toBe(1)
      expect(mockState.targetState).toBe(1)
    })

    it('should sync state to cache after opening', async () => {
      await behavior.open(request)

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        testEndpointId,
        'valveConfigurationAndControl',
        { currentState: 1, targetState: 1 },
      )
    })

    it('should wrap handler execution errors', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      await expect(behavior.open(request)).rejects.toThrow('Failed to open valve: Handler failed')
    })

    it('should not change state or sync cache if handler fails', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      try {
        await behavior.open(request)
      } catch {
        // Expected to throw
      }

      expect(mockState.currentState).toBe(0)
      expect(mockRegistry.syncStateToCache).not.toHaveBeenCalled()
    })
  })

  describe('close', () => {
    it('should execute handler for close command', async () => {
      await behavior.close()

      expect(mockRegistry.executeHandler).toHaveBeenCalledWith(testEndpointId, 'valveConfigurationAndControl', 'close')
    })

    it('should set the cluster state to Closed after the handler succeeds', async () => {
      mockState.currentState = 1
      mockState.targetState = 1

      await behavior.close()

      expect(mockState.currentState).toBe(0)
      expect(mockState.targetState).toBe(0)
    })

    it('should sync state to cache after closing', async () => {
      await behavior.close()

      expect(mockRegistry.syncStateToCache).toHaveBeenCalledWith(
        testEndpointId,
        'valveConfigurationAndControl',
        { currentState: 0, targetState: 0 },
      )
    })

    it('should wrap handler execution errors', async () => {
      mockRegistry.executeHandler = vi.fn().mockRejectedValue(new Error('Handler failed'))

      await expect(behavior.close()).rejects.toThrow('Failed to close valve: Handler failed')
    })
  })
})
