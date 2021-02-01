import * as mac from "./util/mac";
import getVersion from "./version";
import { PluginManager } from "./pluginManager";
import { StorageService } from "./storageService";
import { Logger, Logging } from "./logger";
import { Plugin } from "./plugin";
import { 
  PlatformAccessory, 
  SerializedPlatformAccessory, 
} from "./platformAccessory";
import {
  Accessory,
  AccessoryEventTypes,
  AccessoryLoader,
  Bridge,
  Categories,
  Characteristic,
  CharacteristicEventTypes,
  CharacteristicWarningType,
  InterfaceName,
  IPAddress,
  MacAddress,
  once,
  PublishInfo,
  Service,
  uuid,
  VoidCallback, 
} from "hap-nodejs";
import {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPlugin,
  HomebridgeAPI,
  InternalAPIEvent,
  PlatformIdentifier,
  PlatformName,
  PluginIdentifier,
  StaticPlatformPlugin,
} from "./api";
import { HomebridgeOptions } from "./server";

const log = Logger.internal;

export interface ExternalPortsConfiguration {
  start: number;
  end: number;
}

export interface BridgeConfiguration {
  name: string;
  username: MacAddress;
  pin: string; // format like "000-00-000"
  port?: number;
  bind?: (InterfaceName | IPAddress) | (InterfaceName | IPAddress)[];
  setupID?: string[4];
  manufacturer?: string;
  model?: string;
  disableIpc?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AccessoryConfig extends Record<string, any> {
  accessory: AccessoryName | AccessoryIdentifier;
  name: string;
  uuid_base?: string;
  _bridge?: BridgeConfiguration,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PlatformConfig extends Record<string, any> {
  platform: PlatformName | PlatformIdentifier;
  name?: string;
  _bridge?: BridgeConfiguration,
}

export interface HomebridgeConfig {
  bridge: BridgeConfiguration;

  /**
   * @deprecated
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mdns?: any; // this is deprecated and not used anymore

  accessories: AccessoryConfig[];
  platforms: PlatformConfig[];

  plugins?: PluginIdentifier[]; // array to define set of active plugins

  /**
   * Array of disabled plugins.
   * Unlike the plugins[] config which prevents plugins from being initialised at all, disabled plugins still have their alias loaded so
   * we can match config blocks of disabled plugins and show an appropriate message in the logs.
   */
  disabledPlugins?: PluginIdentifier[];

  // This section is used to control the range of ports (inclusive) that separate accessory (like camera or television) should be bind to
  ports?: ExternalPortsConfiguration;
}

export interface BridgeOptions extends HomebridgeOptions {
  cachedAccessoriesDir: string;
  cachedAccessoriesItemName: string;
}

export class BridgeService {
  public bridge: Bridge;
  private storageService: StorageService;

  private readonly allowInsecureAccess: boolean;

  private readonly externalPorts?: ExternalPortsConfiguration;
  private nextExternalPort?: number;

  private cachedPlatformAccessories: PlatformAccessory[] = [];
  private cachedAccessoriesFileCreated = false;
  private readonly publishedExternalAccessories: Map<MacAddress, PlatformAccessory> = new Map();

  constructor(
    private api: HomebridgeAPI,
    private pluginManager: PluginManager,
    private bridgeOptions: BridgeOptions,
    private bridgeConfig: BridgeConfiguration,
    private config: HomebridgeConfig,
  ) {
    this.storageService = new StorageService(this.bridgeOptions.cachedAccessoriesDir);
    this.storageService.initSync();

    this.externalPorts = this.config?.ports;

    // Server is "secure by default", meaning it creates a top-level Bridge accessory that
    // will not allow unauthenticated requests. This matches the behavior of actual HomeKit
    // accessories. However you can set this to true to allow all requests without authentication,
    // which can be useful for easy hacking. Note that this will expose all functions of your
    // bridged accessories, like changing characteristics (i.e. flipping your lights on and off).
    this.allowInsecureAccess = this.bridgeOptions.insecureAccess || false;

    this.api.on(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, this.handleRegisterPlatformAccessories.bind(this));
    this.api.on(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, this.handleUpdatePlatformAccessories.bind(this));
    this.api.on(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, this.handleUnregisterPlatformAccessories.bind(this));
    this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, this.handlePublishExternalAccessories.bind(this));

    this.bridge = new Bridge(bridgeConfig.name, uuid.generate("HomeBridge"));
    this.bridge.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, () => {
      // We register characteristic warning handlers on every bridged accessory (to have a reference to the plugin).
      // For Bridges the warnings will propagate to the main Bridge accessory, thus we need to silence them here.
      // Other wise those would be printed twice (by us and HAP-NodeJS as it detects no handlers on the bridge).
    });
  }

