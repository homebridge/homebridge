import { EventEmitter } from "events";
import getVersion from "./version";
import { Logger, Logging } from "./logger";
import * as hapNodeJs from "hap-nodejs";
import { Service } from "hap-nodejs";
import { PlatformAccessory } from "./platformAccessory";
import { User } from "./user";
import { AccessoryConfig, PlatformConfig } from "./server";

const log = Logger.internal;


export type PluginIdentifier = PluginName | ScopedPluginName;
export type PluginName = string; // plugin name like "homebridge-dummy"
export type ScopedPluginName = string; // plugin name like "@scope/homebridge-dummy"
export type AccessoryName = string;
export type PlatformName = string;

export type AccessoryIdentifier = string; // format: "PluginName.AccessoryName"
export type PlatformIdentifier = string; // format: "PluginName.PlatformName"

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

    registerAccessory(pluginName: PluginName, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;

    registerPlatform(pluginName: PluginName, platformName: PlatformName, constructor: PlatformPluginConstructor, dynamic?: boolean): void;
    registerPlatformAccessories(pluginName: PlatformName, platformName: PlatformName, accessories: PlatformAccessory[]): void;
    updatePlatformAccessories(accessories: PlatformAccessory[]): void;
    unregisterPlatformAccessories(pluginName: PluginName, platformName: PlatformName, accessories: PlatformAccessory[]): void;

    /**
     * @deprecated use {@link publishExternalAccessories} directly to publish a standalone Accessory
     */
    publishCameraAccessories(pluginName: PluginName, accessories: PlatformAccessory[]): void;
    publishExternalAccessories(pluginName: PluginName, accessories: PlatformAccessory[]): void;

}

export declare interface HomebridgeAPI {


    on(event: "didFinishLaunching", listener: () => void): this;
    on(event: "shutdown", listener: () => void): this;

