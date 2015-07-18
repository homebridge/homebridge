var types = require("HAP-NodeJS/accessories/types.js");
var nest = require('unofficial-nest-api');

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
                                var name = data.shared[deviceId].name
                                var accessory = new NestThermostatAccessory(that.log, name, device, deviceId);
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

function NestThermostatAccessory(log, name, device, deviceId) {
  // device info
  this.name = name;
  this.model = device.model_version;
  this.serial = device.serial_number;
  this.deviceId = deviceId;
  this.log = log;
}

NestThermostatAccessory.prototype = {
    getCurrentHeatingCooling: function(callback){

        var that = this;

        this.log("Checking current heating cooling for: " + this.name);
        nest.fetchStatus(function (data) {
            var device = data.device[that.deviceId];
            
            var currentHeatingCooling = 0;
            switch(device.current_schedule_mode) {
                case "OFF":
                    targetHeatingCooling = 0;
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
            that.log("Current heating for " + this.name + "is: " + currentHeatingCooling);
            callback(currentHeatingCooling);
        });


    },

    getTargetHeatingCoooling: function(callback){

        var that = this;

        this.log("Checking target heating cooling for: " + this.name);
        nest.fetchStatus(function (data) {
            var device = data.device[that.deviceId];
            
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
            that.log("Current target heating for " + this.name + " is: " + targetHeatingCooling);
            callback(targetHeatingCooling);
        });
    },

    getCurrentTemperature: function(callback){

        var that = this;

        nest.fetchStatus(function (data) {
            var device = data.shared[that.deviceId];
            that.log("Current temperature for " + this.name + " is: " + device.current_temperature);
            callback(device.current_temperature);
        });


    },

    getTargetTemperature: function(callback){

        var that = this;

        nest.fetchStatus(function (data) {
            var device = data.shared[that.deviceId];
            that.log("Target temperature for " + this.name + " is: " + device.target_temperature);
            callback(device.target_temperature);
        });


    },

    getTemperatureUnits: function(callback){

        var that = this;

        nest.fetchStatus(function (data) {
            var device = data.device[that.deviceId];
            var temperatureUnits = 0;
            switch(device.temperature_scale) {
                case "F":
                    that.log("Tempature unit for " + this.name + " is: " + "Fahrenheit");
                    temperatureUnits = 1;
                    break;
                case "C":
                    that.log("Tempature unit for " + this.name + " is: " + "Celsius");
                    temperatureUnits = 0;
                    break;
                default:
                    temperatureUnits = 0;
            }

            callback(temperatureUnits);
        });


    },

    getCurrentRelativeHumidity: function(callback){

        var that = this;

        nest.fetchStatus(function (data) {
            var device = data.device[that.deviceId];
            that.log("Humidity for " + this.name + " is: " + device.current_humidity);
            callback(device.current_humidity);
        })


    },

    setTargetHeatingCooling: function(targetHeatingCooling){

        var that = this;

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


    },

    setTargetTemperature: function(targetTemperature){

        var that = this;

        this.log("Setting target temperature for " + this.name + " to: " + targetTemperature);
        nest.setTemperature(this.deviceId, targetTemperature);


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
                initialValue: "Nest",
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
                initialValue: false,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Identify Accessory",
                designedMaxLength: 1
            }]
        },{
            sType: types.THERMOSTAT_STYPE, 
            characteristics: [{
                cType: types.NAME_CTYPE,
                onUpdate: null,
                perms: ["pr"],
                format: "string",
                initialValue: this.name,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Name of thermostat",
                designedMaxLength: 255   
            },{
                cType: types.CURRENTHEATINGCOOLING_CTYPE,
                onUpdate: null,
                onRead: function(callback) {
                    that.getCurrentHeatingCooling(function(currentHeatingCooling){
                        callback(currentHeatingCooling);
                    });
                },
                perms: ["pr","ev"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Current Mode",
                designedMaxLength: 1,
                designedMinValue: 0,
                designedMaxValue: 2,
                designedMinStep: 1,    
            },{
                cType: types.TARGETHEATINGCOOLING_CTYPE,
                onUpdate: function(value) {
                    that.setTargetHeatingCooling(value);
                },
                onRead: function(callback) {
                    that.getTargetHeatingCoooling(function(targetHeatingCooling){
                        callback(targetHeatingCooling);
                    });
                },
                perms: ["pw","pr","ev"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Target Mode",
                designedMinValue: 0,
                designedMaxValue: 3,
                designedMinStep: 1,
            },{
                cType: types.CURRENT_TEMPERATURE_CTYPE,
                onUpdate: null,
                onRead: function(callback) {
                    that.getCurrentTemperature(function(currentTemperature){
                        callback(currentTemperature);
                    });
                },
                perms: ["pr","ev"],
                format: "int",
                initialValue: 20,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Current Temperature",
                unit: "celsius"
            },{
                cType: types.TARGET_TEMPERATURE_CTYPE,
                onUpdate: function(value) {
                    that.setTargetTemperature(value);
                },
                onRead: function(callback) {
                    that.getTargetTemperature(function(targetTemperature){
                        callback(targetTemperature);
                    });
                },
                perms: ["pw","pr","ev"],
                format: "int",
                initialValue: 20,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Target Temperature",
                designedMinValue: 16,
                designedMaxValue: 38,
                designedMinStep: 1,
                unit: "celsius"
            },{
                cType: types.TEMPERATURE_UNITS_CTYPE,
                onUpdate: null,
                onRead: function(callback) {
                    that.getTemperatureUnits(function(temperatureUnits){
                        callback(temperatureUnits);
                    });
                },
                perms: ["pr","ev"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Unit",
            },{
                cType: types.CURRENT_RELATIVE_HUMIDITY_CTYPE,
                onUpdate: null,
                onRead: function(callback) {
                    that.getCurrentRelativeHumidity(function(currentRelativeHumidity){
                        callback(currentRelativeHumidity);
                    });
                },
                perms: ["pr","ev"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Humidity",
            }]
        }];
    }
}

module.exports.accessory = NestThermostatAccessory;
module.exports.platform = NestPlatform;