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


var types = require('HAP-NodeJS/accessories/types.js');

var harmonyDiscover = require('harmonyhubjs-discover');
var harmony = require('harmonyhubjs-client');

var _harmonyHubPort = 61991;

var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var Accessory = require("hap-nodejs").Accessory;
var uuid = require("hap-nodejs").uuid;
var inherits = require('util').inherits;


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

  // Find one Harmony remote hub (only support one for now)
  locateHub: function (callback) {
    var self = this;

    // Connect to a Harmony hub
    var createClient = function (ipAddress) {
      self.log("Connecting to Logitech Harmony remote hub...");

      harmony(ipAddress)
        .then(function (client) {
          self.log("Connected to Logitech Harmony remote hub");

          // prevent connection from closing
          setTimeout(function() {
            setInterval(function() {
              self.log("Sending command to prevent timeout");
              client.getCurrentActivity();
            }, 20000);
          }, 5000);

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
      self.log("Found Logitech Harmony remote hub: " + hubInfo.ip);

      // Stop looking for hubs once we find the first one
      // TODO: Support multiple hubs
      discover.stop();

      createClient(hubInfo.ip);
    });

    // Start looking for hubs
    discover.start();
  },

  accessories: function (callback) {
    var self = this;
    var foundAccessories = [];

    // Get the first hub
    this.locateHub(function (err, hub) {
      if (err) throw err;

      self.log("Fetching Logitech Harmony devices and activites...");

      //getDevices(hub);
      getActivities(hub);
    });

    // Get Harmony Devices
    /*
    var getDevices = function(hub) {
      self.log("Fetching Logitech Harmony devices...");

      hub.getDevices()
        .then(function (devices) {
          self.log("Found devices: ", devices);

          var sArray = sortByKey(json['result'],"Name");

          sArray.map(function(s) {
            accessory = new LogitechHarmonyActivityAccessory(self.log, self.server, self.port, false, s.idx, s.Name, s.HaveDimmer, s.MaxDimLevel, (s.SubType=="RGB")||(s.SubType=="RGBW"));
            foundAccessories.push(accessory);
          });

          callback(foundAccessories);
        });
    };
    */

    // Get Harmony Activities
    var getActivities = function(hub) {
      self.log("Fetching Logitech Harmony activities...");

      hub.getActivities()
        .then(function (activities) {
          self.log("Found activities: \n" + activities.map(function (a) { return "\t" + a.label; }).join("\n"));

          var sArray = sortByKey(activities, "label");

          sArray.map(function(s) {
            var accessory = new LogitechHarmonyActivityAccessory(self.log, hub, s);
            // TODO: Update the initial power state
            foundAccessories.push(accessory);
          });

          callback(foundAccessories);
        });
    };

  }

};


function LogitechHarmonyActivityAccessory (log, hub, details) {
  this.log = log;
  this.hub = hub;
  this.details = details;
  this.id = details.id;
  this.name = details.label;
  Accessory.call(this, this.name, uuid.generate(this.id));

  this.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "Logitech")
      .setCharacteristic(Characteristic.Model, "Harmony")
      // TODO: Add hub unique id to this for people with multiple hubs so that it is really a guid.
      .setCharacteristic(Characteristic.SerialNumber, this.id);

  this.addService(Service.Switch)
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState)
      .on('set', this.setPowerState);
};
inherits(LogitechHarmonyActivityAccessory, Accessory);
LogitechHarmonyActivityAccessory.prototype.parent = Accessory.prototype;
LogitechHarmonyActivityAccessory.prototype.getServices = function() {
  return this.services;
};

  // TODO: Somehow make this event driven so that it tells the user what activity is on
  LogitechHarmonyActivityAccessory.prototype.getPowerState = function (callback) {
    var self = this;

      this.hub.getCurrentActivity().then(function (currentActivity) {
        callback(currentActivity === self.id);
      }).catch(function (err) {
        self.log('Unable to get current activity with error', err);
        callback(false);
      });
  };

  LogitechHarmonyActivityAccessory.prototype.setPowerState = function (state) {
    var self = this;

      this.log('Set activity ' + this.name + ' power state to ' + state);

      this.hub.startActivity(self.id)
        .then(function () {
          self.log('Finished setting activity ' + self.name + ' power state to ' + state);
        })
        .catch(function (err) {
          self.log('Failed setting activity ' + self.name + ' power state to ' + state + ' with error ' + err);
        });
  };

module.exports.platform = LogitechHarmonyPlatform;

