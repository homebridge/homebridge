/**
 * Shared Matter Types
 *
 * These types are used by both the homebridge core and the UI
 * to ensure consistency across the Matter implementation.
 */

/**
 * Matter bridge status states
 */
export enum MatterBridgeStatus {
  /** When the Matter bridge is loading or restarting */
  PENDING = 'pending',

  /** The Matter bridge is online and ready for commissioning */
  OK = 'ok',

  /** The bridge is shutting down or stopped */
  DOWN = 'down',
}

/**
 * Metadata for a Matter bridge instance
 */
export interface MatterBridgeMetadata {
  /** Bridge type identifier (always 'matter') */
  type: 'matter'

  /** Current operational status */
  status: MatterBridgeStatus

  /** Bridge username/identifier */
  username?: string

  /** Bridge port number */
  port?: number

  /** Display name of the bridge */
  name: string

  /** Plugin identifier that owns this bridge */
  plugin: string

  /** Unique identifier for this bridge instance */
  identifier: string

  /** Whether the bridge was manually stopped */
  manuallyStopped?: boolean

  /** Process ID of the bridge if running as child process */
  pid?: number

  /** QR code payload for commissioning */
  qrCode?: string

  /** Manual pairing code for commissioning */
  manualPairingCode?: string

  /** Device serial number */
  serialNumber?: string

  /** Number of devices exposed by this bridge */
  deviceCount: number

  /** Whether the bridge has been commissioned */
  commissioned?: boolean
}

/**
 * Matter commissioning information
 */
export interface MatterCommissioningInfo {
  /** Bridge type (always 'matter') */
  type?: 'matter'

  /** Setup URI/QR code for pairing */
  setupUri?: string | null

  /** PIN/pairing code */
  pin?: string | null

  /** QR code payload for commissioning */
  qrCode?: string

  /** Manual pairing code for commissioning */
  manualPairingCode?: string

  /** Device serial number */
  serialNumber?: string

  /** Whether the device is commissioned */
  commissioned: boolean

  /** Port number if applicable */
  port?: number
}

/**
 * HAP characteristic properties (from hap-nodejs)
 */
export interface CharacteristicProps {
  format?: string
  unit?: string
  minValue?: number
  maxValue?: number
  minStep?: number
  perms?: string[]
  validValues?: number[]
  validValueRanges?: Array<[number, number]>
}

/**
 * HAP characteristic information
 */
export interface CharacteristicInfo {
  type: string
  value: unknown
  props: CharacteristicProps
}

/**
 * HAP service information
 */
export interface ServiceInfo {
  type: string
  subtype?: string
  displayName?: string
  characteristics: CharacteristicInfo[]
}

/**
 * Matter accessory information
 */
export interface MatterAccessoryInfo {
  /** Unique identifier */
  uuid: string

  /** Display name */
  displayName: string

  /** HAP category */
  category: number

  /** Matter device information */
  matterInfo?: {
    /** Whether this is a bridged device */
    bridged: boolean

    /** Child bridge identifier if bridged */
    childBridge?: string

    /** Matter device type */
    deviceType?: string
  }

  /** HAP services */
  services?: ServiceInfo[]
}

/**
 * Matter server configuration
 * Used internally by MatterServer class
 */
export interface MatterServerConfig {
  /** Server port */
  port?: number

  /** Unique identifier (REQUIRED - must be unique for each Matter bridge instance) */
  uniqueId: string

  /** Storage path */
  storagePath?: string

  /** Manufacturer name (inherited from bridge config) */
  manufacturer?: string

  /** Model name (inherited from bridge config) */
  model?: string

  /** Firmware revision (inherited from bridge config) */
  firmwareRevision?: string

  /** Serial number (inherited from bridge config) */
  serialNumber?: string

  /** Enable debug mode for verbose logging */
  debugModeEnabled?: boolean

  /** Display name for the Matter bridge/device */
  displayName?: string

  /** External accessory mode - device is not bridged and so added before server starts */
  externalAccessory?: boolean

  /** Network interfaces to bind to (inherited from `bridge.bind` config) */
  networkInterfaces?: string[]
}

/**
 * Matter accessories collection
 */
export interface MatterAccessoriesResponse {
  /** Child bridge accessories indexed by bridge ID */
  children: { [bridgeId: string]: MatterAccessoryInfo[] }
}

/**
 * IPC message types for Matter child bridges
 * These message types coordinate communication between the main process and Matter child bridge processes
 */
export enum ChildMatterMessageType {
  /** Sent from child process when ready to accept configuration */
  READY = 'ready',

  /** Sent to child process with bridge configuration */
  LOAD = 'load',

  /** Sent from child process when configuration has been loaded */
  LOADED = 'loaded',

  /** Sent to child process to start the Matter bridge */
  START = 'start',

  /** Sent from child process when Matter bridge is online and advertising */
  ONLINE = 'online',

  /** Sent to/from child process to add a Matter accessory */
  ADD_ACCESSORY = 'addAccessory',

  /** Sent to/from child process to remove a Matter accessory */
  REMOVE_ACCESSORY = 'removeAccessory',

  /** Sent from child process with commissioning and operational status updates */
  STATUS_UPDATE = 'statusUpdate',

  /** Sent from child process when an error occurs */
  ERROR = 'error',

  /** Sent to child process to initiate graceful shutdown */
  SHUTDOWN = 'shutdown',
}
