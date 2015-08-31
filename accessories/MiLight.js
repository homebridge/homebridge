var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var Milight = require('node-milight-promise').MilightController;
var commands = require('node-milight-promise').commands;

module.exports = {
  accessory: MiLight
}

function MiLight(log, config) {
  this.log = log;

  // config info
  this.ip_address = config["ip_address"];
  this.port = config["port"];
  this.name = config["name"];
  this.zone = config["zone"];
  this.type = config["type"];
  this.delay = config["delay"];
  this.repeat = config["repeat"];
}

var light = new Milight({
  ip: this.ip_address,
  port: this.port,
  delayBetweenCommands: this.delay,
  commandRepeat: this.repeat
});

MiLight.prototype = {

  setPowerState: function(powerOn, callback) {
    if (powerOn) {
      light.sendCommands(commands[this.type].on(this.zone));
      this.log("Setting power state to on");
    } else {
      light.sendCommands(commands[this.type].off(this.zone));
      this.log("Setting power state to off");
    }
    callback();
  },

  setBrightness: function(level, callback) {
    if (level <= 2 && (this.type == "rgbw" || this.type == "white")) {
      // If setting brightness to 2 or lower, instead set night mode for lamps that support it
      this.log("Setting night mode", level);

      light.sendCommands(commands[this.type].off(this.zone));
      // Not sure if this timing is going to work or not? It's supposed to be 100ms after the off command
      light.sendCommands(commands[this.type].nightMode(this.zone));
    } else {
      this.log("Setting brightness to %s", level);

      // Send on command to ensure we're addressing the right bulb
      light.sendCommands(commands[this.type].on(this.zone));

      // If this is an rgbw lamp, set the absolute brightness specified
      if (this.type == "rgbw") {
        light.sendCommands(commands.rgbw.brightness(level));
      } else {
        // If this is an rgb or a white lamp, they only support brightness up and down.
        // Set brightness up when value is >50 and down otherwise. Not sure how well this works real-world.
        if (level >= 50) {
          if (this.type == "white" && level == 100) {
            // But the white lamps do have a "maximum brightness" command
            light.sendCommands(commands.white.maxBright(this.zone));
          } else {
            light.sendCommands(commands[this.type].brightUp());
          }
        } else {
          light.sendCommands(commands[this.type].brightDown());
        }
      }
    }
    callback();
  },

  setHue: function(value, callback) {
    this.log("Setting hue to %s", value);

    // Send on command to ensure we're addressing the right bulb
    light.sendCommands(commands[this.type].on(this.zone));

    if (this.type == "rgbw") {
      if (value == 0) {
        light.sendCommands(commands.rgbw.whiteMode(this.zone));
      } else {
        light.sendCommands(commands.rgbw.hue(commands.rgbw.hsvToMilightColor(Array(value, 0, 0))));
      }
    } else if (this.type == "rgb") {
      light.sendCommands(commands.rgb.hue(commands.rgbw.hsvToMilightColor(Array(value, 0, 0))));
    } else if (this.type == "white") {
      // Again, white lamps don't support setting an absolue colour temp, so trying to do warmer/cooler step at a time based on colour
      if (value >= 180) {
        light.sendCommands(commands.white.warmer());
      } else {
        light.sendCommands(commands.white.cooler());
      }
    }

  },

  identify: function(callback) {
    this.log("Identify requested!");
    callback(); // success
  },

  getServices: function() {
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "MiLight")
      .setCharacteristic(Characteristic.Model, this.type)
      .setCharacteristic(Characteristic.SerialNumber, "MILIGHT12345");

    var lightbulbService = new Service.Lightbulb();

    lightbulbService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setPowerState.bind(this));

    lightbulbService
      .addCharacteristic(new Characteristic.Brightness())
      .on('set', this.setBrightness.bind(this));

    lightbulbService
      .addCharacteristic(new Characteristic.Hue())
      .on('set', this.setHue.bind(this));

    return [informationService, lightbulbService];
  }
};
