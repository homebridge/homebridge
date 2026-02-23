import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { Logger } from '../logger.js'
import { HomebridgeMatterStorage, MatterStorageManager } from './storage.js'

// Mock dependencies
vi.mock('node:fs')
vi.mock('node:fs/promises')
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

describe('homebridgeMatterStorage', () => {
  let storage: HomebridgeMatterStorage
  let logDebugSpy: any
  let logWarnSpy: any
  let logErrorSpy: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Get logger spies
    const logger = vi.mocked(Logger).withPrefix('')
    logDebugSpy = logger.debug
    logWarnSpy = logger.warn
    logErrorSpy = logger.error

    // Mock readFileSync to return file not found by default
    vi.mocked(readFileSync).mockImplementation(() => {
      const error: any = new Error('ENOENT: no such file or directory')
      error.code = 'ENOENT'
      throw error
    })
  })

  describe('constructor and initializeSync', () => {
    it('should create storage with namespace', () => {
      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')
      expect(storage).toBeDefined()
    })

    it('should log when no existing storage file found', () => {
      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')
      expect(logDebugSpy).toHaveBeenCalledWith('No existing storage for namespace: test-namespace')
    })

    it('should load existing storage from file', () => {
      const mockData = {
        key1: 'value1',
        key2: 42,
      }

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')

      expect(storage.get([], 'key1')).toBe('value1')
      expect(storage.get([], 'key2')).toBe(42)
      expect(logDebugSpy).toHaveBeenCalledWith('Loaded 2 entries for namespace: test-namespace')
    })

    it('should handle invalid JSON data', () => {
      vi.mocked(readFileSync).mockReturnValue('{ invalid json }')

      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')

      expect(logWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load storage'))
    })

    it('should handle array data (arrays are valid objects in JS)', () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(['array', 'data']))

      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')

      // Arrays pass typeof check (typeof [] === 'object'), but Map constructor won't work with array
      // Storage should be initialized even with unexpected data structure
      expect(storage).toBeDefined()
    })

    it('should handle null data', () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(null))

      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')

      expect(logWarnSpy).toHaveBeenCalledWith('Invalid storage data for test-namespace, starting fresh')
    })

    it('should deserialize BigInt values from storage', () => {
      const mockData = {
        bigIntValue: { __type: 'bigint', value: '123456789012345678901234567890' },
      }

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')

      const value = storage.get([], 'bigIntValue')
      expect(typeof value).toBe('bigint')
      expect(value).toBe(BigInt('123456789012345678901234567890'))
    })

    it('should deserialize Uint8Array values from storage', () => {
      const mockData = {
        uint8ArrayValue: { __type: 'Uint8Array', value: [1, 2, 3, 4, 5] },
      }

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')

      const value = storage.get([], 'uint8ArrayValue')
      expect(value).toBeInstanceOf(Uint8Array)
      expect(Array.from(value as Uint8Array)).toEqual([1, 2, 3, 4, 5])
    })

    it('should deserialize Buffer values from storage', () => {
      const mockData = {
        bufferValue: { type: 'Buffer', data: [10, 20, 30] },
      }

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')

      const value = storage.get([], 'bufferValue')
      expect(value).toBeInstanceOf(Uint8Array)
      expect(Array.from(value as Uint8Array)).toEqual([10, 20, 30])
    })

    it('should deserialize nested objects recursively', () => {
      const mockData = {
        nested: {
          bigInt: { __type: 'bigint', value: '123' },
          uint8: { __type: 'Uint8Array', value: [1, 2] },
          deep: {
            buffer: { type: 'Buffer', data: [3, 4] },
          },
        },
      }

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')

      const value: any = storage.get([], 'nested')
      expect(typeof value.bigInt).toBe('bigint')
      expect(value.uint8).toBeInstanceOf(Uint8Array)
      expect(value.deep.buffer).toBeInstanceOf(Uint8Array)
    })

    it('should deserialize arrays recursively', () => {
      const mockData = {
        array: [
          { __type: 'bigint', value: '1' },
          { __type: 'Uint8Array', value: [1, 2] },
          'normal value',
        ],
      }

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData))

      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')

      const value: any = storage.get([], 'array')
      expect(typeof value[0]).toBe('bigint')
      expect(value[1]).toBeInstanceOf(Uint8Array)
      expect(value[2]).toBe('normal value')
    })
  })

  describe('get', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
    })

    it('should get value without context', () => {
      storage.set([], 'key1', 'value1')
      expect(storage.get([], 'key1')).toBe('value1')
    })

    it('should get value with context', () => {
      storage.set(['context1'], 'key1', 'value1')
      expect(storage.get(['context1'], 'key1')).toBe('value1')
    })

    it('should get value with nested context', () => {
      storage.set(['context1', 'context2'], 'key1', 'value1')
      expect(storage.get(['context1', 'context2'], 'key1')).toBe('value1')
    })

    it('should return undefined for non-existent key', () => {
      expect(storage.get([], 'nonexistent')).toBeUndefined()
    })

    it('should return undefined for wrong context', () => {
      storage.set(['context1'], 'key1', 'value1')
      expect(storage.get(['context2'], 'key1')).toBeUndefined()
    })
  })

  describe('set', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)
    })

    it('should set single value', () => {
      storage.set([], 'key1', 'value1')
      expect(storage.get([], 'key1')).toBe('value1')
    })

    it('should set value with context', () => {
      storage.set(['context1'], 'key1', 'value1')
      expect(storage.get(['context1'], 'key1')).toBe('value1')
    })

    it('should set multiple values via object', () => {
      storage.set([], { key1: 'value1', key2: 'value2' })
      expect(storage.get([], 'key1')).toBe('value1')
      expect(storage.get([], 'key2')).toBe('value2')
    })

    it('should set multiple values with context', () => {
      storage.set(['context1'], { key1: 'value1', key2: 'value2' })
      expect(storage.get(['context1'], 'key1')).toBe('value1')
      expect(storage.get(['context1'], 'key2')).toBe('value2')
    })

    it('should overwrite existing value', () => {
      storage.set([], 'key1', 'value1')
      storage.set([], 'key1', 'value2')
      expect(storage.get([], 'key1')).toBe('value2')
    })

    it('should schedule persist on set', async () => {
      storage.set([], 'key1', 'value1')
      // Persist is debounced for non-critical data
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(mkdir).toHaveBeenCalled()
    })

    it('should immediately persist critical fabric data', async () => {
      storage.set(['fabric'], 'key1', 'value1')
      // Small delay to allow async persist
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(mkdir).toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)
    })

    it('should delete value', () => {
      storage.set([], 'key1', 'value1')
      storage.delete([], 'key1')
      expect(storage.get([], 'key1')).toBeUndefined()
    })

    it('should delete value with context', () => {
      storage.set(['context1'], 'key1', 'value1')
      storage.delete(['context1'], 'key1')
      expect(storage.get(['context1'], 'key1')).toBeUndefined()
    })

    it('should only schedule persist if key exists', () => {
      storage.set([], 'key1', 'value1')
      const hasKey = storage.has([], 'key1')
      expect(hasKey).toBe(true)
      storage.delete([], 'key1')
      expect(storage.has([], 'key1')).toBe(false)
    })
  })

  describe('clearAll', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)
    })

    it('should clear all keys in root context', () => {
      storage.set([], 'key1', 'value1')
      storage.set([], 'key2', 'value2')
      storage.set(['context1'], 'key3', 'value3')

      storage.clearAll([])

      expect(storage.get([], 'key1')).toBeUndefined()
      expect(storage.get([], 'key2')).toBeUndefined()
      expect(storage.get(['context1'], 'key3')).toBeUndefined()
    })

    it('should clear all keys in specific context', () => {
      storage.set(['context1'], 'key1', 'value1')
      storage.set(['context1'], 'key2', 'value2')
      storage.set(['context2'], 'key3', 'value3')

      storage.clearAll(['context1'])

      expect(storage.get(['context1'], 'key1')).toBeUndefined()
      expect(storage.get(['context1'], 'key2')).toBeUndefined()
      expect(storage.get(['context2'], 'key3')).toBe('value3')
    })

    it('should clear nested contexts', () => {
      storage.set(['context1', 'sub'], 'key1', 'value1')
      storage.set(['context1'], 'key2', 'value2')

      storage.clearAll(['context1'])

      expect(storage.get(['context1', 'sub'], 'key1')).toBeUndefined()
      expect(storage.get(['context1'], 'key2')).toBeUndefined()
    })

    it('should handle clearing non-existent context', () => {
      const initialSize = storage.getStats().entries
      storage.clearAll(['nonexistent'])
      expect(storage.getStats().entries).toBe(initialSize)
    })
  })

  describe('keys', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
    })

    it('should return root level keys', () => {
      storage.set([], 'key1', 'value1')
      storage.set([], 'key2', 'value2')
      storage.set(['context1'], 'key3', 'value3')

      const keys = storage.keys([])
      expect(keys).toContain('key1')
      expect(keys).toContain('key2')
      expect(keys).not.toContain('key3')
    })

    it('should return keys in specific context', () => {
      storage.set(['context1'], 'key1', 'value1')
      storage.set(['context1'], 'key2', 'value2')
      storage.set(['context2'], 'key3', 'value3')

      const keys = storage.keys(['context1'])
      expect(keys).toContain('key1')
      expect(keys).toContain('key2')
      expect(keys).not.toContain('key3')
    })

    it('should not include nested context keys', () => {
      storage.set(['context1'], 'key1', 'value1')
      storage.set(['context1', 'sub'], 'key2', 'value2')

      const keys = storage.keys(['context1'])
      expect(keys).toContain('key1')
      expect(keys).not.toContain('key2')
    })

    it('should return empty array for non-existent context', () => {
      const keys = storage.keys(['nonexistent'])
      expect(keys).toEqual([])
    })
  })

  describe('contexts', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
    })

    it('should return root level contexts', () => {
      storage.set(['context1'], 'key1', 'value1')
      storage.set(['context2'], 'key2', 'value2')
      storage.set([], 'key3', 'value3')

      const contexts = storage.contexts([])
      expect(contexts).toContain('context1')
      expect(contexts).toContain('context2')
    })

    it('should return sub-contexts', () => {
      storage.set(['context1', 'sub1'], 'key1', 'value1')
      storage.set(['context1', 'sub2'], 'key2', 'value2')

      const contexts = storage.contexts(['context1'])
      expect(contexts).toContain('sub1')
      expect(contexts).toContain('sub2')
    })

    it('should not include contexts from different parent', () => {
      storage.set(['context1', 'sub1'], 'key1', 'value1')
      storage.set(['context2', 'sub2'], 'key2', 'value2')

      const contexts = storage.contexts(['context1'])
      expect(contexts).toContain('sub1')
      expect(contexts).not.toContain('sub2')
    })

    it('should return empty array if no sub-contexts', () => {
      storage.set(['context1'], 'key1', 'value1')

      const contexts = storage.contexts(['context1'])
      expect(contexts).toEqual([])
    })

    it('should not duplicate context names', () => {
      storage.set(['context1', 'sub'], 'key1', 'value1')
      storage.set(['context1', 'sub'], 'key2', 'value2')

      const contexts = storage.contexts(['context1'])
      expect(contexts.filter(c => c === 'sub')).toHaveLength(1)
    })
  })

  describe('has', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
    })

    it('should return true for existing key', () => {
      storage.set([], 'key1', 'value1')
      expect(storage.has([], 'key1')).toBe(true)
    })

    it('should return false for non-existent key', () => {
      expect(storage.has([], 'nonexistent')).toBe(false)
    })

    it('should check context correctly', () => {
      storage.set(['context1'], 'key1', 'value1')
      expect(storage.has(['context1'], 'key1')).toBe(true)
      expect(storage.has(['context2'], 'key1')).toBe(false)
    })
  })

  describe('values', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
    })

    it('should return all values in root context', async () => {
      storage.set([], 'key1', 'value1')
      storage.set([], 'key2', 'value2')
      storage.set(['context1'], 'key3', 'value3')

      const values = await storage.values([])
      expect(values.key1).toBe('value1')
      expect(values.key2).toBe('value2')
      expect(values.key3).toBeUndefined()
    })

    it('should return all values in specific context', async () => {
      storage.set(['context1'], 'key1', 'value1')
      storage.set(['context1'], 'key2', 'value2')
      storage.set(['context2'], 'key3', 'value3')

      const values = await storage.values(['context1'])
      expect(values.key1).toBe('value1')
      expect(values.key2).toBe('value2')
      expect(values.key3).toBeUndefined()
    })

    it('should not include nested context values', async () => {
      storage.set(['context1'], 'key1', 'value1')
      storage.set(['context1', 'sub'], 'key2', 'value2')

      const values = await storage.values(['context1'])
      expect(values.key1).toBe('value1')
      expect(values.key2).toBeUndefined()
    })
  })

  describe('persist', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)
    })

    it('should serialize BigInt values correctly', async () => {
      storage.set([], 'bigInt', BigInt('123456789'))
      await storage.forcePersist()

      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const jsonString = writeCall[1] as string
      const data = JSON.parse(jsonString)
      expect(data.bigInt).toEqual({ __type: 'bigint', value: '123456789' })
    })

    it('should serialize Uint8Array values correctly', async () => {
      storage.set([], 'uint8', new Uint8Array([1, 2, 3]))
      await storage.forcePersist()

      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const jsonString = writeCall[1] as string
      const data = JSON.parse(jsonString)
      expect(data.uint8).toEqual({ __type: 'Uint8Array', value: [1, 2, 3] })
    })

    it('should serialize Buffer values correctly', async () => {
      storage.set([], 'buffer', Buffer.from([10, 20, 30]))
      await storage.forcePersist()

      const writeCall = vi.mocked(writeFile).mock.calls[0]
      const jsonString = writeCall[1] as string
      const data = JSON.parse(jsonString)
      // Buffer.toJSON() is called before the replacer, so we get Buffer's native JSON format
      expect(data.buffer).toEqual({ type: 'Buffer', data: [10, 20, 30] })
    })

    it('should use atomic write pattern', async () => {
      storage.set([], 'key1', 'value1')
      await storage.forcePersist()

      // Should write to temp file first
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.anything(),
        'utf-8',
      )

      // Then rename to final file (namespace is 'test' from beforeEach)
      expect(rename).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.stringContaining('test.json'),
      )
    })

    it('should ensure directory exists', async () => {
      storage.set([], 'key1', 'value1')
      await storage.forcePersist()

      expect(mkdir).toHaveBeenCalledWith(
        expect.anything(),
        { recursive: true },
      )
    })

    it('should handle persist errors gracefully', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('Write failed'))

      storage.set([], 'key1', 'value1')
      await storage.forcePersist()

      expect(logErrorSpy).toHaveBeenCalledWith(
        'Failed to persist storage for test:',
        expect.anything(),
      )
    })

    it('should queue concurrent persist operations', async () => {
      storage.set([], 'key1', 'value1')

      // Start multiple persist operations
      await Promise.all([
        storage.forcePersist(),
        storage.forcePersist(),
        storage.forcePersist(),
      ])

      // All should complete (queued sequentially via persistLock)
      expect(writeFile).toHaveBeenCalled()
    })
  })

  describe('forcePersist', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)
    })

    it('should persist immediately', async () => {
      storage.set([], 'key1', 'value1')
      await storage.forcePersist()

      expect(writeFile).toHaveBeenCalled()
    })

    it('should not persist if no pending changes', async () => {
      await storage.forcePersist()
      expect(writeFile).not.toHaveBeenCalled()
    })
  })

  describe('close', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test', '/mock/path')
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)
    })

    it('should persist and clear storage', async () => {
      storage.set([], 'key1', 'value1')
      await storage.close()

      expect(writeFile).toHaveBeenCalled()
      expect(storage.get([], 'key1')).toBeUndefined()
    })
  })

  describe('getStats', () => {
    beforeEach(() => {
      storage = new HomebridgeMatterStorage('test-namespace', '/mock/path')
    })

    it('should return storage statistics', () => {
      storage.set([], 'key1', 'value1')
      storage.set([], 'key2', 'value2')

      const stats = storage.getStats()
      expect(stats.entries).toBe(2)
      expect(stats.namespace).toBe('test-namespace')
      expect(stats.path).toContain('test-namespace.json')
    })
  })
})

