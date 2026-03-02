import type { MacAddress } from '@homebridge/hap-nodejs';
import type { ChildBridgeFork } from './childBridgeFork.js';
export interface ExternalPortsConfiguration {
    start: number;
    end: number;
}
/**
 * Allocates ports from the user defined `config.ports` and `config.matterPorts` options
 * This service is used to allocate ports for external accessories on the main bridge, and child bridges.
 * HAP ports and Matter ports are managed separately with their own ranges.
 */
export declare class ExternalPortService {
    private externalPorts?;
    private nextExternalPort?;
    private allocatedPorts;
    private readonly matterPortAllocator;
    constructor(externalPorts?: ExternalPortsConfiguration | undefined, matterPorts?: ExternalPortsConfiguration, configuredMatterPorts?: number[]);
    /**
     * Returns the next available HAP port in the external port config.
     * If the external port is not configured by the user it will return undefined.
     * If the port range has been exhausted it will return undefined.
     */
    requestPort(username: MacAddress): Promise<number | undefined>;
    /**
     * Returns the next available Matter port in the Matter port config.
     * Delegates to MatterPortAllocator to keep Matter code in Matter module.
     *
     * @param uuid - Unique identifier for the Matter accessory (can be accessory UUID or other unique string)
     */
    requestMatterPort(uuid: string): Promise<number | undefined>;
    private getNextFreePort;
}
/**
 * This is the child bridge version of the port allocation service.
 * It requests free ports from the main bridge's port service via IPC.
 */
export declare class ChildBridgeExternalPortService extends ExternalPortService {
    private childBridge;
    constructor(childBridge: ChildBridgeFork);
    requestPort(username: MacAddress): Promise<number | undefined>;
    requestMatterPort(uniqueId: string): Promise<number | undefined>;
}
//# sourceMappingURL=externalPortService.d.ts.map