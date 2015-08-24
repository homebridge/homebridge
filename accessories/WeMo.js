var types = require("HAP-NodeJS/accessories/types.js");
var wemo = require('wemo');

// extend our search timeout from 5 seconds to 60
wemo.SearchTimeout = 60000;
wemo.timeout = wemo.SearchTimeout // workaround for a bug in wemo.js v0.0.4

function WeMoAccessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.wemoName = config["wemo_name"];
  this.device = null;
  this.log("Searching for WeMo device with exact name '" + this.wemoName + "'...");
  this.search();
}

WeMoAccessory.prototype = {

  search: function() {
    var that = this;

    wemo.Search(this.wemoName, function(err, device) {
      if (!err && device) {
        that.log("Found '"+that.wemoName+"' device at " + device.ip);
        that.device = new wemo(device.ip, device.port);
      }
      else {
        that.log("Error finding device '" + that.wemoName + "': " + err);
        that.log("Continuing search for WeMo device with exact name '" + that.wemoName + "'...");
        that.search();
      }
    });
  },

  setPowerState: function(powerOn) {

    if (!this.device) {
      this.log("No '"+this.wemoName+"' device found (yet?)");
      return;
    }

    var binaryState = powerOn ? 1 : 0;
    var that = this;

    this.log("Setting power state on the '"+this.wemoName+"' to " + binaryState);

    this.device.setBinaryState(binaryState, function(err, result) {
      if (!err) {
        that.log("Successfully set power state on the '"+that.wemoName+"' to " + binaryState);
      }
      else {
        that.log("Error setting power state on the '"+that.wemoName+"'")
      }
    });
  },

  getPowerState: function(callback) {

    if (!this.device) {
      this.log("No '"+this.wemoName+"' device found (yet?)");
      return;
    }

    var that = this;

    this.log("checking power state for: " + this.wemoName);
    this.device.getBinaryState(function(err, result) {
        if (!err) {
            var binaryState = parseInt(result)
            that.log("power state for " + that.wemoName + " is: " + binaryState)
            callback(binaryState > 0 ? 1 : 0);
        }
        else {
            that.log(err)
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
        initialValue: "WeMo",
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
      sType: types.SWITCH_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: this.name,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of service",
        designedMaxLength: 255
      },{
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) { that.setPowerState(value); },
        onRead: function(callback) {
          that.getPowerState(function(powerState){
            callback(powerState);
          });
        },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Change the power state of the WeMo",
        designedMaxLength: 1
      }]
    }];
  }
};

module.exports.accessory = WeMoAccessory;
