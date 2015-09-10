var types = require("HAP-NodeJS/accessories/types.js");
var lifxObj = require('lifx-api');
var lifx;

function LIFxPlatform(log, config){

  // auth info
  this.access_token = config["access_token"];

  lifx = new lifxObj(this.access_token);

  this.log = log;
}

LIFxPlatform.prototype = {
    accessories: function(callback) {
        this.log("Fetching LIFx devices.");

        var that = this;
        var foundAccessories = [];

        lifx.listLights("all", function(body) {
            var bulbs = JSON.parse(body);

            for(var i = 0; i < bulbs.length; i ++) {
                var bulb = bulbs[i];
                var accessory = new LIFxBulbAccessory(
                    that.log,
                    bulb.label,
                    bulb.uuid,
                    bulb.model,
                    bulb.id
                );
                foundAccessories.push(accessory);
            }
            callback(foundAccessories)
        });
    }
}

function LIFxBulbAccessory(log, label, serial, model, deviceId) {
  // device info
  this.name = label;
  this.model = model;
  this.deviceId = deviceId;
  this.serial = serial;
  this.log = log;
}

LIFxBulbAccessory.prototype = {
    getPower: function(callback){
        var that = this;

        lifx.listLights("all", function(body) {
            var bulbs = JSON.parse(body);

            for(var i = 0; i < bulbs.length; i ++) {
                var bulb = bulbs[i];

              if(bulb.deviceId == that.deviceId) {
                  return bulb.state;
              }
            }
            return "off";
        });

        nest.fetchStatus(function (data) {
          var device = data.shared[that.deviceId];
          that.log("Target temperature for " + this.name + " is: " + device.target_temperature);
          callback(device.target_temperature);
        });
    },
    setPower: function(state){
        var that = this;
        this.log("Setting power state for heating cooling for " + this.name + " to: " + targetTemperatureType);
        lifx.setPower("all", state, 1, function (body) {
            this.log("body");
        });
    },

    getServices: function() {
        var that = this;
        var chars= [{
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
                initialValue: "LIFx",
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
                initialValue: this.serial,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "SN",
                designedMaxLength: 255
            },{
                cType: types.IDENTIFY_CTYPE,
                onUpdate: null,
                perms: ["pw"],
                format: "bool",
                initialValue: true,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Identify Accessory",
                designedMaxLength: 1
            }]
        }, {
            sType: types.LIGHTBULB_STYPE,
            characteristics: [{
                cType: types.NAME_CTYPE,
                onUpdate: null,
                perms: ["pr"],
                format: "string",
                initialValue: this.name,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Name of LIFx bulb",
                designedMaxLength: 255
            }, {
                cType: types.POWER_STATE_CTYPE,
                onUpdate: function (value) {
                  that.setPower(value);
                },
                onRead: function (callback) {
                  that.getPower(function (state) {
                    callback(state);
                  });
                },
                perms: ["pw", "pr", "ev"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Power state",
                designedMinValue: 0,
                designedMaxValue: 1,
                designedMinStep: 1
            }]
        }];
        return chars;
    }
}

module.exports.accessory = LIFxBulbAccessory;
module.exports.platform = LIFxPlatform;
