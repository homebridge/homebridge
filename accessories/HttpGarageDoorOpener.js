/*
{
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:30",
        "port": 51826,
        "pin": "031-45-154"
    },
    
    "description": "This is an example configuration file with all supported devices. You can use this as a template for creating your own configuration file containing devices you actually own.",

    "platforms": [],
    "accessories": [
        {
            "accessory": "HttpGarageDoorOpener",
            "name": "Porte de Garage",
            "description": "",
            "open_url": "http://0.0.0.0:3000",
            "http_method": "GET"
        }
    ]
}
*/

var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;

var request = require("request");

module.exports = {
  accessory: HttpGarageDoorOpener
}

function HttpGarageDoorOpener(log, config) {
  this.log = log;
  this.open_url = config["open_url"];
  this.http_method = config["http_method"];
  this.garageDoorStatus = Characteristic.CurrentDoorState.CLOSED;
}

HttpGarageDoorOpener.prototype = {
  close: function (callback) {
    this.garageDoorStatus = Characteristic.CurrentDoorState.CLOSED;
    this.log("Door is", this.getCurrentDoorStateReadable());
    callback();
  },

  open: function (callback) {
    this.garageDoorStatus = Characteristic.CurrentDoorState.OPEN;
    this.log("Door is", this.getCurrentDoorStateReadable());
    callback();
  },

  identify: function() {
    console.log("Identify the Door!");
  },
  
  getServices: function () {
    this.garageDoorOpenerService = new Service.GarageDoorOpener();
    
    this.garageDoorOpenerService
    .getCharacteristic(Characteristic.CurrentDoorState)
    .on('get', this.getCurrentDoorState.bind(this));

    this.garageDoorOpenerService
    .getCharacteristic(Characteristic.TargetDoorState)
    .on('set', this.setTargetDoorState.bind(this));

    /*
    garageDoorOpenerService
    .getCharacteristic(Characteristic.ObstructionDetected)
    .on('get', this.getObstructionDetected.bind(this))
    .on('set', this.setObstructionDetected.bind(this));
    */

    var informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
      .setCharacteristic(Characteristic.Model, "HTTP Model")
      .setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");

    return [informationService, this.garageDoorOpenerService];
  },

  getCurrentDoorStateReadable: function () {
    var textState = "";
    switch (this.garageDoorStatus) {
      case 0: textState = "OPEN"; break;
      case 1: textState = "CLOSED"; break;
      case 2: textState = "OPENING"; break;
      case 3: textState = "CLOSING"; break;
      case 4: textState = "STOPPED"; break;
      default: this.log("Unhandled CurrentDoorState");
    }
    return textState;
  },

  getCurrentDoorState: function(callback) {

    this.log("The door is now", this.getCurrentDoorStateReadable() ,"("+ this.garageDoorStatus + ")");

    var error = null;
    var returnValue = this.state;

    callback(null, returnValue);
  },

  setTargetDoorState: function(value, callback) {
    if(value === Characteristic.TargetDoorState.OPEN) {
      this.open(callback);
    } else {
      this.close(callback);
    }; 
  }
};