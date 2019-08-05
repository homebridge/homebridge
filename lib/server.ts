import fs from 'fs';

import { uuid } from "hap-nodejs";
import { create } from 'node-persist';

import { Accessory, AccessoryLoader, Bridge, Characteristic, Service, once } from "hap-nodejs";
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';

import {Plugin} from './plugin';
import { Config, ConfigType } from './types';
import {User} from './user';
import {API} from './api';
import { PlatformAccessory } from "./platformAccessory";
import {BridgeSetupManager} from './bridgeSetupManager';
import { _system as log, Logger } from './logger';
import * as mac from "./util/mac";

const accessoryStorage = create();

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt: string) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export interface Options {
    cleanCachedAccessories: boolean;
    config?: Config;
    hideQRCode: boolean;
    insecureAccess: boolean;
}

const defaultOpts: Options = {
    cleanCachedAccessories: false,
    hideQRCode: false,
    insecureAccess: false,
}

export class Server {
    _hideQRCode: any;
    _bridge: any;
    _config: any;
    _publishedAccessories: Record<string, PlatformAccessory> = {};
    _asyncCalls: number = 0;
    _asyncWait: boolean = true;
    _setupManager: BridgeSetupManager = new BridgeSetupManager();
    _configurablePlatformPlugins: Record<string, any> = {};
    _api: API;
    _allowInsecureAccess: boolean;
    _activeDynamicPlugins: Record<string, any> = {};
    _cachedPlatformAccessories: PlatformAccessory[];
    _cleanCachedAccessories: boolean;
    _plugins: Record<string, Plugin>;
    _externalPorts: { start: number, end: number };
    _nextExternalPort?: number = undefined;

    constructor(opts: Options = defaultOpts) {
        // Setup Accessory Cache Storage
        accessoryStorage.initSync({ dir: User.cachedAccessoryPath() });
        this._api = new API(); // object we feed to Plugins
        this._api.on('registerPlatformAccessories', this._handleRegisterPlatformAccessories);
        this._api.on('updatePlatformAccessories', this._handleUpdatePlatformAccessories);
        this._api.on('unregisterPlatformAccessories', this._handleUnregisterPlatformAccessories);
        this._api.on('publishExternalAccessories', this._handlePublishExternalAccessories);

        this._config = opts.config || this._loadConfig();
        this._plugins = this._loadPlugins(); // plugins[name] = Plugin instance
        this._cachedPlatformAccessories = this._loadCachedPlatformAccessories();
        this._bridge = this._createBridge();
        this._cleanCachedAccessories = opts.cleanCachedAccessories || false;
        this._hideQRCode = opts.hideQRCode || false;
        this._externalPorts = this._config.ports;
        this._setupManager = new BridgeSetupManager();
        this._setupManager.on('newConfig', this._handleNewConfig);
        this._setupManager.on('requestCurrentConfig', (callback: (config: Config) => void) => {
            callback(this._config);
        });
        // Server is "secure by default", meaning it creates a top-level Bridge accessory that
        // will not allow unauthenticated requests. This matches the behavior of actual HomeKit
        // accessories. However you can set this to true to allow all requests without authentication,
        // which can be useful for easy hacking. Note that this will expose all functions of your
        // bridged accessories, like changing charactersitics (i.e. flipping your lights on and off).
        this._allowInsecureAccess = opts.insecureAccess || false;
    }

    run = () => {
        if (this._config.platforms) {
            this._loadPlatforms();
        }
        if (this._config.accessories) {
            this._loadAccessories();
        }
        this._loadDynamicPlatforms();
        this._configCachedPlatformAccessories();
        this._setupManager.configurablePlatformPlugins = this._configurablePlatformPlugins;
        this._bridge.addService(this._setupManager.service);
        this._asyncWait = false;
        // publish now unless we're waiting on anyone
        if (this._asyncCalls == 0) {
            this._publish();
        }
        this._api.emit('didFinishLaunching');
    }

