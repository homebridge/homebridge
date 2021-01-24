import child_process from "child_process";
import path from "path";

import { HomebridgeAPI, PluginType } from "./api";
import { Logger } from "./logger";
import { Plugin } from "./plugin";
import { User } from "./user";
import {
  AccessoryConfig,
  BridgeConfiguration,
  BridgeOptions,
  HomebridgeConfig,
  PlatformConfig, 
} from "./bridgeService";

export const enum ChildProcessMessageEventType {
  /**
   * Sent from the child process when it is ready to accept config
   */
  READY = "ready",    

  /**
   * Sent to the child process with a ChildProcessLoadEventData payload
   */
  LOAD = "load",

  /**
   * Sent from the child process once it has loaded the plugin
   */
  LOADED = "loaded", 

  /**
   * Sent to the child process telling it to start
   */
  START = "start",
}

export interface ChildProcessMessageEvent<T> {
  id: ChildProcessMessageEventType;
  data?: T
}

export interface ChildProcessLoadEventData {
  type: PluginType;
  identifier: string;
  pluginPath: string;
  pluginConfig: PlatformConfig | AccessoryConfig;
  bridgeConfig: BridgeConfiguration;
  homebridgeConfig: HomebridgeConfig;
  bridgeOptions: BridgeOptions;
}

/**
 * Manages the child processes of plugins being exposed as seperate forked bridges.
 */
export class ChildPluginService {
  private child?: child_process.ChildProcess;
  private log = Logger.withPrefix(this.pluginConfig?.name || this.plugin.getPluginIdentifier());
  private args: string[] = [];
  private shuttingDown = false;

  constructor(
    private type: PluginType,
    private identifier: string,
    private plugin: Plugin,
    private pluginConfig: PlatformConfig | AccessoryConfig,
    private bridgeConfig: BridgeConfiguration,
    private homebridgeConfig: HomebridgeConfig,
    private bridgeOptions: Partial<BridgeOptions>,
    private api: HomebridgeAPI,
  ) {
    this.setProcessFlags();
    this.startChildProcess();
  }

  private startChildProcess(): void {
    this.child = child_process.fork(path.resolve(__dirname, "childPluginFork.js"), this.args, {
      silent: true,
    });

    this.child.stdout.on("data", (data) => {
      process.stdout.write(data);
    });

    this.child.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    this.child.on("exit", () => {
      this.log.error("Child process ended");
    });

    this.child.on("close", (code, signal) => {
      this.handleProcessClose(code, signal);
    });

    this.api.on("shutdown", () => {
      this.shuttingDown = true;
    });

    // handle incoming ipc messages from the child process
    this.child.on("message", (message: ChildProcessMessageEvent<unknown>) => {
      if (typeof message !== "object" || !message.id) {
        return;
      }

      switch(message.id) {
        case ChildProcessMessageEventType.READY: {
          this.log(`Launched external bridge with PID ${this.child?.pid}`);
          this.loadPlugin();
          break;
        }
        case ChildProcessMessageEventType.LOADED: {
          this.log("Loaded plugin successfully");
          this.startBridge();
          break;
        }
      }
    });
  }

  private sendMessage<T = unknown>(type: ChildProcessMessageEventType, data?: T): void {
    if (this.child && this.child.connected) {
      this.child.send({
        id: type,
        data,
      });
    }
  }

  /**
   * Some plugins may make use of the homebridge process flags
   * These will be passed through to the forked process
   */
  private setProcessFlags(): void {
    if (this.bridgeOptions.debugModeEnabled) {
      this.args.push("-D");
    }

    if (this.bridgeOptions.forceColourLogging) {
      this.args.push("-C");
    }

    if (this.bridgeOptions.insecureAccess) {
      this.args.push("-I");
    }

    if (this.bridgeOptions.noLogTimestamps) {
      this.args.push("-T");
    }

    if (this.bridgeOptions.keepOrphanedCachedAccessories) {
      this.args.push("-K");
    }

    if (this.bridgeOptions.customStoragePath) {
      this.args.push("-U", this.bridgeOptions.customStoragePath);
    }

    if (this.bridgeOptions.customPluginPath) {
      this.args.push("-P", this.bridgeOptions.customPluginPath);
    }
  }

  private loadPlugin(): void {
    const bridgeConfig: BridgeConfiguration = {
      name: this.bridgeConfig.name || this.pluginConfig.name || this.plugin.getPluginIdentifier(),
      port: this.bridgeConfig.port,
      username: this.bridgeConfig.username,
      pin: this.homebridgeConfig.bridge.pin,
      bind: this.homebridgeConfig.bridge.bind,
      setupID: this.homebridgeConfig.bridge.setupID,
      manufacturer: this.homebridgeConfig.bridge.manufacturer,
      model: this.homebridgeConfig.bridge.model,
    };

    const bridgeOptions: BridgeOptions = {
      cachedAccessoriesDir: User.cachedAccessoryPath(),
      cachedAccessoriesItemName: "cachedAccessories." + this.bridgeConfig.username.replace(/:/g, ""),
      keepOrphanedCachedAccessories: this.bridgeOptions.keepOrphanedCachedAccessories,
      hideQRCode: this.bridgeOptions.hideQRCode,
      insecureAccess: this.bridgeOptions.insecureAccess,
      noLogTimestamps: this.bridgeOptions.noLogTimestamps,
      debugModeEnabled: this.bridgeOptions.debugModeEnabled,
      forceColourLogging: this.bridgeOptions.forceColourLogging,
      customStoragePath: this.bridgeOptions.customStoragePath,
      customPluginPath: this.bridgeOptions.customPluginPath,
    };

    this.sendMessage<ChildProcessLoadEventData>(ChildProcessMessageEventType.LOAD, {
      type: this.type,
      identifier: this.identifier,
      pluginPath: this.plugin.getPluginPath(),
      pluginConfig: this.pluginConfig,
      bridgeConfig,
      bridgeOptions,
      homebridgeConfig: this.homebridgeConfig,
    });
  }

  private startBridge(): void {
    this.sendMessage(ChildProcessMessageEventType.START);
  }
  
  private handleProcessClose(code: number, signal: string): void {
    this.log(`Process Ended. Code: ${code}, Signal: ${signal}`);
    
    setTimeout(() => { 
      if (!this.shuttingDown) {
        this.log("Restarting Process...");
        this.startChildProcess();
      }
    }, 7000);
  }
}