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
// If you do not know the IP address of your Hue Bridge, simply leave it blank and your Bridge
// will be discovered automatically.
//
// If you do not have a "username" for your Hue API already, simply leave the field blank and
// you will be prompted to press the link button on your Hue Bridge before running HomeBridge.
// A username will be created for you and printed out, then the server will exit so you may
// enter it in your config.json.
//
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

var types = require("HAP-NodeJS/accessories/types.js");

function PhilipsHuePlatform(log, config) {
  this.log = log;
  this.ip_address = config["ip_address"];
  this.username = config["username"];
}

function PhilipsHueAccessory(log, device, api) {
  this.id = device.id;
  this.name = device.name;
  this.model = device.modelid;
  this.device = device;
  this.api = api;
  this.log = log;
}

// Get the ip address of the first available bridge with meethue.com or a network scan.
var locateBridge = function (callback) {
  var that = this;

  // Report the results of the scan to the user
  var getIp = function (err, bridges) {
    if (!bridges || bridges.length === 0) {
      that.log("No Philips Hue bridges found.");
      callback(err || new Error("No bridges found"));
      return;
    }

    if (bridges.length > 1) {
      that.log("Warning: Multiple Philips Hue bridges detected. The first bridge will be used automatically. To use a different bridge, set the `ip_address` manually in the configuration.");
    }

    that.log(
      "Philips Hue bridges found:\n" +
      (bridges.map(function (bridge) {
        // Bridge name is only returned from meethue.com so use id instead if it isn't there
        return "\t" + bridge.ipaddress + ' - ' + (bridge.name || bridge.id);
      })).join("\n")
    );

    callback(null, bridges[0].ipaddress);
  };

  // Try to discover the bridge ip using meethue.com
  that.log("Attempting to discover Philips Hue bridge with meethue.com...");
  hue.nupnpSearch(function (locateError, bridges) {
    if (locateError) {
      that.log("Philips Hue bridge discovery with meethue.com failed. Register your bridge with the meethue.com for more reliable discovery.");

      that.log("Attempting to discover Philips Hue bridge with network scan...");

      // Timeout after one minute
      hue.upnpSearch(60000)
        .then(function (bridges) {
          that.log("Scan complete");
          getIp(null, bridges);
        })
        .fail(function (scanError) {
          that.log("Philips Hue bridge discovery with network scan failed. Check your network connection or set ip_address manually in configuration.");
          getIp(new Error("Scan failed: " + scanError.message));
        }).done();
    } else {
      getIp(null, bridges);
    }
  });
};

PhilipsHuePlatform.prototype = {

  accessories: function(callback) {
    this.log("Fetching Philips Hue lights...");
    var that = this;
    var getLights = function () {
      var api = new HueApi(that.ip_address, that.username);

      // Connect to the API
      // Get a dump of all lights, so as not to hit rate limiting for installations with larger amounts of bulbs

      api.fullState(function(err, response) {
        if (err) throw err;

        var foundAccessories = [];
        for (var deviceId in response.lights) {
          var device = response.lights[deviceId];
          device.id = deviceId;
          var accessory = new PhilipsHueAccessory(that.log, device, api);
          foundAccessories.push(accessory);
        }
        callback(foundAccessories);

      });
    };

    // Create a new user if needed
    function checkUsername() {
      if (!that.username) {
        var api = new HueApi(that.ip_address);
        api.createUser(that.ip_address, null, null, function(err, user) {
          
          // try and help explain this particular error
          if (err && err.message == "link button not pressed")
            throw "Please press the link button on your Philips Hue bridge, then start the HomeBridge server within 30 seconds.";
          
          if (err) throw err;
            
          throw "Created a new username " + JSON.stringify(user) + " for your Philips Hue. Please add it to your config.json then start the HomeBridge server again: ";
        });
      }
      else {
        getLights();
      }
    }

    // Discover the bridge if needed
    if (!this.ip_address) {
      locateBridge.call(this, function (err, ip_address) {
        if (err) throw err;

        // TODO: Find a way to persist this
        that.ip_address = ip_address;
        that.log("Save the Philips Hue bridge ip address "+ ip_address +" to your config to skip discovery.");
        checkUsername();
      });
    } else {
      checkUsername();
    }
  }
};

PhilipsHueAccessory.prototype = {
  // Convert 0-65535 to 0-360
  hueToArcDegrees: function(value) {
    value = value/65535;
    value = value*100;
    value = Math.round(value);
    return value;
  },
  // Convert 0-360 to 0-65535
  arcDegreesToHue: function(value) {
    value = value/360;
    value = value*65535;
    value = Math.round(value);
    return value;
  },
  // Convert 0-255 to 0-100
  bitsToPercentage: function(value) {
    value = value/255;
    value = value*100;
    value = Math.round(value);
    return value;
  },
  // Create and set a light state
  executeChange: function(api, device, characteristic, value) {
    var that = this;
    var state = lightState.create();
    switch(characteristic.toLowerCase()) {
      case 'identify':
        state.alert('select');
        break;
      case 'power':
        if (value) {
          state.on();
        }
        else {
          state.off();
        }
        break;
      case 'hue':
        state.hue(this.arcDegreesToHue(value));
        break;
      case 'brightness':
        state.brightness(value);
        break;
      case 'saturation':
        state.saturation(value);
        break;
    }
    api.setLightState(device.id, state, function(err, lights) {
      if (!err) {
        that.log(device.name + ", characteristic: " + characteristic + ", value: " + value + ".");
      }
      else {
        that.log(err);
      }
    });
  },
  // Get Services
  getServices: function() {
    var that = this;
    var bulb_characteristics = [
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
        onUpdate: function(value) {
          that.executeChange(that.api, that.device, "power", value);
        },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: that.device.state.on,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Turn On the Light",
        designedMaxLength: 1
      },{
        cType: types.BRIGHTNESS_CTYPE,
        onUpdate: function(value) {
          that.executeChange(that.api, that.device, "brightness", value);
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue: that.bitsToPercentage(that.device.state.bri),
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Adjust Brightness of Light",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      }
    ];
    // Handle the Hue/Hue Lux divergence
    if (that.device.state.hasOwnProperty('hue') && that.device.state.hasOwnProperty('sat')) {
      bulb_characteristics.push({
        cType: types.HUE_CTYPE,
        onUpdate: function(value) {
          that.executeChange(that.api, that.device, "hue", value);
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue: that.hueToArcDegrees(that.device.state.hue),
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Adjust Hue of Light",
        designedMinValue: 0,
        designedMaxValue: 360,
        designedMinStep: 1,
        unit: "arcdegrees"
      });
      bulb_characteristics.push({
        cType: types.SATURATION_CTYPE,
        onUpdate: function(value) {
          that.executeChange(that.api, that.device, "saturation", value);
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue: that.bitsToPercentage(that.device.state.sat),
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Adjust Saturation of Light",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      });
    }
    var accessory_data = [
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
            initialValue: that.model,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Model",
            designedMaxLength: 255
          },{
            cType: types.SERIAL_NUMBER_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: that.device.uniqueid,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "SN",
            designedMaxLength: 255
          },{
            cType: types.IDENTIFY_CTYPE,
            onUpdate: function(value) {
              that.executeChange(that.api, that.device, "identify", value);
            },
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
        // `bulb_characteristics` defined based on bulb type
        characteristics: bulb_characteristics
      }
    ];
    return accessory_data;
  }
};

module.exports.platform = PhilipsHuePlatform;