    _publish = () => {
        // pull out our custom Bridge settings from config.json, if any
        var bridgeConfig = this._config.bridge || {};
        var info = this._bridge.getService(Service.AccessoryInformation);
        info.setCharacteristic(Characteristic.Manufacturer, `${toTitleCase(require('../package.json').author.name)}`);
        info.setCharacteristic(Characteristic.Model, `${toTitleCase(require('../package.json').name)}`);
        info.setCharacteristic(Characteristic.SerialNumber, bridgeConfig.username);
        info.setCharacteristic(Characteristic.FirmwareRevision, require('../package.json').version);
        this._bridge.on('listening', (port: number) => {
            log.info("Homebridge is running on port %s.", port + '');
        });
        var publishInfo = {
            username: bridgeConfig.username || "CC:22:3D:E3:CE:30",
            port: bridgeConfig.port || 0,
            pincode: bridgeConfig.pin || "031-45-154",
            category: Accessory.Categories.BRIDGE,
            mdns: this._config.mdns,
            setupID: undefined,
        };
        if (bridgeConfig.setupID && bridgeConfig.setupID.length === 4) {
            publishInfo['setupID'] = bridgeConfig.setupID;
        }
        this._bridge.publish(publishInfo, this._allowInsecureAccess);
        this._printSetupInfo();
        this._printPin(publishInfo.pincode);
    }

