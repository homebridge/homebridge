var types = require("HAP-NodeJS/accessories/types.js");
var net = require('net');
var Color = require('color');

function HyperionAccessory(log, config) {
  this.log = log;
  this.host = config["host"];
  this.port = config["port"];
  this.name = config["name"];
  this.color = Color().hsv([0, 0, 0]);
  this.prevColor = Color().hsv([0,0,100]);
}


HyperionAccessory.prototype = {

  sendHyperionCommand: function(command, cmdParams, priority) {
    var that = this;
    var client = new net.Socket();
    var data = {};

    if (typeof priority === 'undefined') { priority = 100; }

    switch (command) {
        case 'color':
            data = {"command":"color", "priority":priority,"color":cmdParams}; 
            break;
        case 'blacklevel':
            data = {"command":"transform","transform":{"blacklevel":cmdParams}}
            break;
        default:
            that.log("Hyperion command not found");
            return;
    }

    //that.log(JSON.stringify(data));

    client.connect(that.port, that.host, function() {
        client.write(JSON.stringify(data) + "\n");
    });

    client.on('data', function(data){
        that.log("Response: " + data.toString().trim());
        that.log("***** Color HSV:" + that.color.hsvArray() + "*****");
        that.log("***** Color RGB:" + that.color.rgbArray() + "*****");
        client.end();
    });
  },

  setPowerState: function(powerOn) {
    var that = this;

    if (powerOn) {
      that.log("Setting power state on the '"+that.name+"' to on");
      that.color.rgb(that.prevColor.rgb());
      that.sendHyperionCommand('color', that.color.rgbArray());
    } else {
      that.log("Setting power state on the '"+that.name+"' to off");
      that.prevColor.rgb(that.color.rgb());
      that.color.value(0);
      that.sendHyperionCommand('color', that.color.rgbArray());
      that.sendHyperionCommand('blacklevel', [0,0,0]);
    }

  },

  setBrightness: function(level) {
    var that = this;

    that.color.value(level);
    that.log("Setting brightness on the '"+that.name+"' to '" + level + "'");
    that.sendHyperionCommand('color', that.color.rgbArray());

  },

  setHue: function(level) {
    var that = this;

    that.color.hue(level);
    that.prevColor.hue(level);
    that.log("Setting hue on the '"+that.name+"' to '" + level + "'");
    that.sendHyperionCommand('color', that.color.rgbArray());

  },

  setSaturation: function(level) {
    var that = this;

    that.color.saturationv(level);
    that.prevColor.saturationv(level);
    that.log("Setting saturation on the '"+that.name+"' to '" + level + "'");
    that.sendHyperionCommand('color', that.color.rgbArray());

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
        initialValue: that.name,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of the accessory",
        designedMaxLength: 255
      },{
        cType: types.MANUFACTURER_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Hyperion",
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
        initialValue: "DEADBEEF",
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
        initialValue: that.name,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Name of service",
        designedMaxLength: 255
      },{
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) { that.setPowerState(value); },
        onRead: ((that.color.value() > 0) ? true : false),
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: 0,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Turn on the light",
        designedMaxLength: 1
      },{
        cType: types.BRIGHTNESS_CTYPE,
        onUpdate: function(value) { that.setBrightness(value); },
        onRead: that.color.value(),
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  that.color.value(),
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Adjust Brightness",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      },{
        cType: types.HUE_CTYPE,
        onUpdate: function(value) { that.setHue(value) },
        onRead: that.color.hue(),
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  that.color.hue(),
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Adjust Hue",
        designedMinValue: 0,
        designedMaxValue: 360,
        designedMinStep: 1,
        unit: "arcdegrees"
      },{
        cType: types.SATURATION_CTYPE,
        onUpdate: function(value) { that.setSaturation(value) },
        onRead: that.color.saturationv(),
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue: that.color.saturationv(),
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Adjust Saturation",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      }]
    }];
  }
};

module.exports.accessory = HyperionAccessory;
