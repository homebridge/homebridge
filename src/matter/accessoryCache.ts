/* global NodeJS */

/**
 * Matter Accessory Cache
 *
 * Handles persistence of Matter accessories across Homebridge restarts.
 * Similar to HAP's cached accessories, but designed for Matter's simpler API.
 */

import type { InternalMatterAccessory } from './types.js'

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { Logger } from '../logger.js'

const log = Logger.withPrefix('Matter/Accessories')

/**
 * Serializable Matter accessory part (excludes functions and runtime state)
 */
export interface SerializedMatterAccessoryPart {
  id: string
  displayName?: string
  deviceType: {
    name?: string
    code?: number
  }
  clusters: {
    [clusterName: string]: {
      [attributeName: string]: unknown
    }
  }
}

/**
 * Serializable Matter accessory (excludes functions and runtime state)
 * Plugin developers should work with MatterAccessory instead.
 */
export interface SerializedMatterAccessory {
  plugin: string
  platform: string
  uuid: string // internal uses lowercase for JSON storage
  displayName: string
  deviceType: {
    name?: string
    code?: number
  }
  serialNumber: string
  manufacturer: string
  model: string
  firmwareRevision?: string
  hardwareRevision?: string
  softwareVersion?: string
  context: Record<string, unknown>
  clusters?: {
    [clusterName: string]: {
      [attributeName: string]: unknown
    }
  }
  parts?: SerializedMatterAccessoryPart[]
}

/**
 * Matter Accessory Cache Manager
 */
export class MatterAccessoryCache {
  private readonly cacheFilePath: string
  private cachedAccessories: Map<string, SerializedMatterAccessory> = new Map()
  private cacheLoaded = false
  private saveQueue: Promise<void> = Promise.resolve()
  private directoryEnsured = false
  private saveDebounceTimer: NodeJS.Timeout | null = null
  private readonly SAVE_DEBOUNCE_MS = 2000 // debounce cache saves by 2 seconds

  constructor(storagePath: string, bridgeId: string) {
    this.cacheFilePath = join(storagePath, bridgeId, 'accessories.json')
  }

  /**
   * Load cached accessories from disk
   * Returns a map of cached accessories keyed by UUID
   */
  async load(): Promise<Map<string, SerializedMatterAccessory>> {
    if (this.cacheLoaded) {
      return this.cachedAccessories
    }

    try {
      // Check if cache file exists
      try {
        await stat(this.cacheFilePath)
      } catch {
        log.info('No cached Matter accessories found (first run)')
        this.cacheLoaded = true
        return this.cachedAccessories
      }

      // Read and parse cache file
      const cacheData = JSON.parse(await readFile(this.cacheFilePath, 'utf-8'))

      if (!Array.isArray(cacheData)) {
        throw new TypeError('Cache file does not contain an array')
      }

      // Load accessories into map (only those with valid UUIDs)
      for (const serialized of cacheData) {
        if (serialized.uuid) {
          this.cachedAccessories.set(serialized.uuid, serialized)
        }
      }

      log.info(`Loaded ${this.cachedAccessories.size} cached Matter accessories`)

      // Directory must exist if we successfully loaded the cache file
      this.directoryEnsured = true
      this.cacheLoaded = true

      return this.cachedAccessories
    } catch (error: unknown) {
      // If JSON parsing failed (corrupted file), delete it and start fresh
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error(`Failed to load Matter accessory cache from ${this.cacheFilePath}: ${errorMessage}`)
      log.warn('Deleting corrupted cache file and starting fresh')

      try {
        await rm(this.cacheFilePath, { force: true })
      } catch (removeError) {
        // non-fatal: couldn't delete corrupted file
        log.debug('Could not delete corrupted cache file:', removeError)
      }

      this.cacheLoaded = true
      return this.cachedAccessories
    }
  }

  /**
   * Request a debounced save to cache
   * Multiple rapid calls within the debounce window will only result in one disk write
   * Use this for normal operations to reduce disk I/O
   */
  requestSave(accessories: Map<string, InternalMatterAccessory>): void {
    // Clear any existing debounce timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer)
    }

