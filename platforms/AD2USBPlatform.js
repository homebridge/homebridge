
"use strict";

var types = require("HAP-NodeJS/accessories/types.js");
var AD2USB = require('ad2usb');
var CUSTOM_PANEL_LCD_TEXT_CTYPE = "A3E7B8F9-216E-42C1-A21C-97D4E3BE52C8";
var CUSTOM_OCCUPANCY_EXPIRY_TIME_CTYPE = "C995BEF8-F6FE-495D-9D39-75E04A23275E";
var CUSTOM_OCCUPANCY_TIMEOUT_CTYPE = "D2FD4D4F-8678-43F5-9E2C-03585E76D4D7";
var CUSTOM_OCCUPANCY_TARGET_MODE = "A840C41F-757F-4EBA-84F9-EDE60E2B037B";
var CUSTOM_OCCUPANCY_CURRENT_MODE = "FEFD31F3-ED85-4E79-8F27-0C4395B4F303";
var CUSTOM_OCCUPANCY_TARGET_MORNING = 0;
var CUSTOM_OCCUPANCY_TARGET_DAY = 1;
var CUSTOM_OCCUPANCY_TARGET_EVENING = 2;
var CUSTOM_OCCUPANCY_TARGET_NIGHT = 3;
var CUSTOM_OCCUPANCY_CURRENT_UNOCCUPIED = 0;
var CUSTOM_OCCUPANCY_CURRENT_MORNING = 1;
var CUSTOM_OCCUPANCY_CURRENT_DAY = 2;
var CUSTOM_OCCUPANCY_CURRENT_EVENING = 3;
var CUSTOM_OCCUPANCY_CURRENT_NIGHT = 4;

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
  this.occupancyZones = {};
  this.rfZones = {};

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
        that.updateRFZoneState(serial + ":1", loop1, battery, supervision);
        that.updateRFZoneState(serial + ":2", loop2, battery, supervision);
        that.updateRFZoneState(serial + ":3", loop3, battery, supervision);
        that.updateRFZoneState(serial + ":4", loop4, battery, supervision);

        // Reset any occupancy zones
        if ((!loop1) && (that.occupancyZones[serial + ":1"])) {
            for (var j = 0; j < that.occupancyZones[serial + ":1"].length; j++) {
              that.resetOccupancyZone(that.occupancyZones[serial + ":1"][j]);
            }
        }
        if ((!loop2) && (that.occupancyZones[serial + ":2"])) {
            for (var j = 0; j < that.occupancyZones[serial + ":2"].length; j++) {
              that.resetOccupancyZone(that.occupancyZones[serial + ":2"][j]);
            }
        }
        if ((!loop3) && (that.occupancyZones[serial + ":3"])) {
            for (var j = 0; j < that.occupancyZones[serial + ":3"].length; j++) {
              that.resetOccupancyZone(that.occupancyZones[serial + ":3"][j]);
            }
        }
        if ((!loop4) && (that.occupancyZones[serial + ":4"])) {
            for (var j = 0; j < that.occupancyZones[serial + ":4"].length; j++) {
              that.resetOccupancyZone(that.occupancyZones[serial + ":4"][j]);
            }
        }

    });

    
  });
  this.alarm = alarm;

  this.resetOccupancyZone = function(occupancyZoneAccessory) {

      // Get the timeout
      var timeout = occupancyZoneAccessory.timeout;

      // Update the future timeout value
      occupancyZoneAccessory.timeoutCharacteristic.updateValue(Math.floor(new Date() / 1000) + timeout);

      // Update the occupancy flag
      occupancyZoneAccessory.occupancyCharacteristic.updateValue(true);

      // Set the expiry timer
      occupancyZoneAccessory.setTimeoutTimer();

      // Calculate a friendly string
      var localDate = new Date(0);
      localDate.setUTCSeconds(occupancyZoneAccessory.timeoutCharacteristic.value);

      // Log
      this.log("Occupancy zone " + occupancyZoneAccessory.name + " reset. Now expires " + localDate.toString());

  }

  this.updateRFZoneState = function(serialKey, state, battery, supervision) {

    // Are we tracking a zone with this serial/key?
    var thisZoneAccessory = this.rfZones[serialKey];
    if (thisZoneAccessory) {

      // State. Note we invert this, as iOS expects a "true", and Ademco expects a "false"
      if (thisZoneAccessory.sensorCharacteristic.value == state) {
        this.log("Updating detection state for " + serialKey + " - " + !state);
        thisZoneAccessory.sensorCharacteristic.updateValue(!state);
      }

      // Battery. Note we invert this, as iOS expects a "true", and Ademco expects a "false"
      if (thisZoneAccessory.lowBatteryCharacteristic.value == battery) {
        this.log("Updating battery state for " + serialKey + " - " + !battery);
        thisZoneAccessory.lowBatteryCharacteristic.updateValue(!battery);
      }

      // Supervision. Note we invert this, as iOS expects a "true", and Ademco expects a "false"
      if (thisZoneAccessory.sensorFaultCharacteristic.value == supervision) {
        this.log("Updating supervision state for " + serialKey + " - " + !supervision);
        thisZoneAccessory.sensorFaultCharacteristic.updateValue(!supervision);
      }

    }
    else
    {
      this.log("Not tracking " + serialKey);
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

        // Iterate over the tracking zones, and record them accordingly
        for (var j = 0; j < thisZoneConfig.triggerRF.length; j++) {

          // Get the array associated with this RF serial
          var triggerSerial = thisZoneConfig.triggerRF[j];
          var thisTrackingZoneArray = this.occupancyZones[triggerSerial];
          if (!thisTrackingZoneArray) {
            thisTrackingZoneArray = [];
          }

          // Include this occupancy zone for potential future trigger
          thisTrackingZoneArray.push(thisOccupancyZone);
          this.occupancyZones[triggerSerial] = thisTrackingZoneArray;

        }

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
  this.timeout = config.timeout;
  this.occupancyCharacteristic = undefined;
  this.timeoutCharacteristic = undefined;
  this.transportCategory = types.SENSOR_TCTYPE;
  this.targetModeCharacteristic = undefined;
  this.currentModeCharacteristic = undefined;
  this.timeoutObject = undefined;

  this.setTimeoutTimer = function() {

    // Debug
    this.log("Resetting occupancy timer for " + this.name);

    // Do we have an existing timeout timer?
    if (this.timeoutObject) {
      this.log("   Cancelling existing timer");
      clearTimeout(this.timeoutObject);
    }

    // Set a new timeout timer
    that = this;
    this.timeoutObject = setTimeout(function() {

      that.log("Occupancy timeout fired! Zone " + that.name + " is no longer occupied.");
      that.occupancyCharacteristic.updateValue(false);

    }, this.timeout * 1000);

  }

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
        cType: types.OCCUPANCY_DETECTED_CTYPE,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.occupancyCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr", "ev"],
        format: "bool",
        initialValue: false,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Occupancy Detected",
        designedMaxLength: 255
      },{
        cType: CUSTOM_OCCUPANCY_TIMEOUT_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "int",
        initialValue: that.timeout,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Occupancy Expiry",
        designedMaxLength: 255
      },{
        cType: CUSTOM_OCCUPANCY_EXPIRY_TIME_CTYPE,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.timeoutCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr", "ev"],
        format: "int",
        initialValue: Math.floor(new Date() / 1000),
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Occupancy Expiry",
        designedMaxLength: 255
      },{
        cType: CUSTOM_OCCUPANCY_TARGET_MODE,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.targetStateCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pw", "pr", "ev"],
        format: "int",
        initialValue: CUSTOM_OCCUPANCY_TARGET_DAY,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Target Occupancy Mode",
        designedMaxLength: 255
      },{
        cType: CUSTOM_OCCUPANCY_CURRENT_MODE,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.currentStateCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr", "ev"],
        format: "int",
        initialValue: CUSTOM_OCCUPANCY_CURRENT_UNOCCUPIED,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Current Occupancy Mode",
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
  this.serial = config.serial;
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

  this.sensorCharacteristic = undefined;
  this.lowBatteryCharacteristic = undefined;
  this.sensorFaultCharacteristic = undefined;

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
        initialValue: this.serial,
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
        cType: that.sensorCharacteristicType,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.sensorCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr"],
        format: "bool",
        initialValue: false,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Sensor",
        designedMaxLength: 255
      },{
        cType: types.STATUS_LOW_BATTERY_CTYPE,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.lowBatteryCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr"],
        format: "bool",
        initialValue: false,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Low Battery",
        designedMaxLength: 255
      },{
        cType: types.STATUS_FAULT_CTYPE,
        onUpdate: null,
        onRegister: function(characteristic) { 

            that.sensorFaultCharacteristic = characteristic;
            characteristic.eventEnabled = true;

             },
        perms: ["pr"],
        format: "bool",
        initialValue: false,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Supervision Fault",
        designedMaxLength: 255
      }]
    }];
  }
};

module.exports.platform = AD2USBPlatform;
