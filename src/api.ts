import { EventEmitter } from "events";
import * as hapNodeJs from "hap-nodejs";
import { Controller, Service } from "hap-nodejs";
import getVersion from "./version";
import { PlatformAccessory } from "./platformAccessory";
import { User } from "./user";
import { Logger, Logging } from "./logger";
import { AccessoryConfig, PlatformConfig } from "./bridgeService";
import { PluginManager } from "./pluginManager";
import semver from "semver";

const log = Logger.internal;

export type HAP = typeof hapNodeJs;
export type HAPLegacyTypes = typeof hapNodeJs.LegacyTypes;

export type PluginIdentifier = PluginName | ScopedPluginName;
export type PluginName = string; // plugin name like "homebridge-dummy"
export type ScopedPluginName = string; // plugin name like "@scope/homebridge-dummy"
export type AccessoryName = string;
export type PlatformName = string;

export type AccessoryIdentifier = string; // format: "PluginIdentifier.AccessoryName"
export type PlatformIdentifier = string; // format: "PluginIdentifier.PlatformName"

export const enum PluginType {
  ACCESSORY = "accessory",
  PLATFORM = "platform",
}

/**
 * The {PluginInitializer} is a method which must be the default export for every homebridge plugin.
 * It is called once the plugin is loaded from disk.
 */
export interface PluginInitializer {

  /**
   * When the initializer is called the plugin must use the provided api instance and call the appropriate
   * register methods - {@link API.registerAccessory} or {@link API.registerPlatform} - in order to
   * correctly register for the following startup sequence.
   *
   * @param {API} api
   */
  (api: API): void | Promise<void>;

}

export interface AccessoryPluginConstructor {
  new(logger: Logging, config: AccessoryConfig, api: API): AccessoryPlugin;
}

export interface AccessoryPlugin {

  /**
   * Optional method which will be called if a 'identify' of a Accessory is requested by HomeKit.
   */
  identify?(): void;

  /**
   * This method will be called once on startup, to query all services to be exposed by the Accessory.
   * All event handlers for characteristics should be set up before the array is returned.
   *
   * @returns {Service[]} services - returned services will be added to the Accessory
   */
  getServices(): Service[];

  /**
   * This method will be called once on startup, to query all controllers to be exposed by the Accessory.
   * It is optional to implement.
   *
   * This includes controllers like the RemoteController or the CameraController.
   * Any necessary controller specific setup should have been done when returning the array.
   * In most cases the plugin will only return a array of the size 1.
   *
   * In the case that the Plugin does not add any additional services (returned by {@link getServices}) the
   * method {@link getServices} must defined in any way and should just return an empty array.
   *
   * @returns {Controller[]} controllers - returned controllers will be configured for the Accessory
   */
  getControllers?(): Controller[];

}

export interface PlatformPluginConstructor {
  new(logger: Logging, config: PlatformConfig, api: API): DynamicPlatformPlugin | StaticPlatformPlugin | IndependentPlatformPlugin;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PlatformPlugin {} // not exported to the public in index.ts

/**
 * Platform that is able to dynamically add or remove accessories.
 * All configured accessories are stored to disk and recreated on startup.
 * Accessories can be added or removed by using {@link API.registerPlatformAccessories} or {@link API.unregisterPlatformAccessories}.
 */
export interface DynamicPlatformPlugin extends PlatformPlugin {

  /**
   * This method is called for every PlatformAccessory, which is recreated from disk on startup.
   * It should be used to properly initialize the Accessory and setup all event handlers for
   * all services and their characteristics.
   *
   * @param {PlatformAccessory} accessory which needs to be configured
   */
  configureAccessory(accessory: PlatformAccessory): void;

}

/**
 * Platform that exposes all available characteristics at the start of the plugin.
 * The set of accessories can not change at runtime.
 * The bridge waits for all callbacks to return before it is published and accessible by HomeKit controllers.
 */
export interface StaticPlatformPlugin extends PlatformPlugin {

