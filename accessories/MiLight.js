/*

MiLight accessory shim for Homebridge
Written by Sam Edwards (https://samedwards.ca/)

Uses the node-milight-promise library (https://github.com/mwittig/node-milight-promise) which features some code from
applamp.nl (http://www.applamp.nl/service/applamp-api/) and uses other details from (http://www.limitlessled.com/dev/)

Configure in config.json as follows:

"accessories": [
        {
            "accessory":"MiLight",
            "name": "Lamp",
            "ip_address": "255.255.255.255",
            "port": 8899,
            "zone": 1,
            "type": "rgbw",
            "delay": 30,
            "repeat": 3
        }
]

Where the parameters are:
 *accessory (required): This must be "MiLight", and refers to the name of the accessory as exported from this file
 *name (required): The name for this light/zone, as passed on to Homebridge and HomeKit
 *ip_address (optional): The IP address of the WiFi Bridge. Default to the broadcast address of 255.255.255.255 if not specified
 *port (optional): Port of the WiFi bridge. Defaults to 8899 if not specified
 *zone (required): The zone to target with this accessory. "0" for all zones on the bridge, otherwise 1-4 for a specific zone
 *type (required): One of either "rgbw", "rgb", or "white", depending on the type of bulb being controlled
 *delay (optional): Delay between commands sent over UDP. Default 30ms
 *repeat (optional): Number of times to repeat the UDP command for better reliability. Default 3

Tips and Tricks:
 *Setting the brightness of an rgbw or a white bulb will set it to "night mode", which is dimmer than the lowest brightness setting
 *White and rgb bulbs don't support absolute brightness setting, so we just send a brightness up/brightness down command depending
   if we got a percentage above/below 50% respectively
 *The only exception to the above is that white bulbs support a "maximum brightness" command, so we send that when we get 100%
 *Implemented warmer/cooler for white lamps in a similar way to brightnes, except this time above/below 180 degrees on the colour wheel
 *I welcome feedback on a better way to work the brightness/hue for white and rgb bulbs

Troubleshooting:
The node-milight-promise library provides additional debugging output when the MILIGHT_DEBUG environmental variable is set

TODO:
 *Probably convert this module to a platform that can configure an entire bridge at once, just passing a name for each zone
 *Possibly build in some sort of state logging and persistance so that we can answswer HomeKit status queries to the best of our ability

*/

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

  var light = new Milight({
    ip: this.ip_address,
    port: this.port,
    delayBetweenCommands: this.delay,
    commandRepeat: this.repeat
});

}
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
      // Ensure we're pausing for 100ms between these commands as per the spec
      light.pause(100);
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
