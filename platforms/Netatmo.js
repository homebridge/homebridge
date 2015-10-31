'use strict';

// Netatmo weatherstation for HomeBridge
// Wriiten by planetk (https://github.com/planetk)
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "Netatmo",
//         "name": "Netatmo Weather",
//         "ttl": 10,
//         "auth": {
//             "client_id": "",
//             "client_secret": "",
//             "username": "",
//             "password": ""
//         }
//     }
// ],
//
// The default code for all HomeBridge accessories is 031-45-154.

var DEFAULT_CACHE_TTL = 10; // 10 seconds caching - use config["ttl"] to override

// CUSTOM SERVICE AND CHARACTERISTIC IDS
var ATMOSPHERIC_PRESSURE_STYPE_ID = "B77831FD-D66A-46A4-B66D-FD7EE8DFE3CE";
var ATMOSPHERIC_PRESSURE_CTYPE_ID = "28FDA6BC-9C2A-4DEA-AAFD-B49DB6D155AB";
var NOISE_LEVEL_STYPE_ID = "8C85FD40-EB20-45EE-86C5-BCADC773E580";
var NOISE_LEVEL_CTYPE_ID = "2CD7B6FD-419A-4740-8995-E3BFE43735AB";

var Service;
try {
  Service = require("hap-nodejs").Service;
} catch(err) {
  Service = require("HAP-NodeJS").Service;
}

var Characteristic;
try {
  Characteristic = require("hap-nodejs").Characteristic;
} catch(err) {
  Characteristic = require("HAP-NodeJS").Characteristic;
}

var netatmo = require("netatmo");
var NodeCache = require("node-cache");
var inherits = require('util').inherits;

Characteristic.AtmosphericPressureLevel = function() {
  Characteristic.call(this, 'Atmospheric Pressure', ATMOSPHERIC_PRESSURE_CTYPE_ID);
  this.setProps({
      format: Characteristic.Formats.UINT8,
      unit: "mbar",
      minValue: 800,
      maxValue: 1200,
      minStep: 1,
      perms: [
        Characteristic.Perms.READ,
        Characteristic.Perms.NOTIFY
      ]
  });
  this.value = this.getDefaultValue();
};
inherits(Characteristic.AtmosphericPressureLevel, Characteristic);
Characteristic.NoiseLevel = function() {
  Characteristic.call(this, 'Noise Level', NOISE_LEVEL_CTYPE_ID);
  this.setProps({
      format: Characteristic.Formats.UINT8,
      unit: "dB",
      minValue: 0,
      maxValue: 200,
      minStep: 1,
      perms: [
        Characteristic.Perms.READ,
        Characteristic.Perms.NOTIFY
      ]
  });
  this.value = this.getDefaultValue();
};
inherits(Characteristic.NoiseLevel, Characteristic);

Service.AtmosphericPressureSensor = function(displayName, subtype) {
  Service.call(this, displayName, ATMOSPHERIC_PRESSURE_STYPE_ID, subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.AtmosphericPressureLevel);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.Name);
};
inherits(Service.AtmosphericPressureSensor, Service);

Service.NoiseLevelSensor = function(displayName, subtype) {
  Service.call(this, displayName, NOISE_LEVEL_STYPE_ID, subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.NoiseLevel);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.Name);
};
inherits(Service.NoiseLevelSensor, Service);

function NetAtmoRepository(log, api, ttl) {
  this.api = api;
  this.log = log;
  this.cache = new NodeCache( { stdTTL: ttl } );
}

NetAtmoRepository.prototype = {
  refresh: function(callback) {
    var datasource = {
      modules: {}
    };
    var that = this;
    that.api.getStationsData(function(err, devices) {

      // querying for the device infos and the main module
      for (var device of devices) {
        device.module_name = device.station_name + " " + device.module_name

        that.log("refreshing device " + device._id + " (" + device.module_name + ")");
        datasource.modules[device._id] = device;

        // querying for the extra modules
        for (var module of device.modules) {
          module.module_name = device.station_name + " " + module.module_name

          that.log("refreshing device " + module._id + " (" + module.module_name + ")");
          datasource.modules[module._id] = module;
        }
      }

      that.cache.set( "datasource", datasource );
      callback(datasource);
    });
  },
  load: function(callback) {
    var that = this;
    this.cache.get( "datasource", function(err, datasource) {
      if(!err) {
        if (datasource == undefined) {
          that.refresh(callback);
        } else {
          callback(datasource)
        }
      }
    });
  }
}

