import fs from "fs";
import storage, { LocalStorage } from "node-persist";
import chalk from "chalk";
import qrcode from "qrcode-terminal";
import {
  Accessory,
  AccessoryEventTypes,
  AccessoryLoader,
  Bridge,
  Characteristic,
  once,
  PublishInfo,
  Service,
  uuid,
} from "hap-nodejs";
import { Logger } from "./logger";
import { User } from "./user";
import {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPlugin, AccessoryPluginConstructor,
  HomebridgeAPI,
  InternalAPIEvent,
  LegacyPlatformPlugin,
  PlatformIdentifier,
  PlatformName,
  PlatformPlugin, PlatformPluginConstructor,
  PluginIdentifier,
} from "./api";
import { PlatformAccessory, SerializedPlatformAccessory } from "./platformAccessory";
import getVersion from "./version";
import * as mac from "./util/mac";
import { MacAddress } from "./util/mac";
import { PluginManager, PluginManagerOptions } from "./pluginManager";
import { Plugin } from "./plugin";

const accessoryStorage: LocalStorage = storage.create();
const log = Logger.internal;

export interface HomebridgeOptions {

  config?: HomebridgeConfig;
  cleanCachedAccessories?: boolean;
  hideQRCode?: boolean;
  insecureAccess?: boolean;
  customPluginPath?: string;

}

export interface HomebridgeConfig {
  bridge: BridgeConfiguration;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mdns?: any; // forwarded to "bonjour-hap"

  accessories: AccessoryConfig[];
  platforms: PlatformConfig[];

  plugins?: PluginIdentifier[]; // array to define set of active plugins

  // This section is used to control the range of ports (inclusive) that separate accessory (like camera or television) should be bind to
  ports?: ExternalPortsConfiguration;
}

export interface BridgeConfiguration {
  name: string;
  username: MacAddress;
  pin: string; // format like "000-00-000"
  port?: number;

  setupID?: string[4];

