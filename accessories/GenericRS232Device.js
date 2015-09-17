var types = require("HAP-NodeJS/accessories/types.js");
var SerialPort = require("serialport").SerialPort;

module.exports = {
  accessory: GenericRS232DeviceAccessory
}

function GenericRS232DeviceAccessory(log, config) {
  this.log = log;
  this.id = config["id"];
  this.name = config["name"];
  this.model_name = config["model_name"];
  this.manufacturer = config["manufacturer"];
  this.on_command = config["on_command"];
  this.off_command = config["off_command"];
  this.device = config["device"];
  this.baudrate = config["baudrate"];
}

GenericRS232DeviceAccessory.prototype = {
  getServices: function() {
    var that = this;
    return [
      {
        sType: types.ACCESSORY_INFORMATION_STYPE,
        characteristics: [
          {
            cType: types.NAME_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: that.name,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Name of the accessory",
            designedMaxLength: 255
          },
          {
            cType: types.MANUFACTURER_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: that.manufacturer,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Manufacturer",
            designedMaxLength: 255
          },
          {
            cType: types.MODEL_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: that.model_name,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Model",
            designedMaxLength: 255
          },
          {
            cType: types.SERIAL_NUMBER_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: that.id,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "SN",
            designedMaxLength: 255
          },
          {
            cType: types.IDENTIFY_CTYPE,
            onUpdate: null,
            perms: ["pw"],
            format: "bool",
            initialValue: false,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Identify Accessory",
            designedMaxLength: 1
          }
        ]
      },
      {
        sType: types.SWITCH_STYPE,
        characteristics: [
          {
            cType: types.NAME_CTYPE,
            onUpdate: null,
            perms: ["pr"],
            format: "string",
            initialValue: this.serviceName,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Name of service",
            designedMaxLength: 255
          },
          {
            cType: types.POWER_STATE_CTYPE,
            onUpdate: function(value) {
              var command = (value == 1 ? that.on_command : that.off_command);
              var serialPort = new SerialPort(that.device, { baudrate: that.baudrate });
              serialPort.on("open", function () {
                serialPort.write(command, function(error, results) {
                  if(error) {
                    console.log('Errors ' + err);
                  }
                });
              });
              
            },
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: false,
            supportEvents: false,
            supportBonjour: false,
            manfDescription: "Set the Power state",
            designedMaxLength: 1
          }
        ]
      }
    ]
  }
}

module.exports.accessory = GenericRS232DeviceAccessory;