function NetatmoPlatform(log, config) {
  this.log = log;
  var api = new netatmo(config["auth"]);
  var ttl = typeof config["ttl"] !== 'undefined' ?  config["ttl"] : DEFAULT_CACHE_TTL;
  this.repository = new NetAtmoRepository(this.log, api, ttl);
  api.on("error", function(error) {
    this.log('ERROR - Netatmo: ' + error);
  });
  api.on("warning", function(error) {
    this.log('WARN - Netatmo: ' + error);
  });
}

NetatmoPlatform.prototype = {
  accessories: function(callback) {

    var that = this;
    var foundAccessories = [];

    this.repository.load(function(datasource) {
      for (var id in datasource.modules) {
        var device = datasource.modules[id];
        var accessory = new NetatmoAccessory(that.log, that.repository, device);
        foundAccessories.push(accessory);
      }
      callback(foundAccessories);
    });
  }
}

function NetatmoAccessory(log, repository, device) {
  this.log = log;
  this.repository = repository;
  this.deviceId = device._id;
  this.name = device.module_name
  this.serial = device._id;
  this.firmware = device.firmware;
  this.model = device.type;
  this.serviceTypes = device.data_type;
  if (device.battery_vp) {
    this.serviceTypes.push("Battery");
  }
}

NetatmoAccessory.prototype = {

  getData: function(callback) {
    var that = this;
    this.repository.load(function(datasource) {
      callback(datasource.modules[that.deviceId]);
    });
  },

  identify: function(callback) {
    this.log("Identify requested!");
    callback(); // success
  },

  currentTemperature: function (callback) {
    this.getData(function(deviceData) {
/*
      if (error) {
        callback(error);
      } else {
*/  
      callback(null, deviceData.dashboard_data.Temperature);
    }.bind(this));
  },  

  currentRelativeHumidity: function(callback) {
    this.getData(function(deviceData) {
      callback(null, deviceData.dashboard_data.Humidity);
    }.bind(this));
  },

  carbonDioxideDetected: function(callback) {
    var that = this;
    that.log ("getting CO2" + Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL);

    this.getData(function(deviceData) {
      var result = (deviceData.dashboard_data.CO2 > 1000 ? Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL : Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL);      
      callback(null, result);
    }.bind(this));
  },

  carbonDioxideLevel: function(callback) {
    this.getData(function(deviceData) {
      callback(null, deviceData.dashboard_data.CO2);
    }.bind(this));
  },

  airQuality: function(callback) {
    this.getData(function(deviceData) {
      var level = deviceData.dashboard_data.CO2; 
      var quality = Characteristic.AirQuality.UNKNOWN;
      if (level > 2000) quality = Characteristic.AirQuality.POOR;
      else if (level > 1500) quality = Characteristic.AirQuality.INFERIOR;
      else if (level > 1000) quality = Characteristic.AirQuality.FAIR;
      else if (level > 500) quality = Characteristic.AirQuality.GOOD;
      else if (level > 250) quality = Characteristic.AirQuality.EXCELLENT;
      callback(null, quality);
    }.bind(this));
  },

  batteryLevel: function(callback) {
    this.getData(function(deviceData) {
      var charge = deviceData.battery_vp;
      var level = charge < 3000 ? 0 : (charge - 3000)/30;
      callback(null, level);
    }.bind(this));
  },

  statusLowBattery: function(callback) {
    this.getData(function(deviceData) {
      var charge = deviceData.battery_vp;
      var level = charge < 4600 ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      callback(null, level);
    }.bind(this));
  },

  atmosphericPressure: function(callback) {
    this.getData(function(deviceData) {
      callback(null, deviceData.dashboard_data.Pressure);
    }.bind(this));
  },

  noiseLevel: function(callback) {
    this.getData(function(deviceData) {
      callback(null, deviceData.dashboard_data.Noise);
    }.bind(this));
  },

  getServices: function() {
    var that = this;
    var services = [];

    this.log("creating services for " + this.name)

    // INFORMATION ///////////////////////////////////////////////////

    var informationService = new Service.AccessoryInformation();
    var firmwareCharacteristic = informationService.getCharacteristic(Characteristic.FirmwareRevision)
                           || informationService.addCharacteristic(Characteristic.FirmwareRevision);
    services.push( informationService );
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Netatmo")
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.SerialNumber, this.serial)
      .setCharacteristic(Characteristic.FirmwareRevision, this.firmware);

    // TEMPERATURE //////////////////////////////////////////////////
    if (this.serviceTypes.indexOf("Temperature") > -1) {
      var temperatureSensor = new Service.TemperatureSensor(this.name + " Temperature");
      services.push( temperatureSensor );
      temperatureSensor.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.currentTemperature.bind(this));
    }

    // HUMIDITY ////////////////////////////////////////////////////
    if (this.serviceTypes.indexOf("Humidity") > -1) {
      var humiditySensor = new Service.HumiditySensor(this.name + " Humidity");
      services.push( humiditySensor );
      humiditySensor.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .on('get', this.currentRelativeHumidity.bind(this));
    }


    // CO2 SENSOR /////////////////////////////////////////////////
    if (this.serviceTypes.indexOf("CO2") > -1) {
      var carbonDioxideSensor = new Service.CarbonDioxideSensor(this.name + " Carbon Dioxide");
      var carbonDioxideLevelCharacteristic = carbonDioxideSensor.getCharacteristic(Characteristic.CarbonDioxideLevel)
                           || carbonDioxideSensor.addCharacteristic(Characteristic.CarbonDioxideLevel);

      services.push( carbonDioxideSensor );
      carbonDioxideSensor.getCharacteristic(Characteristic.CarbonDioxideDetected)
        .on('get', this.carbonDioxideDetected.bind(this));
      carbonDioxideLevelCharacteristic
        .on('get', this.carbonDioxideLevel.bind(this));

      var airQualitySensor = new Service.AirQualitySensor(this.name + " Air Quality");
      services.push( airQualitySensor );
      airQualitySensor.getCharacteristic(Characteristic.AirQuality)
        .on('get', this.airQuality.bind(this));
    }

    // BATTERY SERVICE ////////////////////////////////////////////

    if (this.serviceTypes.indexOf("Battery") > -1) {
      var batteryService = new Service.BatteryService(this.name + " Battery Level");
      services.push( batteryService );
      batteryService.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', this.batteryLevel.bind(this));
      batteryService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.statusLowBattery.bind(this));
    }

    // ATMOSPHERIC PRESSURE /////////////////////////////////////////////////////

    if (this.serviceTypes.indexOf("Pressure") > -1) {
      var atmosphericPressureSensor = new Service.AtmosphericPressureSensor(this.name + " Atmospheric Pressure");
      services.push( atmosphericPressureSensor );
      atmosphericPressureSensor.getCharacteristic(Characteristic.AtmosphericPressureLevel)
        .on('get', this.atmosphericPressure.bind(this));
    } 

    // NOISE LEVEL //////////////////////////////////////////////////////////////

    if (this.serviceTypes.indexOf("Noise") > -1) {
      var noiseLevelSensor = new Service.NoiseLevelSensor(this.name + " Noise Level");
      services.push( noiseLevelSensor );
      noiseLevelSensor.getCharacteristic(Characteristic.NoiseLevel)
        .on('get', this.noiseLevel.bind(this));
    } 

    // TODO: Check Elgato Eve Characteristics (map min, max, time series, etc.)!

    return services;
  }
};

module.exports.accessory = NetatmoAccessory;
module.exports.platform = NetatmoPlatform;