  manufacturer?: string;
  model?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AccessoryConfig extends Record<string, any> {
  accessory: AccessoryName | AccessoryIdentifier;
  name: string;
  uuid_base?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PlatformConfig extends Record<string, any>  {
  platform: PlatformName | PlatformIdentifier;
  name?: string;
}

export interface ExternalPortsConfiguration {
  start: number;
  end: number;
}

export class Server {

  private readonly api: HomebridgeAPI;
  private readonly pluginManager: PluginManager;
  private readonly bridge: Bridge;

  private readonly config: HomebridgeConfig;
  private readonly cleanCachedAccessories: boolean;
  private readonly hideQRCode: boolean;
  private readonly allowInsecureAccess: boolean;

  private readonly externalPorts?: ExternalPortsConfiguration;
  private nextExternalPort?: number;

  private cachedPlatformAccessories: PlatformAccessory[] = [];
  private cachedAccessoriesFileCreated = false;
  private readonly publishedExternalAccessories: Map<MacAddress, PlatformAccessory> = new Map();

  constructor(options: HomebridgeOptions = {}) {
    accessoryStorage.initSync({ dir: User.cachedAccessoryPath() }); // Setup Accessory Cache Storage

    this.config = options.config || Server._loadConfig();
    this.cleanCachedAccessories = options.cleanCachedAccessories || false;
    this.hideQRCode = options.hideQRCode || false;
    // Server is "secure by default", meaning it creates a top-level Bridge accessory that
    // will not allow unauthenticated requests. This matches the behavior of actual HomeKit
    // accessories. However you can set this to true to allow all requests without authentication,
    // which can be useful for easy hacking. Note that this will expose all functions of your
    // bridged accessories, like changing characteristics (i.e. flipping your lights on and off).
    this.allowInsecureAccess = options.insecureAccess || false;
    this.externalPorts = this.config.ports;

    this.api = new HomebridgeAPI(); // object we feed to Plugins
    this.api.on(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, this.handleRegisterPlatformAccessories.bind(this));
    this.api.on(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, this.handleUpdatePlatformAccessories.bind(this));
    this.api.on(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, this.handleUnregisterPlatformAccessories.bind(this));
    this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, this.handlePublishExternalAccessories.bind(this));

    const pluginManagerOptions: PluginManagerOptions = {
      activePlugins: this.config.plugins,
      customPluginPath: options.customPluginPath,
    };
    this.pluginManager = new PluginManager(this.api, pluginManagerOptions);

    this.bridge = new Bridge(this.config.bridge.name, uuid.generate("HomeBridge"));
  }

  public async start(): Promise<void> {
    this.loadCachedPlatformAccessoriesFromDisk();
    this.pluginManager.initializeInstalledPlugins();

    if (this.config.platforms.length > 0) {
      await this.loadPlatforms();
    }
    if (this.config.accessories.length > 0) {
      this._loadAccessories();
    }
    this.restoreCachedPlatformAccessories();

    this.publishBridge();
    this.api.signalFinished();
  }

  private publishBridge(): void {
    const bridgeConfig = this.config.bridge;

    const info = this.bridge.getService(Service.AccessoryInformation)!;
    info.setCharacteristic(Characteristic.Manufacturer, bridgeConfig.manufacturer || "homebridge.io");
    info.setCharacteristic(Characteristic.Model, bridgeConfig.model || "homebridge");
    info.setCharacteristic(Characteristic.SerialNumber, bridgeConfig.username);
    info.setCharacteristic(Characteristic.FirmwareRevision, getVersion());

    this.bridge.on(AccessoryEventTypes.LISTENING, (port: number) => {
      log.info("Homebridge is running on port %s.", port);
    });

    const publishInfo: PublishInfo = {
      username: bridgeConfig.username,
      port: bridgeConfig.port,
      pincode: bridgeConfig.pin,
      category: Accessory.Categories.BRIDGE,
      mdns: this.config.mdns,
    };

    if (bridgeConfig.setupID && bridgeConfig.setupID.length === 4) {
      publishInfo.setupID = bridgeConfig.setupID;
    }

    this.bridge.publish(publishInfo, this.allowInsecureAccess);

    this.printSetupInfo(publishInfo.pincode);
  }

  private static _loadConfig(): HomebridgeConfig {
    // Look for the configuration file
    const configPath = User.configPath();

    const defaultBridge: BridgeConfiguration = {
      name: "Homebridge",
      username: "CC:22:3D:E3:CE:30",
      pin: "031-45-154",
    };

    if (!fs.existsSync(configPath)) {
      log.warn("config.json (%s) not found.", configPath);
      return { // return a default configuration
        bridge: defaultBridge,
        accessories: [],
        platforms: [],
      };
    }

    let config: Partial<HomebridgeConfig>;
    try {
      config = JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" }));
    } catch (err) {
      log.error("There was a problem reading your config.json file.");
      log.error("Please try pasting your config.json file here to validate it: http://jsonlint.com");
      log.error("");
      throw err;
    }

    if (config.ports !== undefined) {
      if (config.ports.start && config.ports.end) {
        if (config.ports.start > config.ports.end) {
          log.error("Invalid port pool configuration. End should be greater than or equal to start.");
          config.ports = undefined;
        }
      } else {
        log.error("Invalid configuration for 'ports'. Missing 'start' and 'end' properties! Ignoring it!");
        config.ports = undefined;
      }
    }

    const bridge: Partial<BridgeConfiguration> = config.bridge || defaultBridge;
    bridge.name = bridge.name || defaultBridge.name;
    bridge.username = bridge.username || defaultBridge.username;
    bridge.pin = bridge.pin || defaultBridge.pin;
    config.bridge = bridge as BridgeConfiguration;

    const username = config.bridge.username;
    if (!mac.validMacAddress(username)) {
      throw new Error(`Not a valid username: ${username}. Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address.`);
    }

    config.accessories = config.accessories || [];
    config.platforms = config.platforms || [];
    log.info("Loaded config.json with %s accessories and %s platforms.", config.accessories.length, config.platforms.length);

    log.info("---");

    return config as HomebridgeConfig;
  }

  private loadCachedPlatformAccessoriesFromDisk(): void {
    const cachedAccessories: SerializedPlatformAccessory[] = accessoryStorage.getItem("cachedAccessories");

    if (cachedAccessories) {
      this.cachedPlatformAccessories = cachedAccessories.map(serialized => {
        return PlatformAccessory.deserialize(serialized);
      });
      this.cachedAccessoriesFileCreated = true;
    }
  }

  private restoreCachedPlatformAccessories(): void {
    this.cachedPlatformAccessories = this.cachedPlatformAccessories.filter(accessory => {
      const plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!);
      const platformPlugin = plugin && plugin.getActivePlatform(accessory._associatedPlatform!);

      if (!platformPlugin) {
        console.log(`Failed to find plugin to handle accessory ${accessory._associatedHAPAccessory.displayName}`);
        if (this.cleanCachedAccessories) {
          console.log(`Removing orphaned accessory ${accessory._associatedHAPAccessory.displayName}`);
          return false; // filter it from the list
        }
      } else {
        platformPlugin.configureAccessory(accessory);
        accessory.getService(Service.AccessoryInformation)!
          .setCharacteristic(Characteristic.FirmwareRevision, plugin!.version);
      }

      this.bridge.addBridgedAccessory(accessory._associatedHAPAccessory);
      return true; // keep it in the list
    });
  }

