import { EventEmitter } from 'node:events';
export type { MatterEvent, MatterEventType, MatterStatusInfo, ServerStatusUpdate } from './matter/ipc-types.js';
export declare const enum IpcIncomingEvent {
    RESTART_CHILD_BRIDGE = "restartChildBridge",
    STOP_CHILD_BRIDGE = "stopChildBridge",
    START_CHILD_BRIDGE = "startChildBridge",
    CHILD_BRIDGE_METADATA_REQUEST = "childBridgeMetadataRequest",
    START_MATTER_MONITORING = "startMatterMonitoring",
    STOP_MATTER_MONITORING = "stopMatterMonitoring",
    GET_MATTER_ACCESSORIES = "getMatterAccessories",
    GET_MATTER_ACCESSORY_INFO = "getMatterAccessoryInfo",
    MATTER_ACCESSORY_CONTROL = "matterAccessoryControl",
    RELOAD_PLUGIN = "reloadPlugin"
}
export declare const enum IpcOutgoingEvent {
    SERVER_STATUS_UPDATE = "serverStatusUpdate",
    CHILD_BRIDGE_METADATA_RESPONSE = "childBridgeMetadataResponse",
    CHILD_BRIDGE_STATUS_UPDATE = "childBridgeStatusUpdate",
    MATTER_EVENT = "matterEvent"
}
export declare interface IpcService {
    on: ((event: IpcIncomingEvent.RESTART_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void) => this) & ((event: IpcIncomingEvent.STOP_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void) => this) & ((event: IpcIncomingEvent.START_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void) => this) & ((event: IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST, listener: () => void) => this) & ((event: IpcIncomingEvent.START_MATTER_MONITORING, listener: () => void) => this) & ((event: IpcIncomingEvent.STOP_MATTER_MONITORING, listener: () => void) => this) & ((event: IpcIncomingEvent.GET_MATTER_ACCESSORIES, listener: (data: {
        bridgeUsername?: string;
    }) => void) => this) & ((event: IpcIncomingEvent.GET_MATTER_ACCESSORY_INFO, listener: (data: {
        uuid: string;
    }) => void) => this) & ((event: IpcIncomingEvent.MATTER_ACCESSORY_CONTROL, listener: (data: {
        uuid: string;
        cluster: string;
        attributes: Record<string, unknown>;
        partId?: string;
    }) => void) => this) & ((event: IpcIncomingEvent.RELOAD_PLUGIN, listener: (pluginIdentifier: string) => void) => this);
}
export declare class IpcService extends EventEmitter {
    constructor();
    /**
     * Start the IPC service listeners/
     * Currently this will only listen for messages from a parent process.
     */
    start(): void;
    /**
     * Send a message to connected IPC clients.
     * Currently, this will only send messages if Homebridge was launched as a child_process.fork()
     * from another Node.js process (such as hb-service).
     */
    sendMessage(id: IpcOutgoingEvent, data: unknown): void;
}
//# sourceMappingURL=ipcService.d.ts.map