    _loadPlugins = (accessories?: any[], platforms?: any[]) => {
        const plugins: Record<string, Plugin> = {};
        var foundOnePlugin = false;
        var activePlugins = this._computeActivePluginList();
        // load and validate plugins - check for valid package.json, etc.
        Plugin.installed().forEach((plugin) => {
            if (activePlugins !== undefined && activePlugins[plugin.name()] !== true) {
                return;
            }
            // attempt to load it
            try {
                plugin.load();
            }
            catch (err) {
                log.error("====================");
                log.error("ERROR LOADING PLUGIN " + plugin.name() + ":");
                log.error(err.stack);
                log.error("====================");
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
        });
        // Complain if you don't have any plugins.
        if (!foundOnePlugin) {
            log.warn("No plugins found. See the README for information on installing plugins.");
        }
        return plugins;
    }

    _loadConfig = () => {
        // Look for the configuration file
        var configPath = User.configPath();
        // Complain and exit if it doesn't exist yet
        if (!fs.existsSync(configPath)) {
            log.warn("config.json (%s) not found.", configPath);
            const config: Config = {
                bridge: {
                    "name": "Homebridge",
                    "username": "CC:22:3D:E3:CE:30",
                    "pin": "031-45-154"
                },
            };
            return config;
            // log.error("Couldn't find a config.json file at '"+configPath+"'. Look at config-sample.json for examples of how to format your config.js and add your home accessories.");
            // process.exit(1);
        }
        // Load up the configuration file
        var config;
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
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
        var accessoryCount = (config.accessories && config.accessories.length) || 0;
        var username = config.bridge.username;
        var validMac = /^([0-9A-F]{2}:){5}([0-9A-F]{2})$/;
        if (!validMac.test(username)) {
            throw new Error('Not a valid username: ' + username + '. Must be 6 pairs of colon-' +
                'separated hexadecimal chars (A-F 0-9), like a MAC address.');
        }
        var accessoryCount = (config.accessories && config.accessories.length) || 0;
        var platformCount = (config.platforms && config.platforms.length) || 0;
        log.info("Loaded config.json with %s accessories and %s platforms.", accessoryCount, platformCount);
        log.info("---");
        return config;
    }

    _loadCachedPlatformAccessories = () => {
        var cachedAccessories = accessoryStorage.getItem("cachedAccessories");
        var platformAccessories = [];
        if (cachedAccessories) {
            for (var index in cachedAccessories) {
                var serializedAccessory = cachedAccessories[index];
                var platformAccessory = new PlatformAccessory(serializedAccessory.displayName, serializedAccessory.UUID, serializedAccessory.category);
                platformAccessory._configFromData(serializedAccessory);
                platformAccessories.push(platformAccessory);
            }
        }
        return platformAccessories;
    }

    _computeActivePluginList = () => {
        if (this._config.plugins === undefined) {
            return undefined;
        }
        var activePlugins: Record<string, boolean> = {};
        for (var i = 0; i < this._config.plugins.length; i++) {
            var pluginName = this._config.plugins[i];
            activePlugins[pluginName] = true;
        }
        return activePlugins;
    }

    _createBridge = () => {
        // pull out our custom Bridge settings from config.json, if any
        var bridgeConfig = this._config.bridge || {};
        // Create our Bridge which will host all loaded Accessories
        return new Bridge(bridgeConfig.name || 'Homebridge', uuid.generate("HomeBridge"));
    }

    _loadAccessories = () => {
        // Instantiate all accessories in the config
        log.info("Loading " + this._config.accessories.length + " accessories...");
        for (var i = 0; i < this._config.accessories.length; i++) {
            var accessoryConfig = this._config.accessories[i];
            // Load up the class for this accessory
            var accessoryType = accessoryConfig["accessory"]; // like "Lockitron"
            var accessoryConstructor = this._api.accessory(accessoryType); // like "LockitronAccessory", a JavaScript constructor
            if (!accessoryConstructor)
                throw new Error("Your config.json is requesting the accessory '" + accessoryType + "' which has not been published by any installed plugins.");
            // Create a custom logging function that prepends the device display name for debugging
            var accessoryName = accessoryConfig["name"];
            var accessoryLogger = Logger.withPrefix(accessoryName);
            accessoryLogger.info("Initializing %s accessory...", accessoryType);
            //@ts-ignore
            var accessoryInstance = new accessoryConstructor(accessoryLogger, accessoryConfig);
            var accessory = this._createAccessory(accessoryInstance, accessoryName, accessoryType, accessoryConfig.uuid_base); //pass accessoryType for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
            // add it to the bridge
            this._bridge.addBridgedAccessory(accessory);
        }
    }

    _loadPlatforms = () => {
        log.info("Loading " + this._config.platforms.length + " platforms...");
        for (var i = 0; i < this._config.platforms.length; i++) {
            var platformConfig = this._config.platforms[i];
            // Load up the class for this accessory
            var platformType = platformConfig["platform"]; // like "Wink"
            var platformName = platformConfig["name"] || platformType;
            var platformConstructor = this._api.platform(platformType); // like "WinkPlatform", a JavaScript constructor
            if (!platformConstructor)
                throw new Error("Your config.json is requesting the platform '" + platformType + "' which has not been published by any installed plugins.");
            // Create a custom logging function that prepends the platform name for debugging
            var platformLogger = Logger.withPrefix(platformName);
            platformLogger.info("Initializing %s platform...", platformType);
            var platformInstance = new platformConstructor(platformLogger, platformConfig, this._api);
            if (platformInstance.configureAccessory == undefined) {
                // Plugin 1.0, load accessories
                this._loadPlatformAccessories(platformInstance, platformLogger, platformType);
            }
            else {
                this._activeDynamicPlugins[platformType] = platformInstance;
            }
            if (platformInstance.configurationRequestHandler != undefined) {
                this._configurablePlatformPlugins[platformType] = platformInstance;
            }
        }
    }

    _loadDynamicPlatforms = () => {
        for (var dynamicPluginName in this._api._dynamicPlatforms) {
            if (!this._activeDynamicPlugins[dynamicPluginName] && !this._activeDynamicPlugins[dynamicPluginName.split(".")[1]]) {
                console.log("Load " + dynamicPluginName);
                //@ts-ignore
                var platformConstructor = this._api._dynamicPlatforms[dynamicPluginName];
                var platformLogger = Logger.withPrefix(dynamicPluginName);
                var platformInstance = new platformConstructor(platformLogger, null, this._api);
                this._activeDynamicPlugins[dynamicPluginName] = platformInstance;
                if (platformInstance.configurationRequestHandler != undefined) {
                    this._configurablePlatformPlugins[dynamicPluginName] = platformInstance;
                }
            }
        }
    }

    _configCachedPlatformAccessories = () => {
        var verifiedAccessories = [];
        for (var index in this._cachedPlatformAccessories) {
            var accessory = this._cachedPlatformAccessories[index];
            if (!(accessory instanceof PlatformAccessory)) {
                console.log("Unexpected Accessory!");
                continue;
            }
            var fullName = accessory._associatedPlugin + "." + accessory._associatedPlatform;
            var platformInstance = this._activeDynamicPlugins[fullName];
            if (!platformInstance) {
                platformInstance = this._activeDynamicPlugins[accessory._associatedPlatform];
            }
            if (platformInstance) {
                platformInstance.configureAccessory(accessory);
            }
            else {
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

    _loadPlatformAccessories = (platformInstance: any, log: Logger, platformType: string) => {
        this._asyncCalls++;
        platformInstance.accessories(once((foundAccessories: PlatformAccessory[]) => {
            this._asyncCalls--;
            // loop through accessories adding them to the list and registering them
            for (var i = 0; i < foundAccessories.length; i++) {
                const accessoryInstance = foundAccessories[i];
                // @ts-ignore
              const accessoryName = accessoryInstance.name; // assume this property was set
                log.info("Initializing platform accessory '%s'...", accessoryName);
                // @ts-ignore
              var accessory = this._createAccessory(accessoryInstance, accessoryName, platformType, accessoryInstance.uuid_base);
                // add it to the bridge
                this._bridge.addBridgedAccessory(accessory);
            }
            // were we the last callback?
            if (this._asyncCalls === 0 && !this._asyncWait)
                this._publish();
        }));
    }

    _createAccessory = (accessoryInstance: any, displayName: string, accessoryType: string, uuid_base: string) => {
        var services = accessoryInstance.getServices();
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
            var accessoryUUID = uuid.generate(accessoryType + ":" + (uuid_base || displayName));
            var accessory = new Accessory(displayName, accessoryUUID);
            // listen for the identify event if the accessory instance has defined an identify() method
            if (accessoryInstance.identify) {
              accessory.on('identify', function(paired: boolean, callback: any) { accessoryInstance.identify(callback); });
            }
            services.forEach(function(service: any) {
                // if you returned an AccessoryInformation service, merge its values with ours
                if (service instanceof Service.AccessoryInformation) {
                    var existingService = accessory.getService(Service.AccessoryInformation)!;
                    // pull out any values you may have defined
                    // @ts-ignore
                  var manufacturer = service.getCharacteristic(Characteristic.Manufacturer).value;
                    // @ts-ignore
                  var model = service.getCharacteristic(Characteristic.Model).value;
                    // @ts-ignore
                  var serialNumber = service.getCharacteristic(Characteristic.SerialNumber).value;
                    // @ts-ignore
                  var firmwareRevision = service.getCharacteristic(Characteristic.FirmwareRevision).value;
                    // @ts-ignore
                  var hardwareRevision = service.getCharacteristic(Characteristic.HardwareRevision).value;
                    if (manufacturer)
                        existingService.setCharacteristic(Characteristic.Manufacturer, manufacturer);
                    if (model)
                        existingService.setCharacteristic(Characteristic.Model, model);
                    if (serialNumber)
                        existingService.setCharacteristic(Characteristic.SerialNumber, serialNumber);
                    if (firmwareRevision)
                        existingService.setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
                    if (hardwareRevision)
                        existingService.setCharacteristic(Characteristic.HardwareRevision, hardwareRevision);
                }
                else {
                    accessory.addService(service);
                }
            });
            return accessory;
        }
    }

    _handleRegisterPlatformAccessories = (accessories: PlatformAccessory[]) => {
        var hapAccessories = [];
        for (var index in accessories) {
            var accessory = accessories[index];
            accessory._prepareAssociatedHAPAccessory();
            hapAccessories.push(accessory._associatedHAPAccessory);
            this._cachedPlatformAccessories.push(accessory);
        }
        this._bridge.addBridgedAccessories(hapAccessories);
        this._updateCachedAccessories();
    }

    _handleUpdatePlatformAccessories = (accessories: PlatformAccessory[]) => {
        // Update persisted accessories
        this._updateCachedAccessories();
    }

    _handleUnregisterPlatformAccessories = (accessories: PlatformAccessory[]) => {
        var hapAccessories = [];
        for (var index in accessories) {
            var accessory = accessories[index];
            if (accessory._associatedHAPAccessory) {
                hapAccessories.push(accessory._associatedHAPAccessory);
            }
            for (var targetIndex in this._cachedPlatformAccessories) {
                var existing = this._cachedPlatformAccessories[targetIndex];
                if (existing.UUID === accessory.UUID) {
                    this._cachedPlatformAccessories.splice(Number.parseInt(targetIndex), 1);
                    break;
                }
            }
        }
        this._bridge.removeBridgedAccessories(hapAccessories);
        this._updateCachedAccessories();
    }

  _handlePublishExternalAccessories = (accessories: PlatformAccessory[]) => {
        var accessoryPin = (this._config.bridge || {}).pin || "031-45-154";
        for (var index in accessories) {
            var accessory = accessories[index];
            var accessoryPort = 0;
            if (this._externalPorts) {
                var minPortNumber = this._externalPorts.start;
                // @ts-ignore
              if (this._nextExternalPort > this._externalPorts.end) {
                    log.info("External port pool ran out of ports. Fallback to random assign.");
                    accessoryPort = 0;
                }
                else {
                    if (this._nextExternalPort !== undefined) {
                        accessoryPort = this._nextExternalPort;
                        this._nextExternalPort += 1;
                    }
                    else {
                        accessoryPort = minPortNumber;
                        this._nextExternalPort = minPortNumber + 1;
                    }
                }
            }
            accessory._prepareAssociatedHAPAccessory();
            var hapAccessory = accessory._associatedHAPAccessory;
            var advertiseAddress = mac.generate(accessory.UUID);
            if (this._publishedAccessories[advertiseAddress]) {
                throw new Error("Accessory " + accessory.displayName + " experienced an address collision.");
            }
            else {
                this._publishedAccessories[advertiseAddress] = accessory;
            }
            (function(name) {
                hapAccessory.on('listening', function(port: string) {
                    log.info("%s is running on port %s.", name, port);
                    log.info("Please add [%s] manually in Home app. Setup Code: %s", name, accessoryPin);
                });
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

    _updateCachedAccessories = () => {
        var serializedAccessories = [];
        for (var index in this._cachedPlatformAccessories) {
            var accessory = this._cachedPlatformAccessories[index];
            serializedAccessories.push(accessory._dictionaryPresentation());
        }
        accessoryStorage.setItemSync("cachedAccessories", serializedAccessories);
    }

    _teardown = () => {
        this._updateCachedAccessories();
        this._bridge.unpublish();
        Object.keys(this._publishedAccessories).forEach((advertiseAddress) => {
            // @ts-ignore
          this._publishedAccessories[advertiseAddress]._associatedHAPAccessory.unpublish();
        });
    }

    _handleNewConfig = (type: ConfigType, name: string, replace: boolean, config: any) => {
        if (type === "accessory") {
            // TODO: Load new accessory
            if (!this._config.accessories) {
                this._config.accessories = [];
            }
            if (!replace) {
                this._config.accessories.push(config);
            }
            else {
                var targetName;
                if (name.indexOf('.') !== -1) {
                    targetName = name.split(".")[1];
                }
                var found = false;
                for (var index in this._config.accessories) {
                    var accessoryConfig = this._config.accessories[index];
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
        }
        else if (type === "platform") {
            if (!this._config.platforms) {
                this._config.platforms = [];
            }
            if (!replace) {
                this._config.platforms.push(config);
            }
            else {
                var targetName;
                if (name.indexOf('.') !== -1) {
                    targetName = name.split(".")[1];
                }
                var found = false;
                for (var index in this._config.platforms) {
                    var platformConfig = this._config.platforms[index];
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
        var serializedConfig = JSON.stringify(this._config, null, '  ');
        var configPath = User.configPath();
        fs.writeFileSync(configPath, serializedConfig, 'utf8');
    }

    _printPin = (pin: string) => {
        if (!this._hideQRCode)
            console.log("Or enter this code with your HomeKit app on your iOS device to pair with Homebridge:");
        else
            console.log("Enter this code with your HomeKit app on your iOS device to pair with Homebridge:");
        console.log(chalk.black.bgWhite("                       "));
        console.log(chalk.black.bgWhite("    ┌────────────┐     "));
        console.log(chalk.black.bgWhite("    │ " + pin + " │     "));
        console.log(chalk.black.bgWhite("    └────────────┘     "));
        console.log(chalk.black.bgWhite("                       "));
    }

    _printSetupInfo = () => {
        console.log("Setup Payload:");
        console.log(this._bridge.setupURI());
        if (!this._hideQRCode) {
            console.log("Scan this code with your HomeKit app on your iOS device to pair with Homebridge:");
            qrcode.generate(this._bridge.setupURI());
        }
    }
}






















