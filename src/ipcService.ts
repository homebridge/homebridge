import { EventEmitter } from 'node:events'
import process from 'node:process'

import { sendToParent } from './util/ipc.js'

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

interface MatterControlRequest {
  uuid: string
  cluster: string
  attributes: Record<string, unknown>
  partId?: string
  correlationId?: string
}

/**
 * The requests the parent process can send, each with the listener it takes.
 */
interface IpcIncomingListeners {
  [IpcIncomingEvent.RESTART_CHILD_BRIDGE]: (childBridgeUsername: string) => void
  [IpcIncomingEvent.STOP_CHILD_BRIDGE]: (childBridgeUsername: string) => void
  [IpcIncomingEvent.START_CHILD_BRIDGE]: (childBridgeUsername: string) => void
  [IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST]: () => void
  [IpcIncomingEvent.START_MATTER_MONITORING]: (data?: { correlationId?: string }) => void
  [IpcIncomingEvent.STOP_MATTER_MONITORING]: (data?: { correlationId?: string }) => void
  [IpcIncomingEvent.GET_MATTER_ACCESSORIES]: (data: { bridgeUsername?: string, correlationId?: string }) => void
  [IpcIncomingEvent.GET_MATTER_ACCESSORY_INFO]: (data: { uuid: string, correlationId?: string }) => void
  [IpcIncomingEvent.MATTER_ACCESSORY_CONTROL]: (data: MatterControlRequest) => void
}

const INCOMING_EVENTS: ReadonlySet<string> = new Set<keyof IpcIncomingListeners>([
  IpcIncomingEvent.RESTART_CHILD_BRIDGE,
  IpcIncomingEvent.STOP_CHILD_BRIDGE,
  IpcIncomingEvent.START_CHILD_BRIDGE,
  IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST,
  IpcIncomingEvent.START_MATTER_MONITORING,
  IpcIncomingEvent.STOP_MATTER_MONITORING,
  IpcIncomingEvent.GET_MATTER_ACCESSORIES,
  IpcIncomingEvent.GET_MATTER_ACCESSORY_INFO,
  IpcIncomingEvent.MATTER_ACCESSORY_CONTROL,
])

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export declare interface IpcService {
  on: <E extends keyof IpcIncomingListeners>(event: E, listener: IpcIncomingListeners[E]) => this
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class IpcService extends EventEmitter {
  private readonly messageHandler = (message: { id: string, data: unknown }) => {
    if (!message || typeof message !== 'object' || !message.id) {
      return
    }
    // Only the requests above are passed on. The id used to be emitted as it
    // came: a message with the id `error` is an `error` event with no
    // listener, which throws and takes Homebridge down.
    if (!INCOMING_EVENTS.has(message.id)) {
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
    sendToParent({ id, data })
  }
}
