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
    private readonly ipcService;
    private readonly externalPortService;
    private readonly config;
    private readonly childBridges;
    private serverStatus;
    constructor(options?: HomebridgeOptions);
    /**
     * Set the current server status and update parent via IPC
     * @param status
     */
    private setServerStatus;
    start(): Promise<void>;
    teardown(): void;
    private publishBridge;
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
    private printSetupInfo;
}
//# sourceMappingURL=server.d.ts.map