describe('matterStorageManager', () => {
  let manager: MatterStorageManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readFileSync).mockImplementation(() => {
      const error: any = new Error('ENOENT')
      error.code = 'ENOENT'
      throw error
    })
    manager = new MatterStorageManager('/mock/path')
  })

  describe('getStorage', () => {
    it('should create new storage for namespace', () => {
      const storage = manager.getStorage('namespace1')
      expect(storage).toBeDefined()
    })

    it('should return same storage for same namespace', () => {
      const storage1 = manager.getStorage('namespace1')
      const storage2 = manager.getStorage('namespace1')
      expect(storage1).toBe(storage2)
    })

    it('should create different storages for different namespaces', () => {
      const storage1 = manager.getStorage('namespace1')
      const storage2 = manager.getStorage('namespace2')
      expect(storage1).not.toBe(storage2)
    })
  })

  describe('closeAll', () => {
    beforeEach(() => {
      vi.mocked(mkdir).mockResolvedValue(undefined)
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)
    })

    it('should close all storages', async () => {
      const storage1 = manager.getStorage('namespace1')
      const storage2 = manager.getStorage('namespace2')

      storage1.set([], 'key1', 'value1')
      storage2.set([], 'key2', 'value2')

      await manager.closeAll()

      // Storages should be persisted
      expect(writeFile).toHaveBeenCalled()
    })

    it('should clear all storages after close', async () => {
      manager.getStorage('namespace1')
      manager.getStorage('namespace2')

      await manager.closeAll()

      const stats = manager.getAllStats()
      expect(stats).toHaveLength(0)
    })
  })

  describe('getAllStats', () => {
    it('should return stats for all storages', () => {
      const storage1 = manager.getStorage('namespace1')
      const storage2 = manager.getStorage('namespace2')

      storage1.set([], 'key1', 'value1')
      storage2.set([], 'key2', 'value2')
      storage2.set([], 'key3', 'value3')

      const stats = manager.getAllStats()
      expect(stats).toHaveLength(2)

      const stats1 = stats.find(s => s.namespace === 'namespace1')
      const stats2 = stats.find(s => s.namespace === 'namespace2')

      expect(stats1?.entries).toBe(1)
      expect(stats2?.entries).toBe(2)
    })

    it('should return empty array when no storages', () => {
      const stats = manager.getAllStats()
      expect(stats).toHaveLength(0)
    })
  })
})