  private saveCachedPlatformAccessoriesOnDisk(): void {
    if (this.cachedPlatformAccessories.length > 0) {
      this.cachedAccessoriesFileCreated = true;

      const serializedAccessories = this.cachedPlatformAccessories.map(accessory => PlatformAccessory.serialize(accessory));
      accessoryStorage.setItemSync("cachedAccessories", serializedAccessories);
    } else if (this.cachedAccessoriesFileCreated) {
      this.cachedAccessoriesFileCreated = false;
      accessoryStorage.removeItemSync("cachedAccessories");
    }
  }

  private _loadAccessories(): void {
    log.info("Loading " + this.config.accessories.length + " accessories...");

    this.config.accessories.forEach((accessoryConfig, index) => {
      if (!accessoryConfig.accessory) {
        log.warn("Your config.json contains an illegal accessory configuration object at position %d. " +
          "Missing property 'accessory'. Skipping entry...", index + 1); // we rather count from 1 for the normal people?
        return;
      }

      const accessoryIdentifier: AccessoryName | AccessoryIdentifier = accessoryConfig.accessory;
      const displayName = accessoryConfig.name;
      if (!displayName) {
        log.warn("Could not load accessory %s at position %d as it is missing the required 'name' property!", accessoryIdentifier, index + 1);
        return;
      }

      let plugin: Plugin;
      let constructor: AccessoryPluginConstructor;
      try {
        plugin = this.pluginManager.getPluginForAccessory(accessoryIdentifier);
        constructor = plugin.getAccessoryConstructor(accessoryIdentifier);
      } catch (error) {
        log.warn("Error loading accessory requested in your config.json at position %d", index + 1);
        throw error; // error message contains more information
      }

      const logger = Logger.withPrefix(displayName);
      logger("Initializing %s accessory...", accessoryIdentifier);

      const accessoryInstance: AccessoryPlugin = new constructor(logger, accessoryConfig);

      //pass accessoryIdentifier for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
      const accessory = this.createHAPAccessory(plugin, accessoryInstance, displayName, accessoryIdentifier, accessoryConfig.uuid_base);

      // add it to the bridge
      this.bridge.addBridgedAccessory(accessory);
    });
  }

