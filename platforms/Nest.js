var types = require("HAP-NodeJS/accessories/types.js");
var nest = require('unofficial-nest-api');
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var Accessory = require("hap-nodejs").Accessory;
var uuid = require("hap-nodejs").uuid;
var inherits = require('util').inherits;


function NestPlatform(log, config){

  // auth info
  this.username = config["username"];
  this.password = config["password"];

  this.log = log;
}

NestPlatform.prototype = {
    accessories: function(callback) {
        this.log("Fetching Nest devices.");

        var that = this;
        var foundAccessories = [];

        nest.login(this.username, this.password, function (err, data) {
            if (err) {
                that.log("There was a problem authenticating with Nest.");
            }
            else {
                nest.fetchStatus(function (data) {
                    for (var deviceId in data.device) {
                        if (data.device.hasOwnProperty(deviceId)) {
                            var device = data.device[deviceId];
                            // it's a thermostat, adjust this to detect other accessories
                            if (data.shared[deviceId].hasOwnProperty('current_temperature'))
                            {
                                var initialData = data.shared[deviceId];
                                var name = initialData.name
                                var accessory = new NestThermostatAccessory(that.log, name, device, deviceId, initialData);
                                foundAccessories.push(accessory);
                            }
                        }
                    }
                    callback(foundAccessories)
                });
            }
        });
    }
}

function NestThermostatAccessory(log, name, device, deviceId, initialData) {
  // device info
  if (name) {
    this.name = name;
  } else {
    this.name = "Nest";
  }
  this.model = device.model_version;
  this.serial = device.serial_number;
  this.deviceId = deviceId;
  this.log = log;
    Accessory.call(this, name, uuid.generate(deviceId));

    this.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "Nest")
        .setCharacteristic(Characteristic.Model, this.model)
        .setCharacteristic(Characteristic.SerialNumber, this.serial);

    this.addService(Service.Thermostat, name);

    this.getService(Service.Thermostat)
        .setCharacteristic(Characteristic.TemperatureDisplayUnits, this.extractTemperatureUnits(device))
        .on('get', this.getTemperatureUnits);

    this.getService(Service.Thermostat)
        .setCharacteristic(Characteristic.CurrentTemperature, this.extractCurrentTemperature(device))
        //.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getCurrentTemperature);

    this.getService(Service.Thermostat)
        .setCharacteristic(Characteristic.TargetTemperature, this.extractTargetTemperature(device))
        .on('get', this.getTargetTemperature)
        .on('set', this.setTargetTemperature);

    this.getService(Service.Thermostat)
        .setCharacteristic(Characteristic.CurrentHeatingCoolingState, this.extractCurrentHeatingCooling(device))
        .on('get', this.getCurrentHeatingCooling);

    this.getService(Service.Thermostat)
        .setCharacteristic(Characteristic.TargetHeatingCoolingState, this.extractTargetHeatingCooling(device))
        .on('get', this.getTargetHeatingCoooling)
        .on('set', this.setTargetHeatingCooling);

    //this.getService(Service.Thermostat)
    //    .getCharacteristic(Characteristic.CurrentRelativeHumidity)
    //    .on('get', function(callback) {
    //        that.getCurrentRelativeHumidity(function(currentRelativeHumidity){
    //            callback(currentRelativeHumidity);
    //        });
    //    });



}
inherits(NestThermostatAccessory, Accessory);
//NestThermostatAccessory.prototype.parent = Accessory.prototype;
Service.prototype.getCharacteristic = function(name) {
    // returns a characteristic object from the service
    // If  Service.prototype.getCharacteristic(Characteristic.Type)  does not find the characteristic,
    // but the type is in optionalCharacteristics, it adds the characteristic.type to the service and returns it.
    var index, characteristic;
    for (index in this.characteristics) {
        characteristic = this.characteristics[index];
        if (typeof name === 'string' && characteristic.displayName === name) {
            return characteristic;
        }
        else if (typeof name === 'function' && characteristic instanceof name) {
            return characteristic;
        }
    }
    if (typeof name === 'function')  {
        for (index in this.optionalCharacteristics) {
            characteristic = this.optionalCharacteristics[index];
            if (characteristic instanceof name) {
                return this.addCharacteristic(name);
            }
        }
    }
};

NestThermostatAccessory.prototype.getServices = function() {
    return this.services;
};

NestThermostatAccessory.prototype.extractCurrentHeatingCooling = function(device){
    var currentHeatingCooling = 0;
    switch(device.current_schedule_mode) {
        case "OFF":
            currentHeatingCooling = 0;
            break;
        case "HEAT":
            currentHeatingCooling = 1;
            break;
        case "COOL":
            currentHeatingCooling = 2;
            break;
        case "RANGE":
            currentHeatingCooling = 3;
            break;
        default:
            currentHeatingCooling = 0;
    }
    this.log("Current heating for " + this.name + "is: " + currentHeatingCooling);
    return currentHeatingCooling;
};
NestThermostatAccessory.prototype.getCurrentHeatingCooling = function(callback){
    var that = this;
    this.log("Checking current heating cooling for: " + this.name);
    nest.fetchStatus(function (data) {
        var device = data.device[that.deviceId];
        var currentHeatingCooling = that.extractCurrentHeatingCooling(device);
        callback(currentHeatingCooling);
    });
};
NestThermostatAccessory.prototype.extractTargetHeatingCooling = function(device){
    var targetHeatingCooling = 0;
    switch(device.target_temperature_type) {
        case "off":
            targetHeatingCooling = 0;
            break;
        case "heat":
            targetHeatingCooling = 1;
            break;
        case "cool":
            targetHeatingCooling = 2;
            break;
        case "range":
            targetHeatingCooling = 3;
            break;
        default:
            targetHeatingCooling = 0;
    }
    this.log("Current target heating for " + this.name + " is: " + targetHeatingCooling);
    return targetHeatingCooling;
};
NestThermostatAccessory.prototype.getTargetHeatingCoooling = function(callback){
        var that = this;
        this.log("Checking target heating cooling for: " + this.name);
        nest.fetchStatus(function (data) {
            var device = data.device[that.deviceId];
            var targetHeatingCooling = that.extractTargetHeatingCooling(device);
            callback(targetHeatingCooling);
        });
    };


