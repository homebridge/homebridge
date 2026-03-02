/**
 * Accessory Manager
 *
 * Handles registering/unregistering accessories, building custom behaviors,
 * detecting cluster features, creating endpoint options, creating accessory parts,
 * and restoring cached state.
 */
import type { ServerNode } from '@matter/main';
import type { MatterAccessoryCache } from '../accessoryCache.js';
import type { BehaviorRegistry, RegistryManager } from '../behaviors/index.js';
import type { MatterServerConfig } from '../sharedTypes.js';
import type { InternalMatterAccessory, MatterAccessory } from '../types.js';
import { Endpoint } from '@matter/main';
export interface AccessoryManagerDeps {
    config: MatterServerConfig;
    accessories: Map<string, InternalMatterAccessory>;
    behaviorRegistry: BehaviorRegistry;
    registryManager: RegistryManager;
    accessoryCache: MatterAccessoryCache | null;
    getServerNode: () => ServerNode | null;
    getAggregator: () => Endpoint<typeof import('@matter/main/endpoints').AggregatorEndpoint> | null;
    getIsRunning: () => boolean;
    getMonitoringEnabled: () => boolean;
    isCommissioned: () => boolean;
}
export declare class AccessoryManager {
    /**
     * Register a single Matter accessory
     * The first two arguments are unused, but kept to keep consistency with the HAP accessory registration function signature.
     */
    registerAccessory(_pluginIdentifier: string, _platformName: string, accessory: MatterAccessory, deps: AccessoryManagerDeps): Promise<void>;
    /**
     * Unregister a Matter accessory
     */
    unregisterAccessory(uuid: string, deps: AccessoryManagerDeps): Promise<void>;
    /**
     * Restore cached state for an accessory
     */
    private restoreCachedState;
    /**
     * Detect cluster features for an accessory
     */
    private detectClusterFeatures;
    /**
     * Build custom behaviors for an accessory based on handlers
     */
    private buildCustomBehaviors;
    /**
     * Create endpoint options for an accessory
     */
    private createEndpointOptions;
    /**
     * Register command handlers for an accessory
     */
    private registerAccessoryHandlers;
    /**
     * Create and register child endpoints (parts) for an accessory
     */
    private createAccessoryParts;
    /**
     * Finalize accessory registration (store, emit events, save cache)
     */
    private finalizeAccessoryRegistration;
    /**
     * Notify controllers that the parts list has changed
     */
    private notifyPartsListChanged;
}
//# sourceMappingURL=AccessoryManager.d.ts.map