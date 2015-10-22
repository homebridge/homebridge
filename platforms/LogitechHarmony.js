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


var types = require('hap-nodejs/accessories/types.js');

var harmonyDiscover = require('harmonyhubjs-discover');
var harmony = require('harmonyhubjs-client');

var _harmonyHubPort = 61991;

var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var Accessory = require("hap-nodejs").Accessory;
var uuid = require("hap-nodejs").uuid;
var inherits = require('util').inherits;
var queue = require('queue');


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

  accessories: function (callback) {
    var plat = this;
    var foundAccessories = [];
    var activityAccessories = [];
    var hub = null;
    var hubIP = null;
    var hubQueue = queue();
    hubQueue.concurrency = 1;

    // Get the first hub
    locateHub(function (err, client, clientIP) {
      if (err) throw err;

      plat.log("Fetching Logitech Harmony devices and activites...");

      hub = client;
      hubIP = clientIP;
      //getDevices(hub);
      getActivities();
    });

    // Find one Harmony remote hub (only support one for now)
    function locateHub(callback) {
      // Use the ip address in configuration if available
      if (plat.ip_address) {
        console.log("Using Logitech Harmony hub ip address from configuration");

        return createClient(plat.ip_address, callback)
      }

      plat.log("Searching for Logitech Harmony remote hubs...");

      // Discover the harmony hub with bonjour
      var discover = new harmonyDiscover(_harmonyHubPort);

      // TODO: Support update event with some way to add accessories
      // TODO: Have some kind of timeout with an error message. Right now this searches forever until it finds one hub.
      discover.on('online', function (hubInfo) {
        plat.log("Found Logitech Harmony remote hub: " + hubInfo.ip);

        // Stop looking for hubs once we find the first one
        // TODO: Support multiple hubs
        discover.stop();

        createClient(hubInfo.ip, callback);
      });

      // Start looking for hubs
      discover.start();
    }

    // Connect to a Harmony hub
    function createClient(ipAddress, callback) {
      plat.log("Connecting to Logitech Harmony remote hub...");
      harmony(ipAddress)
          .then(function (client) {
            plat.log("Connected to Logitech Harmony remote hub");
            callback(null, client, ipAddress);
          });
    }

    // Get Harmony Activities
    function getActivities() {
      plat.log("Fetching Logitech Harmony activities...");

      hub.getActivities()
        .then(function (activities) {
          plat.log("Found activities: \n" + activities.map(function (a) { return "\t" + a.label; }).join("\n"));

          hub.getCurrentActivity().then(function (currentActivity) {
            var actAccessories = [];
            var sArray = sortByKey(activities, "label");
            sArray.map(function(s) {
              var accessory = createActivityAccessory(s);
              if (accessory.id > 0) {
                accessory.updateActivityState(currentActivity);
                actAccessories.push(accessory);
                foundAccessories.push(accessory);
              }
            });
            activityAccessories = actAccessories;
            keepAliveRefreshLoop();
            callback(foundAccessories);
          }).catch(function (err) {
            plat.log('Unable to get current activity with error', err);
            throw err;
          });
        });
    }

    function createActivityAccessory(activity) {
      var accessory = new LogitechHarmonyActivityAccessory(plat.log, activity, changeCurrentActivity.bind(plat), -1);
      return accessory;
    }

    var isChangingActivity = false;
    function changeCurrentActivity(nextActivity, callback) {
      if (!nextActivity) {
        nextActivity = -1;
      }
      plat.log('Queue activity to ' + nextActivity);
      executeOnHub(function(h, cb) {
        plat.log('Set activity to ' + nextActivity);
        h.startActivity(nextActivity)
            .then(function () {
              cb();
              isChangingActivity = false;
              plat.log('Finished setting activity to ' + nextActivity);
              updateCurrentActivity(nextActivity);
              if (callback) callback(null, nextActivity);
            })
            .catch(function (err) {
              cb();
              isChangingActivity = false;
              plat.log('Failed setting activity to ' + nextActivity + ' with error ' + err);
              if (callback) callback(err);
            });
      }, function(){
        callback(Error("Set activity failed too many times"));
      });
    }

    function updateCurrentActivity(currentActivity) {
      var actAccessories = activityAccessories;
      if (actAccessories instanceof Array) {
        actAccessories.map(function(a) { a.updateActivityState(currentActivity); });
      }
    }

    // prevent connection from closing
    function keepAliveRefreshLoop() {
      setTimeout(function() {
        setInterval(function() {
          executeOnHub(function(h, cb) {
            plat.log("Refresh Status");
            h.getCurrentActivity()
                .then(function(currentActivity){
                  cb();
                  updateCurrentActivity(currentActivity);
                })
                .catch(cb);
          });
        }, 20000);
      }, 5000);
    }

    function executeOnHub(func, funcMaxTimeout)
    {
      if (!func) return;
      hubQueue.push(function(cb) {
          var tout = setTimeout(function(){
            plat.log("Reconnecting to Hub " + hubIP);
            createClient(hubIP, function(err, newHub){
              if (err) throw err;
              hub = newHub;
              if (funcMaxTimeout) {
                funcMaxTimeout();
              }
              cb();
            });
          }, 30000);
          func(hub, function(){
            clearTimeout(tout);
            cb();
          });
      });
      if (!hubQueue.running){
        hubQueue.start();
      }
    }
  }
};

function LogitechHarmonyActivityAccessory (log, details, changeCurrentActivity) {
  this.log = log;
  this.id = details.id;
  this.name = details.label;
  this.isOn = false;
  this.changeCurrentActivity = changeCurrentActivity;
  Accessory.call(this, this.name, uuid.generate(this.id));
  var self = this;

  this.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "Logitech")
      .setCharacteristic(Characteristic.Model, "Harmony")
      // TODO: Add hub unique id to this for people with multiple hubs so that it is really a guid.
      .setCharacteristic(Characteristic.SerialNumber, this.id);

  this.addService(Service.Switch)
      .getCharacteristic(Characteristic.On)
      .on('get', function(callback) {
        // Refreshed automatically by platform
        callback(null, self.isOn);
      })
      .on('set', this.setPowerState.bind(this));

}
inherits(LogitechHarmonyActivityAccessory, Accessory);
LogitechHarmonyActivityAccessory.prototype.parent = Accessory.prototype;
LogitechHarmonyActivityAccessory.prototype.getServices = function() {
  return this.services;
};

LogitechHarmonyActivityAccessory.prototype.updateActivityState = function (currentActivity) {
  this.isOn = (currentActivity === this.id);
  // Force get to trigger 'change' if needed
  this.getService(Service.Switch)
      .getCharacteristic(Characteristic.On)
      .getValue();
};

LogitechHarmonyActivityAccessory.prototype.setPowerState = function (state, callback) {
  this.changeCurrentActivity(state ? this.id : null, callback);
};

module.exports.platform = LogitechHarmonyPlatform;

