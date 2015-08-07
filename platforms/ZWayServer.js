var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");
var Q = require("q");

function ZWayServerPlatform(log, config){
  this.log          = log;
  this.url          = config["url"];
  this.login        = config["login"];
  this.password     = config["password"];
  this.name_overrides = config["name_overrides"];

    this.jar = request.jar();
}

ZWayServerPlatform.prototype = {

    zwayRequest: function(verb, opts){
        var that = this;
        var deferred = Q.defer();

        opts.jar = this.jar;
        opts.json = true;
//opts.proxy = 'http://localhost:8888';

        var rmethod = request[verb];
        rmethod(opts)
        .on('response', function(response){
            if(response.statusCode == 401){
that.log("Authenticating...");
                request.post({
                    url: that.url + 'ZAutomation/api/v1/login',
                    body: { //JSON.stringify({
                        "form": true,
                        "login": that.login,
                        "password": that.password,
                        "keepme": false,
                        "default_ui": 1
                    },
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    json: true,
                    jar: that.jar
                }).on('response', function(response){
                    if(response.statusCode == 200){
                        that.log("Authenticated. Resubmitting original request...");
                        rmethod(opts).on('response', function(response){
                            if(response.statusCode == 200){
                                deferred.resolve(response);
                            } else {
                                deferred.reject(response);
                            }
                        });
                    } else {
                        deferred.reject(response);
                    }
                });
            } else if(response.statusCode == 200) {
                deferred.resolve(response);
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

        this.zwayRequest('get', {
            url: this.url + 'ZAutomation/api/v1/devices'
        }).then(function(result){
            var devices = result.data.devices;
            var groupedDevices = {};
            for(var i = 0; i < devices.length; i++){
                var dentry = devices[i];
                var gdid = dentry.id.replace(/^(.*?)_zwqy_(\d+-\d+)-\d/, '$1_$2');
                var gd = groupedDevices[gdid] || (groupedDevices[gdid] = []);
                gd.push(dentry);
            }
            for(var gdid in groupedDevices) {
                if(!groupedDevices.hasOwnProperty(gdid)) continue;
                this.log('Got grouped device ' + gdid + ' consiting of devices:');
                var gd = groupedDevices[gdid];
                for(var j = 0; j < gd.length; j++){
                    this.log(gd[j].id);
                }
                var accessory = new ZWayServerAccessory();
                foundAccessories.push(accessory);
            }
            //callback(foundAccessories);
        });

    }

}

function ZWayServerAccessory(log, name, commands) {
  // device info
  this.name     = name;
  this.commands = commands;
  this.log      = log;
}
/*
SmartThingsAccessory.prototype = {

  command: function(c,value) {
    this.log(this.name + " sending command " + c);
    var url = this.commands[c];
    if (value != undefined) {
      url = this.commands[c] + "&value="+value
    }

    var that = this;
    request.put({
      url: url
    }, function(err, response) {
      if (err) {
        that.log("There was a problem sending command " + c + " to" + that.name);
        that.log(url);
      } else {
        that.log(that.name + " sent command " + c);
      }
    })
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
        initialValue: "SmartThings",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Rev-1",
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

  controlCharacteristics: function(that) {
    cTypes = [{
      cType: types.NAME_CTYPE,
      onUpdate: null,
      perms: ["pr"],
      format: "string",
      initialValue: this.name,
      supportEvents: true,
      supportBonjour: false,
      manfDescription: "Name of service",
      designedMaxLength: 255
    }]

    if (this.commands['on'] != undefined) {
      cTypes.push({
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) {
          if (value == 0) {
            that.command("off")
          } else {
            that.command("on")
          }
        },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: 0,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Change the power state",
        designedMaxLength: 1
      })
    }

    if (this.commands['on'] != undefined) {
      cTypes.push({
        cType: types.BRIGHTNESS_CTYPE,
        onUpdate: function(value) { that.command("setLevel", value); },
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
      })
    }

    if (this.commands['setHue'] != undefined) {
      cTypes.push({
        cType: types.HUE_CTYPE,
        onUpdate: function(value) { that.command("setHue", value); },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  0,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust Hue of Light",
        designedMinValue: 0,
        designedMaxValue: 360,
        designedMinStep: 1,
        unit: "arcdegrees"
      })
    }

    if (this.commands['setSaturation'] != undefined) {
      cTypes.push({
        cType: types.SATURATION_CTYPE,
        onUpdate: function(value) { that.command("setSaturation", value); },
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
      })
    }

    return cTypes
  },

  sType: function() {
    if (this.commands['setLevel'] != undefined) {
      return types.LIGHTBULB_STYPE
    } else {
      return types.SWITCH_STYPE
    }
  },

  getServices: function() {
    var that = this;
    var services = [{
      sType: types.ACCESSORY_INFORMATION_STYPE,
      characteristics: this.informationCharacteristics(),
    },
    {
      sType: this.sType(),
      characteristics: this.controlCharacteristics(that)
    }];
    this.log("Loaded services for " + this.name)
    return services;
  }
};
*/

module.exports.accessory = ZWayServerAccessory;
module.exports.platform = ZWayServerPlatform;
