/**
 * Manager Types
 *
 * Type definitions for Matter manager classes and their return values.
 * These types were extracted from inline definitions to improve type safety.
 */
/**
 * Fabric information for a commissioned Matter device
 */
export interface FabricInfo {
    /** Fabric index */
    fabricIndex: number;
    /** Fabric ID */
    fabricId: bigint;
    /** Node ID on this fabric */
    nodeId: bigint;
    /** Vendor ID */
    vendorId: number;
    /** Label for this fabric */
    label?: string;
}
/**
 * Detailed information about a Matter accessory for UI display
 */
export interface AccessoryInfo {
    uuid: string;
    displayName: string;
    serialNumber: string;
    manufacturer: string;
    model: string;
    firmwareRevision?: string;
    hardwareRevision?: string;
    softwareVersion?: string;
    deviceType: string;
    clusters: Record<string, Record<string, unknown>>;
    parts?: AccessoryPartInfo[];
    bridge: {
        username: string;
        type: 'main' | 'child' | 'external';
        name: string;
    };
    plugin: string;
    platform: string;
    context?: Record<string, unknown>;
    commissioned: boolean;
    fabricCount: number;
    fabrics: FabricInfo[];
}
/**
 * Information about a part of a composed accessory
 */
export interface AccessoryPartInfo {
    id: string;
    displayName?: string;
    deviceType: string;
    clusters: Record<string, Record<string, unknown>>;
}
/**
 * Matter cluster attribute map
 * Used throughout the codebase for passing cluster attributes
 */
export type MatterAttributeMap = Record<string, unknown>;
/**
 * Command mapping result from ClusterCommandMapper
 */
export interface CommandMapping {
    /** Command name to invoke */
    command: string;
    /** Optional command arguments */
    args?: Record<string, unknown>;
}
/**
 * Attribute-to-command mapping function
 */
export interface AttributeToCommandMapping {
    /**
     * Map attributes to a command name and optional arguments
     *
     * @param attributes - Cluster attributes to map
     * @returns Command mapping or null if no command needed (state-only update)
     */
    map: (attributes: MatterAttributeMap) => CommandMapping | null;
}
/**
 * Result of publishing an external Matter accessory
 */
export interface PublishExternalAccessoryResult {
    /** The MatterServer instance for this accessory */
    server: unknown;
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
//# sourceMappingURL=managerTypes.d.ts.map