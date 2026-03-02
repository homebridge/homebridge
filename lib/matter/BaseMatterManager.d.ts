/**
 * Base class for Matter bridge managers
 * Contains shared logic for handling Matter accessory control and state updates
 */
import type { PluginManager } from '../pluginManager.js';
import type { InternalMatterAccessory } from './types.js';
import { MatterServer } from './server.js';
/**
 * Base Matter Manager
 * Provides common functionality for both main bridge and child bridge Matter managers
 */
export declare abstract class BaseMatterManager {
    protected matterServer?: MatterServer;
    protected readonly externalMatterServers: Map<string, MatterServer>;
    protected readonly pluginManager: PluginManager;
    constructor(pluginManager: PluginManager);
    /**
     * Get an external Matter server by accessory UUID
     *
     * @param uuid - Accessory UUID
     * @returns Matter server instance or undefined if not found
     */
    getExternalServer(uuid: string): MatterServer | undefined;
    /**
     * Handle Matter accessory command (triggers user handlers)
     * This is for UI/external control that should invoke plugin handlers
     * Checks both external servers and bridge server
     */
    handleTriggerCommand(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void>;
    /**
     * Handle Matter accessory state updates
     * Checks both external servers and bridge server
     */
    handleUpdateAccessoryState(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void>;
    /**
     * Enable state monitoring on all Matter servers
     */
    enableStateMonitoring(): void;
    /**
     * Disable state monitoring on all Matter servers
     */
    disableStateMonitoring(): void;
    /**
     * Restore cached Matter accessories (matching HAP pattern)
     */
    restoreCachedAccessories(keepOrphaned: boolean): void;
    /**
     * Handle registration of Matter platform accessories
     */
    handleRegisterPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: InternalMatterAccessory[]): Promise<void>;
    /**
     * Handle updating Matter platform accessories in the cache
     * Checks both external servers and bridge server
     */
    handleUpdatePlatformAccessories(accessories: InternalMatterAccessory[]): Promise<void>;
    /**
     * Handle unregistration of Matter platform accessories
     */
    handleUnregisterPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: InternalMatterAccessory[]): Promise<void>;
    /**
     * Handle unregistration of external Matter accessories
     * Stops dedicated servers and cleans up storage
     */
    handleUnregisterExternalAccessories(accessories: InternalMatterAccessory[]): Promise<void>;
    /**
     * Deserialize SerializedMatterAccessory from cache to MatterAccessory for plugin use
     * Converts internal cache format to the public API format plugins expect
     */
    private deserializeMatterAccessory;
}
//# sourceMappingURL=BaseMatterManager.d.ts.map