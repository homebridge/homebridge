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

var types = require("../lib/HAP-NodeJS/accessories/types.js");

function PhilipsHuePlatform(log, config) {
  this.log     = log;
  this.ip_address  = config["ip_address"];
  this.username    = config["username"];
}

function PhilipsHueAccessory(log, accessoryName, philipsHueLightID, model, philipsHueLightNumber) {
  return {
    displayName: accessoryName,
    username: philipsHueLightID,
    pincode: '031-45-154',
    services: [{
      sType: types.ACCESSORY_INFORMATION_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
      format: "string",
      initialValue: accessoryName,
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
      initialValue: model,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "Model",
      designedMaxLength: 255
      },{
        cType: types.IDENTIFY_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(accessoryName, philipsHueLightNumber, "identify", value); },
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
      initialValue: accessoryName,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "Name of service",
      designedMaxLength: 255
      },{
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(accessoryName, philipsHueLightNumber, "on", value); },
        perms: ["pw","pr","ev"],
      format: "bool",
      initialValue: false,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "Turn On the Light",
      designedMaxLength: 1
      },{
        cType: types.HUE_CTYPE,
        onUpdate: function(value) { console.log("Change:",value); execute(accessoryName, philipsHueLightNumber, "hue", value); },
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
        onUpdate: function(value) { console.log("Change:",value); execute(accessoryName, philipsHueLightNumber, "brightness", value); },
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
        onUpdate: function(value) { console.log("Change:",value); execute(accessoryName, philipsHueLightNumber, "saturation", value); },
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
    }]
  };
}

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

    var HueApi = require("node-hue-api").HueApi;
    var api = new HueApi(this.ip_address, this.username);

    // Connect to the API and loop through lights
    api.lights(function(err, response) {
      response.lights.map(function(s) {
        var accessory = new PhilipsHueAccessory(that.log, s.name, s.uniqueid, s.modelid, s.id);
        foundAccessories.push(accessory);
      });
      callback(foundAccessories);
    });
  }
};

module.exports.platform = PhilipsHuePlatform;
