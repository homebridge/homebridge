import type { MockInstance } from 'vitest'

import type { InternalMatterAccessory } from '../types.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BehaviorRegistry } from './BehaviorRegistry.js'

describe('behaviorRegistry', () => {
  let registry: BehaviorRegistry
  let accessoriesMap: Map<string, InternalMatterAccessory>
  let consoleDebugSpy: MockInstance
  let consoleErrorSpy: MockInstance

  beforeEach(() => {
    accessoriesMap = new Map()
    registry = new BehaviorRegistry(accessoriesMap)
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleDebugSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('constructor', () => {
    it('should create a new registry with provided accessories map', () => {
      expect(registry).toBeInstanceOf(BehaviorRegistry)
    })

    it('should initialize with empty state', () => {
      const stats = registry.getStats()
      expect(stats.handlerCount).toBe(0)
      expect(stats.partCount).toBe(0)
    })
  })

  describe('registerHandler', () => {
    it('should register a handler', () => {
      const handler = vi.fn()
      registry.registerHandler('endpoint1', 'onOff', 'toggle', handler)

      expect(registry.getHandler('endpoint1', 'onOff', 'toggle')).toBe(handler)
    })

    it('should register multiple handlers for same endpoint', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      registry.registerHandler('endpoint1', 'onOff', 'on', handler1)
      registry.registerHandler('endpoint1', 'onOff', 'off', handler2)

      expect(registry.getHandler('endpoint1', 'onOff', 'on')).toBe(handler1)
      expect(registry.getHandler('endpoint1', 'onOff', 'off')).toBe(handler2)
    })

    it('should register handlers for multiple clusters', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      registry.registerHandler('endpoint1', 'onOff', 'toggle', handler1)
      registry.registerHandler('endpoint1', 'levelControl', 'moveToLevel', handler2)

      expect(registry.getHandler('endpoint1', 'onOff', 'toggle')).toBe(handler1)
      expect(registry.getHandler('endpoint1', 'levelControl', 'moveToLevel')).toBe(handler2)
    })

    it('should register handlers for multiple endpoints', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      registry.registerHandler('endpoint1', 'onOff', 'toggle', handler1)
      registry.registerHandler('endpoint2', 'onOff', 'toggle', handler2)

      expect(registry.getHandler('endpoint1', 'onOff', 'toggle')).toBe(handler1)
      expect(registry.getHandler('endpoint2', 'onOff', 'toggle')).toBe(handler2)
    })

    it('should overwrite existing handler when registered again', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      registry.registerHandler('endpoint1', 'onOff', 'toggle', handler1)
      registry.registerHandler('endpoint1', 'onOff', 'toggle', handler2)

      expect(registry.getHandler('endpoint1', 'onOff', 'toggle')).toBe(handler2)
    })

    it('should not throw when registering a handler', () => {
      const handler = vi.fn()
      // Should not throw
      expect(() => registry.registerHandler('endpoint1', 'onOff', 'toggle', handler)).not.toThrow()
    })
  })

  describe('getHandler', () => {
    it('should return undefined for non-existent endpoint', () => {
      expect(registry.getHandler('nonexistent', 'onOff', 'toggle')).toBeUndefined()
    })

    it('should return undefined for non-existent cluster', () => {
      registry.registerHandler('endpoint1', 'onOff', 'toggle', vi.fn())

      expect(registry.getHandler('endpoint1', 'nonexistent', 'toggle')).toBeUndefined()
    })

    it('should return undefined for non-existent command', () => {
      registry.registerHandler('endpoint1', 'onOff', 'toggle', vi.fn())

      expect(registry.getHandler('endpoint1', 'onOff', 'nonexistent')).toBeUndefined()
    })

    it('should return registered handler', () => {
      const handler = vi.fn()
      registry.registerHandler('endpoint1', 'onOff', 'toggle', handler)

      expect(registry.getHandler('endpoint1', 'onOff', 'toggle')).toBe(handler)
    })
  })

  describe('executeHandler', () => {
    it('should execute handler with provided arguments', async () => {
      const handler = vi.fn()
      registry.registerHandler('endpoint1', 'onOff', 'moveToLevel', handler)

      const args = { level: 100, transitionTime: 200 }
      const result = await registry.executeHandler('endpoint1', 'onOff', 'moveToLevel', args)

      expect(handler).toHaveBeenCalledWith(args, undefined)
      expect(result).toBe(true)
    })

    it('should execute async handler', async () => {
      const handler = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      registry.registerHandler('endpoint1', 'onOff', 'toggle', handler)

      const result = await registry.executeHandler('endpoint1', 'onOff', 'toggle')

      expect(handler).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should throw when handler does not exist', async () => {
      await expect(registry.executeHandler('nonexistent', 'onOff', 'toggle'))
        .rejects
        .toThrow('No handler registered for nonexistent.onOff.toggle')
    })

    it('should log and rethrow errors from handlers', async () => {
      const error = new Error('Handler failed')
      const handler = vi.fn(() => {
        throw error
      })
      registry.registerHandler('endpoint1', 'onOff', 'toggle', handler)

      await expect(registry.executeHandler('endpoint1', 'onOff', 'toggle')).rejects.toThrow('Handler failed')
      // Error should be logged (with timestamps/prefixes added by Logger)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Handler error'))
    })

    it('should handle async handler errors', async () => {
      const error = new Error('Async handler failed')
      const handler = vi.fn(async () => {
        throw error
      })
      registry.registerHandler('endpoint1', 'onOff', 'toggle', handler)

      await expect(registry.executeHandler('endpoint1', 'onOff', 'toggle')).rejects.toThrow('Async handler failed')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('registerPartEndpoint', () => {
    it('should register part endpoint mapping', () => {
      registry.registerPartEndpoint('part-endpoint-1', 'parent-uuid', 'part1')

      expect(registry.getPartEndpointInfo('part-endpoint-1')).toEqual({
        parentUuid: 'parent-uuid',
        partId: 'part1',
      })
    })

    it('should register multiple part endpoints', () => {
      registry.registerPartEndpoint('part-endpoint-1', 'parent-uuid', 'part1')
      registry.registerPartEndpoint('part-endpoint-2', 'parent-uuid', 'part2')

      expect(registry.getPartEndpointInfo('part-endpoint-1')).toEqual({
        parentUuid: 'parent-uuid',
        partId: 'part1',
      })
      expect(registry.getPartEndpointInfo('part-endpoint-2')).toEqual({
        parentUuid: 'parent-uuid',
        partId: 'part2',
      })
    })
  })

  describe('getPartEndpointInfo', () => {
    it('should return undefined for non-existent part endpoint', () => {
      expect(registry.getPartEndpointInfo('nonexistent')).toBeUndefined()
    })

    it('should return part endpoint info', () => {
      registry.registerPartEndpoint('part-endpoint-1', 'parent-uuid', 'part1')

      expect(registry.getPartEndpointInfo('part-endpoint-1')).toEqual({
        parentUuid: 'parent-uuid',
        partId: 'part1',
      })
    })
  })

  describe('syncStateToCache', () => {
    it('should sync state to main accessory cluster', () => {
      const accessory: InternalMatterAccessory = {
        uuid: 'accessory-uuid',
        displayName: 'Test Accessory',
        clusters: {
          onOff: { onOff: false },
        },
      } as any

      accessoriesMap.set('accessory-uuid', accessory)

      registry.syncStateToCache('accessory-uuid', 'onOff', { onOff: true })

      expect(accessory.clusters!.onOff).toEqual({ onOff: true })
    })

    it('should create cluster if it does not exist on main accessory', () => {
      const accessory: InternalMatterAccessory = {
        uuid: 'accessory-uuid',
        displayName: 'Test Accessory',
        clusters: {},
      } as any

      accessoriesMap.set('accessory-uuid', accessory)

      registry.syncStateToCache('accessory-uuid', 'onOff', { onOff: true })

      expect(accessory.clusters!.onOff).toEqual({ onOff: true })
    })

    it('should merge attributes with existing cluster state', () => {
      const accessory: InternalMatterAccessory = {
        uuid: 'accessory-uuid',
        displayName: 'Test Accessory',
        clusters: {
          levelControl: { currentLevel: 100 },
        },
      } as any

      accessoriesMap.set('accessory-uuid', accessory)

      registry.syncStateToCache('accessory-uuid', 'levelControl', { minLevel: 0, maxLevel: 254 })

      expect(accessory.clusters!.levelControl).toEqual({
        currentLevel: 100,
        minLevel: 0,
        maxLevel: 254,
      })
    })

    it('should sync state to part accessory cluster', () => {
      const accessory: InternalMatterAccessory = {
        uuid: 'parent-uuid',
        displayName: 'Test Device',
        clusters: {},
        _parts: [
          {
            id: 'part1',
            clusters: {
              onOff: { onOff: false },
            },
          },
        ],
      } as any

      accessoriesMap.set('parent-uuid', accessory)
      registry.registerPartEndpoint('part-endpoint-1', 'parent-uuid', 'part1')

      registry.syncStateToCache('part-endpoint-1', 'onOff', { onOff: true })

      expect(accessory._parts![0].clusters.onOff).toEqual({ onOff: true })
    })

    it('should create cluster if it does not exist on part', () => {
      const accessory: InternalMatterAccessory = {
        uuid: 'parent-uuid',
        displayName: 'Test Device',
        clusters: {},
        _parts: [
          {
            id: 'part1',
            clusters: {},
          },
        ],
      } as any

      accessoriesMap.set('parent-uuid', accessory)
      registry.registerPartEndpoint('part-endpoint-1', 'parent-uuid', 'part1')

      registry.syncStateToCache('part-endpoint-1', 'onOff', { onOff: true })

      expect(accessory._parts![0].clusters.onOff).toEqual({ onOff: true })
    })

    it('should handle non-existent accessory gracefully', () => {
      registry.syncStateToCache('nonexistent', 'onOff', { onOff: true })

      // Should not throw, just silently fail
      expect(consoleDebugSpy).not.toHaveBeenCalled()
    })

    it('should handle accessory without clusters gracefully', () => {
      const accessory: InternalMatterAccessory = {
        uuid: 'accessory-uuid',
        displayName: 'Test Accessory',
      } as any

      accessoriesMap.set('accessory-uuid', accessory)

      registry.syncStateToCache('accessory-uuid', 'onOff', { onOff: true })

      // Should not throw, just silently fail
      expect(consoleDebugSpy).not.toHaveBeenCalled()
    })

    it('should handle part accessory without _parts gracefully', () => {
      const accessory: InternalMatterAccessory = {
        uuid: 'parent-uuid',
        displayName: 'Test Device',
        clusters: {},
      } as any

      accessoriesMap.set('parent-uuid', accessory)
      registry.registerPartEndpoint('part-endpoint-1', 'parent-uuid', 'part1')

      registry.syncStateToCache('part-endpoint-1', 'onOff', { onOff: true })

      // Should not throw, just silently fail
      expect(consoleDebugSpy).not.toHaveBeenCalled()
    })
  })

  describe('removeEndpoint', () => {
    it('drops handlers for the unregistered endpoint only', () => {
      registry.registerHandler('endpoint-A', 'onOff', 'on', vi.fn())
      registry.registerHandler('endpoint-A', 'levelControl', 'moveToLevel', vi.fn())
      registry.registerHandler('endpoint-B', 'onOff', 'on', vi.fn())

      registry.removeEndpoint('endpoint-A')

      expect(registry.getHandler('endpoint-A', 'onOff', 'on')).toBeUndefined()
      expect(registry.getHandler('endpoint-A', 'levelControl', 'moveToLevel')).toBeUndefined()
      expect(registry.getHandler('endpoint-B', 'onOff', 'on')).toBeDefined()
    })

    it('also drops handlers and mappings for child parts of the endpoint', () => {
      registry.registerHandler('parent-uuid', 'onOff', 'on', vi.fn())
      registry.registerPartEndpoint('parent-uuid-part-1', 'parent-uuid', 'outlet-1')
      registry.registerHandler('parent-uuid-part-1', 'onOff', 'on', vi.fn())
      registry.registerPartEndpoint('parent-uuid-part-2', 'parent-uuid', 'outlet-2')

      registry.removeEndpoint('parent-uuid')

      expect(registry.getHandler('parent-uuid', 'onOff', 'on')).toBeUndefined()
      expect(registry.getHandler('parent-uuid-part-1', 'onOff', 'on')).toBeUndefined()
      expect(registry.getPartEndpointInfo('parent-uuid-part-1')).toBeUndefined()
      expect(registry.getPartEndpointInfo('parent-uuid-part-2')).toBeUndefined()
    })

    it('leaves parts of unrelated parents alone', () => {
      registry.registerPartEndpoint('a-part-1', 'parent-A', 'p1')
      registry.registerPartEndpoint('b-part-1', 'parent-B', 'p1')
      registry.registerHandler('b-part-1', 'onOff', 'on', vi.fn())

      registry.removeEndpoint('parent-A')

      expect(registry.getPartEndpointInfo('a-part-1')).toBeUndefined()
      expect(registry.getPartEndpointInfo('b-part-1')).toBeDefined()
      expect(registry.getHandler('b-part-1', 'onOff', 'on')).toBeDefined()
    })

    it('is a no-op when the endpoint was never registered', () => {
      registry.registerHandler('alive', 'onOff', 'on', vi.fn())
      expect(() => registry.removeEndpoint('never-registered')).not.toThrow()
      expect(registry.getHandler('alive', 'onOff', 'on')).toBeDefined()
    })

    it('returns the endpoint id plus every swept part id (so callers can mirror cleanup)', () => {
      registry.registerHandler('parent-uuid', 'onOff', 'on', vi.fn())
      registry.registerPartEndpoint('parent-uuid-part-1', 'parent-uuid', 'outlet-1')
      registry.registerPartEndpoint('parent-uuid-part-2', 'parent-uuid', 'outlet-2')

      const removed = registry.removeEndpoint('parent-uuid')

      expect(removed).toContain('parent-uuid')
      expect(removed).toContain('parent-uuid-part-1')
      expect(removed).toContain('parent-uuid-part-2')
      // No duplicate of the endpoint id itself.
      expect(removed.filter(id => id === 'parent-uuid')).toHaveLength(1)
    })

    it('returns just the endpoint id when it has no parts', () => {
      registry.registerHandler('solo', 'onOff', 'on', vi.fn())
      expect(registry.removeEndpoint('solo')).toEqual(['solo'])
    })
  })

  describe('clear', () => {
    it('should clear all handlers and part endpoints', () => {
      registry.registerHandler('endpoint1', 'onOff', 'toggle', vi.fn())
      registry.registerPartEndpoint('part-endpoint-1', 'parent-uuid', 'part1')

      registry.clear()

      expect(registry.getHandler('endpoint1', 'onOff', 'toggle')).toBeUndefined()
      expect(registry.getPartEndpointInfo('part-endpoint-1')).toBeUndefined()
      expect(registry.getStats().handlerCount).toBe(0)
      expect(registry.getStats().partCount).toBe(0)
    })
  })

  describe('getStats', () => {
    it('should return zero counts for empty registry', () => {
      const stats = registry.getStats()

      expect(stats.handlerCount).toBe(0)
      expect(stats.partCount).toBe(0)
    })

    it('should count registered handlers', () => {
      registry.registerHandler('endpoint1', 'onOff', 'toggle', vi.fn())
      registry.registerHandler('endpoint1', 'onOff', 'on', vi.fn())
      registry.registerHandler('endpoint1', 'levelControl', 'moveToLevel', vi.fn())
      registry.registerHandler('endpoint2', 'onOff', 'toggle', vi.fn())

      const stats = registry.getStats()

      expect(stats.handlerCount).toBe(4)
    })

    it('should count registered part endpoints', () => {
      registry.registerPartEndpoint('part1', 'parent', 'part1')
      registry.registerPartEndpoint('part2', 'parent', 'part2')

      const stats = registry.getStats()

      expect(stats.partCount).toBe(2)
    })

    it('should count both handlers and part endpoints', () => {
      registry.registerHandler('endpoint1', 'onOff', 'toggle', vi.fn())
      registry.registerHandler('endpoint2', 'levelControl', 'moveToLevel', vi.fn())
      registry.registerPartEndpoint('part1', 'parent', 'part1')

      const stats = registry.getStats()

      expect(stats.handlerCount).toBe(2)
      expect(stats.partCount).toBe(1)
    })
  })
})
