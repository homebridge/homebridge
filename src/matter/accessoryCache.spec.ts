import type { SerializedMatterAccessory } from './accessoryCache.js'
import type { InternalMatterAccessory } from './types.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from '../logger.js'
import { MatterAccessoryCache } from './accessoryCache.js'

// Mock dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
}))
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

// Import mocked fs functions
const { readFile, writeFile, rename, mkdir, rm } = await import('node:fs/promises')
const mockedReadFile = vi.mocked(readFile)
const mockedWriteFile = vi.mocked(writeFile)
const mockedRename = vi.mocked(rename)
const mockedMkdir = vi.mocked(mkdir)
const mockedRm = vi.mocked(rm)

describe('matterAccessoryCache', () => {
  let cache: MatterAccessoryCache
  let logInfoSpy: any
  let logErrorSpy: any
  let logWarnSpy: any
  let logDebugSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockedReadFile.mockReset()

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
      mockedReadFile.mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' }))

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
          context: {},
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
          context: {},
        },
      ]

      mockedReadFile.mockResolvedValue(JSON.stringify(mockData) as any)

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

      mockedReadFile.mockResolvedValue(JSON.stringify(mockData) as any)

      const result = await cache.load()

      expect(result.size).toBe(1)
      expect(result.has('uuid-1')).toBe(true)
    })

    it.each(['EACCES', 'EIO', 'EMFILE'])('preserves the cache on a %s read failure', async (code) => {
      mockedReadFile.mockRejectedValueOnce(Object.assign(new Error('Read failed'), { code }))

      const result = await cache.load()

      expect(result.size).toBe(0)
      expect(mockedRm).not.toHaveBeenCalled()
      expect(logWarnSpy).not.toHaveBeenCalledWith('Deleting corrupted cache file and starting fresh')
      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Read failed'))
    })

    it('does not overwrite an unread cache through immediate or debounced saves', async () => {
      vi.useFakeTimers()
      try {
        mockedReadFile.mockRejectedValueOnce(Object.assign(new Error('Read failed'), { code: 'EIO' }))
        await cache.load()

        await cache.save(new Map())
        cache.requestSave(new Map())
        await vi.runAllTimersAsync()

        expect(mockedWriteFile).not.toHaveBeenCalled()
        expect(mockedRename).not.toHaveBeenCalled()
        expect(mockedRm).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('retries a failed read and allows saves after successfully loading', async () => {
      const cached = { uuid: 'restored-uuid', context: { deviceId: 'keep-me' } }
      mockedReadFile
        .mockRejectedValueOnce(Object.assign(new Error('Read failed'), { code: 'EIO' }))
        .mockResolvedValueOnce(JSON.stringify([cached]))
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

      await cache.load()
      const result = await cache.load()
      await cache.save(new Map())

      expect(mockedReadFile).toHaveBeenCalledTimes(2)
      expect(result.get(cached.uuid)).toEqual(cached)
      expect(mockedWriteFile).toHaveBeenCalledTimes(1)
      expect(mockedRename).toHaveBeenCalledTimes(1)
      expect(mockedRm).not.toHaveBeenCalled()
    })

    it('allows first-run saves if an unread cache is removed before retrying', async () => {
      mockedReadFile
        .mockRejectedValueOnce(Object.assign(new Error('Read failed'), { code: 'EIO' }))
        .mockRejectedValueOnce(Object.assign(new Error('File not found'), { code: 'ENOENT' }))
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

      await cache.load()
      const result = await cache.load()
      await cache.save(new Map())

      expect(result.size).toBe(0)
      expect(mockedWriteFile).toHaveBeenCalledTimes(1)
      expect(mockedRename).toHaveBeenCalledTimes(1)
    })

    it.each([0, 1, 2])('preserves valid entries around a null at index %i without deleting the file', async (index) => {
      const valid = [
        { uuid: 'uuid-1', context: { retained: 1 } },
        { uuid: 'uuid-2', context: { retained: 2 } },
      ]
      const entries: unknown[] = [...valid]
      entries.splice(index, 0, null)
      mockedReadFile.mockResolvedValue(JSON.stringify(entries))

      const result = await cache.load()

      expect([...result.values()]).toEqual(valid)
      expect(mockedRm).not.toHaveBeenCalled()
      expect(logErrorSpy).not.toHaveBeenCalled()
      expect(await cache.load()).toBe(result)
      expect(mockedReadFile).toHaveBeenCalledTimes(1)
    })

    it('skips malformed entries and non-string UUIDs in a parseable array', async () => {
      const valid = { uuid: 'uuid-valid', context: { retained: true } }
      mockedReadFile.mockResolvedValue(JSON.stringify([
        false, 42, 'entry', [], {}, { uuid: '' }, { uuid: 42 }, { uuid: {} }, valid,
      ]))

      const result = await cache.load()

      expect([...result.entries()]).toEqual([['uuid-valid', valid]])
      expect(mockedRm).not.toHaveBeenCalled()
    })

    it('should handle non-array cache data', async () => {
      mockedReadFile.mockResolvedValue(JSON.stringify({ notAnArray: true }) as any)

      const result = await cache.load()

      expect(result.size).toBe(0)
      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load'))
      expect(logWarnSpy).toHaveBeenCalledWith('Deleting corrupted cache file and starting fresh')
      expect(mockedRm).toHaveBeenCalled()
    })

    it('should handle corrupted JSON file', async () => {
      mockedReadFile.mockResolvedValue('not valid json{{{' as any)

      const result = await cache.load()

      expect(result.size).toBe(0)
      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load'))
      expect(logWarnSpy).toHaveBeenCalledWith('Deleting corrupted cache file and starting fresh')
      expect(mockedRm).toHaveBeenCalled()
    })

    it('should handle error when deleting corrupted file', async () => {
      mockedReadFile.mockResolvedValue('invalid json' as any)
      mockedRm.mockRejectedValue(new Error('Cannot delete'))

      const result = await cache.load()

      expect(result.size).toBe(0)
      expect(logDebugSpy).toHaveBeenCalledWith('Could not delete corrupted cache file:', expect.anything())
    })

    it('should not load twice (cacheLoaded flag)', async () => {
      mockedReadFile.mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' }))

      await cache.load()
      await cache.load() // second load

      // readFile should only be called once
      expect(mockedReadFile).toHaveBeenCalledTimes(1)
    })
  })

  describe('requestSave', () => {
    it('should debounce multiple rapid save requests', async () => {
      vi.useFakeTimers()

      const accessories = new Map<string, InternalMatterAccessory>()
      const mockAccessory: InternalMatterAccessory = {
        UUID: 'test-uuid',
        displayName: 'Test',
        deviceType: { name: 'OnOffLight', code: 256 } as any,
        serialNumber: 'SN-001',
        manufacturer: 'Test',
        model: 'Test',
        clusters: {},
      } as any

      accessories.set('test-uuid', mockAccessory)

      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

      // Request multiple saves rapidly
      cache.requestSave(accessories)
      cache.requestSave(accessories)
      cache.requestSave(accessories)

      // Fast-forward timers
      await vi.runAllTimersAsync()

      // Only one actual save should occur
      expect(mockedWriteFile).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })

  describe('cancelPendingSave', () => {
    it('stops an armed debounced save from ever firing', async () => {
      vi.useFakeTimers()

      const accessories = new Map<string, InternalMatterAccessory>()
      accessories.set('test-uuid', {
        UUID: 'test-uuid',
        displayName: 'Test',
        deviceType: { name: 'OnOffLight', code: 256 } as any,
        serialNumber: 'SN-001',
        manufacturer: 'Test',
        model: 'Test',
        clusters: {},
      } as any)

      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

      cache.requestSave(accessories)

      // Cancelling reports that a save was armed, then a second call is a no-op.
      expect(cache.cancelPendingSave()).toBe(true)
      expect(cache.cancelPendingSave()).toBe(false)

      // Even after the debounce window elapses, no write happens — so a map
      // cleared after cancelling can never be persisted as an empty cache.
      await vi.runAllTimersAsync()
      expect(mockedWriteFile).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('returns false when no save is armed', () => {
      expect(cache.cancelPendingSave()).toBe(false)
    })
  })

  describe('save', () => {
    it('should save accessories to cache', async () => {
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()
      const mockAccessory: InternalMatterAccessory = {
        _associatedPlugin: 'homebridge-test',
        _associatedPlatform: 'TestPlatform',
        UUID: 'test-uuid',
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

      expect(mockedWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.stringContaining('"uuid": "test-uuid"'),
        'utf-8',
      )
      expect(mockedRename).toHaveBeenCalled()
      expect(logDebugSpy).toHaveBeenCalledWith('Saved 1 Matter accessory to cache')
    })

    it('should serialize accessories with parts', async () => {
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()
      const mockAccessory: InternalMatterAccessory = {
        _associatedPlugin: 'homebridge-test',
        _associatedPlatform: 'TestPlatform',
        UUID: 'test-uuid',
        displayName: 'Test Device',
        deviceType: { name: 'Aggregator', code: 14 } as any,
        features: { rvcCleanMode: { directModeChange: true } },
        serialNumber: 'SN-001',
        manufacturer: 'Test',
        model: 'Test',
        clusters: {},
        parts: [
          {
            id: 'part-1',
            displayName: 'Part 1',
            deviceType: { name: 'OnOffLight', code: 256 } as any,
            features: { rvcCleanMode: { directModeChange: true } },
            clusters: { onOff: { onOff: true } },
          },
        ],
      } as any

      accessories.set('test-uuid', mockAccessory)

      await cache.save(accessories)

      const savedJson = mockedWriteFile.mock.calls[0][1] as string
      const savedData = JSON.parse(savedJson) as SerializedMatterAccessory[]
      expect(savedData[0].features).toEqual({
        rvcCleanMode: { directModeChange: true },
      })
      expect(savedData[0].parts).toBeDefined()
      expect(savedData[0].parts![0].id).toBe('part-1')
      expect(savedData[0].parts![0].features).toEqual({
        rvcCleanMode: { directModeChange: true },
      })
    })

    it('should ensure directory exists on first save', async () => {
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()

      await cache.save(accessories)

      expect(mockedMkdir).toHaveBeenCalledWith(
        expect.stringContaining('/mock/storage/test-bridge'),
        { recursive: true },
      )
      expect(logDebugSpy).toHaveBeenCalledWith(expect.stringContaining('Cache directory ensured'))
    })

    it('should handle write error gracefully', async () => {
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockRejectedValue(new Error('Write failed'))
      mockedRm.mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()

      await expect(cache.save(accessories)).rejects.toThrow('Write failed')

      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save'))
    })

    it('should use atomic write pattern (temp file then rename)', async () => {
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()

      await cache.save(accessories)

      // Should write to temp file first
      expect(mockedWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.anything(),
        'utf-8',
      )

      // Then rename temp file to final location
      expect(mockedRename).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.stringContaining('accessories.json'),
      )
    })

    it('should clean up temp file on write error', async () => {
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockRejectedValue(new Error('Write failed'))
      mockedRm.mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()

      await expect(cache.save(accessories)).rejects.toThrow('Write failed')

      expect(logErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save'))
      expect(mockedRm).toHaveBeenCalledWith(expect.stringContaining('.tmp'), { force: true })
    })

    it('should handle cleanup error gracefully', async () => {
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockRejectedValue(new Error('Write failed'))
      mockedRm.mockRejectedValue(new Error('Remove failed'))

      const accessories = new Map<string, InternalMatterAccessory>()

      await expect(cache.save(accessories)).rejects.toThrow('Write failed')

      expect(logDebugSpy).toHaveBeenCalledWith('Could not clean up temporary cache file:', expect.anything())
    })

    it.each(['mkdir', 'write', 'rename'])('rejects a failed %s and lets the next queued save succeed', async (operation) => {
      const failure = new Error(`${operation} failed`)
      mockedMkdir.mockResolvedValue(undefined)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)
      mockedRm.mockResolvedValue(undefined)
      const failingOperation = operation === 'mkdir' ? mockedMkdir : operation === 'write' ? mockedWriteFile : mockedRename
      failingOperation.mockRejectedValueOnce(failure)
      const accessories = new Map<string, InternalMatterAccessory>()

      const outcomes = await Promise.allSettled([cache.save(accessories), cache.save(accessories)])

      expect(outcomes).toEqual([{ status: 'rejected', reason: failure }, { status: 'fulfilled', value: undefined }])
      expect(mockedRename).toHaveBeenCalledWith(expect.stringContaining('.tmp'), expect.stringContaining('accessories.json'))
      expect(logDebugSpy.mock.calls.filter((call: string[]) => call[0] === 'Saved 0 Matter accessories to cache')).toHaveLength(1)
    })

    it('reports a debounced save failure and permits a later retry', async () => {
      vi.useFakeTimers()
      try {
        const failure = new Error('disk full')
        mockedMkdir.mockResolvedValue(undefined)
        mockedWriteFile.mockReset().mockRejectedValueOnce(failure).mockResolvedValue(undefined)
        mockedRename.mockResolvedValue(undefined)
        mockedRm.mockResolvedValue(undefined)
        const accessories = new Map<string, InternalMatterAccessory>()
        cache.requestSave(accessories)
        await vi.runAllTimersAsync()
        expect(logErrorSpy).toHaveBeenCalledWith('Debounced cache save failed:', failure)
        await expect(cache.save(accessories)).resolves.toBeUndefined()
        expect(mockedRename).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('should serialize multiple accessories', async () => {
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

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

      const savedJson = mockedWriteFile.mock.calls[0][1] as string
      const savedData = JSON.parse(savedJson) as SerializedMatterAccessory[]
      expect(savedData).toHaveLength(3)
      expect(logDebugSpy).toHaveBeenCalledWith('Saved 3 Matter accessories to cache')
    })

    it('should queue concurrent saves to prevent race conditions', async () => {
      mockedMkdir.mockResolvedValue(undefined as any)
      mockedWriteFile.mockResolvedValue(undefined)
      mockedRename.mockResolvedValue(undefined)

      const accessories = new Map<string, InternalMatterAccessory>()

      // Start multiple saves concurrently
      await Promise.all([
        cache.save(accessories),
        cache.save(accessories),
        cache.save(accessories),
      ])

      // All saves should complete (queued sequentially)
      expect(mockedWriteFile).toHaveBeenCalled()
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
          context: {},
        },
      ]

      mockedReadFile.mockResolvedValue(JSON.stringify(mockData) as any)

      await cache.load()

      const result = cache.getCached('uuid-1')
      expect(result).toEqual(mockData[0])
    })

    it('should return undefined for non-existent UUID', async () => {
      mockedReadFile.mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' }))
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
          context: {},
        },
      ]

      mockedReadFile.mockResolvedValue(JSON.stringify(mockData) as any)

      await cache.load()

      expect(cache.hasCached('uuid-1')).toBe(true)
    })

    it('should return false for non-existent accessory', async () => {
      mockedReadFile.mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' }))
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
          context: {},
        },
      ]

      mockedReadFile.mockResolvedValue(JSON.stringify(mockData) as any)

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
          context: {},
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
          context: {},
        },
      ]

      mockedReadFile.mockResolvedValue(JSON.stringify(mockData) as any)

      await cache.load()

      const all = cache.getAllCached()
      expect(all.length).toBe(2)
      expect(all.find(a => a.uuid === 'uuid-1')).toEqual(mockData[0])
      expect(all.find(a => a.uuid === 'uuid-2')).toEqual(mockData[1])
    })

    it('should return a fresh array on each call (mutating it does not affect the cache)', async () => {
      mockedReadFile.mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' }))
      await cache.load()

      const all = cache.getAllCached()
      all.push({ uuid: 'test-uuid' } as any)

      // Mutating the returned array must not change cache contents
      expect(cache.hasCached('test-uuid')).toBe(false)
      expect(cache.getAllCached().length).toBe(0)
    })
  })
})
