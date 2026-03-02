/**
 * Matter Bridge Manager
 *
 * Manages Matter server lifecycle and accessories for the main Homebridge bridge.
 * This class extracts Matter-specific logic from server.ts to minimize changes to core files.
 */
import type { HomebridgeAPI } from '../api.js';
import type { HomebridgeConfig } from '../bridgeService.js';
import type { ExternalPortService } from '../externalPortService.js';
import type { IpcService } from '../ipcService.js';
import type { HomebridgeOptions } from '../server.js';
import type { MatterStatusInfo } from './ipc-types.js';
import type { AccessoryInfo } from './managerTypes.js';
import type { InternalMatterAccessory } from './types.js';
import { PluginManager } from '../pluginManager.js';
import { BaseMatterManager } from './BaseMatterManager.js';
/**
 * Manages Matter server and accessories for the main bridge
 */
export declare class MatterBridgeManager extends BaseMatterManager {
    private readonly config;
    private readonly api;
    private readonly externalPortService;
    private readonly options;
    private readonly server;
    constructor(config: HomebridgeConfig, api: HomebridgeAPI, externalPortService: ExternalPortService, pluginManager: PluginManager, options: HomebridgeOptions, server: {
        registerExternalMatterBridge: (username: string, owner: string) => void;
        ipcService: IpcService;
    });
    /**
     * Set up event listeners for Matter accessory operations
     * Subscribes directly to API events instead of requiring server.ts to delegate
     */
    private setupEventListeners;
    /**
     * Initialize Matter server for main bridge if enabled
     */
    initialize(): Promise<void>;
    /**
     * Handle external Matter accessories - each gets its own dedicated Matter server
     * This is required for devices like Robotic Vacuum Cleaners that Apple Home
     * requires to be on their own bridge.
     */
    handlePublishExternalAccessories(accessories: InternalMatterAccessory[], registrationId: string): Promise<void>;
    /**
     * Get Matter server status information for IPC communication
     */
    getMatterStatus(): MatterStatusInfo;
    /**
     * Collect all Matter accessories from all sources
     *
     * @param bridgeUsername - Optional: specific bridge username to filter by
     * @returns Array of accessory data suitable for UI consumption
     */
    collectAllAccessories(bridgeUsername?: string): AccessoryInfo[];
    /**
     * Get detailed info for a specific Matter accessory
     *
     * @param uuid - Accessory UUID
     * @returns Accessory info or undefined if not found
     */
    getAccessoryInfo(uuid: string): AccessoryInfo | undefined;
    /**
     * Collect accessories from a specific Matter server
     *
     * @param server - Matter server instance
     * @param bridgeUsername - Bridge MAC address
     * @param bridgeType - Type of bridge (main/child/external)
     * @param bridgeName - Display name of the bridge
     * @returns Array of accessory information
     */
    private collectAccessoriesFromServer;
    /**
     * Transform accessory data for UI consumption
     *
     * @param acc - Cached accessory data
     * @param server - Matter server instance
     * @param bridgeUsername - Bridge MAC address
     * @param bridgeType - Type of bridge
     * @param bridgeName - Display name of the bridge
     * @returns Transformed accessory info for UI
     */
    private transformAccessoryData;
    /**
     * Get detailed accessory info from a specific server
     *
     * @param server - Matter server instance
     * @param uuid - Accessory UUID
     * @param bridgeUsername - Bridge MAC address
     * @param bridgeType - Type of bridge
     * @returns Accessory info or undefined if not found
     */
    private getAccessoryDetailFromServer;
    /**
     * Get current state from Matter server for an accessory
     */
    private getCurrentStateFromServer;
    /**
     * Teardown Matter servers
     */
    teardown(): Promise<void>;
}
//# sourceMappingURL=MatterBridgeManager.d.ts.map