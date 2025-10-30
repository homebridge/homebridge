import type { SerializedMatterAccessory } from './accessoryCache.js'
import type { InternalMatterAccessory } from './types.js'

import fs from 'fs-extra'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../logger.js'
import { MatterAccessoryCache } from './accessoryCache.js'

// Mock dependencies
vi.mock('fs-extra')
vi.mock('../logger.js', () => {
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }
  return {
    Logger: {
      withPrefix: vi.fn(() => mockLogger),
    },
  }
})

describe('matterAccessoryCache', () => {
  let cache: MatterAccessoryCache
  let logInfoSpy: any
  let logErrorSpy: any
  let logWarnSpy: any
  let logDebugSpy: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Get logger spies
    const logger = vi.mocked(Logger).withPrefix('test')
    logInfoSpy = logger.info
    logErrorSpy = logger.error
    logWarnSpy = logger.warn
    logDebugSpy = logger.debug

    // Create cache instance
    cache = new MatterAccessoryCache('/mock/storage', 'test-bridge')
  })

  describe('constructor', () => {
    it('should create cache with correct file path', () => {
      expect(cache).toBeDefined()
      // Path should be /mock/storage/test-bridge/accessories.json
    })
  })

  describe('load', () => {
    it('should return empty map on first run (file does not exist)', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(false)

      const result = await cache.load()

      expect(result.size).toBe(0)
      expect(logInfoSpy).toHaveBeenCalledWith('No cached Matter accessories found (first run)')
    })

    it('should load cached accessories from file', async () => {
      const mockData: SerializedMatterAccessory[] = [
        {
          plugin: 'homebridge-test',
          platform: 'TestPlatform',
          uuid: 'uuid-1',
          displayName: 'Test Device 1',
          deviceType: { name: 'OnOffLight', code: 256 },
          serialNumber: 'SN-001',
          manufacturer: 'Test Mfg',
          model: 'Test Model',
          clusters: { onOff: { onOff: false } },
        },
        {
          plugin: 'homebridge-test',
          platform: 'TestPlatform',
          uuid: 'uuid-2',
          displayName: 'Test Device 2',
          deviceType: { name: 'OnOffLight', code: 256 },
          serialNumber: 'SN-002',
          manufacturer: 'Test Mfg',
          model: 'Test Model',
          clusters: { onOff: { onOff: true } },
        },
      ]

      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.readJson) as any).mockResolvedValue(mockData)

      const result = await cache.load()

      expect(result.size).toBe(2)
      expect(result.get('uuid-1')).toEqual(mockData[0])
      expect(result.get('uuid-2')).toEqual(mockData[1])
      expect(logInfoSpy).toHaveBeenCalledWith('Loaded 2 cached Matter accessories')
    })

    it('should skip accessories without UUID', async () => {
      const mockData = [
        {
          plugin: 'homebridge-test',
          platform: 'TestPlatform',
          uuid: 'uuid-1',
          displayName: 'Valid',
          deviceType: {},
          serialNumber: 'SN-001',
          manufacturer: 'Test',
          model: 'Test',
        },
        {
          // Missing UUID
          plugin: 'homebridge-test',
          platform: 'TestPlatform',
          displayName: 'Invalid',
          deviceType: {},
          serialNumber: 'SN-002',
          manufacturer: 'Test',
          model: 'Test',
        },
      ]

      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.readJson) as any).mockResolvedValue(mockData)

      const result = await cache.load()

      expect(result.size).toBe(1)
      expect(result.has('uuid-1')).toBe(true)
    })

    it('should handle non-array cache data', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.readJson) as any).mockResolvedValue({ notAnArray: true })

      const result = await cache.load()

      expect(result.size).toBe(0)
      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load'))
      expect(logWarnSpy).toHaveBeenCalledWith('Deleting corrupted cache file and starting fresh')
      expect(fs.remove).toHaveBeenCalled()
    })

    it('should handle corrupted JSON file', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.readJson) as any).mockRejectedValue(new Error('Invalid JSON'))

      const result = await cache.load()

      expect(result.size).toBe(0)
      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load'))
      expect(logWarnSpy).toHaveBeenCalledWith('Deleting corrupted cache file and starting fresh')
      expect(fs.remove).toHaveBeenCalled()
    })

    it('should handle error when deleting corrupted file', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.readJson) as any).mockRejectedValue(new Error('Invalid JSON'))
      ;(vi.mocked(fs.remove) as any).mockRejectedValue(new Error('Cannot delete'))

      const result = await cache.load()

      expect(result.size).toBe(0)
      expect(logDebugSpy).toHaveBeenCalledWith('Could not delete corrupted cache file:', expect.anything())
    })

    it('should not load twice (cacheLoaded flag)', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(false)

      await cache.load()
      await cache.load() // second load

      // pathExists should only be called once
      expect(fs.pathExists).toHaveBeenCalledTimes(1)
    })
  })

  describe('requestSave', () => {
    it('should debounce multiple rapid save requests', async () => {
      vi.useFakeTimers()

      const accessories = new Map<string, InternalMatterAccessory>()
      const mockAccessory: InternalMatterAccessory = {
        uuid: 'test-uuid',
        displayName: 'Test',
        deviceType: { name: 'OnOffLight', code: 256 } as any,
        serialNumber: 'SN-001',
        manufacturer: 'Test',
        model: 'Test',
        clusters: {},
      } as any

      accessories.set('test-uuid', mockAccessory)

      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.writeJson) as any).mockResolvedValue(undefined)
      ;(vi.mocked(fs.move) as any).mockResolvedValue(undefined)

      // Request multiple saves rapidly
      cache.requestSave(accessories)
      cache.requestSave(accessories)
      cache.requestSave(accessories)

      // Fast-forward timers
      await vi.runAllTimersAsync()

      // Only one actual save should occur
      expect(fs.writeJson).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })

  describe('save', () => {
    it('should save accessories to cache', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.ensureDir) as any).mockResolvedValue(undefined)
      ;(vi.mocked(fs.writeJson) as any).mockResolvedValue(undefined)
      ;(vi.mocked(fs.move) as any).mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()
      const mockAccessory: InternalMatterAccessory = {
        _associatedPlugin: 'homebridge-test',
        _associatedPlatform: 'TestPlatform',
        uuid: 'test-uuid',
        displayName: 'Test Device',
        deviceType: { name: 'OnOffLight', code: 256 } as any,
        serialNumber: 'SN-001',
        manufacturer: 'Test Mfg',
        model: 'Test Model',
        firmwareRevision: '1.0.0',
        clusters: { onOff: { onOff: false } },
      } as any

      accessories.set('test-uuid', mockAccessory)

      await cache.save(accessories)

      expect(fs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.arrayContaining([
          expect.objectContaining({
            uuid: 'test-uuid',
            displayName: 'Test Device',
          }),
        ]),
        { spaces: 2 },
      )
      expect(fs.move).toHaveBeenCalled()
      expect(logDebugSpy).toHaveBeenCalledWith('Saved 1 Matter accessory to cache')
    })

    it('should serialize accessories with parts', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.writeJson) as any).mockResolvedValue(undefined)
      ;(vi.mocked(fs.move) as any).mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()
      const mockAccessory: InternalMatterAccessory = {
        _associatedPlugin: 'homebridge-test',
        _associatedPlatform: 'TestPlatform',
        uuid: 'test-uuid',
        displayName: 'Test Device',
        deviceType: { name: 'Aggregator', code: 14 } as any,
        serialNumber: 'SN-001',
        manufacturer: 'Test',
        model: 'Test',
        clusters: {},
        parts: [
          {
            id: 'part-1',
            displayName: 'Part 1',
            deviceType: { name: 'OnOffLight', code: 256 } as any,
            clusters: { onOff: { onOff: true } },
          },
        ],
      } as any

      accessories.set('test-uuid', mockAccessory)

      await cache.save(accessories)

      const savedData = vi.mocked(fs.writeJson).mock.calls[0][1] as SerializedMatterAccessory[]
      expect(savedData[0].parts).toBeDefined()
      expect(savedData[0].parts![0].id).toBe('part-1')
    })

    it('should ensure directory exists on first save', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.ensureDir) as any).mockResolvedValue(undefined)
      ;(vi.mocked(fs.writeJson) as any).mockResolvedValue(undefined)
      ;(vi.mocked(fs.move) as any).mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()

      await cache.save(accessories)

      expect(fs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('/mock/storage/test-bridge'))
      expect(logDebugSpy).toHaveBeenCalledWith(expect.stringContaining('Cache directory ensured'))
    })

    it('should throw error if directory creation fails', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(false) // directory doesn't exist after creation
      ;(vi.mocked(fs.ensureDir) as any).mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()

      await cache.save(accessories)

      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save'))
    })

    it('should use atomic write pattern (temp file then move)', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.writeJson) as any).mockResolvedValue(undefined)
      ;(vi.mocked(fs.move) as any).mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()

      await cache.save(accessories)

      // Should write to temp file first
      expect(fs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.anything(),
        expect.anything(),
      )

      // Then move temp file to final location
      expect(fs.move).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.stringContaining('accessories.json'),
        { overwrite: true },
      )
    })

    it('should clean up temp file on write error', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      vi.mocked(fs.writeJson).mockRejectedValue(new Error('Write failed'))

      const accessories = new Map<string, InternalMatterAccessory>()

      await cache.save(accessories)

      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save'))
      expect(fs.pathExists).toHaveBeenCalled()
    })

    it('should handle cleanup error gracefully', async () => {
      ;(vi.mocked(fs.pathExists) as any)
        .mockResolvedValueOnce(true) // directory exists
        .mockResolvedValueOnce(true) // temp file exists for cleanup
      ;(vi.mocked(fs.writeJson) as any).mockRejectedValue(new Error('Write failed'))
      ;(vi.mocked(fs.remove) as any).mockRejectedValue(new Error('Remove failed'))

      const accessories = new Map<string, InternalMatterAccessory>()

      await cache.save(accessories)

      expect(logDebugSpy).toHaveBeenCalledWith('Could not clean up temporary cache file:', expect.anything())
    })

    it('should serialize multiple accessories', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.writeJson) as any).mockResolvedValue(undefined)
      ;(vi.mocked(fs.move) as any).mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()
      for (let i = 1; i <= 3; i++) {
        accessories.set(`uuid-${i}`, {
          uuid: `uuid-${i}`,
          displayName: `Device ${i}`,
          deviceType: { name: 'OnOffLight', code: 256 } as any,
          serialNumber: `SN-00${i}`,
          manufacturer: 'Test',
          model: 'Test',
          clusters: {},
        } as any)
      }

      await cache.save(accessories)

      const savedData = vi.mocked(fs.writeJson).mock.calls[0][1] as SerializedMatterAccessory[]
      expect(savedData).toHaveLength(3)
      expect(logDebugSpy).toHaveBeenCalledWith('Saved 3 Matter accessories to cache')
    })

    it('should queue concurrent saves to prevent race conditions', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.writeJson) as any).mockResolvedValue(undefined)
      ;(vi.mocked(fs.move) as any).mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()

      // Start multiple saves concurrently
      await Promise.all([
        cache.save(accessories),
        cache.save(accessories),
        cache.save(accessories),
      ])

      // All saves should complete (queued sequentially)
      expect(fs.writeJson).toHaveBeenCalled()
    })
  })

  describe('getCached', () => {
    it('should return cached accessory by UUID', async () => {
      const mockData: SerializedMatterAccessory[] = [
        {
          plugin: 'homebridge-test',
          platform: 'TestPlatform',
          uuid: 'uuid-1',
          displayName: 'Test Device',
          deviceType: { name: 'OnOffLight', code: 256 },
          serialNumber: 'SN-001',
          manufacturer: 'Test',
          model: 'Test',
        },
      ]

      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.readJson) as any).mockResolvedValue(mockData)

      await cache.load()

      const result = cache.getCached('uuid-1')
      expect(result).toEqual(mockData[0])
    })

    it('should return undefined for non-existent UUID', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(false)
      await cache.load()

      const result = cache.getCached('non-existent')
      expect(result).toBeUndefined()
    })
  })

  describe('hasCached', () => {
    it('should return true for cached accessory', async () => {
      const mockData: SerializedMatterAccessory[] = [
        {
          plugin: 'homebridge-test',
          platform: 'TestPlatform',
          uuid: 'uuid-1',
          displayName: 'Test',
          deviceType: {},
          serialNumber: 'SN-001',
          manufacturer: 'Test',
          model: 'Test',
        },
      ]

      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.readJson) as any).mockResolvedValue(mockData)

      await cache.load()

      expect(cache.hasCached('uuid-1')).toBe(true)
    })

    it('should return false for non-existent accessory', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(false)
      await cache.load()

      expect(cache.hasCached('non-existent')).toBe(false)
    })
  })

  describe('removeCached', () => {
    it('should remove accessory from cache', async () => {
      const mockData: SerializedMatterAccessory[] = [
        {
          plugin: 'homebridge-test',
          platform: 'TestPlatform',
          uuid: 'uuid-1',
          displayName: 'Test',
          deviceType: {},
          serialNumber: 'SN-001',
          manufacturer: 'Test',
          model: 'Test',
        },
      ]

      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.readJson) as any).mockResolvedValue(mockData)

      await cache.load()

      expect(cache.hasCached('uuid-1')).toBe(true)
      cache.removeCached('uuid-1')
      expect(cache.hasCached('uuid-1')).toBe(false)
    })
  })

  describe('getAllCached', () => {
    it('should return all cached accessories', async () => {
      const mockData: SerializedMatterAccessory[] = [
        {
          plugin: 'homebridge-test',
          platform: 'TestPlatform',
          uuid: 'uuid-1',
          displayName: 'Device 1',
          deviceType: {},
          serialNumber: 'SN-001',
          manufacturer: 'Test',
          model: 'Test',
        },
        {
          plugin: 'homebridge-test',
          platform: 'TestPlatform',
          uuid: 'uuid-2',
          displayName: 'Device 2',
          deviceType: {},
          serialNumber: 'SN-002',
          manufacturer: 'Test',
          model: 'Test',
        },
      ]

      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(true)
      ;(vi.mocked(fs.readJson) as any).mockResolvedValue(mockData)

      await cache.load()

      const all = cache.getAllCached()
      expect(all.size).toBe(2)
      expect(all.get('uuid-1')).toEqual(mockData[0])
      expect(all.get('uuid-2')).toEqual(mockData[1])
    })

    it('should return a copy of the cache (not reference)', async () => {
      ;(vi.mocked(fs.pathExists) as any).mockResolvedValue(false)
      await cache.load()

      const all = cache.getAllCached()
      all.set('test-uuid', {} as any)

      // Original cache should not be modified
      expect(cache.hasCached('test-uuid')).toBe(false)
    })
  })
})
