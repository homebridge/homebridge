/*

MiLight platform shim for Homebridge
Written by Sam Edwards (https://samedwards.ca/)

Uses the node-milight-promise library (https://github.com/mwittig/node-milight-promise) which features some code from
applamp.nl (http://www.applamp.nl/service/applamp-api/) and uses other details from (http://www.limitlessled.com/dev/)

Configure in config.json as follows:

"platforms": [
        {
            "platform":"MiLight",
            "name":"MiLight",
            "ip_address": "255.255.255.255",
            "port": 8899,
            "type": "rgbw",
            "delay": 30,
            "repeat": 3,
            "zones":["Kitchen Lamp","Bedroom Lamp","Living Room Lamp","Hallway Lamp"]
        }
]

Where the parameters are:
 *platform (required): This must be "MiLight", and refers to the name of the accessory as exported from this file
 *name (optional): The display name used for logging output by Homebridge. Best to set to "MiLight"
 *ip_address (optional): The IP address of the WiFi Bridge. Default to the broadcast address of 255.255.255.255 if not specified
 *port (optional): Port of the WiFi bridge. Defaults to 8899 if not specified
 *type (optional): One of either "rgbw", "rgb", or "white", depending on the type of bulb being controlled. This applies to all zones. Defaults to rgbw.
 *delay (optional): Delay between commands sent over UDP. Default 30ms. May cause delays when sending a lot of commands. Try decreasing to improve.
 *repeat (optional): Number of times to repeat the UDP command for better reliability. Default 3
 *zones (required): An array of the names of the zones, in order, 1-4. Use null if a zone is skipped. RGB lamps can only have a single zone.

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
 *Possibly build in some sort of state logging and persistance so that we can answswer HomeKit status queries to the best of our ability

*/

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var Milight = require('node-milight-promise').MilightController;
var commands = require('node-milight-promise').commands;

module.exports = {
  accessory: MiLightAccessory,
  platform: MiLightPlatform
}

function MiLightPlatform(log, config) {
  this.log = log;
  
  this.config = config;
}

MiLightPlatform.prototype = {
  accessories: function(callback) {
    var zones = [];

    // Various error checking    
    if (this.config.zones) {
      var zoneLength = this.config.zones.length;
    } else {
      this.log("ERROR: Could not read zones from configuration.");
      return;
    }

    if (!this.config["type"]) {
      this.log("INFO: Type not specified, defaulting to rgbw");
      this.config["type"] = "rgbw";
    }

    if (zoneLength == 0) {
      this.log("ERROR: No zones found in configuration.");
      return;
    } else if (this.config["type"] == "rgb" && zoneLength > 1) {
      this.log("WARNING: RGB lamps only have a single zone. Only the first defined zone will be used.");
      zoneLength = 1;
    } else if (zoneLength > 4) {
      this.log("WARNING: Only a maximum of 4 zones are supported per bridge. Only recognizing the first 4 zones.");
      zoneLength = 4;
    }

    // Create lamp accessories for all of the defined zones
    for (var i=0; i < zoneLength; i++) {
      if (!!this.config.zones[i]) {
        this.config["name"] = this.config.zones[i];
        this.config["zone"] = i+1;
        lamp = new MiLightAccessory(this.log, this.config);
        zones.push(lamp);
      }
    }
    if (zones.length > 0) {
      callback(zones);
    } else {
      this.log("ERROR: Unable to find any valid zones");
      return;
    }
  }
}

function MiLightAccessory(log, config) {
  this.log = log;

  // config info
  this.ip_address = config["ip_address"];
  this.port = config["port"];
  this.name = config["name"];
  this.zone = config["zone"];
  this.type = config["type"];
  this.delay = config["delay"];
  this.repeat = config["repeat"];

  this.light = new Milight({
    ip: this.ip_address,
    port: this.port,
    delayBetweenCommands: this.delay,
    commandRepeat: this.repeat
  });

}
MiLightAccessory.prototype = {

  setPowerState: function(powerOn, callback) {
    if (powerOn) {
      this.log("["+this.name+"] Setting power state to on");
      this.light.sendCommands(commands[this.type].on(this.zone));
    } else {
      this.log("["+this.name+"] Setting power state to off");
      this.light.sendCommands(commands[this.type].off(this.zone));
    }
    callback();
  },

  setBrightness: function(level, callback) {
    if (level == 0) {
      // If brightness is set to 0, turn off the lamp
      this.log("["+this.name+"] Setting brightness to 0 (off)");
      this.light.sendCommands(commands[this.type].off(this.zone));
    } else if (level <= 2 && (this.type == "rgbw" || this.type == "white")) {
      // If setting brightness to 2 or lower, instead set night mode for lamps that support it
      this.log("["+this.name+"] Setting night mode", level);

      this.light.sendCommands(commands[this.type].off(this.zone));
      // Ensure we're pausing for 100ms between these commands as per the spec
      this.light.pause(100);
      this.light.sendCommands(commands[this.type].nightMode(this.zone));

    } else {
      this.log("["+this.name+"] Setting brightness to %s", level);

      // Send on command to ensure we're addressing the right bulb
      this.light.sendCommands(commands[this.type].on(this.zone));

      // If this is an rgbw lamp, set the absolute brightness specified
      if (this.type == "rgbw") {
        this.light.sendCommands(commands.rgbw.brightness(level));
      } else {
        // If this is an rgb or a white lamp, they only support brightness up and down.
        // Set brightness up when value is >50 and down otherwise. Not sure how well this works real-world.
        if (level >= 50) {
          if (this.type == "white" && level == 100) {
            // But the white lamps do have a "maximum brightness" command
            this.light.sendCommands(commands.white.maxBright(this.zone));
          } else {
            this.light.sendCommands(commands[this.type].brightUp());
          }
        } else {
          this.light.sendCommands(commands[this.type].brightDown());
        }
      }
    }
    callback();
  },

  setHue: function(value, callback) {
    this.log("["+this.name+"] Setting hue to %s", value);

    var hue = Array(value, 0, 0);

    // Send on command to ensure we're addressing the right bulb
    this.light.sendCommands(commands[this.type].on(this.zone));

    if (this.type == "rgbw") {
      if (value == 0) {
        this.light.sendCommands(commands.rgbw.whiteMode(this.zone));
      } else {
        this.light.sendCommands(commands.rgbw.hue(commands.rgbw.hsvToMilightColor(hue)));
      }
    } else if (this.type == "rgb") {
      this.light.sendCommands(commands.rgb.hue(commands.rgbw.hsvToMilightColor(hue)));
    } else if (this.type == "white") {
      // Again, white lamps don't support setting an absolue colour temp, so trying to do warmer/cooler step at a time based on colour
      if (value >= 180) {
        this.light.sendCommands(commands.white.cooler());
      } else {
        this.light.sendCommands(commands.white.warmer());
      }
    }
    callback();
  },

  identify: function(callback) {
    this.log("["+this.name+"] Identify requested!");
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
