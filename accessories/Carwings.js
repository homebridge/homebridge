var types = require("HAP-NodeJS/accessories/types.js");
var carwings = require("carwingsjs");

function CarwingsAccessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.username = config["username"];
  this.password = config["password"];
}

CarwingsAccessory.prototype = {

  setPowerState: function(powerOn) {
    var that = this;

    carwings.login(this.username, this.password, function(err, result) {
      if (!err) {
        that.vin = result.vin;
        that.log("Got VIN: " + that.vin);

        if (powerOn) {
          carwings.startClimateControl(that.vin, null, function(err, result) {
            if (!err)
              that.log("Started climate control.");
            else
              that.log("Error starting climate control: " + err);
          });
        }
        else {
          carwings.stopClimateControl(that.vin, function(err, result) {
            if (!err)
              that.log("Stopped climate control.");
            else
              that.log("Error stopping climate control: " + err);
          });
        }
      }
      else {
        that.log("Error logging in: " + err);
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
        initialValue: "Nissan",
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
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Change the power state of the car",
        designedMaxLength: 1
      }]
    }];
  }
};

module.exports.accessory = CarwingsAccessory;
