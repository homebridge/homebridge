'use strict';

// LiFX Platform Shim for HomeBridge
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "LIFx",             // required
//         "name": "LIFx",                 // required
//         "access_token": "access token", // required
//         "use_lan": "true"               // optional set to "true" (gets and sets over the lan) or "get" (gets only over the lan)
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.
//

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var lifxRemoteObj = require('lifx-api');
var lifx_remote;

var lifxLanObj;
var lifx_lan;
var use_lan;

function LIFxPlatform(log, config){
    // auth info
    this.access_token = config["access_token"];

    lifx_remote = new lifxRemoteObj(this.access_token);

    // use remote or lan api ?
    use_lan = config["use_lan"] || false;

    if (use_lan != false) {
        lifxLanObj = require('lifx');
        lifx_lan = lifxLanObj.init();
    }

    this.log = log;
}

LIFxPlatform.prototype = {
    accessories: function(callback) {
        this.log("Fetching LIFx devices.");

        var that = this;
        var foundAccessories = [];

        lifx_remote.listLights("all", function(body) {
            var bulbs = JSON.parse(body);

            for(var i = 0; i < bulbs.length; i ++) {
                var accessory = new LIFxBulbAccessory(that.log, bulbs[i]);
                foundAccessories.push(accessory);
            }
            callback(foundAccessories)
        });
    }
}

function LIFxBulbAccessory(log, bulb) {
    // device info
    this.name = bulb.label;
    this.model = bulb.product_name;
    this.deviceId = bulb.id;
    this.serial = bulb.uuid;
    this.capabilities = bulb.capabilities;
    this.log = log;
}

