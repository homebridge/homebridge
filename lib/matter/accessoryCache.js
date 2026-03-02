"use strict";
/* global NodeJS */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterAccessoryCache = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const logger_js_1 = require("../logger.js");
const log = logger_js_1.Logger.withPrefix('Matter/Accessories');
/**
 * Matter Accessory Cache Manager
 */
class MatterAccessoryCache {
    cacheFilePath;
    cachedAccessories = new Map();
    cacheLoaded = false;
    saveQueue = Promise.resolve();
    directoryEnsured = false;
    saveDebounceTimer = null;
    SAVE_DEBOUNCE_MS = 2000; // debounce cache saves by 2 seconds
    constructor(storagePath, bridgeId) {
        this.cacheFilePath = (0, node_path_1.join)(storagePath, bridgeId, 'accessories.json');
    }
    /**
     * Load cached accessories from disk
     * Returns a map of cached accessories keyed by UUID
     */
    async load() {
        if (this.cacheLoaded) {
            return this.cachedAccessories;
        }
        try {
            // Check if cache file exists
            try {
                await (0, promises_1.stat)(this.cacheFilePath);
            }
            catch {
                log.info('No cached Matter accessories found (first run)');
                this.cacheLoaded = true;
                return this.cachedAccessories;
            }
            // Read and parse cache file
            const cacheData = JSON.parse(await (0, promises_1.readFile)(this.cacheFilePath, 'utf-8'));
            if (!Array.isArray(cacheData)) {
                throw new TypeError('Cache file does not contain an array');
            }
            // Load accessories into map (only those with valid UUIDs)
            for (const serialized of cacheData) {
                if (serialized.uuid) {
                    this.cachedAccessories.set(serialized.uuid, serialized);
                }
            }
            log.info(`Loaded ${this.cachedAccessories.size} cached Matter accessories`);
            // Directory must exist if we successfully loaded the cache file
            this.directoryEnsured = true;
            this.cacheLoaded = true;
            return this.cachedAccessories;
        }
        catch (error) {
            // If JSON parsing failed (corrupted file), delete it and start fresh
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.error(`Failed to load Matter accessory cache from ${this.cacheFilePath}: ${errorMessage}`);
            log.warn('Deleting corrupted cache file and starting fresh');
            try {
                await (0, promises_1.rm)(this.cacheFilePath, { force: true });
            }
            catch (removeError) {
                // non-fatal: couldn't delete corrupted file
                log.debug('Could not delete corrupted cache file:', removeError);
            }
            this.cacheLoaded = true;
            return this.cachedAccessories;
        }
    }
    /**
     * Request a debounced save to cache
     * Multiple rapid calls within the debounce window will only result in one disk write
     * Use this for normal operations to reduce disk I/O
     */
    requestSave(accessories) {
        // Clear any existing debounce timer
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }
        // Schedule a new save after the debounce period
        this.saveDebounceTimer = setTimeout(() => {
            this.save(accessories).catch((error) => {
                log.error('Debounced cache save failed:', error);
            });
        }, this.SAVE_DEBOUNCE_MS);
    }
    /**
     * Save accessories to cache immediately (serialized to prevent concurrent write conflicts)
     * Uses a queue pattern to ensure saves are truly serialized even when called concurrently
     * Use this for shutdown/critical operations that need immediate persistence
     */
    async save(accessories) {
        // Clear any pending debounced save since we're saving now
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
            this.saveDebounceTimer = null;
        }
        // Chain this save to the end of the queue
        // This ensures all saves run sequentially without race conditions
        this.saveQueue = this.saveQueue.then(() => this.performSave(accessories));
        // Wait for this save to complete
        await this.saveQueue;
    }
    /**
     * Internal save implementation
     * Performs atomic write to prevent cache corruption on system crashes
     */
    async performSave(accessories) {
        const tempFilePath = `${this.cacheFilePath}.tmp`;
        try {
            // Serialize accessories (strip out functions and non-serializable objects)
            const serialized = Array.from(accessories.values())
                .map(accessory => this.serializeAccessory(accessory));
            // Ensure directory exists (only check once, not on every save)
            if (!this.directoryEnsured) {
                const directory = (0, node_path_1.dirname)(this.cacheFilePath);
                await (0, promises_1.mkdir)(directory, { recursive: true });
                this.directoryEnsured = true;
                log.debug(`Cache directory ensured: ${directory}`);
            }
            // Write to temporary file first (atomic write pattern to prevent corruption)
            await (0, promises_1.writeFile)(tempFilePath, JSON.stringify(serialized, null, 2), 'utf-8');
            // Atomically move temp file to final location
            await (0, promises_1.rename)(tempFilePath, this.cacheFilePath);
            log.debug(`Saved ${serialized.length} Matter accessor${serialized.length === 1 ? 'y' : 'ies'} to cache`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.error(`Failed to save Matter accessory cache: ${errorMessage}`);
            // Clean up temp file if it exists
            try {
                await (0, promises_1.rm)(tempFilePath, { force: true });
            }
            catch (cleanupError) {
                // non-fatal: couldn't clean up temp file
                log.debug('Could not clean up temporary cache file:', cleanupError);
            }
        }
    }
    /**
     * Get cached accessory by UUID
     */
    getCached(uuid) {
        return this.cachedAccessories.get(uuid);
    }
    /**
     * Check if an accessory is cached
     */
    hasCached(uuid) {
        return this.cachedAccessories.has(uuid);
    }
    /**
     * Remove an accessory from cache
     */
    removeCached(uuid) {
        this.cachedAccessories.delete(uuid);
    }
    /**
     * Get all cached accessories
     */
    getAllCached() {
        return new Map(this.cachedAccessories);
    }
    /**
     * Serialize a Matter accessory for storage
     */
    serializeAccessory(accessory) {
        // Extract device type information (EndpointType has name and code properties)
        const deviceType = accessory.deviceType;
        const deviceTypeInfo = {
            name: deviceType?.name,
            code: deviceType?.code,
        };
        // Serialize parts if present (excluding handlers which are functions)
        let serializedParts;
        if (accessory.parts && accessory.parts.length > 0) {
            serializedParts = accessory.parts.map((part) => {
                const partDeviceType = part.deviceType;
                return {
                    id: part.id,
                    displayName: part.displayName,
                    deviceType: {
                        name: partDeviceType?.name,
                        code: partDeviceType?.code,
                    },
                    clusters: structuredClone(part.clusters),
                };
            });
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
        };
    }
}
exports.MatterAccessoryCache = MatterAccessoryCache;
//# sourceMappingURL=accessoryCache.js.map