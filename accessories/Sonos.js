var types = require("HAP-NodeJS/accessories/types.js");
var sonos = require('sonos');

function SonosAccessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.playVolume = config["play_volume"];
  this.device = null;
  this.search();
}

SonosAccessory.prototype = {

  search: function() {
    var that = this;

    sonos.search(function(device) {
      that.log("Found device at " + device.host);

      device.deviceDescription(function (err, description) {

        if (description["zoneType"] == '3') {
          that.log("Found playable device");
          // device is an instance of sonos.Sonos
          that.device = device;
        }

      });
    });
  },

  setPlaying: function(playing) {

    if (!this.device) {
      this.log("No device found (yet?)");
      return;
    }

    var that = this;

    if (playing) {
      this.device.play(function(err, success) {
        that.log("Playback attempt with success: " + success);
      });

      if (this.playVolume) {
        this.device.setVolume(this.playVolume, function(err, success) {
          if (!err) {
            that.log("Set volume to " + that.playVolume);
          }
          else {
            that.log("Problem setting volume: " + err);
          }
        });
      }
    }
    else {
      this.device.stop(function(err, success) {
        that.log("Stop attempt with success: " + success);
      });
    }
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
        initialValue: "Sonos",
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
        initialValue: "Speakers",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of service",
        designedMaxLength: 255
      },{
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) { that.setPlaying(value); },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Change the playback state of the sonos",
        designedMaxLength: 1
      }]
    }];
  }
};

module.exports.accessory = SonosAccessory;
