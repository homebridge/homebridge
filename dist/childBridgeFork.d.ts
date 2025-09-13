import type { MacAddress } from 'hap-nodejs';
import type { ChildProcessLoadEventData, ChildProcessPortAllocatedEventData } from './childBridgeService.js';
import { ChildProcessMessageEventType } from './childBridgeService.js';
import 'source-map-support/register.js';
export declare class ChildBridgeFork {
    private bridgeService;
    private api;
    private pluginManager;
    private externalPortService;
    private type;
    private plugin;
    private identifier;
    private pluginConfig;
    private bridgeConfig;
    private bridgeOptions;
    private homebridgeConfig;
    private portRequestCallback;
    constructor();
    sendMessage<T = unknown>(type: ChildProcessMessageEventType, data?: T): void;
    loadPlugin(data: ChildProcessLoadEventData): Promise<void>;
    startBridge(): Promise<void>;
    /**
     * Request the next available external port from the parent process
     * @param username
     */
    requestExternalPort(username: MacAddress): Promise<number | undefined>;
    /**
     * Handles the port allocation response message from the parent process
     * @param data
     */
    handleExternalResponse(data: ChildProcessPortAllocatedEventData): void;
    /**
     * Sends the current pairing status of the child bridge to the parent process
     */
    sendPairedStatusEvent(): void;
    shutdown(): void;
}
//# sourceMappingURL=childBridgeFork.d.ts.map