  private async loadPlatforms(): Promise<void[]> {
    log.info("Loading " + this.config.platforms.length + " platforms...");

    const promises: Promise<void>[] = [];
    this.config.platforms.forEach((platformConfig, index) => {
      if (!platformConfig.platform) {
        log.warn("Your config.json contains an illegal platform configuration object at position %d. " +
          "Missing property 'platform'. Skipping entry...", index + 1); // we rather count from 1 for the normal people?
        return;
      }

      const platformIdentifier: PlatformName | PlatformIdentifier = platformConfig.platform;
      const displayName = platformConfig.name || platformIdentifier;

      let plugin: Plugin;
      let constructor: PlatformPluginConstructor;
      try {
        plugin = this.pluginManager.getPluginForPlatform(platformIdentifier);
        constructor = plugin.getPlatformConstructor(platformIdentifier);
      } catch (error) {
        log.warn("Error loading platform requested in your config.json at position %d", index + 1);
        throw error; // error message contains more information
      }

      const logger = Logger.withPrefix(displayName);
      logger("Initializing %s platform...", platformIdentifier);

      const platform: PlatformPlugin = new constructor(logger, platformConfig, this.api);

      if (platform.configureAccessory !== undefined) {
        plugin.assignPlatformPlugin(platformIdentifier, platform);
      } else if (HomebridgeAPI.isLegacyPlatformPlugin(platform)) {
        // Plugin 1.0, load accessories
        promises.push(this.loadPlatformAccessories(plugin, platform, platformIdentifier));
      } else {
        throw new Error(`Detected malformed PlatformPlugin in your config.json at position ${index + 1}! Please contact Platform developer!`);
      }
    });

    return Promise.all(promises);
  }

