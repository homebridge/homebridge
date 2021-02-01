import { EventEmitter } from "events";

export const enum IpcApiEvent {
  RESTART_CHILD_BRIDGE = "restartChildBridge"
}

export declare interface IpcService {
  on(event: IpcApiEvent.RESTART_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void): this;
}

export class IpcService extends EventEmitter {
  constructor() {
    super();
  }

  public start(): void {
    process.on("message", (message) => {
      if (typeof message !== "object" || !message.id) {
        return;
      }
      this.emit(message.id, message.data);
    });
  }
}