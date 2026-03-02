"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpcService = exports.IpcOutgoingEvent = exports.IpcIncomingEvent = void 0;
const node_events_1 = require("node:events");
const node_process_1 = __importDefault(require("node:process"));
// eslint-disable-next-line no-restricted-syntax
var IpcIncomingEvent;
(function (IpcIncomingEvent) {
    IpcIncomingEvent["RESTART_CHILD_BRIDGE"] = "restartChildBridge";
    IpcIncomingEvent["STOP_CHILD_BRIDGE"] = "stopChildBridge";
    IpcIncomingEvent["START_CHILD_BRIDGE"] = "startChildBridge";
    IpcIncomingEvent["CHILD_BRIDGE_METADATA_REQUEST"] = "childBridgeMetadataRequest";
    IpcIncomingEvent["START_MATTER_MONITORING"] = "startMatterMonitoring";
    IpcIncomingEvent["STOP_MATTER_MONITORING"] = "stopMatterMonitoring";
    IpcIncomingEvent["GET_MATTER_ACCESSORIES"] = "getMatterAccessories";
    IpcIncomingEvent["GET_MATTER_ACCESSORY_INFO"] = "getMatterAccessoryInfo";
    IpcIncomingEvent["MATTER_ACCESSORY_CONTROL"] = "matterAccessoryControl";
    IpcIncomingEvent["RELOAD_PLUGIN"] = "reloadPlugin";
})(IpcIncomingEvent || (exports.IpcIncomingEvent = IpcIncomingEvent = {}));
// eslint-disable-next-line no-restricted-syntax
var IpcOutgoingEvent;
(function (IpcOutgoingEvent) {
    IpcOutgoingEvent["SERVER_STATUS_UPDATE"] = "serverStatusUpdate";
    IpcOutgoingEvent["CHILD_BRIDGE_METADATA_RESPONSE"] = "childBridgeMetadataResponse";
    IpcOutgoingEvent["CHILD_BRIDGE_STATUS_UPDATE"] = "childBridgeStatusUpdate";
    IpcOutgoingEvent["MATTER_EVENT"] = "matterEvent";
})(IpcOutgoingEvent || (exports.IpcOutgoingEvent = IpcOutgoingEvent = {}));
// eslint-disable-next-line ts/no-unsafe-declaration-merging
class IpcService extends node_events_1.EventEmitter {
    constructor() {
        super();
    }
    /**
     * Start the IPC service listeners/
     * Currently this will only listen for messages from a parent process.
     */
    start() {
        node_process_1.default.on('message', (message) => {
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
        if (node_process_1.default.send) {
            node_process_1.default.send({
                id,
                data,
            });
        }
    }
}
exports.IpcService = IpcService;
//# sourceMappingURL=ipcService.js.map