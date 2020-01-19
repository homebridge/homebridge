import * as path from 'path';
import * as  fs from 'fs';
import {uuid} from "hap-nodejs";
import * as accessoryStorage from 'node-persist';
import {AccessoryLoader, Bridge, once} from 'hap-nodejs';
import {Accessory, Service, Characteristic} from "hap-nodejs";
import {Plugin} from './plugin';
import {User} from './user';
import {API} from './api';
import {PlatformAccessory} from "./platformAccessory";
import {BridgeSetupManager} from "./bridgeSetupManager";
import {_system as log} from "./logger";
import {withPrefix as LoggerWithPrefix} from './logger';
import {generate as MacGenerate} from "./util/mac";
import * as chalk from 'chalk';
import * as qrcode from 'qrcode-terminal';

export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export class Server {

  private _api: any;
  private _config: any;
  protected _plugins = {};
  private _cachedPlatformAccessories: any;
  private _bridge: any;
  private _cleanCachedAccessories: boolean;
  protected _hideQRCode: boolean;
  private _externalPorts: any;
  private _nextExternalPort: number;

  private _activeDynamicPlugins = {};
  private _configurablePlatformPlugins = {};
  private _publishedAccessories = {};
  private _setupManager: any;

  private _asyncCalls = 0;
  protected _asyncWait = true;

  // Server is "secure by default", meaning it creates a top-level Bridge accessory that
  // will not allow unauthenticated requests. This matches the behavior of actual HomeKit
  // accessories. However you can set this to true to allow all requests without authentication,
  // which can be useful for easy hacking. Note that this will expose all functions of your
  // bridged accessories, like changing charactersitics (i.e. flipping your lights on and off).
  private _allowInsecureAccess: boolean;


  constructor(opts) {
    opts = opts || {};
  
    // Setup Accessory Cache Storage
    accessoryStorage.initSync({ dir: User.cachedAccessoryPath() });
  
    this._api = new API(); // object we feed to Plugins
  
    this._api.on('registerPlatformAccessories', function(accessories) {
      this._handleRegisterPlatformAccessories(accessories);
    }.bind(this));
  
    this._api.on('updatePlatformAccessories', function(accessories) {
      this._handleUpdatePlatformAccessories(accessories);
    }.bind(this));
  
    this._api.on('unregisterPlatformAccessories', function(accessories) {
      this._handleUnregisterPlatformAccessories(accessories);
    }.bind(this));
  
    this._api.on('publishExternalAccessories', function(accessories) {
      this._handlePublishExternalAccessories(accessories);
    }.bind(this));
  
    this._config = opts.config || this._loadConfig();
    this._plugins = this._loadPlugins(); // plugins[name] = Plugin instance
    this._cachedPlatformAccessories = this._loadCachedPlatformAccessories();
    this._bridge = this._createBridge();
    this._cleanCachedAccessories = opts.cleanCachedAccessories || false;
    this._hideQRCode = opts.hideQRCode || false;
  
    this._externalPorts = this._config.ports;
    this._nextExternalPort = undefined;
  
    this._activeDynamicPlugins = {};
    this._configurablePlatformPlugins = {};
    this._publishedAccessories = {};
    this._setupManager = new BridgeSetupManager();
    this._setupManager.on('newConfig', this._handleNewConfig.bind(this));
  
    this._setupManager.on('requestCurrentConfig', function(callback) {
      callback(this._config);
    }.bind(this));
  
    // Server is "secure by default", meaning it creates a top-level Bridge accessory that
    // will not allow unauthenticated requests. This matches the behavior of actual HomeKit
    // accessories. However you can set this to true to allow all requests without authentication,
    // which can be useful for easy hacking. Note that this will expose all functions of your
    // bridged accessories, like changing charactersitics (i.e. flipping your lights on and off).
    this._allowInsecureAccess = opts.insecureAccess || false;
  }
  
  run() {
  
    // keep track of async calls we're waiting for callbacks on before we can start up
    this._asyncCalls = 0;
    this._asyncWait = true;
  
    if (this._config.platforms) this._loadPlatforms();
    if (this._config.accessories) this._loadAccessories();
    this._loadDynamicPlatforms();
    this._configCachedPlatformAccessories();
    this._setupManager.configurablePlatformPlugins = this._configurablePlatformPlugins;
    this._bridge.addService(this._setupManager.service);
  
    this._asyncWait = false;
  
    // publish now unless we're waiting on anyone
    if (this._asyncCalls == 0)
      this._publish();
  
    this._api.emit('didFinishLaunching');
  }
  
  private _publish() {
    // pull out our custom Bridge settings from config.json, if any
    const bridgeConfig = this._config.bridge || {};
  
    const packageJSONPath = path.join(__dirname, '../package.json');
    const packageJSON = (fs.existsSync(packageJSONPath)) ? JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8')) : { version: '', name: '', author: { name: ''} };
  
    const info = this._bridge.getService(Service.AccessoryInformation);
    info.setCharacteristic(Characteristic.Manufacturer, `${toTitleCase(packageJSON.author.name)}`);
    info.setCharacteristic(Characteristic.Model, `${toTitleCase(packageJSON.name)}`);
    info.setCharacteristic(Characteristic.SerialNumber, bridgeConfig.username);
    info.setCharacteristic(Characteristic.FirmwareRevision, packageJSON.version);
  
    this._bridge.on('listening', function(port) {
      log.info("Homebridge is running on port %s.", port);
    });
  
    const publishInfo = {
      username: bridgeConfig.username || "CC:22:3D:E3:CE:30",
      port: bridgeConfig.port || 0,
      pincode: bridgeConfig.pin || "031-45-154",
      category: Accessory.Categories.BRIDGE,
      mdns: this._config.mdns
    };
  
    if (bridgeConfig.setupID && bridgeConfig.setupID.length === 4) {
      publishInfo['setupID'] = bridgeConfig.setupID;
    }
  
    this._bridge.publish(publishInfo, this._allowInsecureAccess);
  
    this._printSetupInfo();
    this._printPin(publishInfo.pincode);
  }
  
  private _loadPlugins(accessories = null, platforms = null) {
  
    const plugins = {};
    let foundOnePlugin = false;
    const activePlugins = this._computeActivePluginList();
  
    // load and validate plugins - check for valid package.json, etc.
    Plugin.installed().forEach(function(plugin) {
  
      if (activePlugins !== undefined && activePlugins[plugin.name()] !== true) {
        return;
      }
  
      // attempt to load it
      try {
        plugin.load();
      }
      catch (err) {
        log.error("====================")
        log.error("ERROR LOADING PLUGIN " + plugin.name() + ":")
        log.error(err.stack);
        log.error("====================")
        plugin.loadError = err;
      }
  
      if (!plugin.loadError) {
  
        // add it to our dict for easy lookup later
        plugins[plugin.name()] = plugin;
  
        log.info("Loaded plugin: " + plugin.name());
  
        // call the plugin's initializer and pass it our API instance
        plugin.initializer(this._api);
  
        log.info("---");
        foundOnePlugin = true;
      }
  
    }.bind(this));
  
    // Complain if you don't have any plugins.
    if (!foundOnePlugin) {
      log.warn("No plugins found. See the README for information on installing plugins.")
    }
  
    return plugins;
  }
  
  private _loadConfig() {
  
    // Look for the configuration file
    const configPath = User.configPath();
  
    // Complain and exit if it doesn't exist yet
    if (!fs.existsSync(configPath)) {
      log.warn("config.json (%s) not found.", configPath);
  
      let config: any = {};
  
      config.bridge = {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:30",
        "pin": "031-45-154"
      };
  
      return config;
        // log.error("Couldn't find a config.json file at '"+configPath+"'. Look at config-sample.json for examples of how to format your config.js and add your home accessories.");
        // process.exit(1);
    }
  
    // Load up the configuration file
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    catch (err) {
      log.error("There was a problem reading your config.json file.");
      log.error("Please try pasting your config.json file here to validate it: http://jsonlint.com");
      log.error("");
      throw err;
    }
  
    if (config.ports !== undefined) {
      if (config.ports.start > config.ports.end) {
        log.error("Invalid port pool configuration. End should be greater than or equal to start.");
        config.ports = undefined;
      }
    }
  
    let accessoryCount = (config.accessories && config.accessories.length) || 0;
  
    const username = config.bridge.username;
    const validMac = /^([0-9A-F]{2}:){5}([0-9A-F]{2})$/;
    if (!validMac.test(username)){
        throw new Error('Not a valid username: ' + username + '. Must be 6 pairs of colon-' +
                        'separated hexadecimal chars (A-F 0-9), like a MAC address.');
    }
  
    accessoryCount = (config.accessories && config.accessories.length) || 0;
    const platformCount = (config.platforms && config.platforms.length) || 0;
    log.info("Loaded config.json with %s accessories and %s platforms.", accessoryCount, platformCount);
  
    log.info("---");
  
    return config;
  }
  
  private _loadCachedPlatformAccessories() {
    const cachedAccessories = accessoryStorage.getItem("cachedAccessories");
    const platformAccessories = [];
  
    if (cachedAccessories) {
      for (let index in cachedAccessories) {
        const serializedAccessory = cachedAccessories[index];
        const platformAccessory = new PlatformAccessory(serializedAccessory.displayName, serializedAccessory.UUID, serializedAccessory.category);
        platformAccessory._configFromData(serializedAccessory);
  
        platformAccessories.push(platformAccessory);
      }
    }
  
    return platformAccessories;
  }
  
  private _computeActivePluginList() {
    if (this._config.plugins === undefined) {
      return undefined;
    }
  
    const activePlugins = {};
  
    for (let i=0; i<this._config.plugins.length; i++) {
      const pluginName = this._config.plugins[i];
      activePlugins[pluginName] = true;
    }
  
    return activePlugins;
  }
  
  private _createBridge() {
    // pull out our custom Bridge settings from config.json, if any
    const bridgeConfig = this._config.bridge || {};
  
    // Create our Bridge which will host all loaded Accessories
    return new Bridge(bridgeConfig.name || 'Homebridge', uuid.generate("HomeBridge"));
  }
  
  private _loadAccessories() {
  
    // Instantiate all accessories in the config
    log.info("Loading " + this._config.accessories.length + " accessories...");
  
    for (let i=0; i<this._config.accessories.length; i++) {
  
      const accessoryConfig = this._config.accessories[i];
  
      // Load up the class for this accessory
      const accessoryType = accessoryConfig["accessory"]; // like "Lockitron"
      const accessoryConstructor = this._api.accessory(accessoryType); // like "LockitronAccessory", a JavaScript constructor
  
      if (!accessoryConstructor)
        throw new Error("Your config.json is requesting the accessory '" + accessoryType + "' which has not been published by any installed plugins.");
  
      // Create a custom logging function that prepends the device display name for debugging
      const accessoryName = accessoryConfig["name"];
      const accessoryLogger = LoggerWithPrefix(accessoryName);
  
      accessoryLogger("Initializing %s accessory...", accessoryType);
  
      const accessoryInstance = new accessoryConstructor(accessoryLogger, accessoryConfig);
      const accessory = this._createAccessory(accessoryInstance, accessoryName, accessoryType, accessoryConfig.uuid_base);  //pass accessoryType for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
  
      // add it to the bridge
      this._bridge.addBridgedAccessory(accessory);
    }
  }
  
  private _loadPlatforms() {
  
      log.info("Loading " + this._config.platforms.length + " platforms...");
  
      for (let i=0; i<this._config.platforms.length; i++) {
  
          const platformConfig = this._config.platforms[i];
  
          // Load up the class for this accessory
          const platformType = platformConfig["platform"]; // like "Wink"
          const platformName = platformConfig["name"] || platformType;
          const platformConstructor = this._api.platform(platformType); // like "WinkPlatform", a JavaScript constructor
  
          if (!platformConstructor)
            throw new Error("Your config.json is requesting the platform '" + platformType + "' which has not been published by any installed plugins.");
  
          // Create a custom logging function that prepends the platform name for debugging
          const platformLogger = LoggerWithPrefix(platformName);
  
          platformLogger("Initializing %s platform...", platformType);
  
          const platformInstance = new platformConstructor(platformLogger, platformConfig, this._api);
  
          if (platformInstance.configureAccessory == undefined) {
            // Plugin 1.0, load accessories
            this._loadPlatformAccessories(platformInstance, platformLogger, platformType);
          } else {
            this._activeDynamicPlugins[platformType] = platformInstance;
          }
  
          if (platformInstance.configurationRequestHandler != undefined) {
            this._configurablePlatformPlugins[platformType] = platformInstance;
          }
      }
  }
  
  private _loadDynamicPlatforms() {
    for (const dynamicPluginName in this._api._dynamicPlatforms) {
      if (!this._activeDynamicPlugins[dynamicPluginName] && !this._activeDynamicPlugins[dynamicPluginName.split(".")[1]]) {
        console.log("Load " + dynamicPluginName);
        const platformConstructor = this._api._dynamicPlatforms[dynamicPluginName];
        const platformLogger = LoggerWithPrefix(dynamicPluginName);
        const platformInstance = new platformConstructor(platformLogger, null, this._api);
        this._activeDynamicPlugins[dynamicPluginName] = platformInstance;
  
        if (platformInstance.configurationRequestHandler != undefined) {
            this._configurablePlatformPlugins[dynamicPluginName] = platformInstance;
        }
      }
    }
  }
  
  private _configCachedPlatformAccessories() {
    const verifiedAccessories = [];
    for (const index in this._cachedPlatformAccessories) {
      const accessory: any = this._cachedPlatformAccessories[index];
  
      if (!(accessory instanceof PlatformAccessory)) {
        console.log("Unexpected Accessory!");
        continue;
      }
  
      const fullName = accessory._associatedPlugin + "." + accessory._associatedPlatform;
      let platformInstance = this._activeDynamicPlugins[fullName];
  
      if (!platformInstance) {
        platformInstance = this._activeDynamicPlugins[accessory._associatedPlatform];
      }
  
      if (platformInstance) {
        platformInstance.configureAccessory(accessory);
      } else {
        console.log("Failed to find plugin to handle accessory " + accessory.displayName);
        if (this._cleanCachedAccessories) {
          console.log("Removing orphaned accessory " + accessory.displayName);
          continue;
        }
      }
      verifiedAccessories.push(accessory);
      accessory._prepareAssociatedHAPAccessory();
      this._bridge.addBridgedAccessory(accessory._associatedHAPAccessory);
    }
    this._cachedPlatformAccessories = verifiedAccessories;
  }
  
  private _loadPlatformAccessories(platformInstance, log, platformType) {
    this._asyncCalls++;
    platformInstance.accessories(once(function(foundAccessories){
        this._asyncCalls--;
  
        // loop through accessories adding them to the list and registering them
        for (let i = 0; i < foundAccessories.length; i++) {
            const accessoryInstance = foundAccessories[i];
            const accessoryName = accessoryInstance.name; // assume this property was set
  
            log("Initializing platform accessory '%s'...", accessoryName);
  
            const accessory = this._createAccessory(accessoryInstance, accessoryName, platformType, accessoryInstance.uuid_base);
  
            // add it to the bridge
            this._bridge.addBridgedAccessory(accessory);
        }
  
        // were we the last callback?
        if (this._asyncCalls === 0 && !this._asyncWait)
          this._publish();
    }.bind(this)));
  }
  
  private _createAccessory(accessoryInstance, displayName, accessoryType, uuid_base) {
  
    const services = accessoryInstance.getServices();
  
    if (!(services[0] instanceof Service)) {
      // The returned "services" for this accessory is assumed to be the old style: a big array
      // of JSON-style objects that will need to be parsed by HAP-NodeJS's AccessoryLoader.
  
      // Create the actual HAP-NodeJS "Accessory" instance
      return AccessoryLoader.parseAccessoryJSON({
        displayName: displayName,
        services: services
      });
    }
    else {
      // The returned "services" for this accessory are simply an array of new-API-style
      // Service instances which we can add to a created HAP-NodeJS Accessory directly.
  
      const accessoryUUID = uuid.generate(accessoryType + ":" + (uuid_base || displayName));
  
      const accessory = new Accessory(displayName, accessoryUUID);
  
      // listen for the identify event if the accessory instance has defined an identify() method
      if (accessoryInstance.identify)
        accessory.on('identify', function(paired, callback) { accessoryInstance.identify(callback); });
  
      services.forEach(function(service) {
  
        // if you returned an AccessoryInformation service, merge its values with ours
        if (service instanceof Service.AccessoryInformation) {
          const existingService = accessory.getService(Service.AccessoryInformation);
  
          // pull out any values you may have defined
          const manufacturer = service.getCharacteristic(Characteristic.Manufacturer).value;
          const model = service.getCharacteristic(Characteristic.Model).value;
          const serialNumber = service.getCharacteristic(Characteristic.SerialNumber).value;
          const firmwareRevision = service.getCharacteristic(Characteristic.FirmwareRevision).value;
          const hardwareRevision = service.getCharacteristic(Characteristic.HardwareRevision).value;
  
          if (manufacturer) existingService.setCharacteristic(Characteristic.Manufacturer, manufacturer);
          if (model) existingService.setCharacteristic(Characteristic.Model, model);
          if (serialNumber) existingService.setCharacteristic(Characteristic.SerialNumber, serialNumber);
          if (firmwareRevision) existingService.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
          if (hardwareRevision) existingService.setCharacteristic(Characteristic.HardwareRevision, hardwareRevision);
        }
        else {
          accessory.addService(service);
        }
      });
  
      return accessory;
    }
  }
  
  private _handleRegisterPlatformAccessories(accessories) {
    const hapAccessories = [];
    for (const index in accessories) {
      const accessory = accessories[index];
  
      accessory._prepareAssociatedHAPAccessory();
      hapAccessories.push(accessory._associatedHAPAccessory);
  
      this._cachedPlatformAccessories.push(accessory);
    }
  
    this._bridge.addBridgedAccessories(hapAccessories);
    this._updateCachedAccessories();
  }
  
  private _handleUpdatePlatformAccessories(accessories) {
    // Update persisted accessories
    this._updateCachedAccessories();
  }
  
  private _handleUnregisterPlatformAccessories(accessories) {
    const hapAccessories = [];
    for (const index in accessories) {
      const accessory = accessories[index];
  
      if (accessory._associatedHAPAccessory) {
        hapAccessories.push(accessory._associatedHAPAccessory);
      }
  
      for (const targetIndex in this._cachedPlatformAccessories) {
        const existing = this._cachedPlatformAccessories[targetIndex];
        if (existing.UUID === accessory.UUID) {
          this._cachedPlatformAccessories.splice(targetIndex, 1);
          break;
        }
      }
    }
  
    this._bridge.removeBridgedAccessories(hapAccessories);
    this._updateCachedAccessories();
  }
  
  private _handlePublishExternalAccessories(accessories) {
    const accessoryPin = (this._config.bridge || {}).pin || "031-45-154";
  
    for (const index in accessories) {
      const accessory = accessories[index];
      let accessoryPort = 0;
  
      if (this._externalPorts) {
        const minPortNumber = this._externalPorts.start;
  
        if (this._nextExternalPort > this._externalPorts.end) {
          log.info("External port pool ran out of ports. Fallback to random assign.");
          accessoryPort = 0;
        } else {
          if (this._nextExternalPort !== undefined) {
            accessoryPort = this._nextExternalPort;
            this._nextExternalPort += 1;
          } else {
            accessoryPort = minPortNumber;
            this._nextExternalPort = minPortNumber + 1;
          }
        }
      }
  
      accessory._prepareAssociatedHAPAccessory();
      const hapAccessory = accessory._associatedHAPAccessory;
      const advertiseAddress = MacGenerate(accessory.UUID);
  
      if (this._publishedAccessories[advertiseAddress]) {
        throw new Error("Accessory " + accessory.displayName + " experienced an address collision.");
      } else {
        this._publishedAccessories[advertiseAddress] = accessory;
      }
  
      (function(name){
        hapAccessory.on('listening', function(port) {
  
            log.info("%s is running on port %s.", name, port);
            log.info("Please add [%s] manually in Home app. Setup Code: %s", name, accessoryPin);
        })
      })(accessory.displayName);
  
      hapAccessory.publish({
        username: advertiseAddress,
        pincode: accessoryPin,
        category: accessory.category,
        port: accessoryPort,
        mdns: this._config.mdns
      }, this._allowInsecureAccess);
    }
  }
  
  private _updateCachedAccessories() {
    const serializedAccessories = [];
  
    for (const index in this._cachedPlatformAccessories) {
      const accessory = this._cachedPlatformAccessories[index];
      serializedAccessories.push(accessory._dictionaryPresentation());
    }
  
    accessoryStorage.setItemSync("cachedAccessories", serializedAccessories);
  }
  
  private _teardown() {
    const self = this;
    self._updateCachedAccessories();
    self._bridge.unpublish();
    Object.keys(self._publishedAccessories).forEach(function (advertiseAddress) {
      self._publishedAccessories[advertiseAddress]._associatedHAPAccessory.unpublish();
    });
  }
  
  private _handleNewConfig(type, name, replace, config) {
    if (type === "accessory") {
      // TODO: Load new accessory
      if (!this._config.accessories) {
        this._config.accessories = [];
      }
  
      if (!replace) {
        this._config.accessories.push(config);
      } else {
        let targetName;
        if (name.indexOf('.') !== -1) {
          targetName = name.split(".")[1];
        }
        let found = false;
        for (const index in this._config.accessories) {
          const accessoryConfig = this._config.accessories[index];
          if (accessoryConfig.accessory === name) {
            this._config.accessories[index] = config;
            found = true;
            break;
          }
  
          if (targetName && (accessoryConfig.accessory === targetName)) {
            this._config.accessories[index] = config;
            found = true;
            break;
          }
        }
  
        if (!found) {
          this._config.accessories.push(config);
        }
      }
    } else if (type === "platform") {
      if (!this._config.platforms) {
        this._config.platforms = [];
      }
  
      if (!replace) {
        this._config.platforms.push(config);
      } else {
        let targetName;
        if (name.indexOf('.') !== -1) {
          targetName = name.split(".")[1];
        }
  
        let found = false;
        for (const index in this._config.platforms) {
          const platformConfig = this._config.platforms[index];
          if (platformConfig.platform === name) {
            this._config.platforms[index] = config;
            found = true;
            break;
          }
  
          if (targetName && (platformConfig.platform === targetName)) {
            this._config.platforms[index] = config;
            found = true;
            break;
          }
        }
  
        if (!found) {
          this._config.platforms.push(config);
        }
      }
    }
  
    const serializedConfig = JSON.stringify(this._config, null, '  ');
    const configPath = User.configPath();
    fs.writeFileSync(configPath, serializedConfig, 'utf8');
  }
  
  private _printPin = function(pin: string) {
    if(!this._hideQRCode)
      console.log("Or enter this code with your HomeKit app on your iOS device to pair with Homebridge:");
    else
      console.log("Enter this code with your HomeKit app on your iOS device to pair with Homebridge:");
    console.log(chalk.black.bgWhite("                       "));
    console.log(chalk.black.bgWhite("    ┌────────────┐     "));
    console.log(chalk.black.bgWhite("    │ " + pin + " │     "));
    console.log(chalk.black.bgWhite("    └────────────┘     "));
    console.log(chalk.black.bgWhite("                       "));
  }
  
  private _printSetupInfo = function() {
    console.log("Setup Payload:");
    console.log(this._bridge.setupURI());
  
    if(!this._hideQRCode) {
      console.log("Scan this code with your HomeKit app on your iOS device to pair with Homebridge:");
      qrcode.generate(this._bridge.setupURI());
    }
  }

}
