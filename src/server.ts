import fs from "fs";
import chalk from "chalk";
import qrcode from "qrcode-terminal";

import { MacAddress } from "hap-nodejs";
import * as mac from "./util/mac";
import { Logger } from "./logger";
import { User } from "./user";
import { Plugin } from "./plugin";
import { 
  PluginManager, 
  PluginManagerOptions, 
} from "./pluginManager";
import { 
  BridgeService, 
  BridgeConfiguration, 
  HomebridgeConfig, 
  BridgeOptions, 
} from "./bridgeService";
import {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPlugin,
  AccessoryPluginConstructor,
  HomebridgeAPI,
  PlatformIdentifier,
  PlatformName,
  PlatformPlugin,
  PlatformPluginConstructor,
  PluginType,
} from "./api";
import { ChildPluginService } from "./childPluginService";

const log = Logger.internal;

export interface HomebridgeOptions {
  config?: HomebridgeConfig;
  keepOrphanedCachedAccessories?: boolean;
  hideQRCode?: boolean;
  insecureAccess?: boolean;
  customPluginPath?: string;
  noLogTimestamps?: boolean;
  debugModeEnabled?: boolean;
  forceColourLogging?: boolean;
  customStoragePath?: string;
}

export class Server {

  private readonly api: HomebridgeAPI;
  private readonly pluginManager: PluginManager;
  private readonly bridgeService: BridgeService;

  private readonly config: HomebridgeConfig;
  private readonly hideQRCode: boolean;
  
  // used to check for duplicate usernames in child plugins
  private readonly bridgeUsernameCache: MacAddress[] = [];

  constructor(
    private options: HomebridgeOptions = {},
  ) {
    this.config = options.config || Server._loadConfig();
    this.hideQRCode = options.hideQRCode || false;

    // object we feed to Plugins and BridgeService
    this.api = new HomebridgeAPI(); 

    // create new plugin manager
    const pluginManagerOptions: PluginManagerOptions = {
      activePlugins: this.config.plugins,
      disabledPlugins: this.config.disabledPlugins,
      customPluginPath: options.customPluginPath,
    };
    this.pluginManager = new PluginManager(this.api, pluginManagerOptions);

    // add the main bridge username to the username cache for duplicate tracking
    this.bridgeUsernameCache.push(this.config.bridge.username.toUpperCase());

    // create new bridge service
    const bridgeConfig: BridgeOptions = {
      insecureAccess: options.insecureAccess,
      keepOrphanedCachedAccessories: options.keepOrphanedCachedAccessories || false,
      cachedAccessoriesDir: User.cachedAccessoryPath(),
      cachedAccessoriesItemName: "cachedAccessories",
    };

    this.bridgeService = new BridgeService(
      this.api,
      this.pluginManager,
      bridgeConfig,
      this.config.bridge,
      this.config,
    );
  }

  public async start(): Promise<void> {
    const promises: Promise<void>[] = [];

    this.bridgeService.loadCachedPlatformAccessoriesFromDisk();
    this.pluginManager.initializeInstalledPlugins();

    if (this.config.platforms.length > 0) {
      promises.push(...this.loadPlatforms());
    }
    if (this.config.accessories.length > 0) {
      this.loadAccessories();
    }
    this.bridgeService.restoreCachedPlatformAccessories();

    this.api.signalFinished();

    // wait for all platforms to publish their accessories before we publish the bridge
    await Promise.all(promises)
      .then(() => this.publishBridge());
  }

