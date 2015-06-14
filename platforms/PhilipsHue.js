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
  // device info
  this.name = device.name;
  this.model = device.modelid;
  this.device = device;
  this.api = api;
  this.log = log;
}

// @todo Use the node module for all of this
var execute = function(accessory, lightID, characteristic, value) {
  var http = require('http');
  var body = {};
  characteristic = characteristic.toLowerCase();
  if(characteristic === "identify") {
    body = {alert:"select"};
  } else if(characteristic === "on") {
    body = {on:value};
  } else if(characteristic === "hue") {
    body = {hue:value};
  } else  if(characteristic === "brightness") {
    value = value/100;
    value = value*255;
    value = Math.round(value);
    body = {bri:value};
  } else if(characteristic === "saturation") {
    value = value/100;
    value = value*255;
    value = Math.round(value);
    body = {sat:value};
  }
  var post_data = JSON.stringify(body);
  var post_options = {
    host: config["ip_address"],
    port: '80',
    path: '/api/' + config["username"] + '/lights/' + lightID + '/state/',
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': post_data.length
    }
  };
  var post_req = http.request(post_options, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
        console.log('Response: ' + chunk);
    });
  });
  post_req.write(post_data);
  post_req.end();
  console.log("executed accessory: " + accessory + ", and characteristic: " + characteristic + ", with value: " +  value + ".");
};

PhilipsHuePlatform.prototype = {
  accessories: function(callback) {
    this.log("Fetching Philips Hue lights...");

    var that = this;
    var foundAccessories = [];

    var api = new HueApi(this.ip_address, this.username);

    // Connect to the API and loop through lights
    api.lights(function(err, response) {
      if (err) throw err;
      response.lights.map(function(device) {
        var accessory = new PhilipsHueAccessory(that.log, device, api);
        foundAccessories.push(accessory);
      });
      callback(foundAccessories);
    });
  }
};

PhilipsHueAccessory.prototype = {

  setPowerState: function(powerOn) {
    if (!this.device) {
      this.log("No '"+this.name+"' device found (yet?)");
      return;
    }

    var that = this;
    var state;

    if (powerOn) {
      this.log("Setting power state on the '"+this.name+"' to off");
      state = lightState.create().on();
      that.api.setLightState(that.id, state, function(err, result) {
        if (err) {
          that.log("Error setting power state on for '"+that.name+"'");
        } else {
          that.log("Successfully set power state on for '"+that.name+"'");
        }
      });
    }else{
      this.log("Setting power state on the '"+this.name+"' to off");
      state = lightState.create().off();
      that.api.setLightState(that.id, state, function(err, result) {
        if (err) {
          that.log("Error setting power state off for '"+that.name+"'");
        } else {
          that.log("Successfully set power state off for '"+that.name+"'");
        }
      });
    }
  },

  setBrightness: function(level) {
    if (!this.device) {
      this.log("No '"+this.name+"' device found (yet?)");
      return;
    }

    var that = this;

    this.log("Setting brightness on the '"+this.name+"' to " + level);
    this.device.brightness(level, function(response) {
      if (response === undefined) {
        that.log("Error setting brightness on the '"+that.name+"'");
      } else {
        that.log("Successfully set brightness on the '"+that.name+"' to " + level);
      }
    });
  },

  getServices: function() {
    var that = this;
    return [{
      sType: types.ACCESSORY_INFORMATION_STYPE,
      characteristics: [{
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
        cType: types.IDENTIFY_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(this.name, this.id, "identify", value); },
        perms: ["pw"],
      format: "bool",
      initialValue: false,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "Identify Accessory",
      designedMaxLength: 1
      }]
    },{
      sType: types.LIGHTBULB_STYPE,
      characteristics: [{
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
        onUpdate: function(value) { console.log("Change:",value); execute(this.name, this.id, "on", value); },
        perms: ["pw","pr","ev"],
      format: "bool",
      initialValue: false,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "Turn On the Light",
      designedMaxLength: 1
      },{
        cType: types.HUE_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(this.name, this.id, "hue", value); },
        perms: ["pw","pr","ev"],
      format: "int",
      initialValue: 0,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "Adjust Hue of Light",
      designedMinValue: 0,
      designedMaxValue: 65535,
      designedMinStep: 1,
      unit: "arcdegrees"
      },{
        cType: types.BRIGHTNESS_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(this.name, this.id, "brightness", value); },
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
        onUpdate: function(value) { console.log("Change:",value); execute(this.name, this.id, "saturation", value); },
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
      }]
    }];
  }
};

module.exports.platform = PhilipsHuePlatform;
