"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChildBridgeExternalPortService = exports.ExternalPortService = void 0;
const logger_js_1 = require("./logger.js");
const MatterPortAllocator_js_1 = require("./matter/MatterPortAllocator.js");
/**
 * Allocates ports from the user defined `config.ports` and `config.matterPorts` options
 * This service is used to allocate ports for external accessories on the main bridge, and child bridges.
 * HAP ports and Matter ports are managed separately with their own ranges.
 */
class ExternalPortService {
    externalPorts;
    nextExternalPort;
    allocatedPorts = new Map();
    matterPortAllocator;
    constructor(externalPorts, matterPorts, configuredMatterPorts) {
        this.externalPorts = externalPorts;
        // Delegate Matter port allocation to specialized allocator
        this.matterPortAllocator = new MatterPortAllocator_js_1.MatterPortAllocator(matterPorts, configuredMatterPorts);
    }
    /**
     * Returns the next available HAP port in the external port config.
     * If the external port is not configured by the user it will return undefined.
     * If the port range has been exhausted it will return undefined.
     */
    async requestPort(username) {
        // check to see if this device has already requested an external port
        const existingPortAllocation = this.allocatedPorts.get(username);
        if (existingPortAllocation) {
            return existingPortAllocation;
        }
        // get the next unused port
        const port = this.getNextFreePort();
        this.allocatedPorts.set(username, port);
        return port;
    }
    /**
     * Returns the next available Matter port in the Matter port config.
     * Delegates to MatterPortAllocator to keep Matter code in Matter module.
     *
     * @param uuid - Unique identifier for the Matter accessory (can be accessory UUID or other unique string)
     */
    async requestMatterPort(uuid) {
        return await this.matterPortAllocator.requestPort(uuid);
    }
    getNextFreePort() {
        if (!this.externalPorts) {
            return undefined;
        }
        if (this.nextExternalPort === undefined) {
            this.nextExternalPort = this.externalPorts.start;
            return this.nextExternalPort;
        }
        this.nextExternalPort++;
        if (this.nextExternalPort <= this.externalPorts.end) {
            return this.nextExternalPort;
        }
        logger_js_1.Logger.internal.warn('External HAP port pool ran out of ports. Falling back to random port assignment.');
        return undefined;
    }
}
exports.ExternalPortService = ExternalPortService;
/**
 * This is the child bridge version of the port allocation service.
 * It requests free ports from the main bridge's port service via IPC.
 */
class ChildBridgeExternalPortService extends ExternalPortService {
    childBridge;
    constructor(childBridge) {
        super();
        this.childBridge = childBridge;
    }
    async requestPort(username) {
        return await this.childBridge.requestExternalPort(username);
    }
    async requestMatterPort(uniqueId) {
        // For child bridges, request Matter port from parent via IPC
        return await this.childBridge.requestMatterPort(uniqueId);
    }
}
exports.ChildBridgeExternalPortService = ChildBridgeExternalPortService;
//# sourceMappingURL=externalPortService.js.map