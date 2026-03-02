import { IpcService } from './ipcService.js';
export interface HomebridgeOptions {
    keepOrphanedCachedAccessories?: boolean;
    hideQRCode?: boolean;
    insecureAccess?: boolean;
    customPluginPath?: string;
    noLogTimestamps?: boolean;
    debugModeEnabled?: boolean;
    forceColourLogging?: boolean;
    customStoragePath?: string;
    strictPluginResolution?: boolean;
}
export declare const enum ServerStatus {
    /**
     * When the server is starting up
     */
    PENDING = "pending",
    /**
     * When the server is online and has published the main bridge
     */
    OK = "ok",
    /**
     * When the server is shutting down
     */
    DOWN = "down"
}
export declare class Server {
    private options;
    private readonly api;
    private readonly pluginManager;
    private readonly bridgeService;
    private readonly externalPortService;
    readonly ipcService: IpcService;
    private readonly config;
    private readonly childBridges;
    private matterManager?;
    private readonly externalMatterBridgeRegistry;
    private matterMonitoringActive;
    private matterMonitoringClients;
    private serverStatus;
    constructor(options?: HomebridgeOptions);
    /**
     * Set the current server status and update parent via IPC
     * @param status
     */
    private setServerStatus;
    start(): Promise<void>;
    teardown(): Promise<void>;
    private publishBridge;
    private handlePublishExternalAccessories;
    private handleRegisterPlatformAccessories;
    private handleUnregisterPlatformAccessories;
    /**
     * Handle Matter command trigger from IPC (for UI control)
     * This is called by IPC handlers, not API events
     */
    private handleTriggerMatterCommand;
    private static loadConfig;
    private loadAccessories;
    private loadPlatforms;
    /**
     * Validate an external bridge config
     */
    private validateChildBridgeConfig;
    /**
     * Takes care of the IPC Events sent to Homebridge
     */
    private initializeIpcEventHandlers;
    /**
     * Handle start Matter monitoring request from UI
     * Only starts monitoring if this is the first client
     */
    private handleStartMatterMonitoring;
    /**
     * Handle stop Matter monitoring request from UI
     * Only stops monitoring when no more clients
     */
    private handleStopMatterMonitoring;
    /**
     * Register an external Matter bridge (e.g., robot vacuum with own bridge)
     * This allows routing control commands directly to the correct owner
     * @param externalBridgeUsername - Username of the external Matter bridge
     * @param ownerUsername - Username of the bridge that owns it (main bridge or child bridge username)
     */
    registerExternalMatterBridge(externalBridgeUsername: string, ownerUsername: string): void;
    /**
     * Get Matter accessories for a specific bridge or all bridges
     * @param bridgeUsername - Optional: specific bridge username (MAC format)
     */
    private handleGetMatterAccessories;
    /**
     * Get detailed info for a specific Matter accessory
     */
    private handleGetMatterAccessoryInfo;
    /**
     * Handle Matter accessory control command
     */
    private handleMatterAccessoryControl;
    private printSetupInfo;
}
//# sourceMappingURL=server.d.ts.map