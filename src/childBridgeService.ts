import child_process from "child_process";
import path from "path";
import fs from "fs-extra";

import { MacAddress } from "hap-nodejs";
import { IpcOutgoingEvent, IpcService } from "./ipcService";
import { ExternalPortService } from "./externalPortService";
import { HomebridgeAPI, PluginType } from "./api";
import { HomebridgeOptions } from "./server";
import { Logger, Logging } from "./logger";
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

  /**
   * Sent from the child to update it's current status
   */
  STATUS_UPDATE = "status",
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
  pluginConfig: Array<PlatformConfig | AccessoryConfig>;
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

export interface ChildBridgePairedStatusEventData {
  paired: boolean | null;
  setupUri: string | null;
}

export interface ChildMetadata {
  status: ChildBridgeStatus;
  paired?: boolean | null;
  setupUri?: string | null;
  username: MacAddress;
  pin: string;
  name: string;
  plugin: string;
  identifier: string;
  manuallyStopped: boolean;
  pid?: number;
}

/**
 * Manages the child processes of platforms/accessories being exposed as seperate forked bridges.
 * A child bridge runs a single platform or accessory.
 */
export class ChildBridgeService {
  private child?: child_process.ChildProcess;
  private args: string[] = [];
  private shuttingDown = false;
  private lastBridgeStatus: ChildBridgeStatus = ChildBridgeStatus.PENDING;
  private pairedStatus: boolean | null = null;
  private manuallyStopped = false;
  private setupUri: string | null = null;
  private pluginConfig: Array<PlatformConfig | AccessoryConfig> = [];
  private log: Logging;
  private displayName?: string;

  constructor(
    public type: PluginType,
    public identifier: string,
    private plugin: Plugin,
    private bridgeConfig: BridgeConfiguration,
    private homebridgeConfig: HomebridgeConfig,
    private homebridgeOptions: HomebridgeOptions,
    private api: HomebridgeAPI,
    private ipcService: IpcService,
    private externalPortService: ExternalPortService,
  ) {
    this.log = Logger.withPrefix(this.plugin.getPluginIdentifier());
    this.api.on("shutdown", () => {
      this.shuttingDown = true;
      this.teardown();
    });
    
    // make sure we don't hit the max listeners limit
    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
  }

  /**
   * Start the child bridge service
   */
  public start(): void {
    this.setProcessFlags();
    this.startChildProcess();
  
    // set display name
    if (this.pluginConfig.length > 1 || this.pluginConfig.length === 0) {
      this.displayName = this.plugin.getPluginIdentifier();
    } else {
      this.displayName = this.pluginConfig[0]?.name || this.plugin.getPluginIdentifier();
    }

    // re-configured log with display name
    this.log = Logger.withPrefix(this.displayName);
  }

  /**
   * Add a config block to a child bridge.
   * Platform child bridges can only contain one config block.
   * @param config 
   */
  public addConfig(config: PlatformConfig | AccessoryConfig): void {
    this.pluginConfig.push(config);
  }

  private get bridgeStatus(): ChildBridgeStatus {
    return this.lastBridgeStatus; 
  }

  private set bridgeStatus(value: ChildBridgeStatus) {
    this.lastBridgeStatus = value;
    this.sendStatusUpdate();
  }