  private publishBridge(): void {
    this.bridgeService.publishBridge();
    this.printSetupInfo(this.config.bridge.pin);
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

  private loadAccessories(): void {
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
      } catch (error) {
        log.error(error.message);
        return;
      }

      // check the plugin is not disabled
      if (plugin.disabled) {
        log.warn(`Ignoring config for the accessory "${accessoryIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`);
        return;
      }

      try {
        constructor = plugin.getAccessoryConstructor(accessoryIdentifier);
      } catch (error) {
        log.error(`Error loading the accessory "${accessoryIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`);
        log.error(error); // error message contains more information and full stack trace
        return;
      }

      const logger = Logger.withPrefix(displayName);
      logger("Initializing %s accessory...", accessoryIdentifier);

      if (accessoryConfig._bridge) {
        try {
          this.validateExternalBridgeConfig(PluginType.PLATFORM, accessoryIdentifier, accessoryConfig._bridge);
          this.bridgeUsernameCache.push(accessoryConfig._bridge.username.toUpperCase());
        } catch (error) {
          log.error(error.message);
          return;
        }

        return new ChildPluginService(
          PluginType.ACCESSORY,
          accessoryIdentifier,
          plugin,
          accessoryConfig,
          accessoryConfig._bridge,
          this.config,
          this.options,
          this.api,
        );
      }

      const accessoryInstance: AccessoryPlugin = new constructor(logger, accessoryConfig, this.api);

      //pass accessoryIdentifier for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
      const accessory = this.bridgeService.createHAPAccessory(plugin, accessoryInstance, displayName, accessoryIdentifier, accessoryConfig.uuid_base);

      if (accessory) {
        try {
          this.bridgeService.bridge.addBridgedAccessory(accessory);
        } catch (e) {
          logger.error(`Error loading the accessory "${accessoryIdentifier}" from "${plugin.getPluginIdentifier()}" requested in your config.json:`, e.message);
        }
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
      } catch (error) {
        log.error(error.message);
        return;
      }

      // check the plugin is not disabled
      if (plugin.disabled) {
        log.warn(`Ignoring config for the platform "${platformIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`);
        return;
      }

      try {
        constructor = plugin.getPlatformConstructor(platformIdentifier);
      } catch (error) {
        log.error(`Error loading the platform "${platformIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`);
        log.error(error); // error message contains more information and full stack trace
        return;
      }

      const logger = Logger.withPrefix(displayName);
      logger("Initializing %s platform...", platformIdentifier);

      if (platformConfig._bridge) {
        try {
          this.validateExternalBridgeConfig(PluginType.PLATFORM, platformIdentifier, platformConfig._bridge);
          this.bridgeUsernameCache.push(platformConfig._bridge.username.toUpperCase());
        } catch (error) {
          log.error(error.message);
          return;
        }

        return new ChildPluginService(
          PluginType.PLATFORM,
          platformIdentifier,
          plugin, 
          platformConfig,
          platformConfig._bridge,
          this.config,
          this.options,
          this.api,
        );
      }

      const platform: PlatformPlugin = new constructor(logger, platformConfig, this.api);

      if (HomebridgeAPI.isDynamicPlatformPlugin(platform)) {
        plugin.assignDynamicPlatform(platformIdentifier, platform);
      } else if (HomebridgeAPI.isStaticPlatformPlugin(platform)) { // Plugin 1.0, load accessories
        promises.push(this.bridgeService.loadPlatformAccessories(plugin, platform, platformIdentifier, logger));
      } else {
        // otherwise it's a IndependentPlatformPlugin which doesn't expose any methods at all.
        // We just call the constructor and let it be enabled.
      }
    });

    return promises;
  }

  /**
   * Validate an external bridge config
   */
  private validateExternalBridgeConfig(type: PluginType, identifier: string, bridgeConfig: BridgeConfiguration): void {
    if (!mac.validMacAddress(bridgeConfig.username)) {
      throw new Error(
        `Error loading the ${type} "${identifier}" requested in your config.json - ` +
        `not a valid username in _bridge.username: "${bridgeConfig.username}". Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address.`,
      );
    }

    if (this.bridgeUsernameCache.includes(bridgeConfig.username.toUpperCase())) {
      throw new Error(
        `Error loading the ${identifier} "${identifier}" requested in your config.json - ` +
        `Duplicate username found in _bridge.username: "${bridgeConfig.username}". Each external platform/accessory must have it's own unique username.`,
      );
    }
  }

  teardown(): void {
    this.bridgeService.teardown();
  }

  private printSetupInfo(pin: string): void {
    console.log("Setup Payload:");
    console.log(this.bridgeService.bridge.setupURI());

    if(!this.hideQRCode) {
      console.log("Scan this code with your HomeKit app on your iOS device to pair with Homebridge:");
      qrcode.setErrorLevel("M"); // HAP specifies level M or higher for ECC
      qrcode.generate(this.bridgeService.bridge.setupURI());
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
