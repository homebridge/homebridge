var fs = require('fs');
var path = require('path');
var storage = require('node-persist');
var hap = require('HAP-NodeJS');
var uuid = require('HAP-NodeJS').uuid;
var Bridge = require('HAP-NodeJS').Bridge;
var Accessory = require('HAP-NodeJS').Accessory;
var accessoryLoader = require('HAP-NodeJS').AccessoryLoader;

console.log("Starting HomeBridge server...");

console.log("_____________________________________________________________________");
console.log("IMPORTANT: Homebridge is in the middle of some big changes.");
console.log("           Read more about it here:");
console.log("           https://github.com/nfarina/homebridge/wiki/Migration-Guide");
console.log("_____________________________________________________________________");
console.log("");

// Look for the configuration file
var configPath = path.join(__dirname, "config.json");

// Complain and exit if it doesn't exist yet
if (!fs.existsSync(configPath)) {
    console.log("Couldn't find a config.json file in the same directory as app.js. Look at config-sample.json for examples of how to format your config.js and add your home accessories.");
    process.exit(1);
}

// Initialize HAP-NodeJS
hap.init();

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

// pull out our custom Bridge settings from config.json, if any
var bridgeConfig = config.bridge || {};

// Start by creating our Bridge which will host all loaded Accessories
var bridge = new Bridge(bridgeConfig.name || 'Homebridge', uuid.generate("HomeBridge"));

// keep track of async calls we're waiting for callbacks on before we can start up
// this is hacky but this is all going away once we build proper plugin support
var asyncCalls = 0;
var asyncWait = false;

function startup() {
    asyncWait = true;
    if (config.platforms) loadPlatforms();
    if (config.accessories) loadAccessories();
    asyncWait = false;
    
    // publish now unless we're waiting on anyone
    if (asyncCalls == 0)
      publish();
}

function loadAccessories() {

    // Instantiate all accessories in the config
    console.log("Loading " + config.accessories.length + " accessories...");
    
    for (var i=0; i<config.accessories.length; i++) {

        var accessoryConfig = config.accessories[i];

        // Load up the class for this accessory
        var accessoryName = accessoryConfig["accessory"]; // like "WeMo"
        var accessoryModule = require('./accessories/' + accessoryName + ".js"); // like "./accessories/WeMo.js"
        var accessoryConstructor = accessoryModule.accessory; // like "WeMoAccessory", a JavaScript constructor

        // Create a custom logging function that prepends the device display name for debugging
        var name = accessoryConfig["name"];
        var log = function(name) { return function(s) { console.log("[" + name + "] " + s); }; }(name);

        log("Initializing " + accessoryName + " accessory...");
        
        var accessoryInstance = new accessoryConstructor(log, accessoryConfig);

        // Extract the raw "services" for this accessory which is a big array of objects describing the various
        // hooks in and out of HomeKit for the HAP-NodeJS server.
        var services = accessoryInstance.getServices();
        
        // Create the actual HAP-NodeJS "Accessory" instance
        var accessory = accessoryLoader.parseAccessoryJSON({
          displayName: name,
          services: services
        });

        // add it to the bridge
        bridge.addBridgedAccessory(accessory);
    }
}

function loadPlatforms() {

    console.log("Loading " + config.platforms.length + " platforms...");
    
    for (var i=0; i<config.platforms.length; i++) {

        var platformConfig = config.platforms[i];

        // Load up the class for this accessory
        var platformName = platformConfig["platform"]; // like "Wink"
        var platformModule = require('./platforms/' + platformName + ".js"); // like "./platforms/Wink.js"
        var platformConstructor = platformModule.platform; // like "WinkPlatform", a JavaScript constructor

        // Create a custom logging function that prepends the platform display name for debugging
        var name = platformConfig["name"];
        var log = function(name) { return function(s) { console.log("[" + name + "] " + s); }; }(name);

        log("Initializing " + platformName + " platform...");

        var platformInstance = new platformConstructor(log, platformConfig);

        // wrap name and log in a closure so they don't change in the callback
        function getAccessories(name, log) {
          asyncCalls++;
          platformInstance.accessories(function(foundAccessories){
              asyncCalls--;
              // loop through accessories adding them to the list and registering them
              for (var i = 0; i < foundAccessories.length; i++) {
                  var accessoryInstance = foundAccessories[i];
                  
                  log("Initializing device with name " + accessoryInstance.name + "...")
                  
                  // Extract the raw "services" for this accessory which is a big array of objects describing the various
                  // hooks in and out of HomeKit for the HAP-NodeJS server.
                  var services = accessoryInstance.getServices();
                  
                  // Create the actual HAP-NodeJS "Accessory" instance
                  var accessory = accessoryLoader.parseAccessoryJSON({
                    displayName: name,
                    services: services
                  });

                  // add it to the bridge
                  bridge.addBridgedAccessory(accessory);
              }
              
              // were we the last callback?
              if (asyncCalls === 0 && !asyncWait)
                publish();
          })
        }

        // query for devices
        getAccessories(name, log);
    }
}

function publish() {
  bridge.publish({
    username: bridgeConfig.username || "CC:22:3D:E3:CE:30",
    port: bridgeConfig.port || 51826,
    pincode: bridgeConfig.pin || "031-45-154",
    category: Accessory.Categories.OTHER
  });
}

startup();
