import fs from "fs";
import storage, { LocalStorage } from "node-persist";
import chalk from "chalk";
import qrcode from "qrcode-terminal";
import {
  Accessory,
  AccessoryEventTypes,
  AccessoryLoader,
  Bridge,
  Categories,
  Characteristic,
  CharacteristicEventTypes,
  once,
  PublishInfo,
  Service,
  uuid,
} from "hap-nodejs";
import { Logger, Logging } from "./logger";
import { User } from "./user";
import {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPlugin,
  AccessoryPluginConstructor,
  HomebridgeAPI,
  InternalAPIEvent,
  PlatformIdentifier,
  PlatformName,
  PlatformPlugin,
  PlatformPluginConstructor,
  PluginIdentifier,
  StaticPlatformPlugin,
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
  keepOrphanedCachedAccessories?: boolean;
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

export interface AccessoryConfig extends Record<string, unknown> {
  accessory: AccessoryName | AccessoryIdentifier;
  name: string;
  uuid_base?: string;
}

export interface PlatformConfig extends Record<string, unknown>  {
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
  private readonly keepOrphanedCachedAccessories: boolean;
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
    this.keepOrphanedCachedAccessories = options.keepOrphanedCachedAccessories || false;
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
    const promises: Promise<void>[] = [];

    this.loadCachedPlatformAccessoriesFromDisk();
    this.pluginManager.initializeInstalledPlugins();

    if (this.config.platforms.length > 0) {
      promises.push(...this.loadPlatforms());
    }
    if (this.config.accessories.length > 0) {
      this._loadAccessories();
    }
    this.restoreCachedPlatformAccessories();

    this.api.signalFinished();

    // wait for all platforms to publish their accessories before we publish the bridge
    await Promise.all(promises)
      .then(() => this.publishBridge());
  }

  private publishBridge(): void {
    const bridgeConfig = this.config.bridge;

    const info = this.bridge.getService(Service.AccessoryInformation)!;
    info.setCharacteristic(Characteristic.Manufacturer, bridgeConfig.manufacturer || "homebridge.io");
    info.setCharacteristic(Characteristic.Model, bridgeConfig.model || "homebridge");
    info.setCharacteristic(Characteristic.SerialNumber, bridgeConfig.username);
    info.setCharacteristic(Characteristic.FirmwareRevision, getVersion());

    this.bridge.on(AccessoryEventTypes.LISTENING, (port: number) => {
      log.info("Homebridge v%s is running on port %s.", getVersion(), port);
    });

    const publishInfo: PublishInfo = {
      username: bridgeConfig.username,
      port: bridgeConfig.port,
      pincode: bridgeConfig.pin,
      category: Categories.BRIDGE,
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
      let plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!);
      if (!plugin) { // a little explainer here. This section is basically here to resolve plugin name changes of dynamic platform plugins
        try {
          // resolve platform accessories by searching for plugins which registered a dynamic platform for the given name
          plugin = this.pluginManager.getPluginByActiveDynamicPlatform(accessory._associatedPlatform!);

          if (plugin) { // if it's undefined the no plugin was found
            // could improve on this by calculating the Levenshtein distance to only allow platform ownership changes
            // when something like a typo happened. Are there other reasons the name could change?
            // And how would we define the threshold?

            log.info("When searching for the associated plugin of the accessory '" + accessory.displayName + "' " +
              "it seems like the plugin name changed from '" + accessory._associatedPlugin + "' to '" +
              plugin.getPluginIdentifier() + "'. Plugin association is now being transformed!");

            accessory._associatedPlugin = plugin.getPluginIdentifier(); // update the assosicated plugin to the new one
          }
        } catch (error) { // error is thrown if multiple plugins where found for the given platform name
          log.info("Could not find the associated plugin for the accessory '" + accessory.displayName + "'. " +
            "Tried to find the plugin by the platform name but " + error.message);
        }
      }

      const platformPlugins = plugin && plugin.getActiveDynamicPlatform(accessory._associatedPlatform!);

      if (!platformPlugins) {
        log.info(`Failed to find plugin to handle accessory ${accessory._associatedHAPAccessory.displayName}`);
        if (!this.keepOrphanedCachedAccessories) {
          log.info(`Removing orphaned accessory ${accessory._associatedHAPAccessory.displayName}`);
          return false; // filter it from the list
        }
      } else {
        // we set the current plugin version before configureAccessory is called, so the dev has the opportunity to override it
        accessory.getService(Service.AccessoryInformation)!
          .setCharacteristic(Characteristic.FirmwareRevision, plugin!.version);

        platformPlugins.configureAccessory(accessory);
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

      const accessoryInstance: AccessoryPlugin = new constructor(logger, accessoryConfig, this.api);

      //pass accessoryIdentifier for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
      const accessory = this.createHAPAccessory(plugin, accessoryInstance, displayName, accessoryIdentifier, accessoryConfig.uuid_base);

      if (accessory) {
        this.bridge.addBridgedAccessory(accessory);
      } else {
        logger("Accessory %s returned empty set of services. Won't adding it to the bridge!", accessoryIdentifier);
      }
    });
  }

  private loadPlatforms(): Promise<void>[] {
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

      if (HomebridgeAPI.isDynamicPlatformPlugin(platform)) {
        plugin.assignDynamicPlatform(platformIdentifier, platform);
      } else if (HomebridgeAPI.isStaticPlatformPlugin(platform)) { // Plugin 1.0, load accessories
        promises.push(this.loadPlatformAccessories(plugin, platform, platformIdentifier, logger));
      } else {
        // otherwise it's a IndependentPlatformPlugin which doesn't expose any methods at all.
        // We just call the constructor and let it be enabled.
      }
    });

    return promises;
  }

  private async loadPlatformAccessories(plugin: Plugin, platformInstance: StaticPlatformPlugin, platformType: PlatformName | PlatformIdentifier, logger: Logging): Promise<void> {
    // Plugin 1.0, load accessories
    return new Promise(resolve => {
      // warn the user if the static platform is blocking the startup of Homebridge for to long
      const loadDelayWarningInterval = setInterval(() => {
        logger.warn("%s is taking a long time to load and preventing Homebridge from starting.", plugin.getPluginIdentifier());
      }, 20000);

      platformInstance.accessories(once((accessories: AccessoryPlugin[]) => {
        // clear the load delay warning interval
        clearInterval(loadDelayWarningInterval);

        // loop through accessories adding them to the list and registering them
        accessories.forEach((accessoryInstance, index) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const accessoryName = accessoryInstance.name; // assume this property was set
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const uuidBase: string | undefined = accessoryInstance.uuid_base; // optional base uuid

          log.info("Initializing platform accessory '%s'...", accessoryName);

          const accessory = this.createHAPAccessory(plugin, accessoryInstance, accessoryName, platformType, uuidBase);

          if (accessory) {
            this.bridge.addBridgedAccessory(accessory);
          } else {
            logger("Platform %s returned an accessory at index %d with an empty set of services. Won't adding it to the bridge!", platformType, index);
          }
        });

        resolve();
      }));
    });
  }

  private createHAPAccessory(plugin: Plugin, accessoryInstance: AccessoryPlugin, displayName: string, accessoryType: AccessoryName | AccessoryIdentifier, uuidBase?: string): Accessory | undefined {
    const services = (accessoryInstance.getServices() || [])
      .filter(service => !!service); // filter out undefined values; a common mistake
    const controllers = (accessoryInstance.getControllers && accessoryInstance.getControllers() || [])
      .filter(controller => !!controller);

    if (services.length === 0 && controllers.length === 0) { // check that we only add valid accessory with at least one service
      return undefined;
    }

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
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          accessoryInstance.identify!(() => {}); // empty callback for backwards compatibility
          callback();
        });
      }

      const informationService = accessory.getService(Service.AccessoryInformation)!;
      services.forEach(service => {
        // if you returned an AccessoryInformation service, merge its values with ours
        if (service instanceof Service.AccessoryInformation) {
          service.setCharacteristic(Characteristic.Name, displayName); // ensure display name is set
          // ensure the plugin has not hooked already some listeners (some weird ones do).
          // Otherwise they would override our identify listener registered by the HAP-NodeJS accessory
          service.getCharacteristic(Characteristic.Identify).removeAllListeners(CharacteristicEventTypes.SET);

          // pull out any values and listeners (get and set) you may have defined
          informationService.replaceCharacteristicsFromService(service);
        } else {
          accessory.addService(service);
        }
      });

      if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") {
        // overwrite the default value with the actual plugin version
        informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
      }

      controllers.forEach(controller => {
        accessory.configureController(controller);
      });

      return accessory;
    }
  }

  private handleRegisterPlatformAccessories(accessories: PlatformAccessory[]): void {
    const hapAccessories = accessories.map(accessory => {
      this.cachedPlatformAccessories.push(accessory);

      const plugin = this.pluginManager.getPlugin(accessory._associatedPlugin!);
      if (plugin) {
        const informationService = accessory.getService(Service.AccessoryInformation)!;
        if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") {
          // overwrite the default value with the actual plugin version
          informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
        }

        const platforms = plugin.getActiveDynamicPlatform(accessory._associatedPlatform!);
        if (!platforms) {
          log.warn("The plugin '%s' registered a new accessory for the platform '%s'. The platform couldn't be found though!", accessory._associatedPlugin!, accessory._associatedPlatform!);
        }
      } else {
        log.warn("A platform configured a new accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
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
        const informationService = hapAccessory.getService(Service.AccessoryInformation)!;
        if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") {
          // overwrite the default value with the actual plugin version
          informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
        }
      } else if (PluginManager.isQualifiedPluginIdentifier(accessory._associatedPlugin!)) { // we did already complain in api.ts if it wasn't a qualified name
        log.warn("A platform configured a external accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
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