  // characteristic warning event has additional parameter originatorChain: string[] which is currently unused
  public static printCharacteristicWriteWarning(plugin: Plugin, accessory: Accessory, characteristic: Characteristic, type: CharacteristicWarningType, message: string): void {
    switch (type) {
      case CharacteristicWarningType.SLOW_READ:
      case CharacteristicWarningType.SLOW_WRITE:
        log.warn("The plugin '" + plugin.getPluginIdentifier() + "' slows down requests made to homebridge! " + message);
        break;
      case CharacteristicWarningType.TIMEOUT_READ:
      case CharacteristicWarningType.TIMEOUT_WRITE:
        log.error("The plugin '" + plugin.getPluginIdentifier() + "' slows down requests made to homebridge! " + message);
        break;
      case CharacteristicWarningType.WARN_MESSAGE:
        log.info("Received warning for the plugin '" + plugin.getPluginIdentifier() + "' from the characteristic '" + characteristic.displayName + "': " + message);
        break;
      case CharacteristicWarningType.ERROR_MESSAGE:
        log.error("Received error for the plugin '" + plugin.getPluginIdentifier() + "' from the characteristic '" + characteristic.displayName + "': " + message);
        break;
      default: // generic message for yet unknown types
        log.info("Received warning '" + type + " for the plugin '" + plugin.getPluginIdentifier() + "' from the characteristic '" + characteristic.displayName + "': " + message);
        break;
    }
  }

  public publishBridge(): void {
    const bridgeConfig = this.bridgeConfig;

    const info = this.bridge.getService(Service.AccessoryInformation)!;
    info.setCharacteristic(Characteristic.Manufacturer, bridgeConfig.manufacturer || "homebridge.io");
    info.setCharacteristic(Characteristic.Model, bridgeConfig.model || "homebridge");
    info.setCharacteristic(Characteristic.SerialNumber, bridgeConfig.username);
    info.setCharacteristic(Characteristic.FirmwareRevision, getVersion());

    this.bridge.on(AccessoryEventTypes.LISTENING, (port: number) => {
      log.info("Homebridge v%s is running on port %s.", getVersion(), port);
    });

    // noinspection JSDeprecatedSymbols
    const publishInfo: PublishInfo = {
      username: bridgeConfig.username,
      port: bridgeConfig.port,
      pincode: bridgeConfig.pin,
      category: Categories.BRIDGE,
      bind: bridgeConfig.bind,
      mdns: this.config.mdns, // this is deprecated now
      addIdentifyingMaterial: true,
      useLegacyAdvertiser: this.config.mdns?.legacyAdvertiser ?? true,
    };

    if (bridgeConfig.setupID && bridgeConfig.setupID.length === 4) {
      publishInfo.setupID = bridgeConfig.setupID;
    }

    this.bridge.publish(publishInfo, this.allowInsecureAccess);
  }

  /**
   * Attempt to load the cached accessories from disk.
   */
  public async loadCachedPlatformAccessoriesFromDisk(): Promise<void> {
    try {
      const cachedAccessories = await this.storageService.getItem<SerializedPlatformAccessory[]>(this.bridgeOptions.cachedAccessoriesItemName);

      if (cachedAccessories) {
        this.cachedPlatformAccessories = cachedAccessories.map(serialized => {
          return PlatformAccessory.deserialize(serialized);
        });
        this.cachedAccessoriesFileCreated = true;
      }
    } catch (e) {
      log.error("Failed to load cached accessories from disk:", e.message);
      log.error("Not restoring cached accessories - some accessories may be reset.");
    }
  }

