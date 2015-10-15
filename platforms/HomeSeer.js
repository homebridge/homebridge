'use strict';

//
// HomeSeer Platform Shim for HomeBridge
// V0.1 - Jean-Michel Joudrier (stipus at stipus dot com) - 2015/10/07
// - Initial version
// V0.2 - Jean-Michel Joudrier (stipus at stipus dot com) - 2015/10/10
// - Occupancy sensor fix
// V0.3 - Jean-Michel Joudrier (stipus at stipus dot com) - 2015/10/11
// - Added TemperatureUnit=F|C option to temperature sensors
// - Added negative temperature support to temperature sensors
// V0.4 - Jean-Michel Joudrier (stipus at stipus dot com) - 2015/10/12
// - Added thermostat support
// V0.5 - Jean-Michel Joudrier (stipus at stipus dot com) - 2015/10/12
// - Added Humidity sensor support
// V0.6 - Jean-Michel Joudrier (stipus at stipus dot com) - 2015/10/12
// - Added Battery support
// - Added low battery support for all sensors
// - Added HomeSeer event support (using HomeKit switches...)
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
//         "platform": "HomeSeer",              // Required
//         "name": "HomeSeer",                  // Required
//         "host": "http://192.168.3.4:81",     // Required - If you did setup HomeSeer authentication, use "http://user:password@ip_address:port"
//
//         "events":[                           // Optional - List of Events - Currently they are imported into HomeKit as switches
//            {
//               "eventGroup":"My Group",       // Required - The HomeSeer event group
//               "eventName":"My Event",        // Required - The HomeSeer event name
//               "name":"Test"                  // Optional - HomeSeer event name is the default
//            }
//         ],
//
//         "accessories":[                      // Required - List of Accessories
//            {
//              "ref":8,                        // Required - HomeSeer Device Reference (To get it, select the HS Device - then Advanced Tab) 
//              "type":"Lightbulb",             // Optional - Lightbulb is the default
//              "name":"My Light",              // Optional - HomeSeer device name is the default
//              "offValue":"0",                 // Optional - 0 is the default
//              "onValue":"100",                // Optional - 100 is the default
//              "can_dim":true                  // Optional - true is the default - false for a non dimmable lightbulb
//            },
//            {
//              "ref":9                         // This is a dimmable Lightbulb by default
//            },
//            {
//              "ref":58,                       // This is a controllable outlet
//              "type":"Outlet"
//            },
//            {
//              "ref":111,                      // Required - HomeSeer Device Reference for your sensor
//              "type":"TemperatureSensor",     // Required for a temperature sensor
//              "temperatureUnit":"F",          // Optional - C is the default
//              "name":"Bedroom temp",          // Optional - HomeSeer device name is the default
//              "batteryRef":112,               // Optional - HomeSeer device reference for the sensor battery level
//              "batteryThreshold":15           // Optional - If sensor battery level is below this value, the HomeKit LowBattery characteristic is set to 1. Default is 10
//            },
//            {
//              "ref":113,                      // Required - HomeSeer Device Reference of the Current Temperature Device
//              "type":"Thermostat",            // Required for a Thermostat
//              "name":"Température Salon",     // Optional - HomeSeer device name is the default
//              "temperatureUnit":"C",          // Optional - F for Fahrenheit, C for Celsius, C is the default
//              "setPointRef":167,              // Required - HomeSeer device reference for your thermostat Set Point.
//              "setPointReadOnly":true,        // Optional - Set to false if your SetPoint is read/write. true is the default
//              "stateRef":166,                 // Required - HomeSeer device reference for your thermostat current state
//              "stateOffValues":[0,4,5],       // Required - List of the HomeSeer device values for a HomeKit state=OFF
//              "stateHeatValues":[1],          // Required - List of the HomeSeer device values for a HomeKit state=HEAT
//              "stateCoolValues":[2],          // Required - List of the HomeSeer device values for a HomeKit state=COOL
//              "stateAutoValues":[3],          // Required - List of the HomeSeer device values for a HomeKit state=AUTO
//              "controlRef":168,               // Required - HomeSeer device reference for your thermostat mode control (It can be the same as stateRef for some thermostats)
//              "controlOffValue":0,            // Required - Value for OFF
//              "controlHeatValue":1,           // Required - Value for HEAT
//              "controlCoolValue":2,           // Required - Value for COOL
//              "controlAutoValue":3,           // Required - Value for AUTO
//              "coolingThresholdRef":169,      // Optional - Not-implemented-yet - HomeSeer device reference for your thermostat cooling threshold
//              "heatingThresholdRef":170       // Optional - Not-implemented-yet - HomeSeer device reference for your thermostat heating threshold               
//            },
//            {
//              "ref":115,                      // Required - HomeSeer Device Reference for a device holding battery level (0-100)
//              "type":"Battery",               // Required for a Battery
//              "name":"Roomba battery",        // Optional - HomeSeer device name is the default
//              "batteryThreshold":15           // Optional - If the level is below this value, the HomeKit LowBattery characteristic is set to 1. Default is 10
//            }
//         ]
//     }
// ],
//
//
// SUPORTED TYPES:
// - Lightbulb         (can_dim, onValue, offValue options)
// - Fan               (onValue, offValue options)
// - Switch            (onValue, offValue options)
// - Outlet            (onValue, offValue options)
// - Thermostat        (temperatureUnit, setPoint, state, control options)
// - TemperatureSensor (temperatureUnit=C|F)
// - ContactSensor     (0=no contact, 1=contact - batteryRef, batteryThreshold option)
// - MotionSensor      (0=no motion, 1=motion  - batteryRef, batteryThreshold option)
// - LeakSensor        (0=no leak, 1=leak  - batteryRef, batteryThreshold option)
// - LightSensor       (HomeSeer device value in Lux  - batteryRef, batteryThreshold option)
// - HumiditySensor    (HomeSeer device value in %  - batteryRef, batteryThreshold option)
// - OccupancySensor   (0=no occupancy, 1=occupancy  - batteryRef, batteryThreshold option)
// - SmokeSensor       (0=no smoke, 1=smoke  - batteryRef, batteryThreshold option)
// - Battery           (batteryThreshold option)
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
        var that = this;
        var foundAccessories = [];

        if( this.config.events ) {
            this.log("Creating HomeSeer events.");
            for( var i=0; i<this.config.events.length; i++ ) {
                var event = new HomeSeerEvent( that.log, that.config, that.config.events[i] );
                foundAccessories.push( event );
            }
        }

        this.log("Fetching HomeSeer devices.");
        var refList = "";
        for( var i=0; i<this.config.accessories.length; i++ ) {
            refList = refList + this.config.accessories[i].ref;
            if( i < this.config.accessories.length - 1 )
                refList = refList + ",";
        }
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

    this.access_url = platformConfig["host"] + "/JSON?";
    this.control_url = this.access_url + "request=controldevicebyvalue&ref=" + this.ref + "&value=";
    this.status_url = this.access_url + "request=getstatus&ref=" + this.ref;

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

    setTemperature: function(temperature, callback) {
        this.log("Setting temperature to %s", temperature);
        if( this.config.temperatureUnit == "F" ) {
            temperature = temperature*9/5+32;
        }

        var url = this.control_url + temperature;
        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer set temperature function failed: %s', error.message);
                callback(error);
            }
            else {
                this.log('HomeSeer set temperature function succeeded!');
                callback();
            }
        }.bind(this));
    },

    getTemperature: function(callback) {
        var url = this.status_url;

        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer get temperature function failed: %s', error.message);
                callback( error, 0 );
            }
            else {
                var status = JSON.parse( body );
                var value = status.Devices[0].value;
	
                this.log('HomeSeer get temperature function succeeded: value=' + value );
                if( this.config.temperatureUnit == "F" ) {
                    value = (value-32)*5/9;
                }
                callback( null, value );
            }
        }.bind(this));
    },

    getThermostatCurrentHeatingCoolingState: function(callback) {
        var ref = this.config.stateRef;
        var url = this.access_url + "request=getstatus&ref=" + ref;

        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer get thermostat current heating cooling state function failed: %s', error.message);
                callback( error, 0 );
            }
            else {
                var status = JSON.parse( body );
                var value = status.Devices[0].value;
	
                this.log('HomeSeer get thermostat current heating cooling state function succeeded: value=' + value );
                if( this.config.stateOffValues.indexOf(value) != -1 )
                    callback( null, 0 );
                else if( this.config.stateHeatValues.indexOf(value) != -1 )
                    callback( null, 1 );
                else if( this.config.stateCoolValues.indexOf(value) != -1 )
                    callback( null, 2 );
                else if( this.config.stateAutoValues.indexOf(value) != -1 )
                    callback( null, 3 );
                else {
                    this.log( "Error: value for thermostat current heating cooling state not in offValues, heatValues, coolValues or autoValues" );
                    callback( null, 0 );                
                }
            }
        }.bind(this));
    },

    setThermostatCurrentHeatingCoolingState: function(state, callback) {
        this.log("Setting thermostat current heating cooling state to %s", state);

        var ref = this.config.controlRef;
        var value = 0;
        if( state == 0 )
            value = this.config.controlOffValue;
        else if( state == 1 )
            value = this.config.controlHeatValue;
        else if( state == 2 )
            value = this.config.controlCoolValue;
        else if( state == 3 )
            value = this.config.controlAutoValue;

        var url = this.access_url + "request=controldevicebyvalue&ref=" + ref + "&value=" + value;
        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer set thermostat current heating cooling state function failed: %s', error.message);
                callback(error);
            }
            else {
                this.log('HomeSeer set thermostat current heating cooling state function succeeded!');
                callback();
            }
        }.bind(this));
    },

    getThermostatTargetTemperature: function(callback) {
        var ref = this.config.setPointRef;
        var url = this.access_url + "request=getstatus&ref=" + ref;

        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer get thermostat target temperature function failed: %s', error.message);
                callback( error, 0 );
            }
            else {
                var status = JSON.parse( body );
                var value = status.Devices[0].value;
	
                this.log('HomeSeer get thermostat target temperature function succeeded: value=' + value );
                if( this.config.temperatureUnit == "F" ) {
                    value = (value-32)*5/9;
                }
                callback( null, value );
            }
        }.bind(this));
    },

    setThermostatTargetTemperature: function(temperature, callback) {
        this.log("Setting thermostat target temperature to %s", temperature);
        if( this.config.temperatureUnit == "F" ) {
            temperature = temperature*9/5+32;
        }

        var ref = this.config.setPointRef;
        var url = this.access_url + "request=controldevicebyvalue&ref=" + ref + "&value=" + temperature;
        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer set thermostat target temperature function failed: %s', error.message);
                callback(error);
            }
            else {
                this.log('HomeSeer set thermostat target temperature function succeeded!');
                callback();
            }
        }.bind(this));
    },

    getThermostatTemperatureDisplayUnits: function(callback) {
        if( this.config.temperatureUnit == "F" )
            callback( null, 1 );
        else
            callback( null, 0 );
    },

    getLowBatteryStatus: function(callback) {
        var ref = this.config.batteryRef;
        var url = this.access_url + "request=getstatus&ref=" + ref;

        httpRequest(url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer get battery status function failed: %s', error.message);
                callback( error, 0 );
            }
            else {
                var status = JSON.parse( body );
                var value = status.Devices[0].value;
                var minValue = 10;	

                this.log('HomeSeer get battery status function succeeded: value=' + value );
                if( this.config.batteryThreshold ) {
                    	minValue = this.config.batteryThreshold;
                }

                if( value > minValue )
                    callback( null, 0 );
                else
                    callback( null, 1 );
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
                .on('get', this.getTemperature.bind(this));
            temperatureSensorService
                .getCharacteristic(Characteristic.CurrentTemperature).setProps( {minValue: -100} );
            if( this.config.batteryRef ) {
                temperatureSensorService
                    .addCharacteristic(new Characteristic.StatusLowBattery())
                    .on('get', this.getLowBatteryStatus.bind(this));
            }
            services.push( temperatureSensorService );
            break;
            }
        case "ContactSensor": {
            var contactSensorService = new Service.ContactSensor();
            contactSensorService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on('get', this.getPowerState.bind(this));
            if( this.config.batteryRef ) {
                contactSensorService
                    .addCharacteristic(new Characteristic.StatusLowBattery())
                    .on('get', this.getLowBatteryStatus.bind(this));
            }
            services.push( contactSensorService );
            break;
            }
        case "MotionSensor": {
            var motionSensorService = new Service.MotionSensor();
            motionSensorService
                .getCharacteristic(Characteristic.MotionDetected)
                .on('get', this.getPowerState.bind(this));
            if( this.config.batteryRef ) {
                motionSensorService
                    .addCharacteristic(new Characteristic.StatusLowBattery())
                    .on('get', this.getLowBatteryStatus.bind(this));
            }
            services.push( motionSensorService );
            break;
            }
        case "LeakSensor": {
            var leakSensorService = new Service.LeakSensor();
            leakSensorService
                .getCharacteristic(Characteristic.LeakDetected)
                .on('get', this.getPowerState.bind(this));
            if( this.config.batteryRef ) {
                leakSensorService
                    .addCharacteristic(new Characteristic.StatusLowBattery())
                    .on('get', this.getLowBatteryStatus.bind(this));
            }
            services.push( leakSensorService );
            break;
            }
        case "LightSensor": {
            var lightSensorService = new Service.LightSensor();
            lightSensorService
                .getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .on('get', this.getValue.bind(this));
            if( this.config.batteryRef ) {
                lightSensorService
                    .addCharacteristic(new Characteristic.StatusLowBattery())
                    .on('get', this.getLowBatteryStatus.bind(this));
            }
            services.push( lightSensorService );
            break;
            }
        case "HumiditySensor": {
            var humiditySensorService = new Service.HumiditySensor();
            humiditySensorService
                .getCharacteristic(Characteristic.CurrentRelativeHumidity)
                .on('get', this.getValue.bind(this));
            if( this.config.batteryRef ) {
                humiditySensorService
                    .addCharacteristic(new Characteristic.StatusLowBattery())
                    .on('get', this.getLowBatteryStatus.bind(this));
            }
            services.push( humiditySensorService );
            break;
            }
        case "OccupancySensor": {
            var occupancySensorService = new Service.OccupancySensor();
            occupancySensorService
                .getCharacteristic(Characteristic.OccupancyDetected)
                .on('get', this.getPowerState.bind(this));
            if( this.config.batteryRef ) {
                occupancySensorService
                    .addCharacteristic(new Characteristic.StatusLowBattery())
                    .on('get', this.getLowBatteryStatus.bind(this));
            }
            services.push( occupancySensorService );
            break;
            }
        case "SmokeSensor": {
            var smokeSensorService = new Service.SmokeSensor();
            smokeSensorService
                .getCharacteristic(Characteristic.SmokeDetected)
                .on('get', this.getPowerState.bind(this));
            if( this.config.batteryRef ) {
                temperatureSensorService
                    .addCharacteristic(new Characteristic.StatusLowBattery())
                    .on('get', this.getLowBatteryStatus.bind(this));
            }
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
        case "Battery": {
            this.config.batteryRef = this.ref;
            var batteryService = new Service.BatteryService();
            batteryService
                .getCharacteristic(Characteristic.BatteryLevel)
                .on('get', this.getValue.bind(this));
            batteryService
                .getCharacteristic(Characteristic.StatusLowBattery)
                .on('get', this.getLowBatteryStatus.bind(this));
            services.push( batteryService );
            break;
            }
        case "Thermostat": {
            var thermostatService = new Service.Thermostat();
            thermostatService
                .getCharacteristic(Characteristic.CurrentTemperature)
                .on('get', this.getTemperature.bind(this));
            thermostatService
                .getCharacteristic(Characteristic.TargetTemperature)
                .on('get', this.getThermostatTargetTemperature.bind(this));
            if( this.config.setPointReadOnly === null || this.config.setPointReadOnly === false )
                thermostatService
                    .getCharacteristic(Characteristic.TargetTemperature)
                    .on('set', this.setThermostatTargetTemperature.bind(this));
            thermostatService
                .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                .on('get', this.getThermostatCurrentHeatingCoolingState.bind(this));
            thermostatService
                .getCharacteristic(Characteristic.TargetHeatingCoolingState)
                .on('get', this.getThermostatCurrentHeatingCoolingState.bind(this));
            thermostatService
                .getCharacteristic(Characteristic.TargetHeatingCoolingState)
                .on('set', this.setThermostatCurrentHeatingCoolingState.bind(this));
            thermostatService
                .getCharacteristic(Characteristic.TemperatureDisplayUnits)
                .on('get', this.getThermostatTemperatureDisplayUnits.bind(this));

            services.push( thermostatService );
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

function HomeSeerEvent(log, platformConfig, eventConfig ) {
    this.log = log;
    this.config = eventConfig;
    this.name = eventConfig.eventName
    this.model = "HomeSeer Event";

    this.access_url = platformConfig["host"] + "/JSON?";
    this.launch_url = this.access_url + "request=runevent&group=" + encodeURIComponent(this.config.eventGroup) + "&name=" + encodeURIComponent(this.config.eventName);

    if( this.config.name )
        this.name = this.config.name;
}

HomeSeerEvent.prototype = {

    identify: function(callback) {
            callback();
    },

    launchEvent: function(value, callback) {
        this.log("Setting event value to %s", value);

        httpRequest(this.launch_url, 'GET', function(error, response, body) {
            if (error) {
                this.log('HomeSeer run event function failed: %s', error.message);
                callback(error);
            }
            else {
                this.log('HomeSeer run event function succeeded!');
                callback();
            }
        }.bind(this));
    },


    getServices: function() {
        var services = []

        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, "HomeSeer")
            .setCharacteristic(Characteristic.Model, this.model )
            .setCharacteristic(Characteristic.SerialNumber, "HS Event " + this.config.eventGroup + " " + this.config.eventName);
        services.push( informationService );

        var switchService = new Service.Switch();
        switchService
            .getCharacteristic(Characteristic.On) 
            .on('set', this.launchEvent.bind(this));
        services.push( switchService );

        return services;
    }
}

module.exports.platform = HomeSeerPlatform;
