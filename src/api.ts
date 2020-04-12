import { EventEmitter } from "events";
import getVersion from "./version";
import { Logger, Logging } from "./logger";
import * as hapNodeJs from "hap-nodejs";
import { Service } from "hap-nodejs";
import { PlatformAccessory } from "./platformAccessory";
import { User } from "./user";
import { AccessoryConfig, PlatformConfig } from "./server";
import { PluginManager } from "./pluginManager";

const log = Logger.internal;


export type PluginIdentifier = PluginName | ScopedPluginName;
export type PluginName = string; // plugin name like "homebridge-dummy"
export type ScopedPluginName = string; // plugin name like "@scope/homebridge-dummy"
export type AccessoryName = string;
export type PlatformName = string;

export type AccessoryIdentifier = string; // format: "PluginIdentifier.AccessoryName"
export type PlatformIdentifier = string; // format: "PluginIdentifier.PlatformName"

export enum PluginType {
  ACCESSORY = "accessory",
  PLATFORM = "platform",
}

export interface PluginInitializer {

  (api: API): void;

}

export interface AccessoryPluginConstructor {
  new(logger: Logging, config: AccessoryConfig): AccessoryPlugin;
}

export interface AccessoryPlugin {

  identify?(): void;

  getServices(): Service[];

}

export interface PlatformPluginConstructor {
  new(logger: Logging, config: PlatformConfig, api: API): PlatformPlugin;
}

export interface PlatformPlugin { // also referred to as "dynamic" platform plugin

  configureAccessory(accessory: PlatformAccessory): void;

}

export interface LegacyPlatformPlugin {

  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void;

}

export enum APIEvent {
  DID_FINISH_LAUNCHING = "didFinishLaunching",
  SHUTDOWN = "shutdown",
}

export enum InternalAPIEvent {
  REGISTER_ACCESSORY = "registerAccessory",
  REGISTER_PLATFORM = "registerPlatform",

  PUBLISH_EXTERNAL_ACCESSORIES = "publishExternalAccessories",
  REGISTER_PLATFORM_ACCESSORIES = "registerPlatformAccessories",
  UPDATE_PLATFORM_ACCESSORIES = "updatePlatformAccessories",
  UNREGISTER_PLATFORM_ACCESSORIES = "unregisterPlatformAccessories",
}

export declare interface API {

  on(event: "didFinishLaunching", listener: () => void): this;
  on(event: "shutdown", listener: () => void): this;

}

export interface API {

  readonly version: number;
  readonly serverVersion: string;

  // ------------------ LEGACY EXPORTS FOR PRE TYPESCRIPT  ------------------
  readonly user: typeof User;
  readonly hap: typeof hapNodeJs;
  readonly hapLegacyTypes: typeof hapNodeJs.LegacyTypes; // used for older accessories/platforms
  readonly platformAccessory: typeof PlatformAccessory;
  // ------------------------------------------------------------------------

  registerAccessory(accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;
  registerAccessory(pluginIdentifier: PluginIdentifier, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;

  registerPlatform(platformName: PlatformName, constructor: PlatformPluginConstructor): void;
  registerPlatform(pluginIdentifier: PluginIdentifier, platformName: PlatformName, constructor: PlatformPluginConstructor): void;
  registerPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void;
  updatePlatformAccessories(accessories: PlatformAccessory[]): void;
  unregisterPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void;

  /**
   * @deprecated use {@link publishExternalAccessories} directly to publish a standalone Accessory
   */
  publishCameraAccessories(pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]): void;
  publishExternalAccessories(pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]): void;

}

export declare interface HomebridgeAPI {


  on(event: "didFinishLaunching", listener: () => void): this;
  on(event: "shutdown", listener: () => void): this;

  // Internal events (using enums directly to restrict access)
  on(event: InternalAPIEvent.REGISTER_ACCESSORY, listener: (accessoryName: AccessoryName, accessoryConstructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier) => void): this;
  on(event: InternalAPIEvent.REGISTER_PLATFORM, listener: (platformName: PlatformName, platformConstructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier) => void): this;

