import { Logger } from './logger.js';
/**
 * Allocates ports from the user defined `config.ports` option
 * This service is used to allocate ports for external accessories on the main bridge, and child bridges.
 */
export class ExternalPortService {
    externalPorts;
    nextExternalPort;
    allocatedPorts = new Map();
    constructor(externalPorts) {
        this.externalPorts = externalPorts;
    }
    /**
     * Returns the next available port in the external port config.
     * If the external port is not configured by the user it will return null.
     * If the port range has been exhausted it will return null.
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
        Logger.internal.warn('External port pool ran out of ports. Falling back to random port assignment.');
        return undefined;
    }
}
/**
 * This is the child bridge version of the port allocation service.
 * It requests a free port from the main bridge's port service.
 */
export class ChildBridgeExternalPortService extends ExternalPortService {
    childBridge;
    constructor(childBridge) {
        super();
        this.childBridge = childBridge;
    }
    async requestPort(username) {
        return await this.childBridge.requestExternalPort(username);
    }
}
//# sourceMappingURL=externalPortService.js.map