var types = require("../lib/HAP-NodeJS/accessories/types.js");
var wemo = require('wemo');

function WeMoAccessory(log, config) {
  this.log = log;
  this.friendlyName = config["wemo_name"];
  this.device = null;
  this.log("Searching for WeMo device with exact name '" + this.friendlyName + "'...");
  this.search();
}

WeMoAccessory.prototype = {

  search: function() {
    var that = this;

    wemo.Search(this.friendlyName, function(err, device) {
      that.log("Found '"+that.friendlyName+"' device at " + device.ip);
      that.device = new wemo(device.ip, device.port);
    });
  },

  setPowerState: function(powerOn) {

    if (!this.device) {
      this.log("No '"+this.friendlyName+"' device found (yet?)");
      return;
    }

    var binaryState = powerOn ? 1 : 0;
    var that = this;
    
    this.log("Setting power state on the '"+this.friendlyName+"' to " + binaryState);

    this.device.setBinaryState(binaryState, function(err, result) {
      if (!err) {
        that.log("Successfully set power state on the '"+that.friendlyName+"' to " + binaryState);
      }
      else {
        that.log("Error setting power state on the '"+that.friendlyName+"'")
      }
    });
  },

  accessoryData: function() {
    var that = this;
    return {
      services: [{
        sType: types.ACCESSORY_INFORMATION_STYPE,
        characteristics: [{
          cType: types.NAME_CTYPE,
          onUpdate: null,
          perms: ["pr"],
          format: "string",
          initialValue: this.friendlyName,
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
          initialValue: this.friendlyName,
          supportEvents: false,
          supportBonjour: false,
          manfDescription: "Name of service",
          designedMaxLength: 255
        },{
          cType: types.POWER_STATE_CTYPE,
          onUpdate: function(value) { that.setPowerState(value); },
          perms: ["pw","pr","ev"],
          format: "bool",
          initialValue: false,
          supportEvents: false,
          supportBonjour: false,
          manfDescription: "Change the power state of the WeMo",
          designedMaxLength: 1
        }]
      }]
    }
  }
};

module.exports.accessory = WeMoAccessory;
