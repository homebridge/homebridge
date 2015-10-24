'use strict';

// Netatmo weatherstation for HomeBridge
// Wriiten by planetk (https://github.com/planetk)
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "Netatmo",
//         "name": "Netatmo Weather",
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

var types = require('hap-nodejs/accessories/types.js');

//////////////////////////////////////////////////////////////////////////////
// DECLARE SOME UUIDS WHICH SHOUL BE IN HAP-NODEJS TYPES LIB, BUT ARE NOT YET
// REMOVE WHEN HAP LIB IS UPDATED!!
//////////////////////////////////////////////////////////////////////////////
var stPre = "000000";
var stPost = "-0000-1000-8000-0026BB765291";

types.BATTERY_SERVICE_STYPE = stPre + "96" + stPost;
types.AIR_QUALITY_SENSOR_STYPE = stPre + "8D" + stPost;
types.CARBON_DIOXIDE_SENSOR_STYPE = stPre + "97" + stPost;

types.AIR_PARTICULATE_DENISITY_CTYPE = stPre + "64" + stPost;
types.CARBON_DIOXIDE_DETECTED_CTYPE = stPre + "92" + stPost;
types.CARBON_DIOXIDE_LEVEL_CTYPE = stPre + "93" + stPost;
types.AIR_QUALITY_CTYPE = stPre + "95" + stPost;
//////////////////////////////////////////////////////////////////////////////

var netatmo = require('netatmo');
var NodeCache = require( "node-cache" );

function NetAtmoRepository(log, api) {
  this.api = api;
  this.log = log;
  this.cache = new NodeCache();
}

