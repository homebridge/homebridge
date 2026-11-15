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
/**
 * What a MatterServer returns for one accessory: the identity, device type,
 * state and parts, without the fields that need the bridge, the accessory
 * cache or the commissioning state.
 */
export type ServerAccessoryData = Pick<AccessoryInfo, 'uuid' | 'displayName' | 'deviceType' | 'manufacturer' | 'model' | 'serialNumber' | 'firmwareRevision' | 'clusters' | 'parts'>

/**
 * What a MatterServer lists for the UI: {@link ServerAccessoryData} and the bridge it is on.
 */
export type ServerAccessoryListEntry = ServerAccessoryData & Pick<AccessoryInfo, 'bridge'>

export interface AccessoryPartInfo {
  id: string
  displayName?: string
  deviceType: string
  clusters: Record<string, Record<string, unknown>>
}
