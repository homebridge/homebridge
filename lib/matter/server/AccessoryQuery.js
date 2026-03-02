"use strict";
/**
 * Accessory Query
 *
 * Handles accessory lookup and UI display collection methods.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessoryQuery = void 0;
const logger_js_1 = require("../../logger.js");
const log = logger_js_1.Logger.withPrefix('Matter/Server');
class AccessoryQuery {
    accessories;
    getAccessoryCache;
    constructor(accessories, getAccessoryCache) {
        this.accessories = accessories;
        this.getAccessoryCache = getAccessoryCache;
    }
    /**
     * Get all registered accessories (Plugin API)
     */
    getAccessories() {
        return Array.from(this.accessories.values()).map((acc) => {
            // eslint-disable-next-line unused-imports/no-unused-vars
            const { endpoint, registered, ...publicAccessory } = acc;
            return publicAccessory;
        });
    }
    /**
     * Get a specific accessory by UUID (Plugin API)
     */
    getAccessory(uuid) {
        const accessory = this.accessories.get(uuid);
        if (!accessory) {
            return undefined;
        }
        // eslint-disable-next-line unused-imports/no-unused-vars
        const { endpoint, registered, ...publicAccessory } = accessory;
        return publicAccessory;
    }
    /**
     * Get all cached accessories (Internal - for restore process)
     * @internal
     */
    getAllCachedAccessories() {
        const cache = this.getAccessoryCache();
        if (!cache) {
            log.debug('getAllCachedAccessories: No cache available');
            return [];
        }
        const cached = Array.from(cache.getAllCached().values());
        log.debug(`getAllCachedAccessories: Returning ${cached.length} accessories`);
        return cached;
    }
    /**
     * Extract device type name from EndpointType
     */
    getDeviceTypeName(deviceType) {
        return deviceType.name || 'Unknown';
    }
    /**
     * Get current cluster state for an accessory or part
     */
    getCurrentState(uuid, partId) {
        const accessory = this.accessories.get(uuid);
        if (!accessory) {
            return {};
        }
        if (partId) {
            const part = accessory._parts?.find(p => p.id === partId);
            return part?.clusters || {};
        }
        return accessory.clusters || {};
    }
    /**
     * Collect all accessories for UI display
     */
    collectAccessories(bridgeUsername, bridgeType, bridgeName) {
        const accessories = [];
        for (const [uuid, accessory] of this.accessories.entries()) {
            const transformed = {
                uuid,
                displayName: accessory.displayName,
                deviceType: this.getDeviceTypeName(accessory.deviceType),
                clusters: this.getCurrentState(uuid),
                parts: accessory._parts?.map(part => ({
                    id: part.id,
                    displayName: part.displayName,
                    deviceType: this.getDeviceTypeName(part.deviceType),
                    clusters: this.getCurrentState(uuid, part.id),
                })),
                bridge: {
                    username: bridgeUsername,
                    type: bridgeType,
                    name: bridgeName,
                },
            };
            accessories.push(transformed);
        }
        return accessories;
    }
    /**
     * Get detailed info for a specific accessory
     */
    getAccessoryInfo(uuid) {
        const accessory = this.accessories.get(uuid);
        if (!accessory) {
            return undefined;
        }
        return {
            uuid,
            displayName: accessory.displayName,
            deviceType: this.getDeviceTypeName(accessory.deviceType),
            clusters: this.getCurrentState(uuid),
            parts: accessory._parts?.map(part => ({
                id: part.id,
                displayName: part.displayName,
                deviceType: this.getDeviceTypeName(part.deviceType),
                clusters: this.getCurrentState(uuid, part.id),
            })),
        };
    }
}
exports.AccessoryQuery = AccessoryQuery;
//# sourceMappingURL=AccessoryQuery.js.map