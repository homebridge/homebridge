/* global NodeJS */

/**
 * Custom Matter.js Storage Implementation for Homebridge
 *
 * Provides persistent storage for Matter fabric data and device configuration.
 * This ensures commissioning data persists across Homebridge restarts.
 */

import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { Logger } from '../logger.js'

const log = Logger.withPrefix('Matter/Storage')

// Storage configuration constants
const STORAGE_WRITE_DEBOUNCE_MS = 100 // Delay for non-critical writes

/**
 * Custom Matter.js StorageContext implementation for Homebridge
 * Provides persistent storage for fabric data and device configuration
 */
export class HomebridgeMatterStorage {
  private storage: Map<string, any> = new Map()
  private readonly filePath: string
  private isInitialized = false
  private writeTimer: NodeJS.Timeout | null = null
  private pendingWrite = false
  private persistLock: Promise<void> | null = null

  constructor(
    private namespace: string,
    storagePath: string,
  ) {
    this.filePath = join(storagePath, `${namespace}.json`)

    // Synchronously load existing data to avoid race conditions with Matter.js
    // Matter.js expects storage to be immediately available
    this.initializeSync()
  }

  /**
   * Synchronously initialize storage by loading existing data
   *
   * IMPORTANT: This method uses synchronous file I/O (readFileSync) because
   * Matter.js requires storage to be immediately available upon construction.
   * This is a limitation of the Matter.js Storage API - it doesn't support
   * async initialization.
   *
   * This synchronous read only happens once at startup and is unavoidable
   * without rewriting Matter.js's storage interface.
   */
  private initializeSync(): void {
    try {
      const fileContent = readFileSync(this.filePath, 'utf-8')

      // Parse WITHOUT a reviver - we'll deserialize manually
      const data = JSON.parse(fileContent)

      // Ensure data is valid before loading
      if (data && typeof data === 'object') {
        // Deserialize ALL values as we load them into the Map
        const entries: Array<[string, any]> = Object.entries(data).map(([key, value]) => [
          key,
          this.deserializeValue(value),
        ])
        this.storage = new Map(entries)
        log.debug(`Loaded ${this.storage.size} entries for namespace: ${this.namespace}`)
      } else {
        log.warn(`Invalid storage data for ${this.namespace}, starting fresh`)
        this.storage = new Map()
      }
      this.isInitialized = true
    } catch (error: unknown) {
      const code = error instanceof Error && 'code' in error ? (error as any).code : undefined
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (code === 'ENOENT') {
        log.debug(`No existing storage for namespace: ${this.namespace}`)
      } else {
        log.warn(`Failed to load storage for ${this.namespace} (${errorMessage}), starting fresh`)
      }

      // Create fresh storage if file doesn't exist or is corrupted
      this.storage = new Map()
      this.isInitialized = true
    }
  }

  /**
   * Initialize storage and load existing data (async for compatibility)
   * Note: Storage is now initialized synchronously in constructor
   */
  async initialize(): Promise<void> {
    // Storage is already initialized in constructor
    return Promise.resolve()
  }

  /**
   * Build a context key from an array of contexts
   */
  private buildContextKey(contexts: string[]): string {
    return contexts.join('.')
  }

