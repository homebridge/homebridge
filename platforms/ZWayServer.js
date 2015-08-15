var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");
var tough = require('tough-cookie');
var Q = require("q");

var zwshkDeviceClasses = [
    {
        primaryType: "switchBinary",
        subTypes: {
            "battery": true,
            "sensorMultilevel.Electric": true
        },
        tcType: types.SWITCH_TCTYPE
    }
    ,
    {
        primaryType: "thermostat",
        subTypes: {
            "sensorMultiLevel.Temperature": true,
            "battery": true
        },
        tcType: types.THERMOSTAT_TCTYPE
    }
    ,
    {
        primaryType: "sensorBinary.Door/Window",
        subTypes: {
            "battery": true
        },
        tcType: types.SENSOR_TCTYPE
    }
    ,
    {
        primaryType: "sensorMultilevel.Temperature",
        subTypes: {
            "battery": true
        },
        tcType: types.SENSOR_TCTYPE
    }
    ,
    {
        primaryType: "switchMultilevel",
        subTypes: {
            "battery": true
        },
        tcType: types.LIGHTBULB_TCTYPE
    }
];

function ZWayServerPlatform(log, config){
    this.log          = log;
    this.url          = config["url"];
    this.login        = config["login"];
    this.password     = config["password"];
    this.name_overrides = config["name_overrides"];
    this.userAgent = "HomeBridge/-1^0.5";
    this.sessionId = "";
    this.jar = request.jar(new tough.CookieJar());
}

ZWayServerPlatform.getVDevTypeKey = function(vdev){
    return vdev.deviceType + (vdev.metrics && vdev.metrics.probeTitle ? "." + vdev.metrics.probeTitle : "")
}

ZWayServerPlatform.getVDevServiceTypes = function(vdev){
    var typeKey = ZWayServerPlatform.getVDevTypeKey(vdev);
    switch (typeKey) {
        case "switchBinary":
            return [types.SWITCH_STYPE];
        case "switchMultilevel":
            return [types.LIGHTBULB_STYPE];
        case "thermostat":
            return [types.THERMOSTAT_STYPE];
        case "sensorMultilevel.Temperature":
            return [types.TEMPERATURE_SENSOR_STYPE];
        case "sensorBinary.Door/Window":
            return [types.GARAGE_DOOR_OPENER_STYPE];
    }
}

ZWayServerPlatform.getVDevCharacteristicsTypes = function(vdev){
    var typeKey = ZWayServerPlatform.getVDevTypeKey(vdev);
    switch (typeKey) {
        case "switchBinary":
            return [types.POWER_STATE_CTYPE];
        case "switchMultilevel":
            return [types.POWER_STATE_CTYPE, types.BRIGHTNESS_CTYPE];
        case "thermostat":
            return [types.TARGET_TEMPERATURE_CTYPE, types.TEMPERATURE_UNITS_CTYPE, types.CURRENTHEATINGCOOLING_CTYPE, types.TARGETHEATINGCOOLING_CTYPE];
        case "sensorMultilevel.Temperature":
            return [types.CURRENT_TEMPERATURE_CTYPE, types.TEMPERATURE_UNITS_CTYPE];
        case "sensorBinary.Door/Window":
            return [types.CURRENT_DOOR_STATE_CTYPE];
        case "battery.Battery":
            return [types.BATTERY_LEVEL_CTYPE, types.STATUS_LOW_BATTERY_CTYPE];
    }
}