    // Internal events (using enums directly to restrict access)
    on(event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;
    on(event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;
    on(event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;
    on(event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;


    emit(event: "didFinishLaunching"): boolean;
    emit(event: "shutdown"): boolean;

    emit(event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
    emit(event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
    emit(event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
    emit(event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]): boolean;

}

export class HomebridgeAPI extends EventEmitter implements API {

    public readonly version = 2.4; // homebridge API version
    public readonly serverVersion = getVersion(); // homebridge node module version

    // ------------------ LEGACY EXPORTS FOR PRE TYPESCRIPT  ------------------
    readonly user = User;
    readonly hap = hapNodeJs;
    readonly hapLegacyTypes = hapNodeJs.LegacyTypes; // used for older accessories/platforms
    readonly platformAccessory = PlatformAccessory;
    // ------------------------------------------------------------------------

    private readonly _accessories: Record<AccessoryIdentifier, AccessoryPluginConstructor> = {};
    private readonly _platforms: Record<PlatformIdentifier, PlatformPluginConstructor> = {};


    constructor() {
      super();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static isLegacyPlatformPlugin(platformPlugin: any): platformPlugin is LegacyPlatformPlugin {
      return "accessories" in platformPlugin;
    }

    static getAccessoryName(identifier: AccessoryIdentifier): AccessoryName {
      return identifier.split(".")[1];
    }

    static getPlatformName(identifier: PlatformIdentifier): PlatformIdentifier {
      return identifier.split(".")[1];
    }

    static getPluginName(identifier: AccessoryIdentifier | PlatformIdentifier): PluginName {
      return identifier.split(".")[0];
    }

    signalFinished(): void {
      this.emit(APIEvent.DID_FINISH_LAUNCHING);
    }

    signalShutdown(): void {
      this.emit(APIEvent.SHUTDOWN);
    }

    accessory(name: AccessoryIdentifier | AccessoryName): AccessoryPluginConstructor {
      if (name.indexOf(".") === -1) { // see if it matches exactly one accessory
        const found = Object.keys(this._accessories)
          .filter(identifier => HomebridgeAPI.getAccessoryName(identifier) === name);

        if (found.length === 1) {
          return this._accessories[found[0]];
        } else if (found.length > 1) {
          throw new Error(`The requested accessory '${name}' has been registered multiple times. Please be more specific by writing one of: ${found.join(", ")}`);
        } else {
          throw new Error(`The requested accessory '${name}' was not registered by any plugin.`);
        }
      } else {
        if (!this._accessories[name]) {
          throw new Error(`The requested accessory '${name}' was not registered by any plugin.`);
        }

        return this._accessories[name];
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    registerAccessory(pluginName: PluginName, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor, configurationRequestHandler?: undefined): void {
      const fullName: AccessoryIdentifier = pluginName + "." + accessoryName;

      if (this._accessories[fullName]) {
        throw new Error(`Attempting to register an accessory '${fullName}' which has already been registered!`);
      }

      log.info("Registering accessory '%s'", fullName);

      this._accessories[fullName] = constructor;
    }

    publishCameraAccessories(pluginName: PluginName, accessories: PlatformAccessory[]): void {
      this.publishExternalAccessories(pluginName, accessories);
    }

    publishExternalAccessories(pluginName: PluginName, accessories: PlatformAccessory[]): void {
      accessories.forEach(accessory => {
        // noinspection SuspiciousTypeOfGuard
        if (!(accessory instanceof PlatformAccessory)) {
          throw new Error(`${pluginName} attempt to register an accessory that isn't PlatformAccessory!`);
        }

        accessory._associatedPlugin = pluginName;
      });

      this.emit(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories);
    }

    platform(name: PlatformIdentifier | PlatformName): PlatformPluginConstructor {
      if (name.indexOf(".") === -1) { // see if it matches exactly one platform
        const found = Object.keys(this._platforms)
          .filter(identifier => HomebridgeAPI.getPlatformName(identifier) === name);

        if (found.length === 1) {
          return this._platforms[found[0]];
        } else if (found.length > 1) {
          throw new Error(`The requested platform '${name}' has been registered multiple times. Please be more specific by writing one of: ${found.join(", ")}`);
        } else {
          throw new Error(`The requested platform '${name}' was not registered by any plugin.`);
        }
      } else {
        if (!this._platforms[name]) {
          throw new Error(`The requested platform '${name}' was not registered by any plugin.`);
        }

        return this._platforms[name];
      }
    }

    registerPlatform(pluginName: PluginName, platformName: PlatformName, constructor: PlatformPluginConstructor): void {
      const fullName = pluginName + "." + platformName;

      if (this._platforms[fullName]) {
        throw new Error(`Attempting to register a platform '${fullName}' which has already been registered!`);
      }

      log.info("Registering platform '%s'", fullName);

      this._platforms[fullName] = constructor;
    }

    registerPlatformAccessories(pluginName: PlatformName, platformName: PlatformName, accessories: PlatformAccessory[]): void {
      accessories.forEach(accessory => {
        // noinspection SuspiciousTypeOfGuard
        if (!(accessory instanceof PlatformAccessory)) {
          throw new Error(`${pluginName} - ${platformName} attempt to register an accessory that isn't PlatformAccessory!`);
        }

        accessory._associatedPlugin = pluginName;
        accessory._associatedPlatform = platformName;
      });

      this.emit(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, accessories);
    }

    updatePlatformAccessories(accessories: PlatformAccessory[]): void {
      this.emit(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, accessories);
    }

    unregisterPlatformAccessories(pluginName: PluginName, platformName: PlatformName, accessories: PlatformAccessory[]): void {
      accessories.forEach(accessory => {
        // noinspection SuspiciousTypeOfGuard
        if (!(accessory instanceof PlatformAccessory)) {
          throw new Error(`${pluginName} - ${platformName} attempt to unregister an accessory that isn't PlatformAccessory!`);
        }
      });

      this.emit(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, accessories);
    }


}
