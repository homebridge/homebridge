import type { MacAddress } from 'hap-nodejs';
import type { ChildBridgeFork } from './childBridgeFork.js';
export interface ExternalPortsConfiguration {
    start: number;
    end: number;
}
/**
 * Allocates ports from the user defined `config.ports` option
 * This service is used to allocate ports for external accessories on the main bridge, and child bridges.
 */
export declare class ExternalPortService {
    private externalPorts?;
    private nextExternalPort?;
    private allocatedPorts;
    constructor(externalPorts?: ExternalPortsConfiguration | undefined);
    /**
     * Returns the next available port in the external port config.
     * If the external port is not configured by the user it will return null.
     * If the port range has been exhausted it will return null.
     */
    requestPort(username: MacAddress): Promise<number | undefined>;
    private getNextFreePort;
}
/**
 * This is the child bridge version of the port allocation service.
 * It requests a free port from the main bridge's port service.
 */
export declare class ChildBridgeExternalPortService extends ExternalPortService {
    private childBridge;
    constructor(childBridge: ChildBridgeFork);
    requestPort(username: MacAddress): Promise<number | undefined>;
}
//# sourceMappingURL=externalPortService.d.ts.map