var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var SerialPort = require("serialport").SerialPort;

module.exports = {
  accessory: GenericRS232DeviceAccessory
}

function GenericRS232DeviceAccessory(log, config) {
  this.log          = log;
  this.id           = config["id"];
  this.name         = config["name"];
  this.model_name   = config["model_name"];
  this.manufacturer = config["manufacturer"];
  this.on_command   = config["on_command"];
  this.off_command  = config["off_command"];
  this.device       = config["device"];
  this.baudrate     = config["baudrate"];
}

GenericRS232DeviceAccessory.prototype = {
  setPowerState: function(powerOn, callback) {
    var that        = this;
    var command     = powerOn ? that.on_command : that.off_command;
    var serialPort  = new SerialPort(that.device, { baudrate: that.baudrate }, false);
    serialPort.open(function (error) {
      if (error) {
        callback(new Error('Can not communicate with ' + that.name + " (" + error + ")"))
      } else {
        serialPort.write(command, function(err, results) {
          if (error) {
            callback(new Error('Can not send power command to ' + that.name + " (" + err + ")"))
          } else {
            callback()
          }
        });
      }
    });
  },
  
  getServices: function() {
    var switchService = new Service.Switch(this.name);
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model_name)
      .setCharacteristic(Characteristic.SerialNumber, this.id);

    switchService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setPowerState.bind(this));

    return [informationService, switchService];
  }
}

module.exports.accessory = GenericRS232DeviceAccessory;