LIFxBulbAccessory.prototype = {
    getLan: function(type, callback){
        var that = this;

        if (!lifx_lan.bulbs[this.deviceId]) {
            callback(new Error("Device not found"), false);
            return;
        }

        lifx_lan.requestStatus();
        lifx_lan.on('bulbstate', function(bulb) {
            if (callback == null) {
                return;
            }

            if (bulb.addr.toString('hex') == that.deviceId) {
                switch(type) {
                    case "power":
                        callback(null, bulb.state.power > 0);
                        break;
                    case "brightness":
                        callback(null, Math.round(bulb.state.brightness * 100 / 65535));
                        break;
                    case "hue":
                        callback(null, Math.round(bulb.state.hue * 360 / 65535));
                        break;
                    case "saturation":
                        callback(null, Math.round(bulb.state.saturation * 100 / 65535));
                        break;
                }

                callback = null
            }
        });
    },
    getRemote: function(type, callback){
        var that = this;

        lifx_remote.listLights("id:"+ that.deviceId, function(body) {
            var bulb = JSON.parse(body);

            if (bulb.connected != true) {
                callback(new Error("Device not found"), false);
                return;
            }

            switch(type) {
                case "power":
                    callback(null, bulb.power == "on" ? 1 : 0);
                    break;
                case "brightness":
                    callback(null, Math.round(bulb.brightness * 100));
                    break;
                case "hue":
                    callback(null, bulb.color.hue);
                    break;
                case "saturation":
                    callback(null, Math.round(bulb.color.saturation * 100));
                    break;
            }
        });
    },
    identify: function(callback) {
        lifx_remote.breatheEffect("id:"+ this.deviceId, 'green', null, 1, 3, false, true, 0.5, function (body) {
            callback();
        });
    },
    setLanColor: function(type, value, callback){
        var bulb = lifx_lan.bulbs[this.deviceId];

        if (!bulb) {
            callback(new Error("Device not found"), false);
            return;
        }

        var state = {
            hue: bulb.state.hue,
            saturation: bulb.state.saturation,
            brightness: bulb.state.brightness,
            kelvin: bulb.state.kelvin
        };

        var scale = type == "hue" ? 360 : 100;

        state[type] = Math.round(value * 65535 / scale) & 0xffff;
        lifx_lan.lightsColour(state.hue, state.saturation, state.brightness, state.kelvin, 0, bulb);

        callback(null);
    },
    setLanPower: function(state, callback){
        var bulb = lifx_lan.bulbs[this.deviceId];

        if (!bulb) {
            callback(new Error("Device not found"), false);
            return;
        }

        if (state) {
            lifx_lan.lightsOn(bulb);
        }
        else {
            lifx_lan.lightsOff(bulb);
        }

        callback(null);
    },
    setRemoteColor: function(type, value, callback){
        var color;

        switch(type) {
            case "brightness":
                color = "brightness:" + (value / 100);
                break;
            case "hue":
                color = "hue:" + value;
                break;
            case "saturation":
                color = "saturation:" + (value / 100);
                break;
        }

        lifx_remote.setColor("id:"+ this.deviceId, color, 0, null, function (body) {
            callback();
        });
    },
    setRemotePower: function(state, callback){
        var that = this;

        lifx_remote.setPower("id:"+ that.deviceId, (state == 1 ? "on" : "off"), 0, function (body) {
            callback();
        });
    },
    getServices: function() {
        var that = this;
        var services = []
        var service = new Service.Lightbulb(this.name);

        switch(use_lan) {
            case true:
            case "true":
                // gets and sets over the lan api
                service
                .getCharacteristic(Characteristic.On)
                .on('get', function(callback) { that.getLan("power", callback);})
                .on('set', function(value, callback) {that.setLanPower(value, callback);});

                service
                .addCharacteristic(Characteristic.Brightness)
                .on('get', function(callback) { that.getLan("brightness", callback);})
                .on('set', function(value, callback) { that.setLanColor("brightness", value, callback);});

                if (this.capabilities.has_color == true) {
                    service
                    .addCharacteristic(Characteristic.Hue)
                    .on('get', function(callback) { that.getLan("hue", callback);})
                    .on('set', function(value, callback) { that.setLanColor("hue", value, callback);});

                    service
                    .addCharacteristic(Characteristic.Saturation)
                    .on('get', function(callback) { that.getLan("saturation", callback);})
                    .on('set', function(value, callback) { that.setLanColor("saturation", value, callback);});
                }
                break;
            case "get":
                // gets over the lan api, sets over the remote api
                service
                .getCharacteristic(Characteristic.On)
                .on('get', function(callback) { that.getLan("power", callback);})
                .on('set', function(value, callback) {that.setRemotePower(value, callback);});

                service
                .addCharacteristic(Characteristic.Brightness)
                .on('get', function(callback) { that.getLan("brightness", callback);})
                .on('set', function(value, callback) { that.setRemoteColor("brightness", value, callback);});

                if (this.capabilities.has_color == true) {
                    service
                    .addCharacteristic(Characteristic.Hue)
                    .on('get', function(callback) { that.getLan("hue", callback);})
                    .on('set', function(value, callback) { that.setRemoteColor("hue", value, callback);});

                    service
                    .addCharacteristic(Characteristic.Saturation)
                    .on('get', function(callback) { that.getLan("saturation", callback);})
                    .on('set', function(value, callback) { that.setRemoteColor("saturation", value, callback);});
                }
                break;
            default:
                // gets and sets over the remote api
                service
                .getCharacteristic(Characteristic.On)
                .on('get', function(callback) { that.getRemote("power", callback);})
                .on('set', function(value, callback) {that.setRemotePower(value, callback);});

                service
                .addCharacteristic(Characteristic.Brightness)
                .on('get', function(callback) { that.getRemote("brightness", callback);})
                .on('set', function(value, callback) { that.setRemoteColor("brightness", value, callback);});

                if (this.capabilities.has_color == true) {
                    service
                    .addCharacteristic(Characteristic.Hue)
                    .on('get', function(callback) { that.getRemote("hue", callback);})
                    .on('set', function(value, callback) { that.setRemoteColor("hue", value, callback);});

                    service
                    .addCharacteristic(Characteristic.Saturation)
                    .on('get', function(callback) { that.getRemote("saturation", callback);})
                    .on('set', function(value, callback) { that.setRemoteColor("saturation", value, callback);});
                }
        }

        services.push(service);

        service = new Service.AccessoryInformation();

        service
            .setCharacteristic(Characteristic.Manufacturer, "LIFX")
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);

        services.push(service);

        return services;
    }
}

module.exports.accessory = LIFxBulbAccessory;
module.exports.platform = LIFxPlatform;
