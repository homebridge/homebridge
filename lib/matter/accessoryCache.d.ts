/**
 * Matter Accessory Cache
 *
 * Handles persistence of Matter accessories across Homebridge restarts.
 * Similar to HAP's cached accessories, but designed for Matter's simpler API.
 */
import type { InternalMatterAccessory } from './types.js';
/**
 * Serializable Matter accessory part (excludes functions and runtime state)
 */
export interface SerializedMatterAccessoryPart {
    id: string;
    displayName?: string;
    deviceType: {
        name?: string;
        code?: number;
    };
    clusters: {
        [clusterName: string]: {
            [attributeName: string]: unknown;
        };
    };
}
/**
 * Serializable Matter accessory (excludes functions and runtime state)
 * Plugin developers should work with MatterAccessory instead.
 */
export interface SerializedMatterAccessory {
    plugin: string;
    platform: string;
    uuid: string;
    displayName: string;
    deviceType: {
        name?: string;
        code?: number;
    };
    serialNumber: string;
    manufacturer: string;
    model: string;
    firmwareRevision?: string;
    hardwareRevision?: string;
    softwareVersion?: string;
    context: Record<string, unknown>;
    clusters?: {
        [clusterName: string]: {
            [attributeName: string]: unknown;
        };
    };
    parts?: SerializedMatterAccessoryPart[];
}
/**
 * Matter Accessory Cache Manager
 */
export declare class MatterAccessoryCache {
    private readonly cacheFilePath;
    private cachedAccessories;
    private cacheLoaded;
    private saveQueue;
    private directoryEnsured;
    private saveDebounceTimer;
    private readonly SAVE_DEBOUNCE_MS;
    constructor(storagePath: string, bridgeId: string);
    /**
     * Load cached accessories from disk
     * Returns a map of cached accessories keyed by UUID
     */
    load(): Promise<Map<string, SerializedMatterAccessory>>;
    /**
     * Request a debounced save to cache
     * Multiple rapid calls within the debounce window will only result in one disk write
     * Use this for normal operations to reduce disk I/O
     */
    requestSave(accessories: Map<string, InternalMatterAccessory>): void;
    /**
     * Save accessories to cache immediately (serialized to prevent concurrent write conflicts)
     * Uses a queue pattern to ensure saves are truly serialized even when called concurrently
     * Use this for shutdown/critical operations that need immediate persistence
     */
    save(accessories: Map<string, InternalMatterAccessory>): Promise<void>;
    /**
     * Internal save implementation
     * Performs atomic write to prevent cache corruption on system crashes
     */
    private performSave;
    /**
     * Get cached accessory by UUID
     */
    getCached(uuid: string): SerializedMatterAccessory | undefined;
    /**
     * Check if an accessory is cached
     */
    hasCached(uuid: string): boolean;
    /**
     * Remove an accessory from cache
     */
    removeCached(uuid: string): void;
    /**
     * Get all cached accessories
     */
    getAllCached(): Map<string, SerializedMatterAccessory>;
    /**
     * Serialize a Matter accessory for storage
     */
    private serializeAccessory;
}
//# sourceMappingURL=accessoryCache.d.ts.map