    // Schedule a new save after the debounce period
    this.saveDebounceTimer = setTimeout(() => {
      this.save(accessories).catch((error) => {
        log.error('Debounced cache save failed:', error)
      })
    }, this.SAVE_DEBOUNCE_MS)
  }

  /**
   * Cancel any pending debounced save without writing.
   *
   * A debounced save captures the live accessories map by reference. If a
   * timer is still armed when the owning server tears down and clears that
   * map, the timer would later fire and persist an empty map — wiping the
   * cache. Callers that are about to clear the map (e.g. ServerLifecycle.stop)
   * must cancel first.
   *
   * @returns true if a pending save was cancelled, false if none was armed
   */
  cancelPendingSave(): boolean {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer)
      this.saveDebounceTimer = null
      return true
    }
    return false
  }

  /**
   * Save accessories to cache immediately (serialized to prevent concurrent write conflicts)
   * Uses a queue pattern to ensure saves are truly serialized even when called concurrently
   * Use this for shutdown/critical operations that need immediate persistence
   */
  async save(accessories: Map<string, InternalMatterAccessory>): Promise<void> {
    // Clear any pending debounced save since we're saving now
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer)
      this.saveDebounceTimer = null
    }

    // Chain this save to the end of the queue
    // This ensures all saves run sequentially without race conditions
    this.saveQueue = this.saveQueue.then(() => this.performSave(accessories))

    // Wait for this save to complete
    await this.saveQueue
  }

  /**
   * Internal save implementation
   * Performs atomic write to prevent cache corruption on system crashes
   */
  private async performSave(accessories: Map<string, InternalMatterAccessory>): Promise<void> {
    const tempFilePath = `${this.cacheFilePath}.tmp`

    try {
      // Serialize accessories (strip out functions and non-serializable objects)
      const serialized: SerializedMatterAccessory[] = Array.from(accessories.values(), accessory => this.serializeAccessory(accessory))

      // Ensure directory exists (only check once, not on every save)
      if (!this.directoryEnsured) {
        const directory = dirname(this.cacheFilePath)
        await mkdir(directory, { recursive: true })
        this.directoryEnsured = true
        log.debug(`Cache directory ensured: ${directory}`)
      }

      // Write to temporary file first (atomic write pattern to prevent corruption)
      await writeFile(tempFilePath, JSON.stringify(serialized, null, 2), 'utf-8')

      // Atomically move temp file to final location
      await rename(tempFilePath, this.cacheFilePath)

      log.debug(`Saved ${serialized.length} Matter accessor${serialized.length === 1 ? 'y' : 'ies'} to cache`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error(`Failed to save Matter accessory cache: ${errorMessage}`)

      // Clean up temp file if it exists
      try {
        await rm(tempFilePath, { force: true })
      } catch (cleanupError) {
        // non-fatal: couldn't clean up temp file
        log.debug('Could not clean up temporary cache file:', cleanupError)
      }
    }
  }

  /**
   * Get cached accessory by UUID
   */
  getCached(uuid: string): SerializedMatterAccessory | undefined {
    return this.cachedAccessories.get(uuid)
  }

  /**
   * Check if an accessory is cached
   */
  hasCached(uuid: string): boolean {
    return this.cachedAccessories.has(uuid)
  }

  /**
   * Remove an accessory from cache
   */
  removeCached(uuid: string): void {
    this.cachedAccessories.delete(uuid)
  }

  /**
   * Get all cached accessories as an array.
   *
   * Returns a fresh array each call (callers may mutate it freely) but does
   * not clone the per-entry SerializedMatterAccessory objects. If you only
   * need a single accessory, use getCached(uuid) — it's O(1).
   */
  getAllCached(): SerializedMatterAccessory[] {
    return [...this.cachedAccessories.values()]
  }

  /**
   * Serialize a Matter accessory for storage
   */
  private serializeAccessory(accessory: InternalMatterAccessory): SerializedMatterAccessory {
    // Extract device type information (EndpointType has name and code properties)
    const deviceType = accessory.deviceType as { name?: string, code?: number }
    const deviceTypeInfo = {
      name: deviceType?.name,
      code: deviceType?.code,
    }

    // Serialize parts if present (excluding handlers which are functions)
    let serializedParts: SerializedMatterAccessoryPart[] | undefined
    if (accessory.parts && accessory.parts.length > 0) {
      serializedParts = accessory.parts.map((part) => {
        const partDeviceType = part.deviceType as { name?: string, code?: number }
        return {
          id: part.id,
          displayName: part.displayName,
          deviceType: {
            name: partDeviceType?.name,
            code: partDeviceType?.code,
          },
          clusters: structuredClone(part.clusters),
        }
      })
    }

    return {
      plugin: accessory._associatedPlugin || '',
      platform: accessory._associatedPlatform || '',
      uuid: accessory.UUID,
      displayName: accessory.displayName,
      deviceType: deviceTypeInfo,
      serialNumber: accessory.serialNumber,
      manufacturer: accessory.manufacturer,
      model: accessory.model,
      firmwareRevision: accessory.firmwareRevision,
      hardwareRevision: accessory.hardwareRevision,
      softwareVersion: accessory.softwareVersion,
      context: accessory.context,
      clusters: structuredClone(accessory.clusters),
      parts: serializedParts,
    }
  }
}
