import path from "path";
import { IPC } from "node-ipc";
import { EventEmitter } from "events";

import { User } from "./user";
import { Logger } from "./logger";

const log = Logger.internal;

export const enum IpcApiEvent {
  RESTART_CHILD_BRIDGE = "restartChildBridge"
}

export declare interface IpcService {
  on(event: IpcApiEvent.RESTART_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void): this;
}

export class IpcService extends EventEmitter {
  private ipc = new IPC()

  constructor() {
    super();
    
    this.ipc.config.appspace = ".homebridge.";
    this.ipc.config.socketRoot = User.storagePath() + path.sep;
    this.ipc.config.id = "sock";
    this.ipc.config.silent = true;
  }

  public start(): void {
    this.ipc.serve(() => {
      this.ipc.server.on(IpcApiEvent.RESTART_CHILD_BRIDGE, (childBridgeUsername: string) => {
        this.emit(IpcApiEvent.RESTART_CHILD_BRIDGE, childBridgeUsername);
      });
    });

    this.ipc.server.on("error", (err) => {
      log.error("IPC Service Error:", err.message);
    });

    this.ipc.server.start();
  }

  /**
   * Stop the IPC Server
   */
  public stop(): void {
    try {
      this.ipc.server.stop();
    } catch (e) {
      log.error("Error shutting down IPC Service:", e.message);
    }
  }

}