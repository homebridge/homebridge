var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
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
    get: function(type, callback){
        var that = this;

        lifx.listLights("id:"+ that.deviceId, function(body) {
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
        var that = this;

        lifx.breatheEffect("id:"+ that.deviceId, 'green', null, 1, 3, false, true, 0.5, function (body) {
            callback();
        });
    },
    setColor: function(type, state, callback){
        var that = this;
        var color;

        switch(type) {
            case "brightness":
                color = "brightness:" + (state / 100);
                break;
            case "hue":
                color = "hue:" + state;
                break;
            case "saturation":
                color = "saturation:" + (state / 100);
                break;
        }

        lifx.setColor("id:"+ that.deviceId, color, 0, null, function (body) {
            callback();
        });
    },
    setPower: function(state, callback){
        var that = this;

        lifx.setPower("id:"+ that.deviceId, (state == 1 ? "on" : "off"), 0, function (body) {
            callback();
        });
    },

    getServices: function() {
        var that = this;
        var services = []
        var service = new Service.Lightbulb(this.name);

        service
        .getCharacteristic(Characteristic.On)
        .on('identify', function(callback) {})
        .on('get', function(callback) { that.get("power", callback);})
        .on('set', function(value, callback) {that.setPower(value, callback);});

        service
        .addCharacteristic(Characteristic.Brightness)
        .on('get', function(callback) { that.get("brightness", callback);})
        .on('set', function(value, callback) { that.setColor("brightness", value, callback);});

        if (this.capabilities.has_color == true) {
            service
            .addCharacteristic(Characteristic.Hue)
            .on('get', function(callback) { that.get("hue", callback);})
            .on('set', function(value, callback) { that.setColor("hue", value, callback);});

            service
            .addCharacteristic(Characteristic.Saturation)
            .on('get', function(callback) { that.get("saturation", callback);})
            .on('set', function(value, callback) { that.setColor("saturation", value, callback);});
        }

        services.push(service);

        service = new Service.AccessoryInformation();

        service
            .setCharacteristic(Characteristic.Manufacturer, "LiFX")
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);

        services.push(service);

        return services;
    }
}

module.exports.accessory = LIFxBulbAccessory;
module.exports.platform = LIFxPlatform;
