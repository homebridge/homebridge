import type { MacAddress } from 'hap-nodejs';
import type { HomebridgeAPI } from './api.js';
import type { AccessoryConfig, BridgeConfiguration, BridgeOptions, HomebridgeConfig, PlatformConfig } from './bridgeService.js';
import type { ExternalPortService } from './externalPortService.js';
import type { IpcService } from './ipcService.js';
import type { Plugin } from './plugin.js';
import type { HomebridgeOptions } from './server.js';
import { PluginType } from './api.js';
export declare const enum ChildProcessMessageEventType {
    /**
     * Sent from the child process when it is ready to accept config
     */
    READY = "ready",
    /**
     * Sent to the child process with a ChildProcessLoadEventData payload
     */
    LOAD = "load",
    /**
     * Sent from the child process once it has loaded the plugin
     */
    LOADED = "loaded",
    /**
     * Sent to the child process telling it to start
     */
    START = "start",
    /**
     * Sent from the child process when the bridge is online
     */
    ONLINE = "online",
    /**
     * Sent from the child when it wants to request port allocation for an external accessory
     */
    PORT_REQUEST = "portRequest",
    /**
     * Sent from the parent with the port allocation response
     */
    PORT_ALLOCATED = "portAllocated",
    /**
     * Sent from the child to update its current status
     */
    STATUS_UPDATE = "status"
}
export declare const enum ChildBridgeStatus {
    /**
     * When the child bridge is loading, or restarting
     */
    PENDING = "pending",
    /**
     * The child bridge is online and has published it's accessory
     */
    OK = "ok",
    /**
     * The bridge is shutting down, or the process ended unexpectedly
     */
    DOWN = "down"
}
export interface ChildProcessMessageEvent<T> {
    id: ChildProcessMessageEventType;
    data?: T;
}
export interface ChildProcessLoadEventData {
    type: PluginType;
    identifier: string;
    pluginPath: string;
    pluginConfig: Array<PlatformConfig | AccessoryConfig>;
    bridgeConfig: BridgeConfiguration;
    homebridgeConfig: HomebridgeConfig;
    bridgeOptions: BridgeOptions;
}
export interface ChildProcessPluginLoadedEventData {
    version: string;
}
export interface ChildProcessPortRequestEventData {
    username: MacAddress;
}
export interface ChildProcessPortAllocatedEventData {
    username: MacAddress;
    port?: number;
}
export interface ChildBridgePairedStatusEventData {
    paired: boolean | null;
    setupUri: string | null;
}
export interface ChildMetadata {
    status: ChildBridgeStatus;
    paired?: boolean | null;
    setupUri?: string | null;
    username: MacAddress;
    port?: number;
    pin: string;
    name: string;
    plugin: string;
    identifier: string;
    manuallyStopped: boolean;
    pid?: number;
}
/**
 * Manages the child processes of platforms/accessories being exposed as separate forked bridges.
 * A child bridge runs a single platform or accessory.
 */
export declare class ChildBridgeService {
    type: PluginType;
    identifier: string;
    private plugin;
    private bridgeConfig;
    private homebridgeConfig;
    private homebridgeOptions;
    private api;
    private ipcService;
    private externalPortService;
    private child?;
    private args;
    private processEnv;
    private shuttingDown;
    private lastBridgeStatus;
    private pairedStatus;
    private manuallyStopped;
    private setupUri;
    private pluginConfig;
    private log;
    private displayName?;
    private restartCount;
    private readonly maxRestarts;
    constructor(type: PluginType, identifier: string, plugin: Plugin, bridgeConfig: BridgeConfiguration, homebridgeConfig: HomebridgeConfig, homebridgeOptions: HomebridgeOptions, api: HomebridgeAPI, ipcService: IpcService, externalPortService: ExternalPortService);
    /**
     * Start the child bridge service
     */
    start(): void;
    /**
     * Add a config block to a child bridge.
     * Platform child bridges can only contain one config block.
     * @param config
     */
    addConfig(config: PlatformConfig | AccessoryConfig): void;
    private get bridgeStatus();
    private set bridgeStatus(value);
    /**
     * Start the child bridge process
     */
    private startChildProcess;
    /**
     * Called when the child bridge process exits, if Homebridge is not shutting down, it will restart the process
     * @param code
     * @param signal
     */
    private handleProcessClose;
    /**
     * Helper function to send a message to the child process
     * @param type
     * @param data
     */
    private sendMessage;
    /**
     * Some plugins may make use of the homebridge process flags
     * These will be passed through to the forked process
     */
    private setProcessFlags;
    /**
     * Set environment variables for the child process
     */
    private setProcessEnv;
    /**
     * Tell the child process to load the given plugin
     */
    private loadPlugin;
    /**
     * Tell the child bridge to start broadcasting
     */
    private startBridge;
    /**
     * Handle external port requests from child
     */
    private handlePortRequest;
    /**
     * Send sigterm to the child bridge
     */
    private teardown;
    /**
     * Trigger sending child bridge metadata to the process parent via IPC
     */
    private sendStatusUpdate;
    /**
     * Restarts the child bridge process
     */
    restartChildBridge(): void;
    /**
     * Stops the child bridge, not starting it again
     */
    stopChildBridge(): void;
    /**
     * Starts the child bridge, only if it was manually stopped and is no longer running
     */
    startChildBridge(): void;
    /**
     * Read the config.json file from disk and refresh the plugin config block for just this plugin
     */
    refreshConfig(): Promise<void>;
    /**
     * Returns metadata about this child bridge
     */
    getMetadata(): ChildMetadata;
}
//# sourceMappingURL=childBridgeService.d.ts.map