var types = require("HAP-NodeJS/accessories/types.js");
var TellduAPI = require("telldus-live");

function TelldusLivePlatform(log, config) {
    var that = this;
    that.log = log;

    that.isLoggedIn = false;

    // Login to Telldus Live!
    that.cloud = new TellduAPI.TelldusAPI({publicKey: config["public_key"], privateKey: config["private_key"]})
        .login(config["token"], config["token_secret"], function(err, user) {
            if (!!err) that.log("Login error: " + err.message);
            that.log("User logged in: " + user.firstname + " " + user.lastname + ", " + user.email);
            that.isLoggedIn = true;
        }
    );
}

TelldusLivePlatform.prototype = {

    accessories: function(callback) {
        var that = this;

        that.log("Fetching devices...");

        that.cloud.getDevices(function(err, devices) {

            if (!!err) return that.log('getDevices: ' + err.message);

            var foundAccessories = [];

            // Clean non device
            for (var i = 0; i < devices.length; i++) {
                if (devices[i].type != 'device') {
                    devices.splice(i, 1);
                }
            }

            for (var i = 0; i < devices.length; i++) {
                if (devices[i].type === 'device') {
                    TelldusLiveAccessory.create(that.log, devices[i], that.cloud, function(err, accessory) {
                        if (!!err) that.log("Couldn't load device info");
                        foundAccessories.push(accessory);
                        if (foundAccessories.length >= devices.length) {
                            callback(foundAccessories);
                        }
                    });
                }
            }

        });
    }
};

var TelldusLiveAccessory = function TelldusLiveAccessory(log, cloud, device) {

    this.log   = log;
    this.cloud = cloud;

    var m = device.model.split(':');

    // Set accessory info
    this.device         = device;
    this.id             = device.id;
    this.name           = device.name;
    this.manufacturer   = m[1];
    this.model          = m[0];
    this.state          = device.state;
    this.stateValue     = device.stateValue;
    this.status         = device.status;
};

TelldusLiveAccessory.create = function (log, device, cloud, callback) {

    cloud.getDeviceInfo(device, function(err, device) {

        if (!!err) that.log("Couldn't load device info");

        callback(err, new TelldusLiveAccessory(log, cloud, device));
    });
};

TelldusLiveAccessory.prototype = {

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
                    that.cloud.onOffDevice(that.device, true, function(err, result) {
                        if (!!err) that.log("Error: " + err.message);
                        that.cloud.onOffDevice(that.device, false, function(err, result) {
                            if (!!err) that.log("Error: " + err.message);
                            that.cloud.onOffDevice(that.device, true, function(err, result) {
                                if (!!err) that.log("Error: " + err.message);
                                that.cloud.onOffDevice(that.device, false, function(err, result) {
                                    if (!!err) that.log("Error: " + err.message);
                                    that.cloud.onOffDevice(that.device, true, function(err, result) {
                                        if (!!err) that.log("Error: " + err.message);
                                    })
                                })
                            })
                        })
                    })
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
                if (value == 1) {
                    that.cloud.onOffDevice(that.device, value, function(err, result) {
                        if (!!err) {
                            that.log("Error: " + err.message)
                        } else {
                            that.log(that.name + " - Updated power state: " + (value === true ? 'ON' : 'OFF'));
                        }
                    });
                } else {
                    that.cloud.onOffDevice(that.device, value, function(err, result) {
                        if (!!err) {
                            that.log("Error: " + err.message)
                        } else {
                            that.log(that.name + " - Updated power state: " + (value === true ? 'ON' : 'OFF'));
                        }
                    });
                }
            },
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: (that.state != 2 && (that.state === 16 && that.stateValue != "0")) ? 1 : 0,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Change the power state",
            designedMaxLength: 1
        })

        if (that.model === "selflearning-dimmer") {
            cTypes.push({
                cType: types.BRIGHTNESS_CTYPE,
                onUpdate: function (value) {
                    that.cloud.dimDevice(that.device, (255 * (value / 100)), function (err, result) {
                        if (!!err) {
                            that.log("Error: " + err.message);
                        } else {
                            that.log(that.name + " - Updated brightness: " + value);
                        }
                    });
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

module.exports.platform = TelldusLivePlatform;
module.exports.accessory = TelldusLiveAccessory;