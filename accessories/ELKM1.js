var types = require("HAP-NodeJS/accessories/types.js");
var elkington = require("elkington");

function ElkM1Accessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.zone = config["zone"];
  this.host = config["host"];
  this.port = config["port"];
  this.pin = config["pin"];
  this.arm = config["arm"];
}

ElkM1Accessory.prototype = {
  setPowerState: function(alarmOn) {
    var that = this;

    if (!alarmOn)
    {
        return;
    }

    var elk = elkington.createConnection({
        port: that.port,
        host: that.host,
    });

    switch (that.arm)
    {
        case 'Away':
            elk.armAway({area: that.zone, code: that.pin});
            break;
        case 'Stay':
            elk.armStay({area: that.zone, code: that.pin});
            break;
        case 'Night':
            elk.armNightInstant({area: that.zone, code: that.pin});
            break;
        default:
            break;
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
        initialValue: "Elk",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "M1",
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
        manfDescription: "Alarm the Zone",
        designedMaxLength: 1
      }]
    }];
  }
};

module.exports.accessory = ElkM1Accessory;
