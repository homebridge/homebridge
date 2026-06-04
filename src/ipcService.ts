import { EventEmitter } from 'node:events'
import process from 'node:process'

// Re-export Matter IPC types from Matter module
export type { MatterEvent, MatterEventType, MatterStatusInfo, ServerStatusUpdate } from './matter/ipc-types.js'

// eslint-disable-next-line no-restricted-syntax
export const enum IpcIncomingEvent {
  RESTART_CHILD_BRIDGE = 'restartChildBridge',
  STOP_CHILD_BRIDGE = 'stopChildBridge',
  START_CHILD_BRIDGE = 'startChildBridge',
  CHILD_BRIDGE_METADATA_REQUEST = 'childBridgeMetadataRequest',
  START_MATTER_MONITORING = 'startMatterMonitoring',
  STOP_MATTER_MONITORING = 'stopMatterMonitoring',
  GET_MATTER_ACCESSORIES = 'getMatterAccessories',
  GET_MATTER_ACCESSORY_INFO = 'getMatterAccessoryInfo',
  MATTER_ACCESSORY_CONTROL = 'matterAccessoryControl',
}

// eslint-disable-next-line no-restricted-syntax
export const enum IpcOutgoingEvent {
  SERVER_STATUS_UPDATE = 'serverStatusUpdate',
  CHILD_BRIDGE_METADATA_RESPONSE = 'childBridgeMetadataResponse',
  CHILD_BRIDGE_STATUS_UPDATE = 'childBridgeStatusUpdate',
  MATTER_EVENT = 'matterEvent',
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export declare interface IpcService {
  on: ((event: IpcIncomingEvent.RESTART_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void) => this) & ((event: IpcIncomingEvent.STOP_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void) => this) & ((event: IpcIncomingEvent.START_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void) => this) & ((event: IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST, listener: () => void) => this) & ((event: IpcIncomingEvent.START_MATTER_MONITORING, listener: (data?: { correlationId?: string }) => void) => this) & ((event: IpcIncomingEvent.STOP_MATTER_MONITORING, listener: (data?: { correlationId?: string }) => void) => this) & ((event: IpcIncomingEvent.GET_MATTER_ACCESSORIES, listener: (data: { bridgeUsername?: string, correlationId?: string }) => void) => this) & ((event: IpcIncomingEvent.GET_MATTER_ACCESSORY_INFO, listener: (data: { uuid: string }) => void) => this) & ((event: IpcIncomingEvent.MATTER_ACCESSORY_CONTROL, listener: (data: { uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string }) => void) => this)
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class IpcService extends EventEmitter {
  private readonly messageHandler = (message: { id: string, data: unknown }) => {
    if (!message || typeof message !== 'object' || !message.id) {
      return
    }
    this.emit(message.id, message.data)
  }

  constructor() {
    super()
  }

  /**
   * Start the IPC service listeners.
   * Currently this will only listen for messages from a parent process.
   */
  public start(): void {
    process.on('message', this.messageHandler)
  }

  /**
   * Stop the IPC service listeners.
   */
  public stop(): void {
    process.removeListener('message', this.messageHandler)
    // Also drop any EventEmitter listeners registered via ipcService.on(...)
    // by Server. Without this, those listeners outlive the service and retain
    // the Server through closures across hypothetical reload scenarios.
    this.removeAllListeners()
  }

  /**
   * Send a message to connected IPC clients.
   * Currently, this will only send messages if Homebridge was launched as a child_process.fork()
   * from another Node.js process (such as hb-service).
   */
  public sendMessage(id: IpcOutgoingEvent, data: unknown): void {
    if (process.send) {
      process.send({
        id,
        data,
      })
    }
  }
}
