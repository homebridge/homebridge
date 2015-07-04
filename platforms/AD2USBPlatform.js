
"use strict";

var types = require("HAP-NodeJS/accessories/types.js");
var AD2USB = require('ad2usb');
var CUSTOM_PANEL_LCD_TEXT_CTYPE = "A3E7B8F9-216E-42C1-A21C-97D4E3BE52C8";

function AD2USBPlatform(log, config) {

  // Configuration Settings
  this.log = log;
  this.name = config["name"];
  this.host = config["host"];
  this.port = config["port"];
  this.pin = config["pin"];
  this.config = config;

  var that = this;
  this.currentArmState = 2;
  this.currentStateCharacteristic = undefined;
  this.targetStateCharacteristic = undefined;
  this.lcdCharacteristic = undefined;
  this.occupancyZones = [];
  this.rfZones = {};
  this.wiredZones = {};

  // Configure the alarm
  var alarm = AD2USB.connect(this.host, this.port, function() {

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

    // RF Zone
    alarm.on('rfraw', function(serial, supervision, battery, loop1, loop2, loop3, loop4) {

        that.log("RF: " + serial + ": Supervision - " + supervision + ", Battery - " + battery + ", L1 - " + loop1 + ", L2 - " + loop2 + ", L3 - " + loop3 + ", L4 - " + loop4);

        // Update zones. The flags that come from the alarm a 'false with fault', so we'll basically invert them here


    });

    
  });
  this.alarm = alarm;

  function updateRFZoneState(serialKey, state) {

    // Are we tracking a zone with this serial/key?
    var thisZoneAccessory = this.rfZones[serialKey];
    if (thisZoneAccessory) {

    }

  }

}

AD2USBPlatform.prototype = {

  accessories: function(callback) {

    var returnAccessories = [];

    // Create the keypad
    var keypadAccessory = new AD2USBKeypadAccessory(this.log, this);
    returnAccessories.push(keypadAccessory);

    // Create any occupancy zones
    if (this.config.occupancyZones) {
      for (var i = 0; i < this.config.occupancyZones.length; i++) {
        var thisZoneConfig = this.config.occupancyZones[i];
        var thisOccupancyZone = new AD2USBOccupancyAccessory(this.log, thisZoneConfig, this);
        this.occupancyZones.push(thisOccupancyZone);
        returnAccessories.push(thisOccupancyZone);
      }
    }

    // Create RF sensors
    if (this.config.rfZones) {
      for (var i = 0; i < this.config.rfZones.length; i++) {
        var thisZoneConfig = this.config.rfZones[i];
        var thisRFZone = new AD2USBRFZoneAccessory(this.log, thisZoneConfig, this);
        var existingAccessory = this.rfZones[thisZoneConfig["serial"]];
        if (existingAccessory != undefined) {
          throw("Duplicate RF zone with serial " + thisZoneConfig["serial"]);
        }
        this.rfZones[thisZoneConfig["serial"]] = thisRFZone;
        returnAccessories.push(thisRFZone);
      }
    }

    // Output
    this.log("Returning:");
    this.log("  " + Object.keys(this.rfZones).length + " RF zone(s)");
    this.log("  " + this.occupancyZones.length + " occupancy zone(s)");

    // Return the accessories
    callback(returnAccessories);
    
  }

};

/***********************************************************
 * AD2USBKeypadAccessory
 *
 * Accessory that represents the overall alarm state
 * Only one allowed per platform instance
 ***********************************************************/ 

function AD2USBKeypadAccessory(log, platform) {

  this.log = log;
  this.platform = platform;
  var that = this;

  this.name = platform.name;
  this.currentArmState = 2;
  this.currentStateCharacteristic = undefined;
  this.targetStateCharacteristic = undefined;
  this.lcdCharacteristic = undefined;
  this.transportCategory = types.ALARM_SYSTEM_TCTYPE;

}

AD2USBKeypadAccessory.prototype = {

  setArmState: function(targetArmState) {

    var that = this;
    that.log("Desired target arm state: " + targetArmState);

    // TARGET
    // 0 - Stay
    // 1 - Away
    // 2 - Night
    // 3 - Disarm
    if (targetArmState == 0) {
        that.platform.alarm.armStay(that.platform.pin);
    }
    else if (targetArmState == 1) {
        that.platform.alarm.armAway(that.platform.pin);
    }
    else if (targetArmState == 2) {
        that.platform.alarm.armNight(that.platform.pin);
    }
    else if (targetArmState == 3) {
        that.platform.alarm.disarm(that.platform.pin);
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

            that.platform.currentStateCharacteristic = characteristic;
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

            that.platform.targetStateCharacteristic = characteristic;
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

            that.platform.lcdCharacteristic = characteristic;
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


/***********************************************************
 * AD2USBOccupancyAccessory
 *
 * Accessory that represents the an occupancy 'zone'
 ***********************************************************/ 

function AD2USBOccupancyAccessory(log, config, platform) {

  this.log = log;
  this.platform = platform;
  var that = this;

  this.name = config.name;
  this.occupancyCharacteristic = undefined;
  this.transportCategory = types.SENSOR_TCTYPE;

}

AD2USBOccupancyAccessory.prototype = {

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
        initialValue: "Ademco",
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
      sType: types.OCCUPANCY_SENSOR_STYPE,
      characteristics: [{
        cType: "00000071-0000-1000-8000-0026BB765291",
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.occupancyCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr"],
        format: "bool",
        initialValue: true,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Occupancy Detected",
        designedMaxLength: 255
      }]
    }];
  }
};

/***********************************************************
 * AD2USBRFZoneAccessory
 *
 * Accessory that represents the an occupancy 'zone'
 ***********************************************************/ 

function AD2USBRFZoneAccessory(log, config, platform, serviceType) {

  this.log = log;
  this.platform = platform;
  var that = this;

  this.name = config.name;
  this.sensorType = config.type || "contact";
  this.transportCategory = types.SENSOR_TCTYPE;

  switch(this.sensorType) {
    case "contact":
      this.sensorCharacteristicType = types.CONTACT_SENSOR_STATE_CTYPE;
      this.sensorServiceType = types.CONTACT_SENSOR_STYPE;
      break;
    case "motion":
      this.sensorCharacteristicType = types.MOTION_DETECTED_CTYPE;
      this.sensorServiceType = types.MOTION_SENSOR_STYPE;
      break;
    default:
      throw("Unsupported AD2USB RF zone type " + this.sensorType);
  }

  
  this.supervisionCharacteristic = undefined;
  this.lowBatteryCharacteristic = undefined;
  this.loop1Characteristic = undefined;
  this.loop2Characteristic = undefined;
  this.loop3Characteristic = undefined;
  this.loop4Characteristic = undefined;

}

AD2USBRFZoneAccessory.prototype = {

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
        initialValue: "LiftMaster",
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
      sType: that.sensorServiceType,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Loop 1",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of the accessory",
        designedMaxLength: 255
      },{
        cType: that.sensorCharacteristicType,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.occupancyCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr"],
        format: "bool",
        initialValue: false,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Contact Sensor",
        designedMaxLength: 255
      }]
    },{
      sType: that.sensorServiceType,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Loop 2",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of the accessory",
        designedMaxLength: 255
      },{
        cType: that.sensorCharacteristicType,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.occupancyCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr"],
        format: "bool",
        initialValue: false,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Contact Sensor",
        designedMaxLength: 255
      }]
    }];
  }
};

module.exports.platform = AD2USBPlatform;
