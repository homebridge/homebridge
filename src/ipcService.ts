import { EventEmitter } from "events";

export const enum IpcIncomingEvent {
  RESTART_CHILD_BRIDGE = "restartChildBridge",
  STOP_CHILD_BRIDGE = "stopChildBridge",
  START_CHILD_BRIDGE = "startChildBridge",
  CHILD_BRIDGE_METADATA_REQUEST = "childBridgeMetadataRequest",
}

export const enum IpcOutgoingEvent {
  SERVER_STATUS_UPDATE = "serverStatusUpdate",
  CHILD_BRIDGE_METADATA_RESPONSE = "childBridgeMetadataResponse",
  CHILD_BRIDGE_STATUS_UPDATE = "childBridgeStatusUpdate",
}

export declare interface IpcService {
  on(event: IpcIncomingEvent.RESTART_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void): this;
  on(event: IpcIncomingEvent.STOP_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void): this;
  on(event: IpcIncomingEvent.START_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void): this;
  on(event: IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST, listener: () => void): this;
}

export class IpcService extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Start the IPC service listeners/
   * Currently this will only listen for messages from a parent process.
   */
  public start(): void {
    process.on("message", (message: { id: string, data: never }) => {
      if (!message || typeof message !== "object" || !message.id) {
        return;
      }
      this.emit(message.id, message.data);
    });
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
      });
    }
  }

}
