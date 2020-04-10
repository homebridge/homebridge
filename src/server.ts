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
import { Logger, Logging } from "./logger";
import { User } from "./user";
import {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPlugin,
  AccessoryPluginConstructor,
  ConfigurablePlatformPlugin,
  HomebridgeAPI,
  InternalAPIEvent,
  LegacyPlatformPlugin,
  PlatformIdentifier,
  PlatformName,
  PlatformPlugin,
  PlatformPluginConstructor,
  PluginIdentifier,
  PluginType,
} from "./api";
import { PlatformAccessory, SerializedPlatformAccessory } from "./platformAccessory";
import { BridgeSetupManager, BridgeSetupManagerEvent } from "./setupmanager/bridgeSetupManager";
import getVersion from "./version";
import { Plugin, PluginManager } from "./plugin";
import * as mac from "./util/mac";
import { MacAddress } from "./util/mac";

const accessoryStorage: LocalStorage = storage.create();
const log = Logger.internal;

export interface HomebridgeOptions {

    config?: HomebridgeConfig;
    cleanCachedAccessories?: boolean;
    hideQRCode?: boolean;
    insecureAccess?: boolean;

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

    private readonly _config: HomebridgeConfig;
    private readonly _plugins: Record<PluginIdentifier, Plugin>;
    private _cachedPlatformAccessories: PlatformAccessory[];
    private readonly _bridge: Bridge;
    private readonly _cleanCachedAccessories: boolean;
    private readonly _hideQRCode: boolean;

    private readonly _externalPorts?: ExternalPortsConfiguration;
    private _nextExternalPort?: number;

    private readonly _activeDynamicPlugins: Map<PlatformName | PlatformIdentifier, PlatformPlugin> = new Map();
    private readonly _configurablePlatformPlugins: Map<PlatformName | PlatformIdentifier, ConfigurablePlatformPlugin> = new Map();
    private readonly publishedExternalAccessories: Map<MacAddress, PlatformAccessory> = new Map();
    private readonly _setupManager: BridgeSetupManager;
    private readonly _allowInsecureAccess: boolean;

    private _asyncCalls = 0;
    private _asyncWait = false;


    constructor(options: HomebridgeOptions = {}) {
      storage.create();

      // Setup Accessory Cache Storage
      accessoryStorage.initSync({ dir: User.cachedAccessoryPath() });

      this.api = new HomebridgeAPI(); // object we feed to Plugins
      this.api.on(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, this._handleRegisterPlatformAccessories.bind(this));
      this.api.on(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, this._handleUpdatePlatformAccessories.bind(this));
      this.api.on(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, this._handleUnregisterPlatformAccessories.bind(this));
      this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, this._handlePublishExternalAccessories.bind(this));

      this._config = options.config || Server._loadConfig();
      this._plugins = this._loadPlugins();
      this._cachedPlatformAccessories = this._loadCachedPlatformAccessories();
      this._bridge = this._createBridge();
      this._cleanCachedAccessories = options.cleanCachedAccessories || false;
      this._hideQRCode = options.hideQRCode || false;

      this._externalPorts = this._config.ports;

      this._setupManager = new BridgeSetupManager(this._configurablePlatformPlugins);
      this._setupManager.on(BridgeSetupManagerEvent.NEW_CONFIG, this._handleNewConfig.bind(this));
      this._setupManager.on(BridgeSetupManagerEvent.REQUEST_CURRENT_CONFIG, callback => callback(this._config));