  /**
   * Recursively convert special serialized types back to their original types
   *
   * This is necessary because JSON.parse() doesn't automatically reconstruct:
   * - BigInt values (serialized as {__type: 'bigint', value: string})
   * - Uint8Array values (serialized as {__type: 'Uint8Array', value: number[]})
   * - Buffer values (Node.js format: {type: 'Buffer', data: number[]})
   *
   * Matter.js fabric data contains these types which must be properly restored
   * for commissioning to work across restarts.
   *
   * @param value - The value to deserialize (might be nested object/array)
   * @returns The deserialized value with proper types restored
   */
  private deserializeValue(value: unknown): unknown {
    if (value && typeof value === 'object') {
      // Handle special type markers
      const obj = value as any
      if (obj.__type === 'bigint' && typeof obj.value === 'string') {
        return BigInt(obj.value)
      }
      if (obj.__type === 'Uint8Array' && Array.isArray(obj.value)) {
        return new Uint8Array(obj.value)
      }

      // Handle Node.js Buffer JSON format: {type: "Buffer", data: [...]}
      if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
        return new Uint8Array(obj.data)
      }

      // Recursively process arrays
      if (Array.isArray(value)) {
        return value.map(item => this.deserializeValue(item))
      }

      // Recursively process plain objects
      if (Object.getPrototypeOf(value) === Object.prototype) {
        const result: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value)) {
          result[k] = this.deserializeValue(v)
        }
        return result
      }
    }

    return value
  }

  /**
   * Get a value from storage (Matter.js interface)
   * Values are already deserialized during load, so no additional deserialization needed
   */
  get(contexts: string[], key: string): unknown | undefined {
    // Storage is initialized in constructor, so this should always work
    const fullKey = contexts.length ? `${this.buildContextKey(contexts)}.${key}` : key
    return this.storage.get(fullKey)
  }

  /**
   * Set a value in storage (Matter.js interface)
   */
  set(contexts: string[], key: string, value: unknown): void
  set(contexts: string[], values: Record<string, unknown>): void
  set(contexts: string[], keyOrValues: string | Record<string, unknown>, value?: unknown): void {
    const contextKey = this.buildContextKey(contexts)

    if (typeof keyOrValues === 'string') {
      const fullKey = contextKey ? `${contextKey}.${keyOrValues}` : keyOrValues
      this.storage.set(fullKey, value)
    } else {
      for (const [k, v] of Object.entries(keyOrValues)) {
        const fullKey = contextKey ? `${contextKey}.${k}` : k
        this.storage.set(fullKey, v)
      }
    }

    // Debounce writes to avoid excessive disk I/O
    void this.schedulePersist()
  }

  /**
   * Delete a key from storage (Matter.js interface)
   */
  delete(contexts: string[], key: string): void {
    const fullKey = contexts.length ? `${this.buildContextKey(contexts)}.${key}` : key
    const deleted = this.storage.delete(fullKey)
    if (deleted) {
      void this.schedulePersist()
    }
  }

  /**
   * Clear all storage in a context (Matter.js interface)
   */
  clearAll(contexts: string[]): void {
    const contextKey = this.buildContextKey(contexts)
    const prefix = contextKey ? `${contextKey}.` : ''

    // Collect keys to delete first to avoid modifying during iteration
    const keysToDelete: string[] = []
    for (const key of this.storage.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        keysToDelete.push(key)
      }
    }

    // Delete collected keys
    for (const key of keysToDelete) {
      this.storage.delete(key)
    }

    if (keysToDelete.length > 0) {
      void this.schedulePersist()
    }
  }

  /**
   * Get all keys in a context (Matter.js interface)
   */
  keys(contexts: string[]): string[] {
    if (!this.isInitialized) {
      return []
    }

    const contextKey = this.buildContextKey(contexts)
    const prefix = contextKey ? `${contextKey}.` : ''
    const contextKeys: string[] = []

    for (const key of this.storage.keys()) {
      if (prefix) {
        // Return keys within this context (strip context prefix)
        if (key.startsWith(prefix)) {
          const subKey = key.substring(prefix.length)

          // Only include direct children (no further nesting)
          if (!subKey.includes('.')) {
            contextKeys.push(subKey)
          }
        }
      } else {
        // Root level - return keys with no dots
        if (!key.includes('.')) {
          contextKeys.push(key)
        }
      }
    }

    return contextKeys
  }

  /**
   * Get all child context names (Matter.js interface)
   */
  contexts(contexts: string[]): string[] {
    if (!this.isInitialized) {
      return []
    }

    const contextKey = this.buildContextKey(contexts)
    const prefix = contextKey ? `${contextKey}.` : ''
    const childContexts = new Set<string>()

    for (const key of this.storage.keys()) {
      if (prefix) {
        // Find sub-contexts within this context
        if (key.startsWith(prefix)) {
          const subKey = key.substring(prefix.length)
          const nextDot = subKey.indexOf('.')
          if (nextDot > 0) {
            childContexts.add(subKey.substring(0, nextDot))
          }
        }
      } else {
        // Root level - find top-level contexts
        const dotIndex = key.indexOf('.')
        if (dotIndex > 0) {
          childContexts.add(key.substring(0, dotIndex))
        }
      }
    }

    return Array.from(childContexts)
  }

  /**
   * Check if a key exists (Matter.js interface)
   */
  has(contexts: string[], key: string): boolean {
    if (!this.isInitialized) {
      return false
    }
    const fullKey = contexts.length ? `${this.buildContextKey(contexts)}.${key}` : key
    return this.storage.has(fullKey)
  }

  /**
   * Get all values in a context
   * Returns direct children only (does not include nested contexts)
   */
  async values(contexts: string[]): Promise<Record<string, unknown>> {
    await this.initialize()
    const contextKey = this.buildContextKey(contexts)
    const prefix = contextKey ? `${contextKey}.` : ''
    const values: Record<string, unknown> = {}

    for (const [key, value] of this.storage.entries()) {
      // Check if key is in the requested context
      if (prefix && !key.startsWith(prefix)) {
        continue
      }

      const subKey = prefix ? key.substring(prefix.length) : key

      // Only include direct children (no nested contexts)
      if (!subKey.includes('.')) {
        values[subKey] = value // values are already deserialized
      }
    }

    return values
  }

  /**
   * Schedule a persist operation (debounced)
   */
  private async schedulePersist(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
    }

    this.pendingWrite = true

    // Immediate persist for critical data (fabric information)
    const hasCriticalData = Array.from(this.storage.keys()).some(key =>
      key.includes('fabric'),
    )

    if (hasCriticalData) {
      await this.persist()
    } else {
      // Debounce non-critical writes
      this.writeTimer = setTimeout(() => {
        void this.persist()
      }, STORAGE_WRITE_DEBOUNCE_MS)
    }
  }

  /**
   * Persist storage to disk with atomic write
   */
  private async persist(): Promise<void> {
    // Wait for any in-progress persist operation to complete
    if (this.persistLock) {
      await this.persistLock
    }

    if (!this.pendingWrite) {
      return
    }

    // Create a new lock for this persist operation
    this.persistLock = (async () => {
      try {
        const data = Object.fromEntries(this.storage.entries())
        const dir = dirname(this.filePath)

        // Ensure directory exists
        await mkdir(dir, { recursive: true })

        // Atomic write: write to temp file then rename
        // Use a unique temp file to avoid conflicts
        const tempFile = `${this.filePath}.tmp.${Date.now()}`

        // Custom replacer to handle BigInt, Uint8Array, and Buffer serialization
        const jsonString = JSON.stringify(data, (_key, value) => {
          if (typeof value === 'bigint') {
            return { __type: 'bigint', value: value.toString() }
          }

          // Handle Buffer before Uint8Array since Buffer extends Uint8Array
          // Note: Buffer.toJSON() returns {type: 'Buffer', data: [...]}, but we want consistent format
          if (Buffer.isBuffer(value)) {
            return { __type: 'Uint8Array', value: Array.from(value) }
          }
          if (value instanceof Uint8Array) {
            return { __type: 'Uint8Array', value: Array.from(value) }
          }
          return value
        }, 2)
        await writeFile(tempFile, jsonString, 'utf-8')
        await rename(tempFile, this.filePath)

        this.pendingWrite = false
        log.debug(`Persisted ${this.storage.size} entries for namespace: ${this.namespace}`)
      } catch (error) {
        // Don't throw - we don't want to break Matter operations
        log.error(`Failed to persist storage for ${this.namespace}:`, error)
      } finally {
        this.persistLock = null
      }
    })()

    await this.persistLock
  }

  /**
   * Force immediate persist (for shutdown)
   */
  async forcePersist(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    if (this.pendingWrite) {
      await this.persist()
    }
  }

  /**
   * Close and cleanup storage
   */
  async close(): Promise<void> {
    await this.forcePersist()
    this.storage.clear()
    this.isInitialized = false
  }

  /**
   * Get storage statistics
   */
  getStats(): { entries: number, namespace: string, path: string } {
    return {
      entries: this.storage.size,
      namespace: this.namespace,
      path: this.filePath,
    }
  }
}

/**
 * Storage Manager for Matter.js
 * Manages multiple storage contexts for different namespaces
 */
export class MatterStorageManager {
  private storages: Map<string, HomebridgeMatterStorage> = new Map()

  constructor(private storagePath: string) {}

  /**
   * Get or create a storage context for a namespace
   */
  getStorage(namespace: string): HomebridgeMatterStorage {
    let storage = this.storages.get(namespace)
    if (!storage) {
      storage = new HomebridgeMatterStorage(namespace, this.storagePath)
      this.storages.set(namespace, storage)
    }
    return storage
  }

  /**
   * Close all storage contexts
   */
  async closeAll(): Promise<void> {
    const promises = Array.from(this.storages.values()).map(storage => storage.close())
    await Promise.all(promises)
    this.storages.clear()
  }

  /**
   * Get statistics for all storage contexts
   */
  getAllStats(): Array<{ entries: number, namespace: string, path: string }> {
    return Array.from(this.storages.values()).map(storage => storage.getStats())
  }
}
