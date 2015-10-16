// Indigo Platform Shim for HomeBridge
// Written by Mike Riccio (https://github.com/webdeck)
// Based on many of the other HomeBridge plartform modules
// See http://www.indigodomo.com/ for more info on Indigo
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "Indigo",            // required
//         "name": "Indigo",                // required
//         "host": "127.0.0.1",             // required
//         "port": "8176",                  // required
//         "username": "username",          // optional
//         "password": "password"           // optional
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.
//

var types = require("HAP-NodeJS/accessories/types.js");
var Characteristic = require("HAP-NodeJS").Characteristic;
var request = require('request');
var async = require('async');


function IndigoPlatform(log, config) {
    this.log = log;

    this.baseURL = "http://" + config["host"] + ":" + config["port"];

    if (config["username"] && config["password"]) {
        this.auth = {
            'user': config["username"],
            'pass': config["password"],
            'sendImmediately': false
        };
    }
}

IndigoPlatform.prototype = {
    accessories: function(callback) {   
        var that = this;
        this.log("Discovering Indigo Devices.");

        var options = {
            url: this.baseURL + "/devices.json/",
            method: 'GET'
        };
        if (this.auth) {
            options['auth'] = this.auth;
        }
        this.foundAccessories = [];
        this.callback = callback;

        request(options, function(error, response, body) {
            if (error) {
                console.trace("Requesting Indigo devices.");
                that.log(error);
                return error;
            }

            // Cheesy hack because response may have an extra comma at the start of the array, which is invalid
            var firstComma = body.indexOf(",");
            if (firstComma < 10) {
                body = "[" + body.substr(firstComma + 1);
            }

            var json = JSON.parse(body);
            async.each(json, function(item, asyncCallback) {
                var deviceURL = that.baseURL + item.restURL;
                var deviceOptions = {
                  url: deviceURL,
                  method: 'GET'
                };
                if (that.auth) {
                    deviceOptions['auth'] = that.auth;
                }

                request(deviceOptions, function(deviceError, deviceResponse, deviceBody) {
                    if (deviceError) {
                        console.trace("Requesting Indigo device info: " + deviceURL + "\nError: " + deviceError + "\nResponse: " + deviceBody);
                        asyncCallback(deviceError)
                    }
                    else {
                        var deviceJson = JSON.parse(deviceBody);
                        that.log("Discovered " + deviceJson.type + ": " + deviceJson.name);
                        that.foundAccessories.push(
                            new IndigoAccessory(that.log, that.auth, deviceURL, deviceJson));
                        asyncCallback();
                    }
                });
            }, function(asyncError) {
                // This will be called after all the requests complete
                if (asyncError) {
                    console.trace("Requesting Indigo device info.");
                    that.log(asyncError);
                } else {
                    that.callback(that.foundAccessories.sort(function (a,b) {
                        return (a.name > b.name) - (a.name < b.name);
                    }));
                }
            });
        });
    }
}


function IndigoAccessory(log, auth, deviceURL, json) {
    this.log = log;
    this.auth = auth;
    this.deviceURL = deviceURL;

    for (var prop in json) {
        if (json.hasOwnProperty(prop)) {
            this[prop] = json[prop];
        }
    }
}