      // Server is "secure by default", meaning it creates a top-level Bridge accessory that
      // will not allow unauthenticated requests. This matches the behavior of actual HomeKit
      // accessories. However you can set this to true to allow all requests without authentication,
      // which can be useful for easy hacking. Note that this will expose all functions of your
      // bridged accessories, like changing characteristics (i.e. flipping your lights on and off).
      this._allowInsecureAccess = options.insecureAccess || false;
    }

    public run(): void {
      // keep track of async calls we're waiting for callbacks on before we can start up
      this._asyncCalls = 0;
      this._asyncWait = true;

      if (this._config.platforms.length > 0) {
        this._loadPlatforms();
      }
      if (this._config.accessories.length > 0) {
        this._loadAccessories();
      }
      this._configCachedPlatformAccessories();
      this._bridge.addService(this._setupManager.getService());

      this._asyncWait = false;

      // publish now unless we're waiting on anyone
      if (this._asyncCalls === 0) {
        this._publish();
      }

      this.api.signalFinished();
    }

    private _publish(): void {
      const bridgeConfig = this._config.bridge;

      const info = this._bridge.getService(Service.AccessoryInformation)!;
      info.setCharacteristic(Characteristic.Manufacturer, bridgeConfig.manufacturer || "homebridge.io");
      info.setCharacteristic(Characteristic.Model, bridgeConfig.model || "homebridge");
      info.setCharacteristic(Characteristic.SerialNumber, bridgeConfig.username);
      info.setCharacteristic(Characteristic.FirmwareRevision, getVersion());

      this._bridge.on(AccessoryEventTypes.LISTENING, (port: number) => {
        log.info("Homebridge is running on port %s.", port);
      });

      const publishInfo: PublishInfo = {
        username: bridgeConfig.username,
        port: bridgeConfig.port,
        pincode: bridgeConfig.pin,
        category: Accessory.Categories.BRIDGE,
        mdns: this._config.mdns,
      };

      if (bridgeConfig.setupID && bridgeConfig.setupID.length === 4) {
        publishInfo.setupID = bridgeConfig.setupID;
      }

      this._bridge.publish(publishInfo, this._allowInsecureAccess);

      this._printSetupInfo(publishInfo.pincode);
    }

    private _loadPlugins(): Record<PluginIdentifier, Plugin> {
      const plugins: Record<PluginIdentifier, Plugin> = {};
      let foundOnePlugin = false;
      const activePlugins = this._computeActivePluginList();

      // load and validate plugins - check for valid package.json, etc.
      PluginManager.installed().forEach(plugin => {
        if (activePlugins && !activePlugins.includes(plugin.name())) {
          return;
        }

        // attempt to load it
        try {
          plugin.load();
        } catch (err) {
          log.error("====================");
          log.error("ERROR LOADING PLUGIN " + plugin.name() + ":");
          log.error(err.stack);
          log.error("====================");
          return;
        }

        log.info("Loaded plugin: " + plugin.name());
        plugins[plugin.name()] = plugin; // add it to our dict for easy lookup later

            plugin.initializer!(this.api); // call the plugin's initializer and pass it our API instance

            log.info("---");
            foundOnePlugin = true;
      });

      // Complain if you don't have any plugins.
      if (!foundOnePlugin) {
        log.warn("No plugins found. See the README for information on installing plugins.");
      }

      return plugins;
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

    private _loadCachedPlatformAccessories(): PlatformAccessory[] {
      const cachedAccessories: SerializedPlatformAccessory[] = accessoryStorage.getItem("cachedAccessories");
      const platformAccessories: PlatformAccessory[] = [];

      if (cachedAccessories) {
        cachedAccessories.forEach(serializedAccessory => {
          const platformAccessory = PlatformAccessory.deserialize(serializedAccessory);
          platformAccessories.push(platformAccessory);
        });
      }

      return platformAccessories;
    }

    private _computeActivePluginList(): undefined | PlatformIdentifier[] {
      return this._config.plugins;
    }

    private _createBridge(): Bridge {
      return new Bridge(this._config.bridge.name, uuid.generate("HomeBridge"));
    }

    private _loadAccessories(): void {
      log.info("Loading " + this._config.accessories.length + " accessories...");

      this._config.accessories.forEach((accessoryConfig, index) => {
        if (!accessoryConfig.accessory) {
          log.warn("Your config.json contains an illegal accessory configuration object at position %d. " +
                    "Missing property 'accessory'. Skipping entry...", index + 1); // we rather count from 1 for the normal people?
          return;
        }

        const accessoryType: AccessoryName | AccessoryIdentifier = accessoryConfig.accessory;
        const accessoryName = accessoryConfig.name;
        if (!accessoryName) {
          log.warn("Could not load accessory %s at position %d as it is missing the required 'name' property!", accessoryType, index + 1);
          return;
        }

        let accessoryConstructor: AccessoryPluginConstructor;
        try {
          accessoryConstructor = this.api.accessory(accessoryType);
        } catch (error) {
          log.warn("Error loading accessory requested in your config.json at position %d", index + 1);
          throw error; // error message contains more information
        }

        const accessoryLogger = Logger.withPrefix(accessoryName);
        accessoryLogger("Initializing %s accessory...", accessoryType);

        const accessoryInstance = new accessoryConstructor(accessoryLogger, accessoryConfig);
        //pass accessoryType for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
        const accessory = this._createAccessory(accessoryInstance, accessoryName, accessoryType, accessoryConfig.uuid_base);

        // add it to the bridge
        this._bridge.addBridgedAccessory(accessory);
      });
    }

    private _loadPlatforms(): void {
      log.info("Loading " + this._config.platforms.length + " platforms...");

      this._config.platforms.forEach((platformConfig, index) => {
        if (!platformConfig.platform) {
          log.warn("Your config.json contains an illegal platform configuration object at position %d. " +
                    "Missing property 'platform'. Skipping entry...", index + 1); // we rather count from 1 for the normal people?
          return;
        }

        const platformType: PlatformName | PlatformIdentifier = platformConfig.platform;
        const platformName = platformConfig.name || platformType;

        let platformConstructor: PlatformPluginConstructor;
        try {
          platformConstructor = this.api.platform(platformType);
        } catch (error) {
          log.warn("Error loading platform requested in your config.json at position %d", index + 1);
          throw error; // error message contains more information
        }

        const platformLogger: Logging = Logger.withPrefix(platformName);
        platformLogger("Initializing %s platform...", platformType);

        const platformInstance = new platformConstructor(platformLogger, platformConfig, this.api);

        if (platformInstance.configureAccessory !== undefined) {
          this._activeDynamicPlugins.set(platformType, platformInstance); // // platformType is here type "PlatformName"

          if (HomebridgeAPI.isConfigurablePlugin(platformInstance)) {
            this._configurablePlatformPlugins.set(platformType, platformInstance); // platformType is here type "PlatformName"
          }
        } else if (HomebridgeAPI.isLegacyPlatformPlugin(platformInstance)) {
          // Plugin 1.0, load accessories
          this._loadPlatformAccessories(platformInstance, platformLogger, platformType);
        } else {
          throw new Error(`Detected malformed Platform in your config.json at position ${index + 1}! Please contact Platform developer!`);
        }
      });
    }

    private _configCachedPlatformAccessories(): void {
      this._cachedPlatformAccessories = this._cachedPlatformAccessories.filter(accessory => {
        const fullName = accessory._associatedPlugin + "." + accessory._associatedPlatform;

        let platformInstance = this._activeDynamicPlugins.get(fullName);
        if (!platformInstance) { // we have inconsistent keys, this is hell. This fixes it (well not really of course)
          platformInstance = this._activeDynamicPlugins.get(accessory._associatedPlatform!);
        }

        if (platformInstance) {
          platformInstance.configureAccessory(accessory);
        } else {
          console.log(`Failed to find plugin to handle accessory ${accessory._associatedHAPAccessory.displayName}`);
          if (this._cleanCachedAccessories) {
            console.log(`Removing orphaned accessory ${accessory._associatedHAPAccessory.displayName}`);
            return false; // filter it from the list
          }
        }

        this._bridge.addBridgedAccessory(accessory._associatedHAPAccessory);
        return true; // keep it in the list
      });
    }

    private _loadPlatformAccessories(platformInstance: LegacyPlatformPlugin, log: Logging, platformType: PlatformName | PlatformIdentifier): void {
      // Plugin 1.0, load accessories
      this._asyncCalls++;

      platformInstance.accessories(once((accessories: AccessoryPlugin[]) => {
        this._asyncCalls--;

        // loop through accessories adding them to the list and registering them
        accessories.forEach(accessoryInstance => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          const accessoryName = accessoryInstance.name; // assume this property was set
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          const uuidBase: string | undefined = accessoryInstance.uuid_base; // optional base uuid

          log("Initializing platform accessory '%s'...", accessoryName);

          const accessory: Accessory = this._createAccessory(accessoryInstance, accessoryName, platformType, uuidBase);

          // add it to the bridge
          this._bridge.addBridgedAccessory(accessory);
        });

        // were we the last callback?
        if (this._asyncCalls === 0 && !this._asyncWait) {
          this._publish();
        }
      }));
    }

    private _createAccessory(accessoryInstance: AccessoryPlugin, displayName: string, accessoryType: AccessoryName | AccessoryIdentifier, uuidBase?: string): Accessory {
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

            // pull out any values you may have defined
            existingService.replaceCharacteristicsFromService(service);
          } else {
            accessory.addService(service);
          }
        });

        return accessory;
      }
    }

    private _handleRegisterPlatformAccessories(accessories: PlatformAccessory[]): void {
      const hapAccessories = accessories.map(accessory => {
        this._cachedPlatformAccessories.push(accessory);
        return accessory._associatedHAPAccessory;
      });

      this._bridge.addBridgedAccessories(hapAccessories);
      this._updateCachedAccessories();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _handleUpdatePlatformAccessories(accessories: PlatformAccessory[]): void {
      // Update persisted accessories
      this._updateCachedAccessories();
    }

    private _handleUnregisterPlatformAccessories(accessories: PlatformAccessory[]): void {
      const hapAccessories = accessories.map(accessory => {
        const index = this._cachedPlatformAccessories.indexOf(accessory);
        if (index >= 0) {
          this._cachedPlatformAccessories.splice(index, 1);
        }

        return accessory._associatedHAPAccessory;
      });

      this._bridge.removeBridgedAccessories(hapAccessories);
      this._updateCachedAccessories();
    }

    private _handlePublishExternalAccessories(accessories: PlatformAccessory[]): void {
      const accessoryPin = this._config.bridge.pin;

      accessories.forEach(accessory => {
        let accessoryPort = 0;

        if (this._externalPorts) {
          if (this._nextExternalPort === undefined) {
            this._nextExternalPort = this._externalPorts.start;
          }

          if (this._nextExternalPort <= this._externalPorts.end) {
            accessoryPort = this._nextExternalPort++;
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

        hapAccessory.on(AccessoryEventTypes.LISTENING, (port: number) => {
          log.info("%s is running on port %s.", hapAccessory.displayName, port);
          log.info("Please add [%s] manually in Home app. Setup Code: %s", hapAccessory.displayName, accessoryPin);
        });

        hapAccessory.publish({
          username: advertiseAddress,
          pincode: accessoryPin,
          category: accessory.category,
          port: accessoryPort,
          mdns: this._config.mdns,
        }, this._allowInsecureAccess);
      });
    }

    private _updateCachedAccessories(): void {
      const serializedAccessories = this._cachedPlatformAccessories.map(accessory => PlatformAccessory.serialize(accessory));
      accessoryStorage.setItemSync("cachedAccessories", serializedAccessories);
    }

    _teardown(): void {
      this._updateCachedAccessories();

      this._bridge.unpublish();
      for (const accessory of this.publishedExternalAccessories.values()) {
        accessory._associatedHAPAccessory.unpublish();
      }

      this.api.signalShutdown();
    }

    private _handleNewConfig(type: PluginType, name: PlatformName | PlatformIdentifier, replace: boolean, config: AccessoryConfig | PlatformConfig): void {
      if (type === PluginType.ACCESSORY) {
        // TODO: Load new accessory
        const accessoryConfig = config as AccessoryConfig;

        if (!replace) {
          this._config.accessories.push(accessoryConfig);
        } else {
          let targetName;
          if (name.indexOf(".") !== -1) {
            targetName = name.split(".")[1];
          }

          let found = false;
          for (const index in this._config.accessories) {
            const existingConfig = this._config.accessories[index];

            if (existingConfig.accessory === name) {
              this._config.accessories[index] = accessoryConfig;
              found = true;
              break;
            }

            if (targetName && (existingConfig.accessory === targetName)) {
              this._config.accessories[index] = accessoryConfig;
              found = true;
              break;
            }
          }

          if (!found) {
            this._config.accessories.push(accessoryConfig);
          }
        }
      } else if (type === PluginType.PLATFORM) {
        const platformConfig = config as PlatformConfig;

        if (!replace) {
          this._config.platforms.push(platformConfig);
        } else {
          let targetName;
          if (name.indexOf(".") !== -1) {
            targetName = name.split(".")[1];
          }

          let found = false;
          for (const index in this._config.platforms) {
            const existingConfig = this._config.platforms[index];

            if (existingConfig.platform === name) {
              this._config.platforms[index] = platformConfig;
              found = true;
              break;
            }

            if (targetName && (existingConfig.platform === targetName)) {
              this._config.platforms[index] = platformConfig;
              found = true;
              break;
            }
          }

          if (!found) {
            this._config.platforms.push(platformConfig);
          }
        }
      }

      const serializedConfig = JSON.stringify(this._config, null, "  ");
      const configPath = User.configPath();
      fs.writeFileSync(configPath, serializedConfig, "utf8");
    }

    private _printSetupInfo(pin: string): void {
      console.log("Setup Payload:");
      console.log(this._bridge.setupURI());

      if(!this._hideQRCode) {
        console.log("Scan this code with your HomeKit app on your iOS device to pair with Homebridge:");
        qrcode.setErrorLevel("M"); // HAP specifies level M or higher for ECC
        qrcode.generate(this._bridge.setupURI());
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
