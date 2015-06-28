'use strict';

// Logitech Harmony Remote Platform Shim for HomeBridge
// Based on the Domoticz Platform Shim for HomeBridge by Joep Verhaeg (http://www.joepverhaeg.nl)
// Wriiten by John Wells (https://github.com/madmod)
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "LogitechHarmony",
//         "name": "Logitech Harmony"
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.
//


var types = require("../lib/HAP-NodeJS/accessories/types.js");

var harmonyDiscover = require('harmonyhubjs-discover');
var harmony = require('harmonyhubjs-client');

var _harmonyHubPort = 61991;


function sortByKey (array, key) {
  return array.sort(function(a, b) {
    var x = a[key]; var y = b[key];
    return ((x < y) ? -1 : ((x > y) ? 1 : 0));
  });
};


function LogitechHarmonyPlatform (log, config) {
  this.log = log;
  this.ip_address = config['ip_address'];
};


LogitechHarmonyPlatform.prototype = {

  // Find one harmony remote hub (only support one for now)
  locateHub: function (callback) {

    var that = this;

    // Connect to a Harmony hub
    var createClient = function (ipAddress) {
      that.log("Connecting to Logitech Harmony remote hub...");

      harmony(ipAddress)
        .then(function (client) {
          that.log("Connected to Logitech Harmony remote hub");

          callback(null, client);
        });
    };

    // Use the ip address in configuration if available
    if (this.ip_address) {
      console.log("Using Logitech Harmony hub ip address from configuration");

      return createClient(this.ip_address)
    }

    this.log("Searching for Logitech Harmony remote hubs...");

    // Discover the harmony hub with bonjour
    var discover = new harmonyDiscover(_harmonyHubPort);

    // TODO: Support update event with some way to add accessories
    // TODO: Have some kind of timeout with an error message. Right now this searches forever until it finds one hub.
    discover.on('online', function (hubInfo) {
      that.log("Found Logitech Harmony remote hub: " + hubInfo.ip);

      // Stop looking for hubs once we find the first one
      // TODO: Support multiple hubs
      discover.stop();

      createClient(hubInfo.ip);
    });

    // Start looking for hubs
    discover.start();
  },

  accessories: function (callback) {
    var that = this;
    var foundAccessories = [];

    // Get the first hub
    this.locateHub(function (err, hub) {
      if (err) throw err;

      that.log("Fetching Logitech Harmony devices and activites...");

      //getDevices(hub);
      getActivities(hub);
    });

    // Get Harmony Devices
    var getDevices = function(hub) {
      that.log("Fetching Logitech Harmony devices...");

      hub.getDevices()
        .then(function (devices) {
          that.log("Found devices: ", devices);

          var sArray = sortByKey(json['result'],"Name");

          sArray.map(function(s) {
            accessory = new DomoticzAccessory(that.log, that.server, that.port, false, s.idx, s.Name, s.HaveDimmer, s.MaxDimLevel, (s.SubType=="RGB")||(s.SubType=="RGBW"));
            foundAccessories.push(accessory);
          });

          callback(foundAccessories);
        });
    };

    // Get Harmony Activities
    var getActivities = function(hub) {
      that.log("Fetching Logitech Harmony activities...");

      hub.getActivities()
        .then(function (activities) {
          that.log("Found activities: \n" + activities.map(function (a) { return "\t" + a.label; }).join("\n"));

          var sArray = sortByKey(activities, "label");

          sArray.map(function(s) {
            var accessory = new LogitechHarmonyAccessory(that.log, hub, s, true);
            foundAccessories.push(accessory);
          });

          callback(foundAccessories);
        });
    };

  }

};


function LogitechHarmonyAccessory (log, hub, details, isActivity) {
  this.log = log;
  this.hub = hub;
  this.details = details;
  this.id = details.id;
  this.name = details.label;
  this.isActivity = isActivity;
};


LogitechHarmonyAccessory.prototype = {

  command: function (command, value) {
    this.log(this.name + " sending command " + command + " with value " + value);
    if (this.isActivity) {
      if (command === "On") {
        this.hub.startActivity(this.id)
      } else {
        this.hub.turnOff();
      }
    } else {
      // TODO: Support device specific commands
    }
  },

  getServices: function () {
    var that = this;

    return [
      {
        sType: types.ACCESSORY_INFORMATION_STYPE,
        characteristics: [
          {
            cType: types.NAME_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: this.name,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Name of the accessory",
            designedMaxLength: 255
          },{
            cType: types.MANUFACTURER_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: "Logitech",
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Manufacturer",
            designedMaxLength: 255
          },{
            cType: types.MODEL_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: "Harmony",
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Model",
            designedMaxLength: 255
          },{
            cType: types.SERIAL_NUMBER_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: "A1S2NASF88EW",
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "SN",
            designedMaxLength: 255
          },{
            cType: types.IDENTIFY_CTYPE,
            onUpdate: null,
            perms: ["pw"],
            format: "bool",
            initialValue: false,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Identify Accessory",
            designedMaxLength: 1
          }
        ]
      },
      {
        sType: types.SWITCH_STYPE,
        characteristics: [
          {
            cType: types.NAME_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: this.name,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Name of service",
            designedMaxLength: 255
          },
          {
            cType: types.POWER_STATE_CTYPE,
            onUpdate: function (value) {
              if (value == 0) {
                that.command("Off")
              } else {
                that.command("On")
              }
            },
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: 0,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Change the power state",
            designedMaxLength: 1
          }
        ]
      }
    ];
  }
};

module.exports.accessory = LogitechHarmonyAccessory;
module.exports.platform = LogitechHarmonyPlatform;