NetAtmoRepository.prototype = {
  refresh: function(callback) {
    var datasource={
      devices: {},
      modules: {}
    };
    var that = this;
    that.api.getDevicelist(function(err, devices, modules) {
      for (var device of devices) {
        that.log("refreshing device " + device._id + " (" + device.module_name + ")");
        datasource.devices[device._id] = device;
      }
      for (var module of modules) {
        that.log("refreshing module " + module._id + " (" + module.module_name + ")");
        datasource.modules[module._id] = module;
      }
      that.cache.set( "datasource", datasource, 20 );
      callback(datasource);
    });
  },
  load: function(callback) {
    var that = this;
    this.cache.get( "datasource", function( err, datasource ){
      if( !err ){
        if ( datasource == undefined ){
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
  this.repository = new NetAtmoRepository(this.log, api);
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
      for (var id in datasource.devices) {
        var device = datasource.devices[id];
        that.log("Adding accessory for device " + id + " (" + device.module_name + ")");
        var accessory = new NetatmoAccessory(that.log, that.repository, device._id, null, device);
        foundAccessories.push(accessory);
      }
      for (var id in datasource.modules) {
        var module = datasource.modules[id];
        that.log("Adding accessory for module " + module._id + " (" + module.module_name + ")");
        var accessory = new NetatmoAccessory(that.log, that.repository, module.main_device, module._id, module);
        foundAccessories.push(accessory);
      }
      callback(foundAccessories);
    });
  }
}

function NetatmoAccessory(log, repository, deviceId, moduleId, device) {
  this.log = log;
  this.repository = repository;
  this.deviceId = deviceId;
  this.moduleId = moduleId;
  this.serial = deviceId;
  if (moduleId) {
    this.serial = moduleId;
  }
  this.name = device.module_name;
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
      if(that.moduleId) {
        callback(datasource.modules[that.moduleId]);
      } else {
        callback(datasource.devices[that.deviceId]);
      }
    });
  },

  getCurrentTemperature: function(callback) {
    this.getData(function(deviceData) {
      callback(deviceData.dashboard_data.Temperature);
    });
  },

  getCurrentHumidity: function(callback) {
    this.getData(function(deviceData) {
      callback(deviceData.dashboard_data.Humidity);
    });
  },

  getAirQuality: function(callback) {
    this.getData(function(deviceData) {
      var level = deviceData.dashboard_data.CO2; 
      var quality = 0;
      if (level > 2000) quality = 5;
      else if (level > 1500) quality = 4;
      else if (level > 1000) quality = 3;
      else if (level > 500) quality = 2;
      else if (level > 250) quality = 1;
      callback(quality);
    });
  },
  getCurrentCO2Level: function(callback) {
    this.log("fetching co2");
    this.getData(function(deviceData) {
      callback(deviceData.dashboard_data.CO2);
    });
  },

  informationCharacteristics: function() {
    return [
      {
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
        initialValue: "Netatmo",
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
      }
    ]
  },

  humidityCharacteristics: function(that) {
    var cTypes = [{
      cType: types.NAME_CTYPE,
      onUpdate: null,
      perms: ["pr"],
      format: "string",
      initialValue: this.name +" Humidity",
      supportEvents: true,
      supportBonjour: false,
      manfDescription: "Name of service",
      designedMaxLength: 255
    },{
      cType: types.CURRENT_RELATIVE_HUMIDITY_CTYPE,
      onRead: function(callback) { that.getCurrentHumidity(callback); },
      onUpdate: null,
      perms: ["pr","ev"],
      format: "int",
      initialValue: 0,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "Humidity"
    }];
    return cTypes;
  },

  temperatureCharacteristics: function(that) {
    var cTypes = [{
      cType: types.NAME_CTYPE,
      onUpdate: null,
      perms: ["pr"],
      format: "string",
      initialValue: this.name + " Temperature",
      supportEvents: true,
      supportBonjour: false,
      manfDescription: "Name of service",
      designedMaxLength: 255
    },{
      cType: types.CURRENT_TEMPERATURE_CTYPE,
      onRead: function(callback) { that.getCurrentTemperature(callback); },
      onUpdate: null,
      perms: ["pr","ev"],
      format: "float",
      initialValue: 0.0,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "Current Temperature",
      unit: "celsius"
    }];
    return cTypes;
  },

  co2Characteristics: function(that) {
    var cTypes = [{
      cType: types.NAME_CTYPE,
      onUpdate: null,
      perms: ["pr"],
      format: "string",
      initialValue: this.name + "Carbon Dioxide Level",
      supportEvents: true,
      supportBonjour: false,
      manfDescription: "Name of service",
      designedMaxLength: 255
    },{
      cType: types.CARBON_DIOXIDE_DETECTED_CTYPE,
      //onRead: function(callback) { that.getCurrentTemperature(callback); },
      onRead: function(callback) { callback(0); },
      onUpdate: null,
      perms: ["pr","ev"],
      format: "uint8",
      initialValue: 0,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "CO2 detected"
    },{
      cType: types.CARBON_DIOXIDE_LEVEL_CTYPE,
      onRead: function(callback) { that.getCurrentCO2Level(callback); },
      onUpdate: null,
      perms: ["pr","ev"],
      format: "float",
      initialValue: 0,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "CO2 level "
    }];
    return cTypes;
  },

  airQualityCharacteristics: function(that) {
    var cTypes = [{
      cType: types.NAME_CTYPE,
      onUpdate: null,
      perms: ["pr"],
      format: "string",
      initialValue: this.name + " Air Quality",
      supportEvents: true,
      supportBonjour: false,
      manfDescription: "Name of service",
      designedMaxLength: 255
    },{
      cType: types.AIR_QUALITY_CTYPE,
      onRead: function(callback) { that.getAirQuality(callback); },
      onUpdate: null,
      perms: ["pr","ev"],
      format: "float",
      initialValue: 0,
      supportEvents: false,
      supportBonjour: false,
      manfDescription: "Current Air Quality",
    }];
    return cTypes;
  },


  getServices: function() {
    var that = this;
    var services = [{
      sType: types.ACCESSORY_INFORMATION_STYPE,
      characteristics: this.informationCharacteristics(),
    }];

    // TEMPERATURE //////////////////////////////////////////////////
    if (this.serviceTypes.indexOf("Temperature") > -1) {
      var tempSensorSvc = {
        sType: types.TEMPERATURE_SENSOR_STYPE,
        characteristics: this.temperatureCharacteristics(that)
      }
      services.push(tempSensorSvc);
    }
    // HUMIDITY ////////////////////////////////////////////////////
    if (this.serviceTypes.indexOf("Humidity") > -1) {
      services.push({
        sType: types.HUMIDITY_SENSOR_STYPE,
        characteristics: this.humidityCharacteristics(that)
      });
    }
    // CO2 SENSOR /////////////////////////////////////////////////
    if (this.serviceTypes.indexOf("CO2") > -1) {
      services.push({
        sType: types.CARBON_DIOXIDE_SENSOR_STYPE,
        characteristics: this.co2Characteristics(that)
      });
      services.push({
        sType: types.AIR_QUALITY_SENSOR_STYPE,
        characteristics: this.airQualityCharacteristics(that)
      });
    }

    // TODO: Pressure
    // TODO: Noise
    // TODO: Battery
    // TODO: Check Elgato Eve Characteristics (map min, max, time series, etc.)!

    return services;
  }
};

module.exports.accessory = NetatmoAccessory;
module.exports.platform = NetatmoPlatform;