  /**
   * This method is called once at startup. The Platform should pass all accessories which need to be created
   * to the callback in form of a {@link AccessoryPlugin}.
   * The Platform must respond in a timely manner as otherwise the startup of the bridge would be unnecessarily delayed.
   *
   * @param {(foundAccessories: AccessoryPlugin[]) => void} callback
   */
  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void;

}

/**
 * Platform that does not aim to add any accessories to the main bridge accessory.
 * This platform should be used if for example a plugin aims to only expose external accessories.
 * It should also be used when the platform doesn't intend to expose any accessories at all, like plugins
 * providing a UI for homebridge.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndependentPlatformPlugin extends PlatformPlugin {
  // does not expose any methods
}

export const enum APIEvent {
  /**
   * Event is fired once homebridge has finished with booting up and initializing all components and plugins.
   * When this event is fired it is possible that the Bridge accessory isn't published yet, if homebridge still needs
   * to wait for some {@see StaticPlatformPlugin | StaticPlatformPlugins} to finish accessory creation.
   */
  DID_FINISH_LAUNCHING = "didFinishLaunching",
  /**
   * This event is fired when homebridge got shutdown. This could be a regular shutdown or a unexpected crash.
   * At this stage all Accessories are already unpublished and all PlatformAccessories are already saved to disk!
   */
  SHUTDOWN = "shutdown",
}

export const enum InternalAPIEvent {
  REGISTER_ACCESSORY = "registerAccessory",
  REGISTER_PLATFORM = "registerPlatform",

  PUBLISH_EXTERNAL_ACCESSORIES = "publishExternalAccessories",
  REGISTER_PLATFORM_ACCESSORIES = "registerPlatformAccessories",
  UPDATE_PLATFORM_ACCESSORIES = "updatePlatformAccessories",
  UNREGISTER_PLATFORM_ACCESSORIES = "unregisterPlatformAccessories",
}

export interface API {

  /**
   * The homebridge API version as a floating point number.
   */
  readonly version: number;
  /**
   * The current homebridge semver version.
   */
  readonly serverVersion: string;

  // ------------------ LEGACY EXPORTS FOR PRE TYPESCRIPT  ------------------
  readonly user: typeof User;
  readonly hap: HAP;
  readonly hapLegacyTypes: HAPLegacyTypes; // used for older accessories/platforms
  readonly platformAccessory: typeof PlatformAccessory;
  // ------------------------------------------------------------------------

  /**
   * Returns true if the current running homebridge version is greater or equal to the
   * passed version string.
   *
   * Example:
   *
   * We assume the homebridge version 1.3.0-beta.12 ({@link serverVersion}) and the following example calls below
   * ```
   *  versionGreaterOrEqual("1.2.0"); // will return true
   *  versionGreaterOrEqual("1.3.0"); // will return false (the RELEASE version 1.3.0 is bigger than the BETA version 1.3.0-beta.12)
   *  versionGreaterOrEqual("1.3.0-beta.8); // will return true
   * ```
   *
   * @param version
   */
  versionGreaterOrEqual(version: string): boolean;

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

  on(event: "didFinishLaunching", listener: () => void): this;
  on(event: "shutdown", listener: () => void): this;

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

  public readonly version = 2.7; // homebridge API version
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

  public versionGreaterOrEqual(version: string): boolean {
    return semver.gte(this.serverVersion, version);
  }

  public static isDynamicPlatformPlugin(platformPlugin: PlatformPlugin): platformPlugin is DynamicPlatformPlugin {
    return "configureAccessory" in platformPlugin;
  }

  public static isStaticPlatformPlugin(platformPlugin: PlatformPlugin): platformPlugin is StaticPlatformPlugin {
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
    if (!PluginManager.isQualifiedPluginIdentifier(pluginIdentifier)) {
      log.info(`One of your plugins incorrectly registered an external accessory using the platform name (${pluginIdentifier}) and not the plugin identifier. Please report this to the developer!`);
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
