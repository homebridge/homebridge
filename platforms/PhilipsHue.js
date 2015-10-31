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

var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;


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
    value = value*360;
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
  extractValue: function(characteristic, status) {
    switch(characteristic.toLowerCase()) {
      case 'power':
        return status.state.on  ? 1 : 0;
      case 'hue':
        return this.hueToArcDegrees(status.state.hue);
      case 'brightness':
        return this.bitsToPercentage(status.state.bri);
      case 'saturation':
        return this.bitsToPercentage(status.state.sat);
      default:
        return null;
    }
  },
  // Create and set a light state
  executeChange: function(characteristic, value, callback) {
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
    this.api.setLightState(this.id, state, function(err, lights) {
      if (callback == null) {
        return;
      }
      if (!err) {
      	if (callback) callback(); // Success
      	callback = null;
        this.log("Set " + this.device.name + ", characteristic: " + characteristic + ", value: " + value + ".");
      }
      else {
        if (err.code == "ECONNRESET") {
          setTimeout(function() {
            this.executeChange(characteristic, value, callback);
          }.bind(this), 300);
        } else {
          this.log(err);
          callback(new Error(err));
        }
      }
    }.bind(this));
  },
  // Read light state
  // TODO: implement clever polling/update and caching
  //       maybe a better NodeJS hue API exists for this
  getState: function(characteristic, callback) {
    this.api.lightStatus(this.id, function(err, status) {
      if (callback == null) {
      	return;
      }
      
      if (err) {
        if (err.code == "ECONNRESET") {
          setTimeout(function() {
            this.getState(characteristic, callback);
          }.bind(this), 300);
        } else {
          this.log(err);
          callback(new Error(err));
        }
      }
      
      else {
        var newValue = this.extractValue(characteristic, status);
        if (newValue != undefined) {
          callback(null, newValue);
        } else {
          //  this.log("Device " + that.device.name + " does not support reading characteristic " + characteristic);
          //  callback(Error("Device " + that.device.name + " does not support reading characteristic " + characteristic) );
        }

        callback = null;
		
        //this.log("Get " + that.device.name + ", characteristic: " + characteristic + ", value: " + value + ".");
      }
    }.bind(this));
  },
  
  // Respond to identify request
  identify: function(callback) { 
  	this.executeChange("identify", true, callback); 
  },

  // Get Services
  getServices: function() {
    var that = this;
    
    // Use HomeKit types defined in HAP node JS
	var lightbulbService = new Service.Lightbulb(this.name);

	// Basic light controls, common to Hue and Hue lux
	lightbulbService
	.getCharacteristic(Characteristic.On)
	.on('get', function(callback) { that.getState("power", callback);})
	.on('set', function(value, callback) { that.executeChange("power", value, callback);})
    .value = this.extractValue("power", this.device);

	lightbulbService
	.addCharacteristic(Characteristic.Brightness)
	.on('get', function(callback) { that.getState("brightness", callback);})
	.on('set', function(value, callback) { that.executeChange("brightness", value, callback);})
    .value = this.extractValue("brightness", this.device);

	// Handle the Hue/Hue Lux divergence
	if (this.device.state.hasOwnProperty('hue') && this.device.state.hasOwnProperty('sat')) {
		lightbulbService
		.addCharacteristic(Characteristic.Hue)
		.on('get', function(callback) { that.getState("hue", callback);})
		.on('set', function(value, callback) { that.executeChange("hue", value, callback);})
        .value = this.extractValue("hue", this.device);

		lightbulbService
		.addCharacteristic(Characteristic.Saturation)
		.on('get', function(callback) { that.getState("saturation", callback);})
		.on('set', function(value, callback) { that.executeChange("saturation", value, callback);})
        .value = this.extractValue("saturation", this.device);
	}

	var informationService = new Service.AccessoryInformation();

	informationService
		.setCharacteristic(Characteristic.Manufacturer, "Philips")
		.setCharacteristic(Characteristic.Model, this.model)
		.setCharacteristic(Characteristic.SerialNumber, this.device.uniqueid)
		.addCharacteristic(Characteristic.FirmwareRevision, this.device.swversion);

	return [informationService, lightbulbService];
  }
};

module.exports.platform = PhilipsHuePlatform;
