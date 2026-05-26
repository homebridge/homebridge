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
  fabricIndex: number
  /** Fabric ID — string because Matter fabric IDs are 64-bit and must survive IPC/JSON */
  fabricId: string
  /** Node ID on this fabric — string for the same reason as fabricId */
  nodeId: string
  /** Vendor ID */
  vendorId: number
  /** Label for this fabric */
  label?: string
}

/**
 * Detailed information about a Matter accessory for UI display
 */
export interface AccessoryInfo {
  // Identity
  uuid: string
  displayName: string
  serialNumber: string
  manufacturer: string
  model: string
  firmwareRevision?: string
  hardwareRevision?: string
  softwareVersion?: string

  // Device type
  deviceType: string

  // Current cluster states
  clusters: Record<string, Record<string, unknown>>

  // Parts (for composed devices)
  parts?: AccessoryPartInfo[]

  // Bridge info
  bridge: {
    username: string
    type: 'main' | 'child' | 'external'
    name: string
  }

  // Plugin info
  plugin: string
  platform: string

  // Context (plugin-specific data)
  context?: Record<string, unknown>

  // Commissioning info
  commissioned: boolean
  fabricCount: number
  fabrics: FabricInfo[]
}

/**
 * Information about a part of a composed accessory
 */
export interface AccessoryPartInfo {
  id: string
  displayName?: string
  deviceType: string
  clusters: Record<string, Record<string, unknown>>
}

/**
 * Matter cluster attribute map
 * Used throughout the codebase for passing cluster attributes
 */
export type MatterAttributeMap = Record<string, unknown>

/**
 * Command mapping result from ClusterCommandMapper
 */
export interface CommandMapping {
  /** Command name to invoke */
  command: string
  /** Optional command arguments */
  args?: Record<string, unknown>
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
  map: (attributes: MatterAttributeMap) => CommandMapping | null
}

/**
 * Result of publishing an external Matter accessory
 */
export interface PublishExternalAccessoryResult {
  /** The MatterServer instance for this accessory */
  server: unknown // Avoid circular dependency, imported where needed
  /** Port the server is running on */
  port: number
  /** Username (MAC address) of the external Matter bridge */
  username: string
  /** Commissioning information */
  commissioningInfo: {
    qrCode?: string
    manualPairingCode?: string
    serialNumber?: string
    commissioned: boolean
  }
}
