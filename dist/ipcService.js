import { EventEmitter } from 'node:events';
import process from 'node:process';
// eslint-disable-next-line no-restricted-syntax
export var IpcIncomingEvent;
(function (IpcIncomingEvent) {
    IpcIncomingEvent["RESTART_CHILD_BRIDGE"] = "restartChildBridge";
    IpcIncomingEvent["STOP_CHILD_BRIDGE"] = "stopChildBridge";
    IpcIncomingEvent["START_CHILD_BRIDGE"] = "startChildBridge";
    IpcIncomingEvent["CHILD_BRIDGE_METADATA_REQUEST"] = "childBridgeMetadataRequest";
})(IpcIncomingEvent || (IpcIncomingEvent = {}));
// eslint-disable-next-line no-restricted-syntax
export var IpcOutgoingEvent;
(function (IpcOutgoingEvent) {
    IpcOutgoingEvent["SERVER_STATUS_UPDATE"] = "serverStatusUpdate";
    IpcOutgoingEvent["CHILD_BRIDGE_METADATA_RESPONSE"] = "childBridgeMetadataResponse";
    IpcOutgoingEvent["CHILD_BRIDGE_STATUS_UPDATE"] = "childBridgeStatusUpdate";
})(IpcOutgoingEvent || (IpcOutgoingEvent = {}));
// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class IpcService extends EventEmitter {
    constructor() {
        super();
    }
    /**
     * Start the IPC service listeners/
     * Currently this will only listen for messages from a parent process.
     */
    start() {
        process.on('message', (message) => {
            if (!message || typeof message !== 'object' || !message.id) {
                return;
            }
            this.emit(message.id, message.data);
        });
    }
    /**
     * Send a message to connected IPC clients.
     * Currently, this will only send messages if Homebridge was launched as a child_process.fork()
     * from another Node.js process (such as hb-service).
     */
    sendMessage(id, data) {
        if (process.send) {
            process.send({
                id,
                data,
            });
        }
    }
}
//# sourceMappingURL=ipcService.js.map