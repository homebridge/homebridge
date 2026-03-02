/**
 * Matter Port Allocator
 *
 * Handles allocation of Matter protocol ports for the main bridge and external accessories.
 */
import type { ExternalPortsConfiguration } from '../externalPortService.js';
/**
 * Allocates Matter ports from the user-defined `config.matterPorts` option.
 * Separate from HAP port allocation to avoid conflicts.
 */
export declare class MatterPortAllocator {
    private matterPorts?;
    private allocatedPorts;
    private readonly configuredPorts;
    constructor(matterPorts?: ExternalPortsConfiguration | undefined, configuredMatterPorts?: number[]);
    /**
     * Returns the next available Matter port in the Matter port config.
     * If Matter ports are not configured, falls back to range 5530-5541.
     * If the port range has been exhausted it will return undefined.
     *
     * @param uuid - Unique identifier for the Matter accessory (can be accessory UUID or other unique string)
     */
    requestPort(uuid: string): Promise<number | undefined>;
    /**
     * Get the next free Matter port from the configured range
     */
    private getNextFreePort;
    /**
     * Get statistics about port allocation
     */
    getStats(): {
        allocatedCount: number;
        configuredPortsCount: number;
    };
}
//# sourceMappingURL=MatterPortAllocator.d.ts.map