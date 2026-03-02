import type { MacAddress } from '@homebridge/hap-nodejs';
import type { ChildProcessLoadEventData, ChildProcessPortAllocatedEventData } from './childBridgeService.js';
import { ChildProcessMessageEventType } from './childBridgeService.js';
import 'source-map-support/register.js';
export declare class ChildBridgeFork {
    private bridgeService;
    private api;
    private pluginManager;
    private externalPortService;
    private matterManager?;
    private matterMessageHandler?;
    private type;
    private plugin;
    private identifier;
    private pluginConfig;
    private bridgeConfig;
    private bridgeOptions;
    private portRequestCallback;
    constructor();
    sendMessage<T = unknown>(type: ChildProcessMessageEventType, data?: T): void;
    loadPlugin(data: ChildProcessLoadEventData): Promise<void>;
    startBridge(): Promise<void>;
    /**
     * Request the next available external HAP port from the parent process
     * @param username
     */
    requestExternalPort(username: MacAddress): Promise<number | undefined>;
    /**
     * Request the next available Matter port from the parent process
     * @param uniqueId - MAC-derived identifier (without colons)
     */
    requestMatterPort(uniqueId: string): Promise<number | undefined>;
    /**
     * Handles the port allocation response message from the parent process
     * @param data
     */
    handleExternalResponse(data: ChildProcessPortAllocatedEventData): void;
    /**
     * Sends the current pairing status of the child bridge to the parent process
     */
    sendPairedStatusEvent(): void;
    /**
     * Handle start Matter monitoring request from parent process
     */
    handleStartMatterMonitoring(): void;
    /**
     * Handle stop Matter monitoring request from parent process
     */
    handleStopMatterMonitoring(): void;
    /**
     * Handle get Matter accessories request from parent process
     */
    handleGetMatterAccessories(): void;
    /**
     * Handle get Matter accessory info request from parent process
     */
    handleGetMatterAccessoryInfo(data: {
        uuid: string;
    }): void;
    /**
     * Handle Matter accessory control request from parent process
     */
    handleMatterAccessoryControl(data: {
        uuid: string;
        cluster: string;
        attributes: Record<string, unknown>;
        partId?: string;
    }): void;
    shutdown(): void;
}
//# sourceMappingURL=childBridgeFork.d.ts.map