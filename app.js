var fs = require('fs');
var path = require('path');
var storage = require('node-persist');

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

function loadAccessories() {
    console.log("Loading " + config.accessories.length + " accessories...");

    var accessories = [];

    // Instantiate all accessories in the config
    for (var i=0; i<config.accessories.length; i++) {

        var accessoryConfig = config.accessories[i];

        // Load up the class for this accessory
        var accessoryName = accessoryConfig["accessory"]; // like "WeMo"
        var accessoryModule = require('./accessories/' + accessoryName + ".js"); // like "./accessories/WeMo.js"
        var accessoryConstructor = accessoryModule.accessory; // like "WeMoAccessory", a JavaScript constructor

        // Create a custom logging function that prepends the Siri name for debugging
        var siriName = accessoryConfig["siri_name"];
        var log = function(siriName) { return function(s) { console.log("[" + siriName + "] " + s); }; }(siriName);

        log("Initializing " + accessoryName + " accessory...");
        var accessory = new accessoryConstructor(log, accessoryConfig);
        accessories.push(accessory);

        // Extract the raw "accessoryData" for this accessory which is a big object-blob describing the various
        // hooks in and out of HomeKit for the HAP-NodeJS server.
        var accessoryData = accessory.accessoryData();

        // Create the HAP server for this accessory
        createHAPServer(accessoryData);
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

function createHAPServer(data) {
    var accessoryController = new accessoryController_Factor.AccessoryController();

    //loop through services
    for (var j = 0; j < data.services.length; j++) {
        var service = new service_Factor.Service(data.services[j].sType);

        //loop through characteristics
        for (var k = 0; k < data.services[j].characteristics.length; k++) {
            var options = {
                type: data.services[j].characteristics[k].cType,
                perms: data.services[j].characteristics[k].perms,
                format: data.services[j].characteristics[k].format,
                initialValue: data.services[j].characteristics[k].initialValue,
                supportEvents: data.services[j].characteristics[k].supportEvents,
                supportBonjour: data.services[j].characteristics[k].supportBonjour,
                manfDescription: data.services[j].characteristics[k].manfDescription,
                designedMaxLength: data.services[j].characteristics[k].designedMaxLength,
                designedMinValue: data.services[j].characteristics[k].designedMinValue,
                designedMaxValue: data.services[j].characteristics[k].designedMaxValue,
                designedMinStep: data.services[j].characteristics[k].designedMinStep,
                unit: data.services[j].characteristics[k].unit
            };

            var characteristic = new characteristic_Factor.Characteristic(options, data.services[j].characteristics[k].onUpdate);

            service.addCharacteristic(characteristic);
        }
        accessoryController.addService(service);
    }

    //increment ports for each accessory
    nextPort = nextPort + (nextServer*2);

    // create a unique "username" for this accessory
    var pincode = "031-45-154";
    var username = "DD:22:3D:EE:5E:" + ("00" + nextServer.toString(16)).substr(-2);

    var accessory = new accessory_Factor.Accessory(data.displayName, username, storage, parseInt(nextPort), pincode, accessoryController);
    accessoryServers[nextServer] = accessory;
    accessoryControllers[nextServer] = accessoryController;
    accessory.publishAccessory();

    nextServer++;
}

loadAccessories();