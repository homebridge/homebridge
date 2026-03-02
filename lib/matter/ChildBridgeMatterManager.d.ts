/**
 * Child Bridge Matter Manager
 *
 * Manages Matter server lifecycle and accessories for child bridges.
 * This class extracts Matter-specific logic from childBridgeFork.ts to minimize changes to core files.
 */
import type { HomebridgeAPI } from '../api.js';
import type { BridgeConfiguration, BridgeOptions } from '../bridgeService.js';
import type { ChildBridgeExternalPortService } from '../externalPortService.js';
import type { AccessoryInfo } from './managerTypes.js';
import type { InternalMatterAccessory } from './types.js';
import { PluginManager } from '../pluginManager.js';
import { BaseMatterManager } from './BaseMatterManager.js';
/**
 * Matter status information for child bridge IPC communication
 */
export interface ChildBridgeMatterStatusInfo {
    qrCode?: string;
    manualPairingCode?: string;
    serialNumber?: string;
    commissioned: boolean;
    deviceCount: number;
}
/**
 * Manages Matter server and accessories for a child bridge
 */
export declare class ChildBridgeMatterManager extends BaseMatterManager {
    private readonly bridgeConfig;
    private readonly bridgeOptions;
    private readonly api;
    private readonly externalPortService;
    private readonly matterConfig?;
    private matterSerialNumber?;
    constructor(bridgeConfig: BridgeConfiguration, bridgeOptions: BridgeOptions, api: HomebridgeAPI, externalPortService: ChildBridgeExternalPortService, pluginManager: PluginManager);
    /**
     * Initialize Matter server for child bridge if enabled
     * @param onCommissioningChanged Optional callback when commissioning status changes
     */
    initialize(onCommissioningChanged?: () => void): Promise<void>;
    /**
     * Start Matter server for child bridge
     */
    private startMatterServer;
    /**
     * Set up Matter API event listeners
     */
    private setupEventListeners;
    /**
     * Handle external Matter accessories - each gets its own dedicated Matter server
     * This is required for devices like Robotic Vacuum Cleaners that Apple Home
     * requires to be on their own bridge.
     */
    handlePublishExternalAccessories(accessories: InternalMatterAccessory[], registrationId: string): Promise<void>;
    /**
     * Get Matter status information for IPC communication
     * Returns undefined if Matter is not enabled for this child bridge
     */
    getMatterStatusInfo(): ChildBridgeMatterStatusInfo | undefined;
    /**
     * Check if Matter is enabled for this child bridge
     */
    isMatterEnabled(): boolean;
    /**
     * Enable state monitoring on all Matter servers
     * Override to add bridge-specific logging
     */
    enableStateMonitoring(): void;
    /**
     * Disable state monitoring on all Matter servers
     * Override to add bridge-specific logging
     */
    disableStateMonitoring(): void;
    /**
     * Collect all Matter accessories for UI display
     */
    collectAllAccessories(): AccessoryInfo[];
    /**
     * Get detailed info for a specific Matter accessory
     *
     * @param uuid - Accessory UUID
     * @returns Accessory info or undefined if not found
     */
    getAccessoryInfo(uuid: string): AccessoryInfo | undefined;
    /**
     * Teardown Matter servers
     */
    teardown(): Promise<void>;
}
//# sourceMappingURL=ChildBridgeMatterManager.d.ts.map