  private async loadPlatformAccessories(plugin: Plugin, platformInstance: LegacyPlatformPlugin, platformType: PlatformName | PlatformIdentifier): Promise<void> {
    // Plugin 1.0, load accessories
    return new Promise(resolve => {
      platformInstance.accessories(once((accessories: AccessoryPlugin[]) => {
        // loop through accessories adding them to the list and registering them
        accessories.forEach(accessoryInstance => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          const accessoryName = accessoryInstance.name; // assume this property was set
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          const uuidBase: string | undefined = accessoryInstance.uuid_base; // optional base uuid

          log.info("Initializing platform accessory '%s'...", accessoryName);

          const accessory: Accessory = this.createHAPAccessory(plugin, accessoryInstance, accessoryName, platformType, uuidBase);
          this.bridge.addBridgedAccessory(accessory);
        });

        resolve();
      }));
    });
  }

  private createHAPAccessory(plugin: Plugin, accessoryInstance: AccessoryPlugin, displayName: string, accessoryType: AccessoryName | AccessoryIdentifier, uuidBase?: string): Accessory {
    const services = (accessoryInstance.getServices() || []).filter(service => !!service);

    if (!(services[0] instanceof Service)) {
      // The returned "services" for this accessory is assumed to be the old style: a big array
      // of JSON-style objects that will need to be parsed by HAP-NodeJS's AccessoryLoader.

      return AccessoryLoader.parseAccessoryJSON({ // Create the actual HAP-NodeJS "Accessory" instance
        displayName: displayName,
        services: services,
      });
    } else {
      // The returned "services" for this accessory are simply an array of new-API-style
      // Service instances which we can add to a created HAP-NodeJS Accessory directly.
      const accessoryUUID = uuid.generate(accessoryType + ":" + (uuidBase || displayName));
      const accessory = new Accessory(displayName, accessoryUUID);

      // listen for the identify event if the accessory instance has defined an identify() method
      if (accessoryInstance.identify) {
        accessory.on(AccessoryEventTypes.IDENTIFY, (paired, callback) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          accessoryInstance.identify!(() => {}); // empty callback for backwards compatibility
          callback();
        });
      }

      services.forEach(service => {
        // if you returned an AccessoryInformation service, merge its values with ours
        if (service instanceof Service.AccessoryInformation) {
          const existingService = accessory.getService(Service.AccessoryInformation)!;

          service.setCharacteristic(Characteristic.Name, displayName); // ensure display name is set
          // pull out any values you may have defined
          existingService.replaceCharacteristicsFromService(service);
        } else {
          accessory.addService(service);
        }
      });

      accessory.getService(Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.FirmwareRevision, plugin.version);

      return accessory;
    }
  }

  private handleRegisterPlatformAccessories(accessories: PlatformAccessory[]): void {
    const hapAccessories = accessories.map(accessory => {
      this.cachedPlatformAccessories.push(accessory);

      const plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!);
      if (plugin) {
        accessory.getService(Service.AccessoryInformation)!
          .setCharacteristic(Characteristic.FirmwareRevision, plugin.version);

        const platform = plugin.getActivePlatform(accessory._associatedPlatform!);
        if (!platform) {
          log.error("The plugin '%s' registered a new accessory for the platform '%s'. The platform couldn't be found though!", accessory._associatedPlugin!, accessory._associatedPlatform!);
        }
      } else {
        log.error("A platform configure a new accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
      }

      return accessory._associatedHAPAccessory;
    });

    this.bridge.addBridgedAccessories(hapAccessories);
    this.saveCachedPlatformAccessoriesOnDisk();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleUpdatePlatformAccessories(accessories: PlatformAccessory[]): void {
    // Update persisted accessories
    this.saveCachedPlatformAccessoriesOnDisk();
  }

  private handleUnregisterPlatformAccessories(accessories: PlatformAccessory[]): void {
    const hapAccessories = accessories.map(accessory => {
      const index = this.cachedPlatformAccessories.indexOf(accessory);
      if (index >= 0) {
        this.cachedPlatformAccessories.splice(index, 1);
      }

      return accessory._associatedHAPAccessory;
    });

    this.bridge.removeBridgedAccessories(hapAccessories);
    this.saveCachedPlatformAccessoriesOnDisk();
  }

  private handlePublishExternalAccessories(accessories: PlatformAccessory[]): void {
    const accessoryPin = this.config.bridge.pin;

    accessories.forEach(accessory => {
      let accessoryPort = 0;

      if (this.externalPorts) {
        if (this.nextExternalPort === undefined) {
          this.nextExternalPort = this.externalPorts.start;
        }

        if (this.nextExternalPort <= this.externalPorts.end) {
          accessoryPort = this.nextExternalPort++;
        } else {
          // accessoryPort is still zero
          log.warn("External port pool ran out of ports. Fallback to random assign.");
        }
      }

      const hapAccessory = accessory._associatedHAPAccessory;
      const advertiseAddress = mac.generate(hapAccessory.UUID);

      if (this.publishedExternalAccessories.has(advertiseAddress)) {
        throw new Error(`Accessory ${hapAccessory.displayName} experienced an address collision.`);
      } else {
        this.publishedExternalAccessories.set(advertiseAddress, accessory);
      }

      const plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!);
      if (plugin) {
        hapAccessory.getService(Service.AccessoryInformation)!
          .setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
      } else {
        log.error("A platform configured a external accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
      }

      hapAccessory.on(AccessoryEventTypes.LISTENING, (port: number) => {
        log.info("%s is running on port %s.", hapAccessory.displayName, port);
        log.info("Please add [%s] manually in Home app. Setup Code: %s", hapAccessory.displayName, accessoryPin);
      });

      hapAccessory.publish({
        username: advertiseAddress,
        pincode: accessoryPin,
        category: accessory.category,
        port: accessoryPort,
        mdns: this.config.mdns,
      }, this.allowInsecureAccess);
    });
  }

  teardown(): void {
    this.saveCachedPlatformAccessoriesOnDisk();

    this.bridge.unpublish();
    for (const accessory of this.publishedExternalAccessories.values()) {
      accessory._associatedHAPAccessory.unpublish();
    }

    this.api.signalShutdown();
  }

  private printSetupInfo(pin: string): void {
    console.log("Setup Payload:");
    console.log(this.bridge.setupURI());

    if(!this.hideQRCode) {
      console.log("Scan this code with your HomeKit app on your iOS device to pair with Homebridge:");
      qrcode.setErrorLevel("M"); // HAP specifies level M or higher for ECC
      qrcode.generate(this.bridge.setupURI());
      console.log("Or enter this code with your HomeKit app on your iOS device to pair with Homebridge:");
    } else {
      console.log("Enter this code with your HomeKit app on your iOS device to pair with Homebridge:");
    }

    console.log(chalk.black.bgWhite("                       "));
    console.log(chalk.black.bgWhite("    ┌────────────┐     "));
    console.log(chalk.black.bgWhite("    │ " + pin + " │     "));
    console.log(chalk.black.bgWhite("    └────────────┘     "));
    console.log(chalk.black.bgWhite("                       "));
  }

}