ZWayServerPlatform.prototype = {

    zwayRequest: function(opts){
        var that = this;
        var deferred = Q.defer();

        opts.jar = true;//this.jar;
        opts.json = true;
        opts.headers = {
            "Cookie": "ZWAYSession=" + this.sessionId
        };
opts.proxy = 'http://localhost:8888';

        request(opts, function(error, response, body){
            if(response.statusCode == 401){
that.log("Authenticating...");
                request({
                    method: "POST",
                    url: that.url + 'ZAutomation/api/v1/login',
proxy: 'http://localhost:8888',
                    body: { //JSON.stringify({
                        "form": true,
                        "login": that.login,
                        "password": that.password,
                        "keepme": false,
                        "default_ui": 1
                    },
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "User-Agent": that.userAgent
                    },
                    json: true,
                    jar: true//that.jar
                }, function(error, response, body){
                    if(response.statusCode == 200){
                        that.sessionId = body.data.sid;
                        opts.headers["Cookie"] = "ZWAYSession=" + that.sessionId;
                        that.log("Authenticated. Resubmitting original request...");
                        request(opts, function(error, response, body){
                            if(response.statusCode == 200){
                                deferred.resolve(body);
                            } else {
                                deferred.reject(response);
                            }
                        });
                    } else {
                        deferred.reject(response);
                    }
                });
            } else if(response.statusCode == 200) {
                deferred.resolve(body);
            } else {
                deferred.reject(response);
            }
        });
        return deferred.promise;
    }
    ,

    accessories: function(callback) {
        this.log("Fetching Z-Way devices...");

        var that = this;
        var foundAccessories = [];

        this.zwayRequest({
            method: "GET",
            url: this.url + 'ZAutomation/api/v1/devices'
        }).then(function(result){
            var devices = result.data.devices;
            var groupedDevices = {};
            for(var i = 0; i < devices.length; i++){
                var vdev = devices[i];
                var gdid = vdev.id.replace(/^(.*?)_zway_(\d+-\d+)-\d.*/, '$1_$2');
                var gd = groupedDevices[gdid] || (groupedDevices[gdid] = {devices: [], types: {}, primary: undefined});
                gd.devices.push(vdev);
                gd.types[ZWayServerPlatform.getVDevTypeKey(vdev)] = gd.devices.length - 1;
                gd.types[vdev.deviceType] = gd.devices.length - 1; // also include the deviceType only as a possibility
            }
            //TODO: Make a second pass, re-splitting any devices that don't make sense together
            for(var gdid in groupedDevices) {
                if(!groupedDevices.hasOwnProperty(gdid)) continue;
                
                // Debug/log...
                that.log('Got grouped device ' + gdid + ' consiting of devices:');
                var gd = groupedDevices[gdid];
                for(var j = 0; j < gd.devices.length; j++){
                    that.log(gd.devices[j].id + " - " + gd.devices[j].deviceType + (gd.devices[j].metrics && gd.devices[j].metrics.probeTitle ? "." + gd.devices[j].metrics.probeTitle : ""));
                }
                
                var accessory = null;
                for(var ti = 0; ti < zwshkDeviceClasses.length; ti++){
                    if(gd.types[zwshkDeviceClasses[ti].primaryType] !== undefined){
                        gd.primary = gd.types[zwshkDeviceClasses[ti].primaryType];
                        var pd = gd.devices[gd.primary];
                        var name = pd.metrics && pd.metrics.title ? pd.metrics.title : pd.id;
                        that.log("Using class with primaryType " + zwshkDeviceClasses[ti].primaryType + ", " + name + " (" + pd.id + ") as primary.");
                        accessory = new ZWayServerAccessory(name, zwshkDeviceClasses[ti], gd, that);
                        break;
                    }
                }
                if(!accessory) that.log("WARN: Didn't find suitable device class!");

                //var accessory = new ZWayServerAccessory();
                foundAccessories.push(accessory);
            }
foundAccessories = [foundAccessories[0], foundAccessories[1], foundAccessories[2], foundAccessories[3]]; // Limit to a few devices for testing...
            callback(foundAccessories);
        });

    }

}

function ZWayServerAccessory(name, dclass, devDesc, platform) {
  // device info
  this.name     = name;
  this.dclass   = dclass;
  this.devDesc  = devDesc;
  this.platform = platform;
  this.log      = platform.log;
}