  on(event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;
  on(event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;
  on(event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;
  on(event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;


  emit(event: "didFinishLaunching"): boolean;
  emit(event: "shutdown"): boolean;

  emit(event: InternalAPIEvent.REGISTER_ACCESSORY, accessoryName: AccessoryName, accessoryConstructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier): boolean;
  emit(event: InternalAPIEvent.REGISTER_PLATFORM, platformName: PlatformName, platformConstructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier): boolean;

  emit(event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
  emit(event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
  emit(event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
  emit(event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]): boolean;

}

export class HomebridgeAPI extends EventEmitter implements API {

  public readonly version = 2.5; // homebridge API version
  public readonly serverVersion = getVersion(); // homebridge node module version

  // ------------------ LEGACY EXPORTS FOR PRE TYPESCRIPT  ------------------
  readonly user = User;
  readonly hap = hapNodeJs;
  readonly hapLegacyTypes = hapNodeJs.LegacyTypes; // used for older accessories/platforms
  readonly platformAccessory = PlatformAccessory;
  // ------------------------------------------------------------------------

  constructor() {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static isLegacyPlatformPlugin(platformPlugin: any): platformPlugin is LegacyPlatformPlugin {
    return "accessories" in platformPlugin;
  }

  signalFinished(): void {
    this.emit(APIEvent.DID_FINISH_LAUNCHING);
  }

  signalShutdown(): void {
    this.emit(APIEvent.SHUTDOWN);
  }

  registerAccessory(accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;
  registerAccessory(pluginIdentifier: PluginIdentifier, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;

  registerAccessory(pluginIdentifier: PluginIdentifier | AccessoryName, accessoryName: AccessoryName | AccessoryPluginConstructor, constructor?: AccessoryPluginConstructor): void {
    if (typeof accessoryName === "function") {
      constructor = accessoryName;
      accessoryName = pluginIdentifier;
      this.emit(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, constructor);
    } else {
      this.emit(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, constructor!, pluginIdentifier);
    }
  }

  registerPlatform(platformName: PlatformName, constructor: PlatformPluginConstructor): void;
  registerPlatform(pluginIdentifier: PluginIdentifier, platformName: PlatformName, constructor: PlatformPluginConstructor): void;

  registerPlatform(pluginIdentifier: PluginIdentifier | PlatformName, platformName: PlatformName | PlatformPluginConstructor, constructor?: PlatformPluginConstructor): void {
    if (typeof platformName === "function") {
      constructor = platformName;
      platformName = pluginIdentifier;
      this.emit(InternalAPIEvent.REGISTER_PLATFORM, platformName, constructor);
    } else {
      this.emit(InternalAPIEvent.REGISTER_PLATFORM, platformName, constructor!, pluginIdentifier);
    }
  }

  publishCameraAccessories(pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]): void {
    this.publishExternalAccessories(pluginIdentifier, accessories);
  }

  publishExternalAccessories(pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]): void {
    if (PluginManager.isQualifiedPluginIdentifier(pluginIdentifier)) {
      log.warn(`One of your plugins incorrectly registered an external accessory using the platform name (${pluginIdentifier}) and not the plugin identifier. Please report this to the developer!`);
    }

    accessories.forEach(accessory => {
      // noinspection SuspiciousTypeOfGuard
      if (!(accessory instanceof PlatformAccessory)) {
        throw new Error(`${pluginIdentifier} attempt to register an accessory that isn't PlatformAccessory!`);
      }

      accessory._associatedPlugin = pluginIdentifier;
    });

    this.emit(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories);
  }

  registerPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void {
    accessories.forEach(accessory => {
      // noinspection SuspiciousTypeOfGuard
      if (!(accessory instanceof PlatformAccessory)) {
        throw new Error(`${pluginIdentifier} - ${platformName} attempt to register an accessory that isn't PlatformAccessory!`);
      }

      accessory._associatedPlugin = pluginIdentifier;
      accessory._associatedPlatform = platformName;
    });

    this.emit(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, accessories);
  }

  updatePlatformAccessories(accessories: PlatformAccessory[]): void {
    this.emit(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, accessories);
  }

  unregisterPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void {
    accessories.forEach(accessory => {
      // noinspection SuspiciousTypeOfGuard
      if (!(accessory instanceof PlatformAccessory)) {
        throw new Error(`${pluginIdentifier} - ${platformName} attempt to unregister an accessory that isn't PlatformAccessory!`);
      }
    });

    this.emit(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, accessories);
  }


}
