import type { Endpoint } from '@matter/main'

import { describe, expect, it } from 'vitest'

import { getRegistryManager, setRegistryManager } from './EndpointContext.js'
import { RegistryManager } from './RegistryManager.js'

describe('endpointContext', () => {
  describe('setRegistryManager', () => {
    it('should attach RegistryManager to endpoint', () => {
      const mockEndpoint = { id: 'test-endpoint' } as Endpoint
      const registryManager = new RegistryManager()

      setRegistryManager(mockEndpoint, registryManager)

      // Verify it was set by retrieving it
      const retrieved = getRegistryManager(mockEndpoint)
      expect(retrieved).toBe(registryManager)
    })

    it('should allow overwriting existing RegistryManager', () => {
      const mockEndpoint = { id: 'test-endpoint' } as Endpoint
      const registryManager1 = new RegistryManager()
      const registryManager2 = new RegistryManager()

      setRegistryManager(mockEndpoint, registryManager1)
      setRegistryManager(mockEndpoint, registryManager2)

      const retrieved = getRegistryManager(mockEndpoint)
      expect(retrieved).toBe(registryManager2)
      expect(retrieved).not.toBe(registryManager1)
    })

    it('should work with multiple endpoints independently', () => {
      const endpoint1 = { id: 'endpoint-1' } as Endpoint
      const endpoint2 = { id: 'endpoint-2' } as Endpoint
      const registryManager1 = new RegistryManager()
      const registryManager2 = new RegistryManager()

      setRegistryManager(endpoint1, registryManager1)
      setRegistryManager(endpoint2, registryManager2)

      expect(getRegistryManager(endpoint1)).toBe(registryManager1)
      expect(getRegistryManager(endpoint2)).toBe(registryManager2)
    })
  })

  describe('getRegistryManager', () => {
    it('should retrieve attached RegistryManager', () => {
      const mockEndpoint = { id: 'test-endpoint' } as Endpoint
      const registryManager = new RegistryManager()

      setRegistryManager(mockEndpoint, registryManager)

      const retrieved = getRegistryManager(mockEndpoint)
      expect(retrieved).toBe(registryManager)
      expect(retrieved).toBeInstanceOf(RegistryManager)
    })

    it('should throw error when no RegistryManager is attached', () => {
      const mockEndpoint = { id: 'test-endpoint' } as Endpoint

      expect(() => getRegistryManager(mockEndpoint)).toThrow(
        'No RegistryManager attached to endpoint test-endpoint',
      )
    })

    it('should throw error with endpoint id in message', () => {
      const mockEndpoint = { id: 'my-custom-endpoint-id' } as Endpoint

      expect(() => getRegistryManager(mockEndpoint)).toThrow(
        'No RegistryManager attached to endpoint my-custom-endpoint-id',
      )
    })
  })

  describe('symbol-based storage', () => {
    it('should not pollute endpoint with visible properties', () => {
      const mockEndpoint = { id: 'test-endpoint' } as Endpoint
      const registryManager = new RegistryManager()

      setRegistryManager(mockEndpoint, registryManager)

      // Check that no string keys were added
      const stringKeys = Object.keys(mockEndpoint)
      expect(stringKeys).toEqual(['id'])

      // The symbol key should exist but not be enumerable
      const allKeys = Reflect.ownKeys(mockEndpoint)
      expect(allKeys.length).toBeGreaterThan(1) // 'id' + symbol
    })

    it('should use Symbol to avoid naming conflicts', () => {
      const mockEndpoint = {
        id: 'test-endpoint',
        // Even if someone adds a property with a similar name
        registryManager: 'this is something else',
        homebridgeRegistryManager: 'also not the same',
      } as any as Endpoint
      const registryManager = new RegistryManager()

      setRegistryManager(mockEndpoint, registryManager)

      // The symbol-based storage should not interfere
      expect((mockEndpoint as any).registryManager).toBe('this is something else')
      expect((mockEndpoint as any).homebridgeRegistryManager).toBe('also not the same')
      expect(getRegistryManager(mockEndpoint)).toBe(registryManager)
    })
  })

  describe('integration with RegistryManager', () => {
    it('should allow full workflow of setting and using RegistryManager', () => {
      const mockEndpoint = { id: 'test-endpoint' } as Endpoint
      const registryManager = new RegistryManager()
      const mockRegistry = {
        executeHandler: () => Promise.resolve(true),
        syncStateToCache: () => {},
      } as any

      // Set registry manager
      setRegistryManager(mockEndpoint, registryManager)

      // Register endpoint
      registryManager.registerEndpoint('test-endpoint', mockRegistry)

      // Retrieve and use
      const retrieved = getRegistryManager(mockEndpoint)
      const registry = retrieved.getRegistry('test-endpoint')

      expect(registry).toBe(mockRegistry)
    })

    it('should isolate different MatterServer instances', () => {
      // Simulate two different MatterServer instances
      const endpoint1 = { id: 'endpoint-1' } as Endpoint
      const endpoint2 = { id: 'endpoint-2' } as Endpoint

      const registryManager1 = new RegistryManager()
      const registryManager2 = new RegistryManager()

      const mockRegistry1 = { name: 'registry-1' } as any
      const mockRegistry2 = { name: 'registry-2' } as any

      // Server 1 setup
      setRegistryManager(endpoint1, registryManager1)
      registryManager1.registerEndpoint('endpoint-1', mockRegistry1)

      // Server 2 setup
      setRegistryManager(endpoint2, registryManager2)
      registryManager2.registerEndpoint('endpoint-2', mockRegistry2)

      // Verify isolation
      expect(getRegistryManager(endpoint1)).toBe(registryManager1)
      expect(getRegistryManager(endpoint2)).toBe(registryManager2)
      expect(registryManager1.getRegistry('endpoint-1')).toBe(mockRegistry1)
      expect(registryManager2.getRegistry('endpoint-2')).toBe(mockRegistry2)

      // Verify cross-contamination doesn't occur
      expect(() => registryManager1.getRegistry('endpoint-2')).toThrow()
      expect(() => registryManager2.getRegistry('endpoint-1')).toThrow()
    })
  })

  describe('error handling', () => {
    it('should handle endpoint without id gracefully', () => {
      const mockEndpoint = {} as Endpoint
      const registryManager = new RegistryManager()

      setRegistryManager(mockEndpoint, registryManager)

      expect(() => getRegistryManager(mockEndpoint)).not.toThrow()
    })

    it('should provide helpful error message', () => {
      const mockEndpoint = { id: 'important-endpoint' } as Endpoint

      // Use the toThrow matcher (instead of try/catch with conditional expects)
      // so the message assertions are unconditional. Each call re-invokes the
      // getter, which throws afresh.
      expect(() => getRegistryManager(mockEndpoint)).toThrow(Error)
      expect(() => getRegistryManager(mockEndpoint)).toThrow('No RegistryManager attached')
      expect(() => getRegistryManager(mockEndpoint)).toThrow('important-endpoint')
      expect(() => getRegistryManager(mockEndpoint)).toThrow('programming error')
    })
  })
})
