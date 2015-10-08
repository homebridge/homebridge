'use strict';

//
// HomeSeer Platform Shim for HomeBridge
// V0.1 - Jean-Michel Joudrier (stipus at stipus dot com) - 2015/10/07 - Initial version
//
//
// Remember to add platform to config.json. 
//
// You can get HomeSeer Device References by clicking a HomeSeer device name, then 
// choosing the Advanced Tab. 
//
// Example:
// "platforms": [
//     {
//         "platform": "HomeSeer",         // required
//         "name": "HomeSeer",             // required
//         "url": "http://192.168.3.4:81", // required
//         "accessories":[
//            {
//              "ref":8,                   // required - HomeSeer Device Reference (To get it, select the HS Device - then Advanced Tab) 
//              "type":"Lightbulb",        // Optional - Lightbulb is the default
//              "name":"My Light",         // Optional - HomeSeer device name is the default
//              "offValue":"0",            // Optional - 0 is the default
//              "onValue":"100",           // Optional - 100 is the default
//              "can_dim":true             // Optional - true is the default - false for a non dimmable lightbulb
//            },
//            {
//              "ref":9                    // This is a dimmable Lightbulb by default
//            },
//            {
//              "ref":58,                  // This is an controllable outlet
//              "type":"Outlet"
//            }
//         ]
//     }
// ],
//
//
// SUPORTED TYPES:
// - Lightbulb (can_dim, onValue, offValue options)
// - Fan (onValue, offValue options)
// - Switch (onValue, offValue options)
// - Outlet (onValue, offValue options)
// - TemperatureSensor
// - ContactSensor
// - MotionSensor
// - LeakSensor
// - LightSensor
// - OccupancySensor
// - SmokeSensor
// - Door


var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var request = require("request");


function httpRequest(url, method, callback) {
    request({
      url: url,
      method: method
    },
    function (error, response, body) {
      callback(error, response, body)
    })
}



function HomeSeerPlatform(log, config){
    this.log = log;
    this.config = config;
}

HomeSeerPlatform.prototype = {
    accessories: function(callback) {
        this.log("Fetching HomeSeer devices.");

        var refList = "";
        for( var i=0; i<this.config.accessories.length; i++ ) {
            refList = refList + this.config.accessories[i].ref;
            if( i < this.config.accessories.length - 1 )
                refList = refList + ",";
        }

        var that = this;
        var foundAccessories = [];
        var url = this.config["host"] + "/JSON?request=getstatus&ref=" + refList;
        httpRequest( url, "GET", function(error, response, body) {
            if (error) {
                this.log('HomeSeer status function failed: %s', error.message);
                callback( foundAccessories );
            }
            else {
                this.log('HomeSeer status function succeeded!');
                var response = JSON.parse( body );
                for( var i=0; i<response.Devices.length; i++ ) {
                    var accessory = new HomeSeerAccessory( that.log, that.config, response.Devices[i] );
                    foundAccessories.push( accessory );
                }
                callback( foundAccessories );
            }
        }.bind(this));
    }
}

function HomeSeerAccessory(log, platformConfig, status ) {
    this.log = log;
    this.ref = status.ref;
    this.name = status.name
    this.model = status.device_type_string;
    this.onValue = "100";
    this.offValue = "0";

    this.control_url = platformConfig["host"] + "/JSON?request=controldevicebyvalue&ref=" + this.ref + "&value=";
    this.status_url = platformConfig["host"] + "/JSON?request=getstatus&ref=" + this.ref;

    for( var i=0; i<platformConfig.accessories.length; i++ ) {
        if( platformConfig.accessories[i].ref == this.ref )
        {
            this.config = platformConfig.accessories[i];
            break;
        }
    }

    if( this.config.name )
        this.name = this.config.name;

    if( this.config.onValue )
        this.onValue = this.config.onValue;

    if( this.config.offValue )
        this.offValue = this.config.offValue;
}

