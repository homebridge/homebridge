var types = require("HAP-NodeJS/accessories/types.js");
var AD2USB = require('ad2usb');
var CUSTOM_PANEL_LCD_TEXT_CTYPE = "A3E7B8F9-216E-42C1-A21C-97D4E3BE52C8";

function AD2USBAccessory(log, config) {

  this.log = log;
  this.name = config["name"];
  this.host = config["host"];
  this.port = config["port"];
  this.pin = config["pin"];
  var that = this;
  this.currentArmState = 2;
  this.currentStateCharacteristic = undefined;
  this.targetStateCharacteristic = undefined;
  this.lcdCharacteristic = undefined;

  var alarm = AD2USB.connect(this.host, this.port, function() {

    // Send an initial empty character to get status
    alarm.send('');

    // Armed Away
    alarm.on('armedAway', function() {

        that.log("Armed to AWAY");
        if (that.currentStateCharacteristic) {
            that.currentStateCharacteristic.updateValue(0, null);
        }
        if (that.targetStateCharacteristic) {
            that.targetStateCharacteristic.updateValue(1, null);
        }

    });

    // Armed Stay
    alarm.on('armedStay', function() {

        that.log("Armed to STAY");
        if (that.currentStateCharacteristic) {
            that.currentStateCharacteristic.updateValue(0, null);
        }
        if (that.targetStateCharacteristic) {
            that.targetStateCharacteristic.updateValue(0, null);
        }

    });

    // Armed Night
    alarm.on('armedNight', function() {

        that.log("Armed to NIGHT");
        if (that.currentStateCharacteristic) {
            that.currentStateCharacteristic.updateValue(0, null);
        }
        if (that.targetStateCharacteristic) {
            that.targetStateCharacteristic.updateValue(2, null);
        }

    });

    // Disarmed
    alarm.on('disarmed', function() {

        that.log("Disarmed");
        if (that.currentStateCharacteristic) {
            that.currentStateCharacteristic.updateValue(1, null);
        }
        if (that.targetStateCharacteristic) {
            that.targetStateCharacteristic.updateValue(3, null);
        }

    });

    // Text Change
    alarm.on('lcdtext', function(newText) {

        that.log("LCD: " + newText);
        if (that.lcdCharacteristic) {
            that.lcdCharacteristic.updateValue(newText, null);
        }

    });

    
  });
  this.alarm = alarm;

}

AD2USBAccessory.prototype = {

  setArmState: function(targetArmState) {

    var that = this;
    that.log("Desired target arm state: " + targetArmState);

    // TARGET
    // 0 - Stay
    // 1 - Away
    // 2 - Night
    // 3 - Disarm
    if (targetArmState == 0) {
        that.alarm.armStay(that.pin);
    }
    else if (targetArmState == 1) {
        that.alarm.armAway(that.pin);
    }
    else if (targetArmState == 2) {
        that.alarm.armNight(that.pin);
    }
    else if (targetArmState == 3) {
        that.alarm.disarm(that.pin);
    }


    // CURRENT
    // 0 - Armed
    // 1 - Disarmed
    // 2 - Hold

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
        initialValue: "Nutech",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "AD2USB",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Model",
        designedMaxLength: 255
      },{
        cType: types.SERIAL_NUMBER_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "AD2USBIF",
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
      sType: types.ALARM_STYPE,
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
        cType: types.ALARM_CURRENT_STATE_CTYPE,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.currentStateCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr","ev"],
        format: "int",
        initialValue: 2,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Alarm current arm state",
        designedMaxLength: 1
      },{
        cType: types.ALARM_TARGET_STATE_CTYPE,
        onUpdate: function(value) { that.setArmState(value); },
        onRegister: function(characteristic) { 

            that.targetStateCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue: 1,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Alarm target arm state",
        designedMaxLength: 1
      },
      {
        cType: CUSTOM_PANEL_LCD_TEXT_CTYPE,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.lcdCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr","ev"],
        format: "string",
        initialValue: "Unknown",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Keypad Text",
        designedMaxLength: 64
      }]
    }];
  }
};

module.exports.accessory = AD2USBAccessory;
