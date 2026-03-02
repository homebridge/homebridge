/**
 * External Matter Accessory Publisher
 *
 * Shared logic for publishing external Matter accessories on dedicated bridges.
 * Used by both MatterBridgeManager and ChildBridgeMatterManager to avoid code duplication.
 */
import type { InternalMatterAccessory } from './types.js';
import { MatterServer } from './server.js';
/**
 * Configuration context for publishing external Matter accessories
 */
export interface ExternalAccessoryPublishContext {
    /** Port service for allocating Matter ports */
    portService: {
        requestMatterPort: (uniqueId: string) => Promise<number | null | undefined>;
    };
    /** Network interfaces to bind to (from bridge config) */
    networkInterfaces?: string[];
    /** Whether debug mode is enabled */
    debugModeEnabled?: boolean;
}
/**
 * Result of publishing an external Matter accessory
 */
export interface PublishedExternalAccessory {
    /** The MatterServer instance for this accessory */
    server: MatterServer;
    /** Port the server is running on */
    port: number;
    /** Username (MAC address) of the external Matter bridge */
    username: string;
    /** Commissioning information */
    commissioningInfo: {
        qrCode?: string;
        manualPairingCode?: string;
        serialNumber?: string;
        commissioned: boolean;
    };
}
/**
 * Publish an external Matter accessory on its own dedicated Matter server.
 * This is required for devices like Robotic Vacuum Cleaners that Apple Home
 * requires to be on their own bridge.
 *
 * @param accessory - The Matter accessory to publish
 * @param context - Configuration context for publishing
 * @returns Published accessory info, or null if publishing failed
 */
export declare function publishExternalMatterAccessory(accessory: InternalMatterAccessory, context: ExternalAccessoryPublishContext): Promise<PublishedExternalAccessory | null>;
//# sourceMappingURL=ExternalMatterAccessoryPublisher.d.ts.map