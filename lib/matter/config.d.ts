/**
 * Lightweight Matter Configuration Utilities
 *
 * This module provides config collection and validation without importing
 * heavy Matter.js libraries. This ensures fast startup for users without
 * Matter configured.
 */
import type { HomebridgeConfig } from '../bridgeService.js';
/**
 * Lightweight config collector that doesn't require Matter.js imports
 */
export declare class MatterConfigCollector {
    /**
     * Check if any Matter configuration exists in the config
     */
    static hasMatterConfig(config: HomebridgeConfig): boolean;
    /**
     * Collect all configured Matter ports from config to avoid conflicts
     */
    static collectConfiguredMatterPorts(config: HomebridgeConfig): number[];
    /**
     * Validate the matterPorts pool configuration
     * Ensures start and end are defined and start <= end
     *
     * @param config - The Homebridge configuration
     */
    static validateMatterPortsPool(config: HomebridgeConfig): void;
    /**
     * Validate Matter configuration (lazy-loads validator only when needed)
     * This function dynamically imports the full validator to avoid loading it
     * when Matter is not configured.
     */
    static validateMatterConfig(config: HomebridgeConfig): Promise<void>;
    /**
     * Check for port conflicts between main bridge and child bridges
     *
     * @param config - The Homebridge configuration
     */
    private static checkPortConflicts;
}
//# sourceMappingURL=config.d.ts.map