var types = require("HAP-NodeJS/accessories/types.js");
var wink = require('wink-js');

var model = {
  light_bulbs: require('wink-js/lib/model/light')
};


function WinkPlatform(log, config){

  // auth info
  this.client_id = config["client_id"];
  this.client_secret = config["client_secret"];
  this.username = config["username"];
  this.password = config["password"];

  this.log = log;
}

WinkPlatform.prototype = {
  accessories: function(callback) {
    this.log("Fetching Wink devices.");

    var that = this;
    var foundAccessories = [];

    wink.init({
        "client_id": this.client_id,
        "client_secret": this.client_secret,
        "username": this.username,
        "password": this.password
    }, function(auth_return) {
      if ( auth_return === undefined ) {
        that.log("There was a problem authenticating with Wink.");
      } else {
        // success
        wink.user().devices('light_bulbs', function(devices) {
          for (var i=0; i<devices.data.length; i++){
            device = model.light_bulbs(devices.data[i], wink)
            accessory = new WinkAccessory(that.log, device);
            foundAccessories.push(accessory);
          }
          callback(foundAccessories);
        });
      }
    });

  }
}

function WinkAccessory(log, device) {
  // device info
  this.name = device.name;
  this.device = device;
  this.log = log;
}

WinkAccessory.prototype = {
  getPowerState: function(callback){
    if (!this.device) {
      this.log("No '"+this.name+"' device found (yet?)");
      return;
    }

    var that = this;

    this.log("checking power state for: " + this.name);
    wink.user().device(this.name, function(light_obj){
      powerState = light_obj.desired_state.powered
      that.log("power state for " + that.name + " is: " + powerState)
      callback(powerState);
    });


  },

  getBrightness: function(callback){
    if (!this.device) {
      this.log("No '"+this.name+"' device found (yet?)");
      return;
    }

    var that = this;

    this.log("checking brightness level for: " + this.name);
    wink.user().device(this.name, function(light_obj){
      level = light_obj.desired_state.brightness * 100
      that.log("brightness level for " + that.name + " is: " + level)
      callback(level);
    });

  },

  setPowerState: function(powerOn) {
    if (!this.device) {
      this.log("No '"+this.name+"' device found (yet?)");
      return;
    }

    var that = this;

    if (powerOn) {
      this.log("Setting power state on the '"+this.name+"' to on");
      this.device.power.on(function(response) {
        if (response === undefined) {
          that.log("Error setting power state on the '"+that.name+"'")
        } else {
          that.log("Successfully set power state on the '"+that.name+"' to on");
        }
      });
    }else{
      this.log("Setting power state on the '"+this.name+"' to off");
      this.device.power.off(function(response) {
        if (response === undefined) {
          that.log("Error setting power state on the '"+that.name+"'")
        } else {
          that.log("Successfully set power state on the '"+that.name+"' to off");
        }
      });
    }

  },

  setBrightness: function(level) {
    if (!this.device) {
      this.log("No '"+this.name+"' device found (yet?)");
      return;
    }

    var that = this;

    this.log("Setting brightness on the '"+this.name+"' to " + level);
    this.device.brightness(level, function(response) {
      if (response === undefined) {
        that.log("Error setting brightness on the '"+that.name+"'")
      } else {
        that.log("Successfully set brightness on the '"+that.name+"' to " + level);
      }
    });
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
        initialValue: "Wink",
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
      }]
    },{
      sType: types.LIGHTBULB_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: this.name,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Name of service",
        designedMaxLength: 255
      },{
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) {
          that.setPowerState(value);
        },
        onRead: function(callback) {
          that.getPowerState(function(powerState){
            callback(powerState);
          });
        },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: 0,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Change the power state of the Bulb",
        designedMaxLength: 1
      },{
        cType: types.BRIGHTNESS_CTYPE,
        onUpdate: function(value) {
          that.setBrightness(value);
        },
        onRead: function(callback) {
          that.getBrightness(function(level){
            callback(level);
          });
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
      }]
    }];
  }
};

module.exports.accessory = WinkAccessory;
module.exports.platform = WinkPlatform;