ZWayServerAccessory.prototype = {

    command: function(vdev, command, value) {
        this.platform.zwayRequest({
            method: "GET",
            url: this.platform.url + 'ZAutomation/api/v1/devices/' + vdev.id + '/command/' + command + (value === undefined ? "" : "/" + value)
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
                initialValue: "Z-Wave.me",
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Manufacturer",
                designedMaxLength: 255
            },{
                cType: types.MODEL_CTYPE,
                onUpdate: null,
                perms: ["pr"],
                format: "string",
                initialValue: "VDev",
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Model",
                designedMaxLength: 255
            },{
                cType: types.SERIAL_NUMBER_CTYPE,
                onUpdate: null,
                perms: ["pr"],
                format: "string",
                initialValue: "VDev-" + this.devDesc.devices[this.devDesc.primary].h, //TODO: Is this valid?
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

    controlCharacteristics: function(vdev) {
        var that = this;
        var cTypes = [];
        
        var cxs = ZWayServerPlatform.getVDevCharacteristicsTypes(vdev);
        
        if(!cxs || cxs.length <= 0) return cTypes;
        
        if (cxs.indexOf(types.POWER_STATE_CTYPE) >= 0) {
            cTypes.push({
                cType: types.POWER_STATE_CTYPE,
                onUpdate: function(value) {
                    if (value == 0) {
                        that.command(vdev, "off");
                    } else {
                        that.command(vdev, "on");
                    }
                },
                perms: ["pw","pr","ev"],
                format: "bool",
                initialValue: 0,
                supportEvents: true,
                supportBonjour: false,
                manfDescription: "Change the power state",
                designedMaxLength: 1
            });
        }

        if (cxs.indexOf(types.BRIGHTNESS_CTYPE) >= 0) {
            cTypes.push({
                cType: types.BRIGHTNESS_CTYPE,
                onUpdate: function(value) {
                    that.command(vdev, "exact", value);
                },
                perms: ["pw","pr","ev"],
                format: "int",
                initialValue:  0,
                supportEvents: true,
                supportBonjour: false,
                manfDescription: "Adjust Brightness of Light",
                designedMinValue: 0,
                designedMaxValue: 100,
                designedMinStep: 1,
                unit: "%"
            });
        }
        
        if (cxs.indexOf(types.CURRENT_TEMPERATURE_CTYPE) >= 0) {
            cTypes.push({
                cType: types.CURRENT_TEMPERATURE_CTYPE,
                onUpdate: null,
                onRead: function(callback) {
                    that.platform.zwayRequest({
                        method: "GET",
                        url: that.platform.url + 'ZAutomation/api/v1/devices/' + vdev.id
                    }).then(function(result){
                        callback(result.data.metrics.level);
                    });
                },
                perms: ["pr","ev"],
                format: "int",
                initialValue: 20,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Current Temperature",
                unit: "celsius"
            });
        }
        
        if (cxs.indexOf(types.TARGET_TEMPERATURE_CTYPE) >= 0) {
            cTypes.push({
                cType: types.TARGET_TEMPERATURE_CTYPE,
                onUpdate: function(value) {
                    that.command(vdev, "exact", value);
                },
                onRead: function(callback) {
                    that.platform.zwayRequest({
                        method: "GET",
                        url: that.platform.url + 'ZAutomation/api/v1/devices/' + vdev.id
                    }).then(function(result){
                        callback(result.data.metrics.level);
                    });
                },
                perms: ["pw","pr","ev"],
                format: "int",
                initialValue: 20,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Target Temperature",
                designedMinValue: 2,
                designedMaxValue: 38,
                designedMinStep: 1,
                unit: "celsius"
            });
        }
        
        if (cxs.indexOf(types.TEMPERATURE_UNITS_CTYPE) >= 0) {
            cTypes.push({
                cType: types.TEMPERATURE_UNITS_CTYPE,
                perms: ["pr"],
                format: "int",
                //TODO: Let this update from the device if it changes after startup.
                initialValue: vdev.metrics.scaleTitle.indexOf("F") >= 0 ? 1 : 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Unit",
            });
        }
        
        if (cxs.indexOf(types.CURRENTHEATINGCOOLING_CTYPE) >= 0) {
            cTypes.push({
                cType: types.CURRENTHEATINGCOOLING_CTYPE,
                //TODO: Support multifunction thermostats...only heating supported now.
                /*
                onUpdate: null,
                onRead: function(callback) {
                    that.getCurrentHeatingCooling(function(currentHeatingCooling){
                        callback(currentHeatingCooling);
                    });
                },
                */
                perms: ["pr"],
                format: "int",
                initialValue: 1,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Current Mode",
                designedMaxLength: 1,
                designedMinValue: 0,
                designedMaxValue: 2,
                designedMinStep: 1,    
            });
        }
            
        if (cxs.indexOf(types.TARGETHEATINGCOOLING_CTYPE) >= 0) {
            cTypes.push({
                cType: types.TARGETHEATINGCOOLING_CTYPE,
                //TODO: Support multifunction thermostats...only heating supported now.
                /*
                onUpdate: function(value) {
                    that.setTargetHeatingCooling(value);
                },
                onRead: function(callback) {
                    that.getTargetHeatingCoooling(function(targetHeatingCooling){
                        callback(targetHeatingCooling);
                    });
                },
                */
                perms: ["pr"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Target Mode",
                designedMinValue: 0,
                designedMaxValue: 3,
                designedMinStep: 1,
            });
        }
            
        if (cxs.indexOf(types.CONTACT_SENSOR_STATE_CTYPE) >= 0) {
            cTypes.push({
                cType: types.CONTACT_SENSOR_STATE_CTYPE,
                onUpdate: null,
                onRead: function(callback) {
                    that.platform.zwayRequest({
                        method: "GET",
                        url: that.platform.url + 'ZAutomation/api/v1/devices/' + vdev.id
                    }).then(function(result){
                        callback(result.data.metrics.level == "off" ? 0 : 1);
                    });
                },
                perms: ["pr","ev"],
                format: "bool",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Contact State",
                designedMaxLength: 1
            });
        }
        
        if (cxs.indexOf(types.CURRENT_DOOR_STATE_CTYPE) >= 0) {
            cTypes.push({
                cType: types.CURRENT_DOOR_STATE_CTYPE,
                onRead: function(callback) {
                    that.platform.zwayRequest({
                        method: "GET",
                        url: that.platform.url + 'ZAutomation/api/v1/devices/' + vdev.id
                    }).then(function(result){
                        callback(result.data.metrics.level == "off" ? 0 : 1);
                    });
                },
                perms: ["pr","ev"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Current Door State",
                designedMinValue: 0,
                designedMaxValue: 4,
                designedMinStep: 1,
                designedMaxLength: 1    
            });
        }

        return cTypes;
    },

    getServices: function() {
        var that = this;
        var services = [{
            sType: types.ACCESSORY_INFORMATION_STYPE,
            characteristics: this.informationCharacteristics(),
        }];
    
        // rearrange the array so the primary is first
        var vdevs = this.devDesc.devices.concat();
        var p = vdevs.splice(this.devDesc.primary, 1)[0];
        vdevs.unshift(p);
        /*
        for(var i = 0; i < vdevs.length; i++){
            var sTypes = ZWayServerPlatform.getVDevServiceTypes(vdevs[i]);
            if(!sTypes) continue;
            for(var j = 0; j < sTypes.length; j++){
                services.push({
                    sType: sTypes[j],
                    characteristics: this.controlCharacteristics(vdevs[i])
                });
            }
        }
        */
       
        var sTypes = ZWayServerPlatform.getVDevServiceTypes(vdevs[0]);
        var cTypes = [{
            cType: types.NAME_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: this.name,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Name of service",
            designedMaxLength: 255
        }];
        if(sTypes) for(var i = 0; i < vdevs.length; i++){
            cTypes = cTypes.concat(this.controlCharacteristics(vdevs[i]));
        }
        
        // Scrub/eliminate duplicate cTypes? This is a lot of guesswork ATM...
        var hits = {};
        for (var i = 0; i < cTypes.length; i++){
            if(hits[cTypes[i].cType]) cTypes.splice(i--, 1); // Remember postfix means post-evaluate!
            hits[cTypes[i].cType] = true;
        }
        
        services.push({
            sType: sTypes[0],
            characteristics: cTypes
        });
        //...
        
        this.log("Loaded services for " + this.name);
        return services;
    }
};

module.exports.accessory = ZWayServerAccessory;
module.exports.platform = ZWayServerPlatform;
