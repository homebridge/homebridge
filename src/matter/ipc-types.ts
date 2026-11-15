/**
 * Matter IPC Types
 *
 * Type definitions for Matter protocol IPC communication between
 * main Homebridge process and child bridges.
 */

import type { FabricInfo } from './server/FabricManager.js'

/**
 * Matter event types
 *
 * `accessoryAdded` and `accessoryRemoved` come from the Matter server itself
 * (server/AccessoryManager.ts), not from a manager. It sends them with
 * `IpcOutgoingEvent.MATTER_EVENT`; in a child bridge they reach the main
 * process only because that id is the same string as
 * `ChildProcessMessageEventType.MATTER_EVENT` (`'matterEvent'`).
 */
export type MatterEventType
  = | 'monitoringStarted'
    | 'monitoringStopped'
    | 'accessoriesData'
    | 'accessoryInfoData'
    | 'accessoryControlResponse'
    | 'accessoryUpdate'
    | 'accessoryAdded'
    | 'accessoryRemoved'
    | 'externalBridgeRegistration' // Register an external Matter bridge (child → main)

/**
 * Matter event payload structure
 */
export interface MatterEvent<T = unknown> {
  type: MatterEventType
  correlationId?: string
  data?: T
}

/**
 * Matter server status information for IPC communication
 */
export interface MatterStatusInfo {
  enabled: boolean
  port?: number
  setupUri?: string
  pin?: string
  serialNumber?: string
  commissioned?: boolean
  deviceCount?: number
  /**
   * When true, the Matter bridge node itself is NOT advertised but plugins
   * may still publish external Matter accessories. The UI uses this to show
   * a distinct status colour (the bridge is configured but the node is
   * intentionally suppressed). Mirrors `bridge.hap.externalsOnly`.
   */
  externalsOnly?: boolean
  /**
   * True when Matter is configured for the bridge but its server did not
   * start (for example its port is in use). The reason is in the log.
   */
  startFailed?: boolean
}

/**
 * The Matter part of the status a child bridge sends to the main process.
 */
export interface ChildBridgeMatterStatusInfo {
  qrCode?: string
  manualPairingCode?: string
  serialNumber?: string
  commissioned: boolean
  deviceCount: number
  fabricCount: number
  fabrics: FabricInfo[]
  /**
   * True when Matter is configured for the child bridge but its server did
   * not start (for example its port is in use). The reason is in the log.
   */
  startFailed?: boolean
}

/**
 * A request from the UI to control one Matter accessory.
 */
export interface MatterControlRequest {
  uuid: string
  cluster: string
  attributes: Record<string, unknown>
  partId?: string
  correlationId?: string
}

/**
 * Server status update message sent from Homebridge to parent process
 */
export interface ServerStatusUpdate {
  status: string
  paired: boolean | null
  setupUri: string | null
  name: string
  username: string
  pin: string
  matter: MatterStatusInfo
}
