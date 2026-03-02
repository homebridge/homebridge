/**
 * Matter.js Server Implementation for Homebridge Plugin API
 *
 * This is a thin facade that delegates to focused submodules under ./server/.
 * All public method signatures are preserved for external callers.
 */
import type { SerializedMatterAccessory } from './accessoryCache.js';
import type { MatterServerConfig } from './sharedTypes.js';
import { EventEmitter } from 'node:events';
import { clusters, deviceTypes, MatterAccessory, MatterServerEvents } from './types.js';
/**
 * Matter Server for Homebridge Plugin API
 * Allows plugins to register Matter accessories explicitly
 */
export declare class MatterServer extends EventEmitter {
    on: <K extends keyof MatterServerEvents>(event: K, listener: MatterServerEvents[K]) => this;
    emit: <K extends keyof MatterServerEvents>(event: K, ...args: Parameters<MatterServerEvents[K]>) => boolean;
    removeListener: <K extends keyof MatterServerEvents>(event: K, listener: MatterServerEvents[K]) => this;
    removeAllListeners: (event?: keyof MatterServerEvents) => this;
    private readonly config;
    private serverNode;
    private aggregator;
    private accessories;
    private readonly behaviorRegistry;
    private readonly registryManager;
    private isRunning;
    private shutdownHandler;
    private cleanupHandlers;
    private accessoryCache;
    private monitoringEnabled;
    username: string;
    bridgeName: string;
    private readonly commissioningManager;
    private readonly fabricManager;
    private readonly serverLifecycle;
    private readonly stateManager;
    private readonly accessoryManager;
    private readonly accessoryQuery;
    constructor(config: MatterServerConfig);
    start(): Promise<void>;
    runServer(): Promise<void>;
    stop(): Promise<void>;
    registerPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]): Promise<void>;
    unregisterAccessory(uuid: string): Promise<void>;
    unregisterPlatformAccessories(_pluginIdentifier: string, _platformName: string, accessories: MatterAccessory[]): Promise<void>;
    updatePlatformAccessories(accessories: MatterAccessory[]): Promise<void>;
    updateAccessoryState(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void>;
    getAccessoryState(uuid: string, cluster: string, partId?: string): Record<string, unknown> | undefined;
    triggerCommand(uuid: string, cluster: string, command: string, args?: Record<string, unknown>, partId?: string): Promise<void>;
    getAccessories(): MatterAccessory[];
    getAccessory(uuid: string): MatterAccessory | undefined;
    getAllCachedAccessories(): SerializedMatterAccessory[];
    collectAccessories(bridgeUsername: string, bridgeType: string, bridgeName: string): any[];
    getAccessoryInfo(uuid: string): any | undefined;
    getFabricInfo(): import("./server/FabricManager.js").FabricInfo[];
    isCommissioned(): boolean;
    getCommissionedFabricCount(): number;
    removeFabric(fabricIndex: number): Promise<void>;
    hasFabric(fabricIndex: number): boolean;
    getCommissioningInfo(): {
        qrCode?: string;
        manualPairingCode?: string;
        serialNumber?: string;
        passcode?: number;
        discriminator?: number;
        commissioned: boolean;
    };
    getServerInfo(): {
        running: boolean;
        port: number;
        deviceCount: number;
        commissioned: boolean;
        fabricCount: number;
        serialNumber?: string;
    };
    getStorageStats(): null;
    isServerRunning(): boolean;
    getDeviceTypes(): typeof deviceTypes;
    getClusters(): typeof clusters;
    enableStateMonitoring(): void;
    disableStateMonitoring(): void;
    isMonitoringEnabled(): boolean;
    notifyStateChange(uuid: string, cluster: string, state: Record<string, unknown>, partId?: string): void;
    private getCommissioningDeps;
    private getLifecycleDeps;
    private getAccessoryManagerDeps;
}
//# sourceMappingURL=server.d.ts.map