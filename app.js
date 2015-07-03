var fs = require('fs');
var path = require('path');
var storage = require('node-persist');
var crypto = require('crypto');

console.log("Starting HomeBridge server...");

// Look for the configuration file
var configPath = path.join(__dirname, "config.json");

// Complain and exit if it doesn't exist yet
if (!fs.existsSync(configPath)) {
    console.log("Couldn't find a config.json file in the same directory as app.js. Look at config-sample.json for examples of how to format your config.js and add your home accessories.");
    process.exit(1);
}

// Initialize persistent storage
storage.initSync();

// Load up the configuration file
var config = JSON.parse(fs.readFileSync(configPath));

// Just to prevent them getting garbage collected
var accessories = [];

function startup() {
    if (config.platforms) loadPlatforms();
    if (config.accessories) loadAccessories();
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
        var accessory = new accessoryConstructor(log, accessoryConfig);
        accessories.push(accessory);

        // Extract the raw "services" for this accessory which is a big array of objects describing the various
        // hooks in and out of HomeKit for the HAP-NodeJS server.
        var services = accessory.getServices();

        // Create the HAP server for this accessory
        createHAPServer(name, services);
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

        var platform = new platformConstructor(log, platformConfig);

        // query for devices
        platform.accessories(function(foundAccessories){
            // loop through accessories adding them to the list and registering them
            for (var i = 0; i < foundAccessories.length; i++) {
                accessory = foundAccessories[i]
                accessories.push(accessory);
                log("Initializing device with name " + accessory.name + "...")
                // Extract the raw "services" for this accessory which is a big array of objects describing the various
                // hooks in and out of HomeKit for the HAP-NodeJS server.
                var services = accessory.getServices();
                // Create the HAP server for this accessory
                createHAPServer(accessory.name, services);
            }
            accessories.push.apply(accessories, foundAccessories);
        })
    }
}

//
// Creates the actual HAP servers which listen on different sockets
//

// Pull in required HAP-NodeJS stuff
var accessory_Factor = new require("./lib/HAP-NodeJS/Accessory.js");
var accessoryController_Factor = new require("./lib/HAP-NodeJS/AccessoryController.js");
var service_Factor = new require("./lib/HAP-NodeJS/Service.js");
var characteristic_Factor = new require("./lib/HAP-NodeJS/Characteristic.js");

// Each accessory has its own little server. We'll need to allocate some ports for these servers
var nextPort = 51826;
var nextServer = 0;
var accessoryServers = [];
var accessoryControllers = [];
var usernames = {};

function createHAPServer(name, services) {
    var accessoryController = new accessoryController_Factor.AccessoryController();

    //loop through services
    for (var j = 0; j < services.length; j++) {
        var service = new service_Factor.Service(services[j].sType);

        //loop through characteristics
        for (var k = 0; k < services[j].characteristics.length; k++) {
            var options = {
                onRead: services[j].characteristics[k].onRead,
                onRegister: services[j].characteristics[k].onRegister,
                type: services[j].characteristics[k].cType,
                perms: services[j].characteristics[k].perms,
                format: services[j].characteristics[k].format,
                initialValue: services[j].characteristics[k].initialValue,
                supportEvents: services[j].characteristics[k].supportEvents,
                supportBonjour: services[j].characteristics[k].supportBonjour,
                manfDescription: services[j].characteristics[k].manfDescription,
                designedMaxLength: services[j].characteristics[k].designedMaxLength,
                designedMinValue: services[j].characteristics[k].designedMinValue,
                designedMaxValue: services[j].characteristics[k].designedMaxValue,
                designedMinStep: services[j].characteristics[k].designedMinStep,
                unit: services[j].characteristics[k].unit
            };

            var characteristic = new characteristic_Factor.Characteristic(options, services[j].characteristics[k].onUpdate);

            service.addCharacteristic(characteristic);
        }
        accessoryController.addService(service);
    }

    // create a unique "username" for this accessory based on the default display name
    var username = createUsername(name);

    if (usernames[username]) {
        console.log("Cannot create another accessory with the same name '" + name + "'. The 'name' property must be unique for each accessory.");
        return;
    }

    // remember that we used this name already
    usernames[username] = name;

    // increment ports for each accessory
    nextPort = nextPort + (nextServer*2);

    // hardcode the PIN to something random (same PIN as HAP-NodeJS sample accessories)
    var pincode = "031-45-154";

    var accessory = new accessory_Factor.Accessory(name, username, storage, parseInt(nextPort), pincode, accessoryController);
    accessoryServers[nextServer] = accessory;
    accessoryControllers[nextServer] = accessoryController;
    accessory.publishAccessory();

    nextServer++;
}

// Creates a unique "username" for HomeKit from a hash of the given string
function createUsername(str) {

    // Hash str into something like "098F6BCD4621D373CADE4E832627B4F6"
    var hash = crypto.createHash('md5').update(str).digest("hex").toUpperCase();

    // Turn it into a MAC-address-looking "username" for HomeKit
    return hash[0] + hash[1] + ":" +
           hash[2] + hash[3] + ":" +
           hash[4] + hash[5] + ":" +
           hash[6] + hash[7] + ":" +
           hash[8] + hash[9] + ":" +
           hash[10] + hash[11];
}

startup();