  /**
   * Start the child bridge process
   */
  private startChildProcess(): void {
    this.bridgeStatus = ChildBridgeStatus.PENDING;

    this.child = child_process.fork(path.resolve(__dirname, "childBridgeFork.js"), this.args, {
      silent: true,
    });

    this.child.stdout?.on("data", (data) => {
      process.stdout.write(data);
    });

    this.child.stderr?.on("data", (data) => {
      process.stderr.write(data);
    });

    this.child.on("exit", () => {
      this.log.warn("Child bridge process ended");
    });
    
    this.child.on("error", (e) => {
      this.bridgeStatus = ChildBridgeStatus.DOWN;
      this.log.error("Child process error", e);
    });

    this.child.once("close", (code, signal) => {
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
          this.log(`Launched child bridge with PID ${this.child?.pid}`);
          this.loadPlugin();
          break;
        }
        case ChildProcessMessageEventType.LOADED: {
          const version = (message.data as ChildProcessPluginLoadedEventData).version;
          if (this.pluginConfig.length > 1) {
            this.log(`Loaded ${this.plugin.getPluginIdentifier()} v${version} child bridge successfully with ${this.pluginConfig.length} accessories`);
          } else {
            this.log(`Loaded ${this.plugin.getPluginIdentifier()} v${version} child bridge successfully`);
          }
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
        case ChildProcessMessageEventType.STATUS_UPDATE: {
          this.pairedStatus = (message.data as ChildBridgePairedStatusEventData).paired;
          this.setupUri = (message.data as ChildBridgePairedStatusEventData).setupUri;
          this.sendStatusUpdate();
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
  private handleProcessClose(code: number | null, signal: string | null): void {
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
      name: this.bridgeConfig.name || this.displayName || this.plugin.getPluginIdentifier(),
      port: this.bridgeConfig.port,
      username: this.bridgeConfig.username,
      advertiser: this.homebridgeConfig.bridge.advertiser,
      pin: this.bridgeConfig.pin || this.homebridgeConfig.bridge.pin,
      bind: this.homebridgeConfig.bridge.bind,
      setupID: this.bridgeConfig.setupID,
      manufacturer: this.bridgeConfig.manufacturer || this.homebridgeConfig.bridge.manufacturer,
      model: this.bridgeConfig.model || this.homebridgeConfig.bridge.model,
      firmwareRevision: this.bridgeConfig.firmwareRevision || this.homebridgeConfig.bridge.firmwareRevision,
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
      homebridgeConfig: { // need to break this out to avoid a circular structure to JSON from other plugins modifying their config at runtime.
        bridge: this.homebridgeConfig.bridge,
        mdns: this.homebridgeConfig.mdns,
        ports: this.homebridgeConfig.ports,
        disabledPlugins: [], // not used by child bridges
        accessories: [], // not used by child bridges
        platforms: [], // not used by child bridges
      },
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
   * Trigger sending child bridge metdata to the process parent via IPC
   */
  private sendStatusUpdate(): void {
    this.ipcService.sendMessage(IpcOutgoingEvent.CHILD_BRIDGE_STATUS_UPDATE, this.getMetadata());
  }

  /**
   * Restarts the child bridge process
   */
  public restartChildBridge(): void {
    if (this.manuallyStopped) {
      this.startChildBridge();
    } else {
      this.log.warn("Restarting child bridge...");
      this.refreshConfig();
      this.teardown();
    }
  }

  /**
   * Stops the child bridge, not starting it again
   */
  public stopChildBridge(): void {
    if (!this.shuttingDown) {
      this.log.warn("Stopping child bridge (will not restart)...");
      this.shuttingDown = true;
      this.manuallyStopped = true;
      this.child?.removeAllListeners("close");
      this.teardown();
    } else {
      this.log.warn("Bridge already shutting down or stopped.");
    }
  }

  /**
   * Starts the child bridge, only if it was manually stopped and is no longer running
   */
  public startChildBridge(): void {
    if (this.manuallyStopped && this.bridgeStatus === ChildBridgeStatus.DOWN && (!this.child || !this.child.connected)) {
      this.log.warn("Starting child bridge...");
      this.refreshConfig();
      this.startChildProcess();
      this.shuttingDown = false;
      this.manuallyStopped = false;
    } else {
      this.log.warn("Cannot start child bridge, it is still running or was not manually stopped");
    }
  }

  /**
   * Read the config.json file from disk and refresh the plugin config block for just this plugin
   */
  public async refreshConfig(): Promise<void> {
    try {
      const homebridgeConfig: HomebridgeConfig = await fs.readJson(User.configPath());

      if (this.type === PluginType.PLATFORM) {
        const config = homebridgeConfig.platforms?.filter(x => x.platform === this.identifier && x._bridge?.username === this.bridgeConfig.username);
        if (config.length) {
          this.pluginConfig = config;
          this.bridgeConfig = this.pluginConfig[0]._bridge || this.bridgeConfig;
        } else {
          this.log.warn("Platform config could not be found, using existing config.");
        }
      } else if (this.type === PluginType.ACCESSORY) {
        const config = homebridgeConfig.accessories?.filter(x => x.accessory === this.identifier && x._bridge?.username === this.bridgeConfig.username);
        if (config.length) {
          this.pluginConfig = config;
          this.bridgeConfig = this.pluginConfig[0]._bridge || this.bridgeConfig;
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
      paired: this.pairedStatus,
      setupUri: this.setupUri,
      username: this.bridgeConfig.username,
      pin: this.bridgeConfig.pin || this.homebridgeConfig.bridge.pin,
      name: this.bridgeConfig.name || this.displayName || this.plugin.getPluginIdentifier(),
      plugin: this.plugin.getPluginIdentifier(),
      identifier: this.identifier,
      pid: this.child?.pid,
      manuallyStopped: this.manuallyStopped,
    };
  }

}