NestThermostatAccessory.prototype.extractCurrentTemperature = function(device){
    var curTemp = this.extractAsDisplayUnit(device.current_temperature, device);
    this.log("Current temperature for " + this.name + " is: " + curTemp);
    return curTemp;
};
NestThermostatAccessory.prototype.getCurrentTemperature = function(callback){
        var that = this;
        nest.fetchStatus(function (data) {
            var device = data.shared[that.deviceId];
            var curTemp = this.extractCurrentTemperature(device);
            callback(curTemp);
        });
    };

NestThermostatAccessory.prototype.extractTargetTemperature = function(device){
    var targetTemp;
    if (device.target_temperature != undefined) {
        targetTemp = device.target_temperature;
    } else if (device.temperature_lock_high_temp != undefined) {
        targetTemp = device.temperature_lock_high_temp;
    } else {
        return null;
    }

    targetTemp = this.extractAsDisplayUnit(targetTemp, device);
    this.log("Target temperature for " + this.name + " is: " + targetTemp);
    return targetTemp;
};
NestThermostatAccessory.prototype.getTargetTemperature = function(callback){
        var that = this;
        nest.fetchStatus(function (data) {
            var device = data.shared[that.deviceId];
            var targetTemp = this.extractTargetTemperature(device);
            callback(targetTemp);
        });
    };

NestThermostatAccessory.prototype.extractTemperatureUnits = function(device) {
    var temperatureUnits = 0;
    switch(device.temperature_scale) {
        case "F":
            this.log("Tempature unit for " + this.name + " is: " + "Fahrenheit");
            temperatureUnits = 1;
            break;
        case "C":
            this.log("Tempature unit for " + this.name + " is: " + "Celsius");
            temperatureUnits = 0;
            break;
        default:
            temperatureUnits = 0;
    }
    return temperatureUnits;
};

NestThermostatAccessory.prototype.isFahrenheitUnit = function(unit) {
  return unit == 1;
};

NestThermostatAccessory.prototype.convertToDisplayUnit = function(value, displayUnit) {
    return this.isFahrenheitUnit(displayUnit) ? nest.ctof(value) : value;
};

NestThermostatAccessory.prototype.convertToValueUnit = function(value, displayUnit) {
    return this.isFahrenheitUnit(displayUnit) ? nest.ftoc(value) : value;
};

NestThermostatAccessory.prototype.extractAsDisplayUnit = function(value, device) {
    var tempUnit = this.extractTemperatureUnits(device);
    return this.convertToDisplayUnit(value, tempUnit);
};

NestThermostatAccessory.prototype.extractAsValueUnit = function(value, device) {
    return this.convertToValueUnit(value, this.extractTemperatureUnits(device));
};

NestThermostatAccessory.prototype.getTemperatureUnits = function(callback){
        var that = this;
        nest.fetchStatus(function (data) {
            var device = data.device[that.deviceId];
            var temperatureUnits = that.extractTemperatureUnits(device);
            callback(temperatureUnits);
        });
    };

NestThermostatAccessory.prototype.getCurrentRelativeHumidity = function(callback){

        var that = this;

        nest.fetchStatus(function (data) {
            var device = data.device[that.deviceId];
            that.log("Humidity for " + this.name + " is: " + device.current_humidity);
            callback(device.current_humidity);
        })


    };

NestThermostatAccessory.prototype.setTargetHeatingCooling = function(targetHeatingCooling, callback){
        var targetTemperatureType = 'off';
        switch(targetHeatingCooling) {
            case 0:
                targetTemperatureType = 'off';
                break;
            case 1:
                targetTemperatureType = 'heat';
                break;
            case 2:
                targetTemperatureType = 'cool';
                break;
            case 3:
                targetTemperatureType = 'range';
                break;
            default:
                targetTemperatureType = 'off';
        }

        this.log("Setting target heating cooling for " + this.name + " to: " + targetTemperatureType);
        nest.setTargetTemperatureType(this.deviceId, targetTemperatureType);

    if (callback) {
        callback();
    }
};

NestThermostatAccessory.prototype.setTargetTemperature = function(targetTemperature, callback){
    this.log("Setting target temperature for " + this.name + " to: " + targetTemperature);
    nest.setTemperature(this.deviceId, targetTemperature);
    if (callback) {
        callback();
    }
};

module.exports.accessory = NestThermostatAccessory;
module.exports.platform = NestPlatform;
