import { EventEmitter } from 'node:events';
export declare const enum IpcIncomingEvent {
    RESTART_CHILD_BRIDGE = "restartChildBridge",
    STOP_CHILD_BRIDGE = "stopChildBridge",
    START_CHILD_BRIDGE = "startChildBridge",
    CHILD_BRIDGE_METADATA_REQUEST = "childBridgeMetadataRequest"
}
export declare const enum IpcOutgoingEvent {
    SERVER_STATUS_UPDATE = "serverStatusUpdate",
    CHILD_BRIDGE_METADATA_RESPONSE = "childBridgeMetadataResponse",
    CHILD_BRIDGE_STATUS_UPDATE = "childBridgeStatusUpdate"
}
export declare interface IpcService {
    on: ((event: IpcIncomingEvent.RESTART_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void) => this) & ((event: IpcIncomingEvent.STOP_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void) => this) & ((event: IpcIncomingEvent.START_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void) => this) & ((event: IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST, listener: () => void) => this);
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