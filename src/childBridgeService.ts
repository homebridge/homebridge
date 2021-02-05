import child_process from "child_process";
import path from "path";
import fs from "fs-extra";

import { MacAddress } from "hap-nodejs";
import { IpcOutgoingEvent, IpcService } from "./ipcService";
import { ExternalPortService } from "./externalPortService";
import { HomebridgeAPI, PluginType } from "./api";
import { HomebridgeOptions } from "./server";
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

  /**
   * Sent from the child process when the bridge is online
   */
  ONLINE = "online",

  /**
   * Sent from the child when it wants to request port allocation for an external accessory
   */
  PORT_REQUEST = "portRequest",

  /**
   * Sent from the parent with the port allocation response
   */
  PORT_ALLOCATED= "portAllocated",
}

export const enum ChildBridgeStatus {
  /**
   * When the child bridge is loading, or restarting
   */
  PENDING = "pending",

  /**
   * The child bridge is online and has published it's accessory
   */
  OK = "ok",

  /**
   * The bridge is shutting down, or the process ended unexpectedly
   */
  DOWN = "down"
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

export interface ChildProcessPluginLoadedEventData {
  version: string;
}

export interface ChildProcessPortRequestEventData {
  username: MacAddress;
}

export interface ChildProcessPortAllocatedEventData {
  username: MacAddress;
  port?: number;
}

export interface ChildMetadata {
  status: ChildBridgeStatus;
  username: MacAddress;
  name: string;
  plugin: string;
  identifier: string;
  pid?: number;
}

/**
 * Manages the child processes of platforms/accessories being exposed as seperate forked bridges.
 * A child bridge runs a single platform or accessory.
 */
export class ChildBridgeService {
  private child?: child_process.ChildProcess;
  private log = Logger.withPrefix(this.pluginConfig?.name || this.plugin.getPluginIdentifier());
  private args: string[] = [];
  private shuttingDown = false;
  private lastBridgeStatus: ChildBridgeStatus = ChildBridgeStatus.PENDING;

  constructor(
    private type: PluginType,
    private identifier: string,
    private plugin: Plugin,
    private pluginConfig: PlatformConfig | AccessoryConfig,
    private bridgeConfig: BridgeConfiguration,
    private homebridgeConfig: HomebridgeConfig,
    private homebridgeOptions: HomebridgeOptions,
    private api: HomebridgeAPI,
    private ipcService: IpcService,
    private externalPortService: ExternalPortService,
  ) {
    this.setProcessFlags();
    this.startChildProcess();

    this.api.on("shutdown", () => {
      this.shuttingDown = true;
      this.teardown();
    });
    
    // make sure we don't hit the max listeners limit
    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
  }

  private get bridgeStatus(): ChildBridgeStatus {
    return this.lastBridgeStatus; 
  }

  private set bridgeStatus(value: ChildBridgeStatus) {
    this.lastBridgeStatus = value;
    this.ipcService.sendMessage(IpcOutgoingEvent.CHILD_BRIDGE_STATUS_UPDATE, this.getMetadata());
  }

  /**
   * Start the child bridge process
   */
  private startChildProcess(): void {
    this.bridgeStatus = ChildBridgeStatus.PENDING;

    this.child = child_process.fork(path.resolve(__dirname, "childBridgeFork.js"), this.args, {
      silent: true,
    });

    this.child.stdout.on("data", (data) => {
      process.stdout.write(data);
    });

    this.child.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    this.child.on("exit", () => {
      this.log.warn("Child bridge process ended");
    });
    
    this.child.on("error", (e) => {
      this.bridgeStatus = ChildBridgeStatus.DOWN;
      this.log.error("Child process error", e);
    });

    this.child.on("close", (code, signal) => {
      this.bridgeStatus = ChildBridgeStatus.DOWN;
      this.handleProcessClose(code, signal);
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
          const version = (message.data as ChildProcessPluginLoadedEventData).version;
          this.log(`Loaded ${this.plugin.getPluginIdentifier()} v${version} successfully`);
          this.startBridge();
          break;
        }
        case ChildProcessMessageEventType.ONLINE: {
          this.bridgeStatus = ChildBridgeStatus.OK;
          break;
        }
        case ChildProcessMessageEventType.PORT_REQUEST: {
          this.handlePortRequest(message.data as ChildProcessPortRequestEventData);
          break;
        }
      }
    });
  }
  
  /**
   * Called when the child bridge process exits, if Homebridge is not shutting down, it will restart the process
   * @param code 
   * @param signal 
   */
  private handleProcessClose(code: number, signal: string): void {
    this.log(`Process Ended. Code: ${code}, Signal: ${signal}`);

    setTimeout(() => {
      if (!this.shuttingDown) {
        this.log("Restarting Process...");
        this.startChildProcess();
      }
    }, 7000);
  }

  /**
   * Helper function to send a message to the child process
   * @param type 
   * @param data 
   */
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
    if (this.homebridgeOptions.debugModeEnabled) {
      this.args.push("-D");
    }

    if (this.homebridgeOptions.forceColourLogging) {
      this.args.push("-C");
    }

    if (this.homebridgeOptions.insecureAccess) {
      this.args.push("-I");
    }

    if (this.homebridgeOptions.noLogTimestamps) {
      this.args.push("-T");
    }

    if (this.homebridgeOptions.keepOrphanedCachedAccessories) {
      this.args.push("-K");
    }

    if (this.homebridgeOptions.customStoragePath) {
      this.args.push("-U", this.homebridgeOptions.customStoragePath);
    }

    if (this.homebridgeOptions.customPluginPath) {
      this.args.push("-P", this.homebridgeOptions.customPluginPath);
    }
  }

  /**
   * Tell the child process to load the given plugin
   */
  private loadPlugin(): void {
    const bridgeConfig: BridgeConfiguration = {
      name: this.bridgeConfig.name || this.pluginConfig.name || this.plugin.getPluginIdentifier(),
      port: this.bridgeConfig.port,
      username: this.bridgeConfig.username,
      pin: this.bridgeConfig.pin || this.homebridgeConfig.bridge.pin,
      bind: this.homebridgeConfig.bridge.bind,
      setupID: this.bridgeConfig.setupID,
      manufacturer: this.bridgeConfig.manufacturer || this.homebridgeConfig.bridge.manufacturer,
      model: this.bridgeConfig.model || this.homebridgeConfig.bridge.model,
    };

    const bridgeOptions: BridgeOptions = {
      cachedAccessoriesDir: User.cachedAccessoryPath(),
      cachedAccessoriesItemName: "cachedAccessories." + this.bridgeConfig.username.replace(/:/g, "").toUpperCase(),
    };

    // shallow copy the homebridge options to the bridge options object
    Object.assign(bridgeOptions, this.homebridgeOptions);

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

  /**
   * Tell the child bridge to start broadcasting
   */
  private startBridge(): void {
    this.sendMessage(ChildProcessMessageEventType.START);
  }

  /**
   * Handle external port requests from child
   */
  private async handlePortRequest(request: ChildProcessPortRequestEventData) {
    const port = await this.externalPortService.requestPort(request.username);
    this.sendMessage<ChildProcessPortAllocatedEventData>(ChildProcessMessageEventType.PORT_ALLOCATED, {
      username: request.username,
      port: port,
    });
  }

  /**
   * Send sigterm to the child bridge
   */
  private teardown(): void {
    if (this.child && this.child.connected) {
      this.bridgeStatus = ChildBridgeStatus.DOWN;
      this.child.kill("SIGTERM");
    }
  }

  /**
   * Restarts the child bridge process
   */
  public restartBridge(): void {
    this.log.warn("Restarting child bridge...");
    this.refreshConfig();
    this.teardown();
  }

  /**
   * Read the config.json file from disk and refresh the plugin config block for just this plugin
   */
  public async refreshConfig(): Promise<void> {
    try {
      const homebridgeConfig: HomebridgeConfig = await fs.readJson(User.configPath());

      if (this.type === PluginType.PLATFORM) {
        const config = homebridgeConfig.platforms?.find(x => x.platform === this.identifier && x._bridge?.username === this.bridgeConfig.username);
        if (config) {
          this.pluginConfig = config;
          this.bridgeConfig = this.pluginConfig._bridge || this.bridgeConfig;
        } else {
          this.log.warn("Platform config could not be found, using existing config.");
        }
      } else if (this.type === PluginType.ACCESSORY) {
        const config = homebridgeConfig.accessories?.find(x => x.accessory === this.identifier && x._bridge?.username === this.bridgeConfig.username);
        if (config) {
          this.pluginConfig = config;
          this.bridgeConfig = this.pluginConfig._bridge || this.bridgeConfig;
        } else {
          this.log.warn("Accessory config could not be found, using existing config.");
        }
      }

    } catch (e) {
      this.log.error("Failed to refresh plugin config:", e.message);
    }
  }

  /**
   * Returns metadata about this child bridge
   */
  public getMetadata(): ChildMetadata {
    return {
      status: this.bridgeStatus,
      username: this.bridgeConfig.username,
      name: this.bridgeConfig.name || this.pluginConfig.name || this.plugin.getPluginIdentifier(),
      plugin: this.plugin.getPluginIdentifier(),
      identifier: this.identifier,
      pid: this.child?.pid,
    };
  }

}