  public restoreCachedPlatformAccessories(): void {
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

            accessory._associatedPlugin = plugin.getPluginIdentifier(); // update the associated plugin to the new one

            accessory._associatedHAPAccessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, accessory._associatedHAPAccessory));
          }
        } catch (error) { // error is thrown if multiple plugins where found for the given platform name
          log.info("Could not find the associated plugin for the accessory '" + accessory.displayName + "'. " +
            "Tried to find the plugin by the platform name but " + error.message);
        }
      }

      const platformPlugins = plugin && plugin.getActiveDynamicPlatform(accessory._associatedPlatform!);

      if (!platformPlugins) {
        log.info(`Failed to find plugin to handle accessory ${accessory._associatedHAPAccessory.displayName}`);
        if (!this.bridgeOptions.keepOrphanedCachedAccessories) {
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

  /**
   * Save the cached accessories back to disk.
   */
  public saveCachedPlatformAccessoriesOnDisk(): void {
    try {
      if (this.cachedPlatformAccessories.length > 0) {
        this.cachedAccessoriesFileCreated = true;

        const serializedAccessories = this.cachedPlatformAccessories.map(accessory => PlatformAccessory.serialize(accessory));
        this.storageService.setItemSync(this.bridgeOptions.cachedAccessoriesItemName, serializedAccessories);
      } else if (this.cachedAccessoriesFileCreated) {
        this.cachedAccessoriesFileCreated = false;
        this.storageService.removeItemSync(this.bridgeOptions.cachedAccessoriesItemName);
      }
    } catch (e) {
      log.error("Failed to save cached accessories to disk:", e.message);
      log.error("Your accessories will not persist between restarts until this issue is resolved.");
    }
  }

  handleRegisterPlatformAccessories(accessories: PlatformAccessory[]): void {
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

        accessory._associatedHAPAccessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, accessory._associatedHAPAccessory));
      } else {
        log.warn("A platform configured a new accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
      }

      return accessory._associatedHAPAccessory;
    });

    this.bridge.addBridgedAccessories(hapAccessories);
    this.saveCachedPlatformAccessoriesOnDisk();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleUpdatePlatformAccessories(accessories: PlatformAccessory[]): void {
    // Update persisted accessories
    this.saveCachedPlatformAccessoriesOnDisk();
  }

  handleUnregisterPlatformAccessories(accessories: PlatformAccessory[]): void {
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
  
  handlePublishExternalAccessories(accessories: PlatformAccessory[]): void {
    const accessoryPin = this.bridgeConfig.pin;

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

        hapAccessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, hapAccessory));
      } else if (PluginManager.isQualifiedPluginIdentifier(accessory._associatedPlugin!)) { // we did already complain in api.ts if it wasn't a qualified name
        log.warn("A platform configured a external accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
      }

      hapAccessory.on(AccessoryEventTypes.LISTENING, (port: number) => {
        log.info("%s is running on port %s.", hapAccessory.displayName, port);
        log.info("Please add [%s] manually in Home app. Setup Code: %s", hapAccessory.displayName, accessoryPin);
      });

      // noinspection JSDeprecatedSymbols
      hapAccessory.publish({
        username: advertiseAddress,
        pincode: accessoryPin,
        category: accessory.category,
        port: accessoryPort,
        bind: this.bridgeConfig.bind,
        mdns: this.config.mdns, // this is deprecated and not used anymore
        addIdentifyingMaterial: true,
        useLegacyAdvertiser: this.config.mdns?.legacyAdvertiser ?? true,
      }, this.allowInsecureAccess);
    });
  }

  public createHAPAccessory(plugin: Plugin, accessoryInstance: AccessoryPlugin, displayName: string, accessoryType: AccessoryName | AccessoryIdentifier, uuidBase?: string): Accessory | undefined {
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
        accessory.on(AccessoryEventTypes.IDENTIFY, (paired: boolean, callback: VoidCallback) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          accessoryInstance.identify!(() => { }); // empty callback for backwards compatibility
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

      accessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, accessory));

      controllers.forEach(controller => {
        accessory.configureController(controller);
      });

      return accessory;
    }
  }

  public async loadPlatformAccessories(plugin: Plugin, platformInstance: StaticPlatformPlugin, platformType: PlatformName | PlatformIdentifier, logger: Logging): Promise<void> {
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

  teardown(): void {
    this.bridge.unpublish();
    for (const accessory of this.publishedExternalAccessories.values()) {
      accessory._associatedHAPAccessory.unpublish();
    }

    this.saveCachedPlatformAccessoriesOnDisk();

    this.api.signalShutdown();
  }


}