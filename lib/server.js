var path = require('path');
var fs = require('fs');
var uuid = require("hap-nodejs").uuid;
var accessoryStorage = require('node-persist').create();
var Bridge = require("hap-nodejs").Bridge;
var Accessory = require("hap-nodejs").Accessory;
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var AccessoryLoader = require("hap-nodejs").AccessoryLoader;
var once = require("hap-nodejs/lib/util/once").once;
var Plugin = require('./plugin').Plugin;
var User = require('./user').User;
var API = require('./api').API;
var PlatformAccessory = require("./platformAccessory").PlatformAccessory;
var BridgeSetupManager = require("./bridgeSetupManager").BridgeSetupManager;
var log = require("./logger")._system;
var Logger = require('./logger').Logger;
var mac = require("./util/mac");
var chalk = require('chalk');

'use strict';

module.exports = {
  Server: Server
}

function Server(insecureAccess, opts) {
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

  this._api.on('publishCameraAccessories', function(accessories) {
    this._handlePublishCameraAccessories(accessories);
  }.bind(this));

  this._plugins = this._loadPlugins(); // plugins[name] = Plugin instance
  this._config = opts.config || this._loadConfig();
  this._cachedPlatformAccessories = this._loadCachedPlatformAccessories();
  this._bridge = this._createBridge();

  this._activeDynamicPlugins = {};
  this._configurablePlatformPlugins = {};
  this._publishedCameras = {};
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
  this._allowInsecureAccess = insecureAccess || false;
}