IndigoAccessory.prototype = {
    getStatus: function(callback) {
        var that = this;

        var options = {
            url: this.deviceURL,
            method: 'GET'
        };
        if (this.auth) {
            options['auth'] = this.auth;
        }

        request(options, function(error, response, body) {
            if (error) {
                console.trace("Requesting Device Status.");
                that.log(error);
                return error;
            }

            that.log("getStatus of " + that.name + ": " + body);
            callback(JSON.parse(body));
        });
    },

    updateStatus: function(params) {
        var that = this;
        var options = {
            url: this.deviceURL + "?" + params,
            method: 'PUT'
        };
        if (this.auth) {
            options['auth'] = this.auth;
        }

        this.log("updateStatus of " + that.name + ": " + params);
        request(options, function(error, response, body) {
            if (error) {
                console.trace("Updating Device Status.");
                that.log(error);
                return error;
            }
        });
    },

    query: function(prop, callback) {
        this.getStatus(function(json) {
            callback(json[prop]);
        });
    },

    turnOn: function() {
        if (this.typeSupportsOnOff) {
            this.updateStatus("isOn=1");
        }
    },
    
    turnOff: function() {
        if (this.typeSupportsOnOff) {
            this.updateStatus("isOn=0");
        }
    },

    setBrightness: function(brightness) {
        if (this.typeSupportsDim && brightness >= 0 && brightness <= 100) {
            this.updateStatus("brightness=" + brightness);
        }
    },
    
    setSpeedIndex: function(speedIndex) {
        if (this.typeSupportsSpeedControl && speedIndex >= 0 && speedIndex <= 3) {
            this.updateStatus("speedIndex=" + speedIndex);
        }
    },
    
    getCurrentHeatingCooling: function(callback) {
        this.getStatus(function(json) {
            var mode = 0;
            if (json["hvacOperatonModeIsHeat"]) {
                mode = 1;
            }
            else if (json["hvacOperationModeIsCool"]) {
                mode = 2;
            }
            else if (json["hvacOperationModeIsAuto"]) {
                mode = 3;
            }
            callback(mode);
        });
    },

    setTargetHeatingCooling: function(mode) {
        if (mode == 0) {
            param = "Off";
        }
        else if (mode == 1) {
            param = "Heat";
        }
        else if (mode == 2) {
            param = "Cool";
        }
        else if (mode == 3) {
            param = "Auto";
        }

        if (param) {
            this.updateStatus("hvacOperationModeIs" + param + "=true");
        }
    },

    // Note: HomeKit wants all temperature values to be in celsius
    getCurrentTemperature: function(callback) {
        this.query("displayRawState", function(temperature) {
            callback((temperature - 32.0) * 5.0 / 9.0);
        });
    },

    getTargetTemperature: function(callback) {
        this.getStatus(function(json) {
            var temperature;
            if (json["hvacOperatonModeIsHeat"]) {
                temperature = json["setpointHeat"];
            }
            else if (json["hvacOperationModeIsCool"]) {
                temperature = json["setpointCool"];
            }
            else {
                temperature = (json["setpointHeat"] + json["setpointCool"]) / 2.0;
            }
            callback((temperature - 32.0) * 5.0 / 9.0);
        });
    },

    setTargetTemperature: function(temperature) {
        var that = this;
        var t = (temperature * 9.0 / 5.0) + 32.0;
        this.getStatus(function(json) {
            if (json["hvacOperatonModeIsHeat"]) {
                that.updateStatus("setpointHeat=" + t);
            }
            else if (json["hvacOperationModeIsCool"]) {
                that.updateStatus("setpointCool=" + t);
            }
            else {
                var cool = t + 5;
                var heat = t - 5;
                that.updateStatus("setpointCool=" + cool + "&setpointHeat=" + heat);
            }
        });
    },

    informationCharacteristics: function() {
    return [
      {
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: [Characteristic.Perms.READ],
        format: Characteristic.Formats.STRING,
        initialValue: this.name,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of the accessory",
        designedMaxLength: 255
      },{
        cType: types.MANUFACTURER_CTYPE,
        onUpdate: null,
        perms: [Characteristic.Perms.READ],
        format: Characteristic.Formats.STRING,
        initialValue: "Indigo",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: [Characteristic.Perms.READ],
        format: Characteristic.Formats.STRING,
        initialValue: this.type,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Model",
        designedMaxLength: 255
      },{
        cType: types.SERIAL_NUMBER_CTYPE,
        onUpdate: null,
        perms: [Characteristic.Perms.READ],
        format: Characteristic.Formats.STRING,
        initialValue: this.addressStr,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "SN",
        designedMaxLength: 255
      },{
        cType: types.IDENTIFY_CTYPE,
        onUpdate: null,
        perms: [Characteristic.Perms.WRITE],
        format: Characteristic.Formats.BOOL,
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Identify Accessory",
        designedMaxLength: 1
      }
    ]
  },

  controlCharacteristics: function(that) {
    var cTypes = [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: [Characteristic.Perms.READ],
        format: Characteristic.Formats.STRING,
        initialValue: that.name,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of the accessory",
        designedMaxLength: 255
    }];

    cTypes.push({
        cType: types.POWER_STATE_CTYPE,
        perms: [Characteristic.Perms.WRITE,Characteristic.Perms.READ,Characteristic.Perms.NOTIFY],
        format: Characteristic.Formats.BOOL,
        initialValue: (that.isOn) ? 1 : 0,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Change the power state",
        designedMaxLength: 1,
        onUpdate: function(value) {
            if (value == 0) {
                that.turnOff();
            } else {
                that.turnOn();
            }
        },
        onRead: function(callback) {
            that.query("isOn", function(isOn) {
                callback((isOn) ? 1 : 0);
            });
        }
    });

    if (that.typeSupportsDim) {
        cTypes.push({
            cType: types.BRIGHTNESS_CTYPE,
            perms: [Characteristic.Perms.WRITE,Characteristic.Perms.READ,Characteristic.Perms.NOTIFY],
            format: Characteristic.Formats.INT,
            initialValue:  that.brightness,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Adjust Brightness of Light",
            designedMinValue: 0,
            designedMaxValue: 100,
            designedMinStep: 1,
            unit: Characteristic.Units.PERCENTAGE,
            onUpdate: function(value) {
                that.setBrightness(value);
            },
            onRead: function(callback) {
                that.query("brightness", callback);
            }
        });
    }

    if (that.typeSupportsSpeedControl) {
        cTypes.push({
            cType: types.ROTATION_SPEED_CTYPE,
            perms: [Characteristic.Perms.WRITE,Characteristic.Perms.READ,Characteristic.Perms.NOTIFY],
            format: Characteristic.Formats.INT,
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Change the speed of the fan",
            designedMaxLength: 1,
            designedMinValue: 0,
            designedMaxValue: 3,
            designedMinStep: 1,    
            onUpdate: function(value) {
                that.setSpeedIndex(value);
            },
            onRead: function(callback) {
                that.query("speedIndex", callback);
            }
        });
    }

    if (that.typeSupportsHVAC) {
        cTypes.push({
            cType: types.CURRENTHEATINGCOOLING_CTYPE,
            perms: [Characteristic.Perms.READ,Characteristic.Perms.NOTIFY],
            format: Characteristic.Formats.INT,
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Current Mode",
            designedMaxLength: 1,
            designedMinValue: 0,
            designedMaxValue: 3,
            designedMinStep: 1,    
            onUpdate: null,
            onRead: function(callback) {
                that.getCurrentHeatingCooling(callback);
            }
        });

        cTypes.push({
            cType: types.TARGETHEATINGCOOLING_CTYPE,
            perms: [Characteristic.Perms.WRITE,Characteristic.Perms.READ,Characteristic.Perms.NOTIFY],
            format: Characteristic.Formats.INT,
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Target Mode",
            designedMaxLength: 1,
            designedMinValue: 0,
            designedMaxValue: 3,
            designedMinStep: 1,    
            onUpdate: function(value) {
                that.setTargetHeatingCooling(value);
            },
            onRead: function(callback) {
                that.getCurrentHeatingCooling(callback);
            }
        });

        cTypes.push({
            cType: types.CURRENT_TEMPERATURE_CTYPE,
            perms: [Characteristic.Perms.READ,Characteristic.Perms.NOTIFY],
            format: Characteristic.Formats.INT,
            designedMinValue: 0,
            designedMaxValue: 110,
            designedMinStep: 1,
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Current Temperature",
            unit: Characteristic.Units.FAHRENHEIT,
            onUpdate: null,
            onRead: function(callback) {
                that.getCurrentTemperature(callback);
            }
        });

        cTypes.push({
            cType: types.TARGET_TEMPERATURE_CTYPE, 
            perms: [Characteristic.Perms.WRITE,Characteristic.Perms.READ,Characteristic.Perms.NOTIFY],
            format: Characteristic.Formats.INT,
            designedMinValue: 0,
            designedMaxValue: 110,
            designedMinStep: 1,
            initialValue: 0,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Target Temperature",
            unit: Characteristic.Units.FAHRENHEIT,
            onUpdate: function(value) {
                that.setTargetTemperature(value);
            },
            onRead: function(callback) {
                that.getTargetTemperature(callback);
            }
        });

        cTypes.push({
            cType: types.TEMPERATURE_UNITS_CTYPE, 
            perms: [Characteristic.Perms.READ,Characteristic.Perms.NOTIFY],
            format: Characteristic.Formats.INT,
            initialValue: 1,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Unit",
            onUpdate: null,
            onRead: function(callback) {
                callback(Characteristic.Units.FAHRENHEIT);
            }
        });
    }

    return cTypes;
  },

  sType: function() {
    if (this.typeSupportsHVAC) {
        return types.THERMOSTAT_STYPE;
    } else if (this.typeSupportsDim) {
        return types.LIGHTBULB_STYPE;
    } else if (this.typeSupportsSpeedControl) {
        return types.FAN_STYPE;
    } else if (this.typeSupportsOnOff) {
        return types.SWITCH_STYPE;
    }

    return types.SWITCH_STYPE;
  },

  getServices: function() {
    var that = this;
    var services = [{
      sType: types.ACCESSORY_INFORMATION_STYPE,
      characteristics: that.informationCharacteristics(),
    },
    {
      sType: that.sType(),
      characteristics: that.controlCharacteristics(that)
    }];

    that.log("Loaded services for " + that.name);
    return services;
  }
};

module.exports.accessory = IndigoAccessory;
module.exports.platform = IndigoPlatform;
