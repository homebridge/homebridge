var path = require('path');
var fs = require('fs');
var uuid = require("hap-nodejs").uuid;
var Bridge = require("hap-nodejs").Bridge;
var Accessory = require("hap-nodejs").Accessory;
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var Plugin = require('./plugin').Plugin;
var User = require('./user').User;

'use strict';

module.exports = {
  Server: Server
}

function Server() {
  this._accessories = {}; // this._accessories[name] = accessory constructor
  this._platforms = {}; // this._platforms[name] = platform constructor
  this._plugins = this._loadPlugins(this._accessories, this._platforms); // plugins[name] = plugin
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
}

Server.prototype._loadPlugins = function(accessories, platforms) {
  
  var plugins = {};
  
  // load and validate plugins - check for valid package.json, etc.
  Plugin.installed().forEach(function(plugin) {
        
    // attempt to load it
    try {
      plugin.load();
    }
    catch (err) {
      console.error(err);
      plugin.loadError = err;
    }

    // add it to our dict for easy lookup later
    plugins[plugin.name()] = plugin;

    console.log("Loaded plugin: " + plugin.name());
    
    if (plugin.accessories) {
      var sep = ""
      var line = "Accessories: [";
      for (var name in plugin.accessories) {
        if (accessories[name])
          throw new Error("Plugin " + plugin.name() + " wants to publish an accessory '" + name + "' which has already been published by another plugin!");
        
        accessories[name] = plugin.accessories[name]; // copy to global dict
        line += sep + name; sep = ",";
      }
      line += "]";
      if (sep) console.log(line);
    }

    if (plugin.platforms) {
      var sep = ""
      var line = "Platforms: [";
      for (var name in plugin.platforms) {
        if (plugin.platforms[name])
          throw new Error("Plugin " + plugin.name() + " wants to publish a platform '" + name + "' which has already been published by another plugin!");
        
        platforms[name] = plugin.platforms[name]; // copy to global dict
        line += sep + name; sep = ",";
      }
      line += "]";
      if (sep) console.log(line);
    }

    console.log("---");
    
  }.bind(this));
  
  return plugins;
}

Server.prototype._loadConfig = function() {
  
  // Look for the configuration file
  var configPath = User.configPath();

  // Complain and exit if it doesn't exist yet
  if (!fs.existsSync(configPath)) {
      console.log("Couldn't find a config.json file in the same directory as app.js. Look at config-sample.json for examples of how to format your config.js and add your home accessories.");
      process.exit(1);
  }
  
  // Load up the configuration file
  var config;
  try {
    config = JSON.parse(fs.readFileSync(configPath));
  }
  catch (err) {
    console.log("There was a problem reading your config.json file.");
    console.log("Please try pasting your config.json file here to validate it: http://jsonlint.com");
    console.log("");
    throw err;
  }
  
  var accessoryCount = (config.accessories && config.accessories.length) || 0;
  var platformCount = (config.platforms && config.platforms.length) || 0;
  console.log("Loaded config.json with %s accessories and %s platforms.", accessoryCount, platformCount);
  
  console.log("---");

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
  console.log("Loading " + this._config.accessories.length + " accessories...");
  
  for (var i=0; i<this._config.accessories.length; i++) {

    var accessoryConfig = this._config.accessories[i];

    // Load up the class for this accessory
    var accessoryType = accessoryConfig["accessory"]; // like "Lockitron"
    var accessoryConstructor = this._accessories[accessoryType]; // like "LockitronAccessory", a JavaScript constructor

    if (!accessoryConstructor)
      throw new Error("Your config.json is requesting the accessory '" + accessoryType + "' which has not been published by any installed plugins.");

    // Create a custom logging function that prepends the device display name for debugging
    var accessoryName = accessoryConfig["name"];
    var log = this._createLog(accessoryName);

    log("Initializing %s accessory...", accessoryType);
    
    var accessoryInstance = new accessoryConstructor(log, accessoryConfig);
    var accessory = this._createAccessory(accessoryInstance, accessoryName, accessoryType, accessoryConfig.uuid_base);  //pass accessoryType for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
    
    // add it to the bridge
    this._bridge.addBridgedAccessory(accessory);
  }
}

Server.prototype._loadPlatforms = function() {

    console.log("Loading " + this._config.platforms.length + " platforms...");
    
    for (var i=0; i<this._config.platforms.length; i++) {

        var platformConfig = this._config.platforms[i];

        // Load up the class for this accessory
        var platformType = platformConfig["platform"]; // like "Wink"
        var platformName = platformConfig["name"];
        var platformConstructor = this._platforms[platformType]; // like "WinkPlatform", a JavaScript constructor

        if (!platformConstructor)
          throw new Error("Your config.json is requesting the platform '" + platformType + "' which has not been published by any installed plugins.");

        // Create a custom logging function that prepends the platform name for debugging
        var log = this._createLog(platformName);

        log("Initializing %s platform...", platformType);

        var platformInstance = new platformConstructor(log, platformConfig);
        this._loadPlatformAccessories(platformInstance, log, platformType);
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
    return accessoryLoader.parseAccessoryJSON({
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
  console.log("Scan this code with your HomeKit App on your iOS device:");
  console.log("\x1b[30;47m%s\x1b[0m", "                       ");
  console.log("\x1b[30;47m%s\x1b[0m", "    ┌────────────┐     ");
  console.log("\x1b[30;47m%s\x1b[0m", "    │ " + pin + " │     ");
  console.log("\x1b[30;47m%s\x1b[0m", "    └────────────┘     ");
  console.log("\x1b[30;47m%s\x1b[0m", "                       ");
}

// Returns a logging function that prepends messages with the given name in [brackets].
Server.prototype._createLog = function(name) {
  return function(message) {
    var rest = Array.prototype.slice.call(arguments, 1 ); // any arguments after message
    var args = ["[%s] " + message, name].concat(rest);
    console.log.apply(console, args);
  }
}
