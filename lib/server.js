var path = require('path');
var fs = require('fs');
var uuid = require("hap-nodejs").uuid;
var Bridge = require("hap-nodejs").Bridge;
var Accessory = require("hap-nodejs").Accessory;
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var AccessoryLoader = require("hap-nodejs").AccessoryLoader;
var once = require("hap-nodejs/lib/util/once").once;
var Plugin = require('./plugin').Plugin;
var User = require('./user').User;
var API = require('./api').API;
var log = require("./logger")._system;
var Logger = require('./logger').Logger;

'use strict';

module.exports = {
  Server: Server
}

function Server() {
  this._api = new API(); // object we feed to Plugins
  this._plugins = this._loadPlugins(); // plugins[name] = Plugin instance
  this._config = this._loadConfig();
  this._bridge = this._createBridge();
}

Server.prototype.run = function() {
  
  // keep track of async calls we're waiting for callbacks on before we can start up
  this._asyncCalls = 0;
  this._asyncWait = true;
  
  if (this._config.platforms) this._loadPlatforms();
  if (this._config.accessories) this._loadAccessories();
  
  this._asyncWait = false;
  
  // publish now unless we're waiting on anyone
  if (this._asyncCalls == 0)
    this._publish();
}

Server.prototype._publish = function() {
  // pull out our custom Bridge settings from config.json, if any
  var bridgeConfig = this._config.bridge || {};

  this._printPin(bridgeConfig.pin);
  this._bridge.publish({
    username: bridgeConfig.username || "CC:22:3D:E3:CE:30",
    port: bridgeConfig.port || 51826,
    pincode: bridgeConfig.pin || "031-45-154",
    category: Accessory.Categories.OTHER
  });
  
  log.info("Homebridge is running on port %s.", bridgeConfig.port || 51826);
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
      log.error(err);
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
      log.error("Couldn't find a config.json file at '"+configPath+"'. Look at config-sample.json for examples of how to format your config.js and add your home accessories.");
      process.exit(1);
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
  var platformCount = (config.platforms && config.platforms.length) || 0;
  log.info("Loaded config.json with %s accessories and %s platforms.", accessoryCount, platformCount);
  
  log.info("---");

  return config;
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

        var platformInstance = new platformConstructor(platformLogger, platformConfig);
        this._loadPlatformAccessories(platformInstance, platformLogger, platformType);
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

// Returns the setup code in a scannable format.
Server.prototype._printPin = function(pin) {
  console.log("Scan this code with your HomeKit App on your iOS device to pair with Homebridge:");
  console.log("\x1b[30;47m%s\x1b[0m", "                       ");
  console.log("\x1b[30;47m%s\x1b[0m", "    ┌────────────┐     ");
  console.log("\x1b[30;47m%s\x1b[0m", "    │ " + pin + " │     ");
  console.log("\x1b[30;47m%s\x1b[0m", "    └────────────┘     ");
  console.log("\x1b[30;47m%s\x1b[0m", "                       ");
}
