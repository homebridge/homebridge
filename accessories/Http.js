var types = require("../lib/HAP-NodeJS/accessories/types.js");
var request = require("request");

function HttpAccessory(log, config) {
  this.log = log;

  // url info
  this.on_url = config["on_url"];
  this.off_url = config["off_url"];
  this.brightness_url = config["brightness_url"];
  this.http_method = config["http_method"];

  // device info
  this.name = config["name"];
}

HttpAccessory.prototype = {

  httpRequest: function(url, method, callback) {
    request({
      url: url,
      method: method
    },
    function (error, response, body) {
      callback(error, response, body)
    })
  },

  getPowerState: function(callback){
    if (!this.read_powered_url) { callback(null); }

    var that = this;
    this.log("checking power state for: " + this.name);

    this.httpRequest(this.read_powered_url, 'GET', function(error, response, body){
      if (error) {
        that.log('http get powerState failed:', error);
        callback(null)
      }else{
        that.log('http getPowerState function succeeded!');
        callback(body)
      }
    });
  },

  getBrightness: function(callback){
    if (!this.read_brightness_url) { callback(null); }

    var that = this;
    this.log("checking brightness level for: " + this.name);

    this.httpRequest(this.read_powered_url, 'GET', function(error, response, body){
      if (error) {
        that.log('http get brightness level failed:', error);
        callback(null)
      }else{
        that.log('http get brightness level succeeded!');
        callback(body)
      }
    });
  },

  setPowerState: function(powerOn) {
    if (!this.on_url) { return; }
    if (!this.off_url) { return; }

    var url;

    if (powerOn) {
      url = this.on_url
      this.log("Setting power state on the '"+this.name+"' to on");
    }else{
      url = this.off_url
      this.log("Setting power state on the '"+this.name+"' to off");
    }

    that = this

    this.httpRequest(url, this.http_method, function(error, response, body){
      if (error) {
        that.log('http power function failed:', error);
      }else{
        that.log('http power function succeeded!');
      }
    });
  },

  setBrightness: function(level) {
    if (!this.brightness_url) { return; }

    var url = this.brightness_url.replace("%b", level)

    this.log("Setting brightness on the '"+this.name+"' to " + level);
    that = this

    this.httpRequest(url, this.http_method, function(error, response, body){
      if (error) {
        that.log('http brightness function failed:', error);
      }else{
        that.log('http brightness function succeeded!');
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
        initialValue: "Http",
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
        manfDescription: "Change the power state",
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
        manfDescription: "Adjust Brightness",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      }]
    }];
  }
};

module.exports.accessory = HttpAccessory;
