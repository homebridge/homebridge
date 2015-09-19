var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var wemo = require('wemo');

module.exports = {
  accessory: WeMoAccessory
}

function WeMoAccessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.service = config["service"] || "Switch";
  this.wemoName = config["wemo_name"] || this.name; // fallback to "name" if you didn't specify an exact "wemo_name"
  this.device = null; // instance of WeMo, for controlling the discovered device
  this.log("Searching for WeMo device with exact name '" + this.wemoName + "'...");
  this.search();
}

WeMoAccessory.prototype.search = function() {
  wemo.Search(this.wemoName, function(err, device) {
    if (!err && device) {
      this.log("Found '"+this.wemoName+"' device at " + device.ip);
      this.device = new wemo(device.ip, device.port);
    }
    else {
      this.log("Error finding device '" + this.wemoName + "': " + err);
      this.log("Continuing search for WeMo device with exact name '" + this.wemoName + "'...");
      this.search();
    }
  }.bind(this));
}

WeMoAccessory.prototype.getMotion = function(callback) {

  if (!this.device) {
    this.log("No '%s' device found (yet?)", this.wemoName);
    callback(new Error("Device not found"), false);
    return;
  }

  this.log("Getting motion state on the '%s'...", this.wemoName);

  this.device.getBinaryState(function(err, result) {
    if (!err) {
      var binaryState = parseInt(result);
      var powerOn = binaryState > 0;
      this.log("Motion state for the '%s' is %s", this.wemoName, binaryState);
      callback(null, powerOn);
    }
    else {
      this.log("Error getting motion state on the '%s': %s", this.wemoName, err.message);
      callback(err);
    }
  }.bind(this));
}

WeMoAccessory.prototype.getPowerOn = function(callback) {

  if (!this.device) {
    this.log("No '%s' device found (yet?)", this.wemoName);
    callback(new Error("Device not found"), false);
    return;
  }

  this.log("Getting power state on the '%s'...", this.wemoName);

  this.device.getBinaryState(function(err, result) {
    if (!err) {
      var binaryState = parseInt(result);
      var powerOn = binaryState > 0;
      this.log("Power state for the '%s' is %s", this.wemoName, binaryState);
      callback(null, powerOn);
    }
    else {
      this.log("Error getting power state on the '%s': %s", this.wemoName, err.message);
      callback(err);
    }
  }.bind(this));
}

WeMoAccessory.prototype.setPowerOn = function(powerOn, callback) {

  if (!this.device) {
    this.log("No '%s' device found (yet?)", this.wemoName);
    callback(new Error("Device not found"));
    return;
  }

  var binaryState = powerOn ? 1 : 0; // wemo langauge
  this.log("Setting power state on the '%s' to %s", this.wemoName, binaryState);

  this.device.setBinaryState(binaryState, function(err, result) {
    if (!err) {
      this.log("Successfully set power state on the '%s' to %s", this.wemoName, binaryState);
      callback(null);
    }
    else {
      this.log("Error setting power state to %s on the '%s'", binaryState, this.wemoName);
      callback(err);
    }
  }.bind(this));
}

WeMoAccessory.prototype.setTargetDoorState = function(targetDoorState, callback) {

  if (!this.device) {
    this.log("No '%s' device found (yet?)", this.wemoName);
    callback(new Error("Device not found"));
    return;
  }

  this.log("Activating WeMo switch '%s'", this.wemoName);

  this.device.setBinaryState(1, function(err, result) {
    if (!err) {
      this.log("Successfully activated WeMo switch '%s'", this.wemoName);
      callback(null);
    }
    else {
      this.log("Error activating WeMo switch '%s'", this.wemoName);
      callback(err);
    }
  }.bind(this));
}

WeMoAccessory.prototype.getServices = function() {
  
  if (this.service == "Switch") {
    var switchService = new Service.Switch(this.name);
    
    switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerOn.bind(this))
      .on('set', this.setPowerOn.bind(this));
    
    return [switchService];
  }
  else if (this.service == "GarageDoor") {
    var garageDoorService = new Service.GarageDoorOpener("Garage Door Opener");
    
    garageDoorService
      .getCharacteristic(Characteristic.TargetDoorState)
      .on('set', this.setTargetDoorState.bind(this));
    
    return [garageDoorService];
  }
  else if (this.service == "MotionSensor") {
    var motionSensorService = new Service.MotionSensor(this.name);

    motionSensorService
      .getCharacteristic(Characteristic.MotionDetected)
      .on('get', this.getMotion.bind(this));

    return [motionSensorService];
  }
  else {
    throw new Error("Unknown service type '%s'", this.service);
  }
}
