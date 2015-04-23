var types = require("../lib/HAP-NodeJS/accessories/types.js");
var request = require("request");

function X10(log, config) {
  this.log = log;
  this.ip_address = config["ip_address"];
  this.name = config["name"];
  this.deviceID = config["device_id"];
  this.protocol = config["protocol"];
  this.canDim = config["can_dim"];
}

X10.prototype = {

  setPowerState: function(powerOn) {

    var binaryState = powerOn ? "on" : "off";
    var that = this;
    
    this.log("Setting power state of " + this.deviceID + " to " + powerOn);
    this.log("http://"+this.ip_address+"/x10/"+this.deviceID+"/power/"+binaryState+"?protocol="+this.protocol);
    request.put({
      url: "http://"+this.ip_address+"/x10/"+this.deviceID+"/power/"+binaryState+"?protocol="+this.protocol,
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        that.log("State change complete.");
      }
      else {
        that.log("Error '"+err+"' setting power state: " + body);
      }
    });
  },

  setBrightnessLevel: function(value) {

    var that = this;
    
    this.log("Setting brightness level of " + this.deviceID + " to " + value);
    request.put({
      url: "http://"+this.ip_address+"/x10/"+this.deviceID+"/brightness/?protocol="+this.protocol+"&value="+value,
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        that.log("State change complete.");
      }
      else {
        that.log("Error '"+err+"' setting brightness level: " + body);
      }
    });
  },

  getServices: function() {
    var that = this;
    var services = [{
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
        initialValue: "X10",
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
        manfDescription: "Change the power state of a Variable",
        designedMaxLength: 1
      }]
    }];
    if (that.canDim) {
      services[1].characteristics.push({
        cType: types.BRIGHTNESS_CTYPE,
        onUpdate: function(value) { that.setBrightnessLevel(value); },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue: 0,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Adjust Brightness of Light",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      });
    }
    return services;
  }
};

module.exports.accessory = X10;
