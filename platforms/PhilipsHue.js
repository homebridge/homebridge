// Philips Hue Platform Shim for HomeBridge
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "PhilipsHue",
//         "name": "Philips Hue",
//         "ip_address": "127.0.0.1",
//         "username": "252deadbeef0bf3f34c7ecb810e832f"
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.
//

/* jslint node: true */
/* globals require: false */
/* globals config: false */

"use strict";

var hue = require("node-hue-api"),
    HueApi = hue.HueApi,
    lightState = hue.lightState;

var types = require("../lib/HAP-NodeJS/accessories/types.js");

function PhilipsHuePlatform(log, config) {
  this.log     = log;
  this.ip_address  = config["ip_address"];
  this.username    = config["username"];
}

function PhilipsHueAccessory(log, device, api) {
  this.id = device.id;
  this.name = device.name;
  this.model = device.modelid;
  this.device = device;
  this.api = api;
  this.log = log;
}

// Execute changes for various characteristics
// @todo Move this into accessory methods
var execute = function(api, device, characteristic, value) {

  var state = lightState.create();

  characteristic = characteristic.toLowerCase();
  if (characteristic === "identify") {
    state.alert('select');
  }
  else if (characteristic === "power") {
    if (value) {
      state.on();
    }
    else {
      state.off();
    }
  }
  else if (characteristic === "hue") {
    value = value * 182.5487; // Convert degrees to 0-65535 range
    value = Math.round(value);
    state.hue(value);
  }
  else if (characteristic === "brightness") {
    state.brightness(value);
  }
  else if (characteristic === "saturation") {
    state.saturation(value);
  }
  api.setLightState(device.id, state, function(err, lights) {
    if (!err) {
      console.log("executed accessory: " + device.name + ", and characteristic: " + characteristic + ", with value: " +  value + ".");
    }
    else {
      console.log(err);
    }
  });
};


// Get the ip address of the first available bridge with meethue.com or a network scan.
var locateBridge = function (callback) {
  // Report the results of the scan to the user
  var getIp = function (err, bridges) {
    if (!bridges || bridges.length === 0) {
      this.log("No Philips Hue bridges found.");
      callback(err || new Error("No bridges found"));
      return;
    }

    if (bridges.length > 1) {
      this.log("Warning: Multiple Philips Hue bridges detected. The first bridge will be used automatically. To use a different bridge set ip_address manually in configuration.");
    }

    this.log(
      "Philips Hue bridges found:",
      bridges.map(function (bridge) {
        // Bridge name is only returned from meethue.com so use id instead if it isn't there
        return '\t' + (bridge.name || bridge.id) + bridge.ipaddress + '\n';
      })
    );

    callback(null, bridges[0].ipaddress);
  };

  // Try to discover the bridge ip using meethue.com
  this.log("Attempting to discover Philips Hue bridge with network scan.");
  api.locateBridges(function (locateError, bridges) {
    if (locateError) {
      this.log("Philips Hue bridge discovery with meethue.com failed. Register your bridge with the meethue.com for more reiable discovery.");

      this.log("Attempting to discover Philips Hue bridge with network scan.");

      api.searchForBridges(function (searchError, bridges) {
        if (err) {
          this.log("Philips Hue bridge discovery with network scan failed. Check your network connection or set ip_address manually in configuration.");
          getIp(new Error("Scan failed"));
        } else {
          getIp(null, bridges);
        }
      });
    } else {
      getIp(null, bridges);
    }
  });
};


PhilipsHuePlatform.prototype = {
  accessories: function(callback) {
    this.log("Fetching Philips Hue lights...");

    var that = this;
    var foundAccessories = [];

    var getLights = function () {
      var api = new HueApi(that.ip_address, that.username);

      // Connect to the API and loop through lights
      api.lights(function(err, response) {
        if (err) throw err;
        response.lights.map(function(device) {
          var accessory = new PhilipsHueAccessory(that.log, device, api);
          foundAccessories.push(accessory);
        });
        callback(foundAccessories);
      });
    };

    // Discover the bridge if needed
    if (!this.ip_address) {
      locateBridge.call(this, function (err, ip_address) {
        // TODO: Find a way to persist this
        that.ip_address = ip_address;
        that.log("Save the Philips Hue bridge ip address "+ ip_address +" to your config to skip discovery.");
        getLights();
      });
    } else {
      getLights();
    }
  }
};

PhilipsHueAccessory.prototype = {
  // Get Services
  getServices: function() {
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
            initialValue: "Philips",
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Manufacturer",
            designedMaxLength: 255
          },{
            cType: types.MODEL_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: this.model,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Model",
            designedMaxLength: 255
          },{
            cType: types.SERIAL_NUMBER_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: this.model + this.id,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "SN",
            designedMaxLength: 255
          },{
            cType: types.IDENTIFY_CTYPE,
            onUpdate: function(value) { console.log("Change:",value); execute(that.api, that.device, "identify", value); },
            perms: ["pw"],
            format: "bool",
            initialValue: false,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Identify Accessory",
            designedMaxLength: 1
          }
        ]
      },{
        sType: types.LIGHTBULB_STYPE,
        characteristics: [
          {
            cType: types.NAME_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: this.name,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Name of service",
            designedMaxLength: 255
          },{
            cType: types.POWER_STATE_CTYPE,
            onUpdate: function(value) { console.log("Change:",value); execute(that.api, that.device, "power", value); },
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: false,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Turn On the Light",
            designedMaxLength: 1
          },{
            cType: types.HUE_CTYPE,
            onUpdate: function(value) { console.log("Change:",value); execute(that.api, that.device, "hue", value); },
            perms: ["pw","pr","ev"],
            format: "int",
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Adjust Hue of Light",
            designedMinValue: 0,
            designedMaxValue: 360,
            designedMinStep: 1,
            unit: "arcdegrees"
          },{
            cType: types.BRIGHTNESS_CTYPE,
            onUpdate: function(value) { console.log("Change:",value); execute(that.api, that.device, "brightness", value); },
            perms: ["pw","pr","ev"],
            format: "int",
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Adjust Brightness of Light",
            designedMinValue: 0,
            designedMaxValue: 100,
            designedMinStep: 1,
            unit: "%"
          },{
            cType: types.SATURATION_CTYPE,
            onUpdate: function(value) { console.log("Change:",value); execute(that.api, that.device, "saturation", value); },
            perms: ["pw","pr","ev"],
            format: "int",
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Adjust Saturation of Light",
            designedMinValue: 0,
            designedMaxValue: 100,
            designedMinStep: 1,
            unit: "%"
          }
        ]
      }
    ];
  }
};

module.exports.platform = PhilipsHuePlatform;
