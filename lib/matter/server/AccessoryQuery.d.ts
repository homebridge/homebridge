/**
 * Accessory Query
 *
 * Handles accessory lookup and UI display collection methods.
 */
import type { MatterAccessoryCache, SerializedMatterAccessory } from '../accessoryCache.js';
import type { InternalMatterAccessory, MatterAccessory } from '../types.js';
export declare class AccessoryQuery {
    private readonly accessories;
    private readonly getAccessoryCache;
    constructor(accessories: Map<string, InternalMatterAccessory>, getAccessoryCache: () => MatterAccessoryCache | null);
    /**
     * Get all registered accessories (Plugin API)
     */
    getAccessories(): MatterAccessory[];
    /**
     * Get a specific accessory by UUID (Plugin API)
     */
    getAccessory(uuid: string): MatterAccessory | undefined;
    /**
     * Get all cached accessories (Internal - for restore process)
     * @internal
     */
    getAllCachedAccessories(): SerializedMatterAccessory[];
    /**
     * Extract device type name from EndpointType
     */
    private getDeviceTypeName;
    /**
     * Get current cluster state for an accessory or part
     */
    private getCurrentState;
    /**
     * Collect all accessories for UI display
     */
    collectAccessories(bridgeUsername: string, bridgeType: string, bridgeName: string): any[];
    /**
     * Get detailed info for a specific accessory
     */
    getAccessoryInfo(uuid: string): any | undefined;
}
//# sourceMappingURL=AccessoryQuery.d.ts.map