HomeSeerAccessory.prototype = {

    identify: function(callback) {
            callback();
    },

    setPowerState: function(powerOn, callback) {
        var url;

        if (powerOn) {
            url = this.control_url + this.onValue;
            this.log("Setting power state to on");
        }
        else {
            url = this.control_url + this.offValue;
            this.log("Setting power state to off");
        }

        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer power function failed: %s', error.message);
                callback(error);
            }
            else {
                this.log('HomeSeer power function succeeded!');
                callback();
            }
        }.bind(this));
    },

    getPowerState: function(callback) {
        var url = this.status_url;

        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer get power function failed: %s', error.message);
                callback( error, 0 );
            }
            else {
                var status = JSON.parse( body );
                var value = status.Devices[0].value;
	
                this.log('HomeSeer get power function succeeded: value=' + value );
                if( value == 0 )
                    callback( null, 0 );
                else
                    callback( null, 1 );
            }
        }.bind(this));
    },


    setValue: function(level, callback) {
        var url = this.control_url + level;

        this.log("Setting value to %s", level);

        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer set value function failed: %s', error.message);
                callback(error);
            }
            else {
                this.log('HomeSeer set value function succeeded!');
                callback();
            }
        }.bind(this));
    },

    getValue: function(callback) {
        var url = this.status_url;

        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer get value function failed: %s', error.message);
                callback( error, 0 );
            }
            else {
                var status = JSON.parse( body );
                var value = status.Devices[0].value;
	
                this.log('HomeSeer get value function succeeded: value=' + value );
                callback( null, value );
            }
        }.bind(this));
    },

    getServices: function() {
        var services = []

        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, "HomeSeer")
            .setCharacteristic(Characteristic.Model, this.model )
            .setCharacteristic(Characteristic.SerialNumber, "HS " + this.config.type + " ref " + this.ref);
        services.push( informationService );


        switch( this.config.type ) {
        case "Lightbulb": {
            var lightbulbService = new Service.Lightbulb();
            lightbulbService
                .getCharacteristic(Characteristic.On)
                .on('set', this.setPowerState.bind(this))
                .on('get', this.getPowerState.bind(this));
    
            if( this.config.can_dim == null || this.config.can_dim == true ) {
                lightbulbService
                    .addCharacteristic(new Characteristic.Brightness())
                    .on('set', this.setValue.bind(this))
                    .on('get', this.getValue.bind(this));
            }

            services.push( lightbulbService );
            break;
            }
        case "Fan": {
            var fanService = new Service.Fan();
            fanService
                .getCharacteristic(Characteristic.On)
                .on('set', this.setPowerState.bind(this))
                .on('get', this.getPowerState.bind(this));
            services.push( fanService );
            break;
            }
        case "Switch": {
            var switchService = new Service.Switch();
            switchService
                .getCharacteristic(Characteristic.On)
                .on('set', this.setPowerState.bind(this))
                .on('get', this.getPowerState.bind(this));
            services.push( switchService );
            break;
            }
        case "Outlet": {
            var outletService = new Service.Outlet();
            outletService
                .getCharacteristic(Characteristic.On)
                .on('set', this.setPowerState.bind(this))
                .on('get', this.getPowerState.bind(this));
            services.push( outletService );
            break;
            }
        case "TemperatureSensor": {
            var temperatureSensorService = new Service.TemperatureSensor();
            temperatureSensorService
                .getCharacteristic(Characteristic.CurrentTemperature)
                .on('get', this.getValue.bind(this));
            services.push( temperatureSensorService );
            break;
            }
        case "ContactSensor": {
            var contactSensorService = new Service.ContactSensor();
            contactSensorService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on('get', this.getPowerState.bind(this));
            services.push( contactSensorService );
            break;
            }
        case "MotionSensor": {
            var motionSensorService = new Service.MotionSensor();
            motionSensorService
                .getCharacteristic(Characteristic.MotionDetected)
                .on('get', this.getPowerState.bind(this));
            services.push( motionSensorService );
            break;
            }
        case "LeakSensor": {
            var leakSensorService = new Service.LeakSensor();
            leakSensorService
                .getCharacteristic(Characteristic.LeakDetected)
                .on('get', this.getPowerState.bind(this));
            services.push( leakSensorService );
            break;
            }
        case "LightSensor": {
            var lightSensorService = new Service.LightSensor();
            lightSensorService
                .getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .on('get', this.getValue.bind(this));
            services.push( lightSensorService );
            break;
            }
        case "OccupancySensor": {
            var occupancySensorService = new Service.OccupancySensor();
            motionSensorService
                .getCharacteristic(Characteristic.OccupancyDetected)
                .on('get', this.getPowerState.bind(this));
            services.push( occupancySensorService );
            break;
            }
        case "SmokeSensor": {
            var smokeSensorService = new Service.SmokeSensor();
            smokeSensorService
                .getCharacteristic(Characteristic.SmokeDetected)
                .on('get', this.getPowerState.bind(this));
            services.push( smokeSensorService );
            break;
            }
        case "Door": {
            var doorService = new Service.Door();
            doorService
                .getCharacteristic(Characteristic.CurrentPosition)
                .on('get', this.getValue.bind(this));
            doorService
                .getCharacteristic(Characteristic.TargetPosition)
                .on('set', this.setValue.bind(this));
            services.push( doorService );
            break;
            }
        default:{
            var lightbulbService = new Service.Lightbulb();
            lightbulbService
                .getCharacteristic(Characteristic.On)
                .on('set', this.setPowerState.bind(this))
                .on('get', this.getPowerState.bind(this));
    
            lightbulbService
                .addCharacteristic(new Characteristic.Brightness())
                .on('set', this.setValue.bind(this))
                .on('get', this.getValue.bind(this));

            services.push( lightbulbService );
            break;
            }
        }

        return services;
    }
}

module.exports.accessory = HomeSeerAccessory;
module.exports.platform = HomeSeerPlatform;