Server.prototype.run = function() {

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

Server.prototype._publish = function() {
  // pull out our custom Bridge settings from config.json, if any
  var bridgeConfig = this._config.bridge || {};

  var info = this._bridge.getService(Service.AccessoryInformation);
  if (bridgeConfig.manufacturer)
    info.setCharacteristic(Characteristic.Manufacturer, bridgeConfig.manufacturer);
  if (bridgeConfig.model)
    info.setCharacteristic(Characteristic.Model, bridgeConfig.model);
  if (bridgeConfig.serialNumber)
    info.setCharacteristic(Characteristic.SerialNumber, bridgeConfig.serialNumber);

  this._printPin(bridgeConfig.pin);

  this._bridge.on('listening', function(port) {
    log.info("Homebridge is running on port %s.", port);
  });

  this._bridge.publish({
    username: bridgeConfig.username || "CC:22:3D:E3:CE:30",
    port: bridgeConfig.port || 0,
    pincode: bridgeConfig.pin || "031-45-154",
    category: Accessory.Categories.BRIDGE
  }, this._allowInsecureAccess);
}

Server.prototype._loadPlugins = function(accessories, platforms) {

  var plugins = {};
  var foundOnePlugin = false;

  // load and validate plugins - check for valid package.json, etc.
  Plugin.installed().forEach(function(plugin) {

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

Server.prototype._loadConfig = function() {

  // Look for the configuration file
  var configPath = User.configPath();

  // Complain and exit if it doesn't exist yet
  if (!fs.existsSync(configPath)) {
    log.warn("config.json (%s) not found.", configPath);

    var config = {};

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
  var config;
  try {
    config = JSON.parse(fs.readFileSync(configPath));
  }
  catch (err) {
    log.error("There was a problem reading your config.json file.");
    log.error("Please try pasting your config.json file here to validate it: http://jsonlint.com");
    log.error("");
    throw err;
  }

  var accessoryCount = (config.accessories && config.accessories.length) || 0;

  var username = config.bridge.username;
  var validMac = /^([0-9A-F]{2}:){5}([0-9A-F]{2})$/;
  if (!validMac.test(username)){
      throw new Error('Not a valid username: ' + username + '. Must be 6 pairs of colon-' +
                      'separated hexadecimal chars (A-F 0-9), like a MAC address.');
  }

  var accessoryCount = (config.accessories && config.accessories.length) || 0;
  var platformCount = (config.platforms && config.platforms.length) || 0;
  log.info("Loaded config.json with %s accessories and %s platforms.", accessoryCount, platformCount);

  log.info("---");

  return config;
}

Server.prototype._loadCachedPlatformAccessories = function() {
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

Server.prototype._createBridge = function() {
  // pull out our custom Bridge settings from config.json, if any
  var bridgeConfig = this._config.bridge || {};

  // Create our Bridge which will host all loaded Accessories
  return new Bridge(bridgeConfig.name || 'Homebridge', uuid.generate("HomeBridge"));
}

Server.prototype._loadAccessories = function() {

  // Instantiate all accessories in the config
  log.info("Loading " + this._config.accessories.length + " accessories...");

  for (var i=0; i<this._config.accessories.length; i++) {

    var accessoryConfig = this._config.accessories[i];

    // Load up the class for this accessory
    var accessoryType = accessoryConfig["accessory"]; // like "Lockitron"
    var accessoryConstructor = this._api.accessory(accessoryType); // like "LockitronAccessory", a JavaScript constructor

    if (!accessoryConstructor)
      throw new Error("Your config.json is requesting the accessory '" + accessoryType + "' which has not been published by any installed plugins.");

    // Create a custom logging function that prepends the device display name for debugging
    var accessoryName = accessoryConfig["name"];
    var accessoryLogger = Logger.withPrefix(accessoryName);

    accessoryLogger("Initializing %s accessory...", accessoryType);

    var accessoryInstance = new accessoryConstructor(accessoryLogger, accessoryConfig);
    var accessory = this._createAccessory(accessoryInstance, accessoryName, accessoryType, accessoryConfig.uuid_base);  //pass accessoryType for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation

    // add it to the bridge
    this._bridge.addBridgedAccessory(accessory);
  }
}

Server.prototype._loadPlatforms = function() {

    log.info("Loading " + this._config.platforms.length + " platforms...");

    for (var i=0; i<this._config.platforms.length; i++) {

        var platformConfig = this._config.platforms[i];

        // Load up the class for this accessory
        var platformType = platformConfig["platform"]; // like "Wink"
        var platformName = platformConfig["name"];
        var platformConstructor = this._api.platform(platformType); // like "WinkPlatform", a JavaScript constructor

        if (!platformConstructor)
          throw new Error("Your config.json is requesting the platform '" + platformType + "' which has not been published by any installed plugins.");

        // Create a custom logging function that prepends the platform name for debugging
        var platformLogger = Logger.withPrefix(platformName);

        platformLogger("Initializing %s platform...", platformType);

        var platformInstance = new platformConstructor(platformLogger, platformConfig, this._api);

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

Server.prototype._loadDynamicPlatforms = function() {
  for (var dynamicPluginName in this._api._dynamicPlatforms) {
    if (!this._activeDynamicPlugins[dynamicPluginName] && !this._activeDynamicPlugins[dynamicPluginName.split(".")[1]]) {
      console.log("Load " + dynamicPluginName);
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

Server.prototype._configCachedPlatformAccessories = function() {
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
    } else {
      console.log("Failed to find plugin to handle accessory " + accessory.displayName);
    }

    accessory._prepareAssociatedHAPAccessory();
    this._bridge.addBridgedAccessory(accessory._associatedHAPAccessory);
  }
}

Server.prototype._loadPlatformAccessories = function(platformInstance, log, platformType) {
  this._asyncCalls++;
  platformInstance.accessories(once(function(foundAccessories){
      this._asyncCalls--;

      // loop through accessories adding them to the list and registering them
      for (var i = 0; i < foundAccessories.length; i++) {
          var accessoryInstance = foundAccessories[i];
          var accessoryName = accessoryInstance.name; // assume this property was set

          log("Initializing platform accessory '%s'...", accessoryName);

          var accessory = this._createAccessory(accessoryInstance, accessoryName, platformType, accessoryInstance.uuid_base);

          // add it to the bridge
          this._bridge.addBridgedAccessory(accessory);
      }

      // were we the last callback?
      if (this._asyncCalls === 0 && !this._asyncWait)
        this._publish();
  }.bind(this)));
}

Server.prototype._createAccessory = function(accessoryInstance, displayName, accessoryType, uuid_base) {

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
    if (accessoryInstance.identify)
      accessory.on('identify', function(paired, callback) { accessoryInstance.identify(callback); });

    services.forEach(function(service) {

      // if you returned an AccessoryInformation service, merge its values with ours
      if (service instanceof Service.AccessoryInformation) {
        var existingService = accessory.getService(Service.AccessoryInformation);

        // pull out any values you may have defined
        var manufacturer = service.getCharacteristic(Characteristic.Manufacturer).value;
        var model = service.getCharacteristic(Characteristic.Model).value;
        var serialNumber = service.getCharacteristic(Characteristic.SerialNumber).value;

        if (manufacturer) existingService.setCharacteristic(Characteristic.Manufacturer, manufacturer);
        if (model) existingService.setCharacteristic(Characteristic.Model, model);
        if (serialNumber) existingService.setCharacteristic(Characteristic.SerialNumber, serialNumber);
      }
      else {
        accessory.addService(service);
      }
    });

    return accessory;
  }
}

Server.prototype._handleRegisterPlatformAccessories = function(accessories) {
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

Server.prototype._handleUpdatePlatformAccessories = function(accessories) {
  // Update persisted accessories
  this._updateCachedAccessories();
}

Server.prototype._handleUnregisterPlatformAccessories = function(accessories) {
  var hapAccessories = [];
  for (var index in accessories) {
    var accessory = accessories[index];

    if (accessory._associatedHAPAccessory) {
      hapAccessories.push(accessory._associatedHAPAccessory);
    }

    for (var targetIndex in this._cachedPlatformAccessories) {
      var existing = this._cachedPlatformAccessories[targetIndex];
      if (existing.UUID === accessory.UUID) {
        this._cachedPlatformAccessories.splice(targetIndex, 1);
        break;
      }
    }
  }

  this._bridge.removeBridgedAccessories(hapAccessories);
  this._updateCachedAccessories();
}

Server.prototype._handlePublishCameraAccessories = function(accessories) {
  var accessoryPin = (this._config.bridge || {}).pin || "031-45-154";

  for (var index in accessories) {
    var accessory = accessories[index];

    accessory._prepareAssociatedHAPAccessory();
    var hapAccessory = accessory._associatedHAPAccessory;
    var advertiseAddress = mac.generate(accessory.UUID);

    if (this._publishedCameras[advertiseAddress]) {
      throw new Error("Camera accessory " + accessory.displayName + " experienced an address collision.");
    } else {
      this._publishedCameras[advertiseAddress] = accessory;
    }

    hapAccessory.on('listening', function(port) {
      log.info("%s is running on port %s.", accessory.displayName, port);
    });

    hapAccessory.publish({
      username: advertiseAddress,
      pincode: accessoryPin,
      category: accessory.category
    }, this._allowInsecureAccess);
  }
}

Server.prototype._updateCachedAccessories = function() {
  var serializedAccessories = [];

  for (var index in this._cachedPlatformAccessories) {
    var accessory = this._cachedPlatformAccessories[index];
    serializedAccessories.push(accessory._dictionaryPresentation());
  }

  accessoryStorage.setItemSync("cachedAccessories", serializedAccessories);
}

Server.prototype._handleNewConfig = function(type, name, replace, config) {
  if (type === "accessory") {
    // TODO: Load new accessory
    if (!this._config.accessories) {
      this._config.accessories = [];
    }

    if (!replace) {
      this._config.accessories.push(config);
    } else {
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
  } else if (type === "platform") {
    if (!this._config.platforms) {
      this._config.platforms = [];
    }

    if (!replace) {
      this._config.platforms.push(config);
    } else {
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

// Returns the setup code in a scannable format.
Server.prototype._printPin = function(pin) {
  console.log("Scan this code with your HomeKit App on your iOS device to pair with Homebridge:");
  console.log(chalk.black.bgWhite("                       "));
  console.log(chalk.black.bgWhite("    ┌────────────┐     "));
  console.log(chalk.black.bgWhite("    │ " + pin + " │     "));
  console.log(chalk.black.bgWhite("    └────────────┘     "));
  console.log(chalk.black.bgWhite("                       "));
}
