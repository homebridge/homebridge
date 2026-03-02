"use strict";
/**
 * Shared Matter Types
 *
 * These types are used by both the homebridge core and the UI
 * to ensure consistency across the Matter implementation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChildMatterMessageType = exports.MatterBridgeStatus = void 0;
/**
 * Matter bridge status states
 */
var MatterBridgeStatus;
(function (MatterBridgeStatus) {
    /** When the Matter bridge is loading or restarting */
    MatterBridgeStatus["PENDING"] = "pending";
    /** The Matter bridge is online and ready for commissioning */
    MatterBridgeStatus["OK"] = "ok";
    /** The bridge is shutting down or stopped */
    MatterBridgeStatus["DOWN"] = "down";
})(MatterBridgeStatus || (exports.MatterBridgeStatus = MatterBridgeStatus = {}));
/**
 * IPC message types for Matter child bridges
 * These message types coordinate communication between the main process and Matter child bridge processes
 */
var ChildMatterMessageType;
(function (ChildMatterMessageType) {
    /** Sent from child process when ready to accept configuration */
    ChildMatterMessageType["READY"] = "ready";
    /** Sent to child process with bridge configuration */
    ChildMatterMessageType["LOAD"] = "load";
    /** Sent from child process when configuration has been loaded */
    ChildMatterMessageType["LOADED"] = "loaded";
    /** Sent to child process to start the Matter bridge */
    ChildMatterMessageType["START"] = "start";
    /** Sent from child process when Matter bridge is online and advertising */
    ChildMatterMessageType["ONLINE"] = "online";
    /** Sent to/from child process to add a Matter accessory */
    ChildMatterMessageType["ADD_ACCESSORY"] = "addAccessory";
    /** Sent to/from child process to remove a Matter accessory */
    ChildMatterMessageType["REMOVE_ACCESSORY"] = "removeAccessory";
    /** Sent from child process with commissioning and operational status updates */
    ChildMatterMessageType["STATUS_UPDATE"] = "statusUpdate";
    /** Sent from child process when an error occurs */
    ChildMatterMessageType["ERROR"] = "error";
    /** Sent to child process to initiate graceful shutdown */
    ChildMatterMessageType["SHUTDOWN"] = "shutdown";
})(ChildMatterMessageType || (exports.ChildMatterMessageType = ChildMatterMessageType = {}));
//# sourceMappingURL=sharedTypes.js.map