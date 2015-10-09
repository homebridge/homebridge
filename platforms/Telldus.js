var types = require("HAP-NodeJS/accessories/types.js");
var telldus = require('telldus');

function TelldusPlatform(log, config) {
    var that = this;
    that.log = log;
}

TelldusPlatform.prototype = {

    accessories: function(callback) {
        var that = this;

        that.log("Fetching devices...");

        var devices = telldus.getDevicesSync();

        that.log("Found " + devices.length + " devices...");

        var foundAccessories = [];

        // Clean non device
        for (var i = 0; i < devices.length; i++) {
            if (devices[i].type != 'DEVICE') {
                devices.splice(i, 1);
            }
        }

        for (var i = 0; i < devices.length; i++) {
            if (devices[i].type === 'DEVICE') {
                TelldusAccessory.create(that.log, devices[i], function(err, accessory) {
                    if (!!err) that.log("Couldn't load device info");
                    foundAccessories.push(accessory);
                    if (foundAccessories.length >= devices.length) {
                        callback(foundAccessories);
                    }
                });
            }
        }
    }
};

var TelldusAccessory = function TelldusAccessory(log, device) {

    this.log   = log;

    var m = device.model.split(':');

    this.dimTimeout = false;

    // Set accessory info
    this.device         = device;
    this.id             = device.id;
    this.name           = device.name;
    this.manufacturer   = "Telldus"; // NOTE: Change this later
    this.model          = device.model;
    this.status         = device.status;
    switch (device.status.name) {
      case 'OFF':
        this.state = 0;
        this.stateValue = 0;
        break;
      case 'ON':
        this.state = 2;
        this.stateValue = 1;
        break;
      case 'DIM':
        this.state = 16;
        this.stateValue = device.status.level;
        break;
    }
};

TelldusAccessory.create = function (log, device, callback) {

    callback(null, new TelldusAccessory(log, device));

};

TelldusAccessory.prototype = {

    dimmerValue: function() {

        if (this.state === 1) {
            return 100;
        }

        if (this.state === 16 && this.stateValue != "unde") {
            return parseInt(this.stateValue * 100 / 255);
        }

        return 0;
    },

    informationCharacteristics: function() {
        var that = this;

        informationCharacteristics = [
            {
                cType: types.NAME_CTYPE,
                onUpdate: null,
                perms: ["pr"],
                format: "string",
                initialValue: that.name,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Name of the accessory",
                designedMaxLength: 255
            },{
                cType: types.MANUFACTURER_CTYPE,
                onUpdate: null,
                perms: ["pr"],
                format: "string",
                initialValue: that.manufacturer,
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
                initialValue: "A1S2NASF88EW",
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "SN",
                designedMaxLength: 255
            },{
                cType: types.IDENTIFY_CTYPE,
                onUpdate: function () {
                    telldus.turnOff(that.id, function(err){
                        if (!!err) that.log("Error: " + err.message);
                        telldus.turnOn(that.id, function(err){
                            if (!!err) that.log("Error: " + err.message);
                            telldus.turnOff(that.id, function(err){
                                if (!!err) that.log("Error: " + err.message);
                                telldus.turnOn(that.id, function(err){
                                    if (!!err) that.log("Error: " + err.message);
                                });
                            });
                        });
                    });
                },
                perms: ["pw"],
                format: "bool",
                initialValue: false,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Identify Accessory",
                designedMaxLength: 1
            }
        ];
        return informationCharacteristics;
    },

    controlCharacteristics: function() {
        var that = this;

        cTypes = [{
            cType: types.NAME_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: that.name,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Name of service",
            designedMaxLength: 255
        }]

        cTypes.push({
            cType: types.POWER_STATE_CTYPE,
            onUpdate: function(value) {
                if (value) {
                    telldus.turnOn(that.id, function(err){
                        if (!!err) {
                            that.log("Error: " + err.message)
                        } else {
                            that.log(that.name + " - Updated power state: ON");
                        }
                    });
                } else {
                    telldus.turnOff(that.id, function(err){
                        if (!!err) {
                            that.log("Error: " + err.message)
                        } else {
                            that.log(that.name + " - Updated power state: OFF");
                        }
                    });
                }
            },
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: (that.state != 2 && (that.state === 16 && that.stateValue != 0)) ? 1 : 0,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Change the power state",
            designedMaxLength: 1
        })

        if (that.model === "selflearning-dimmer") {
            cTypes.push({
                cType: types.BRIGHTNESS_CTYPE,
                onUpdate: function (value) {
                    if (that.dimTimeout) {
                      clearTimeout(that.dimTimeout);
                    }

                    that.dimTimeout = setTimeout(function(){
                        telldus.dim(that.id, (255 * (value / 100)), function(err, result){
                            if (!!err) {
                                that.log("Error: " + err.message);
                            } else {
                                that.log(that.name + " - Updated brightness: " + value);
                            }
                        });
                        that.dimTimeout = false;
                    }, 250);
                },
                perms: ["pw", "pr", "ev"],
                format: "int",
                initialValue: that.dimmerValue(),
                supportEvents: true,
                supportBonjour: false,
                manfDescription: "Adjust Brightness of Light",
                designedMinValue: 0,
                designedMaxValue: 100,
                designedMinStep: 1,
                unit: "%"
            })
        }

        return cTypes
    },

    getServices: function() {

        var services = [
            {
                sType: types.ACCESSORY_INFORMATION_STYPE,
                characteristics: this.informationCharacteristics()
            },
            {
                sType: types.LIGHTBULB_STYPE,
                characteristics: this.controlCharacteristics()
            }
        ];

        return services;
    }
};

module.exports.platform = TelldusPlatform;
module.exports.accessory = TelldusAccessory;
