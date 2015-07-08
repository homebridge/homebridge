var types = require("HAP-NodeJS/accessories/types.js");
var Milight = require('node-milight-promise').MilightController;
var commands = require('node-milight-promise').commands;

function MiLight(log, config) {
	this.log = log;
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

	setPowerState: function(powerOn) {

		var binaryState = powerOn ? "on" : "off";
		var that = this;

		if (binaryState === "on") {
			this.log("Setting power state of zone " + this.zone + " to " + powerOn);
			light.sendCommands(commands[this.type].on(this.zone));
		} else {
			this.log("Setting power state of zone " + this.zone + " to " + powerOn);
			light.sendCommands(commands[this.type].off(this.zone));
		}

	},

	setBrightnessLevel: function(value) {

		var that = this;

		this.log("Setting brightness level of zone " + this.zone + " to " + value);

		light.sendCommands(commands[this.type].brightness(value));
	},

	setHue: function(value) {

		var that = this;

		this.log("Setting hue of zone " + this.zone + " to " + value);

		if (value == "0") {
			light.sendCommands(commands.rgbw.whiteMode(this.zone));
		} else {
			light.sendCommands(commands.rgbw.hue(commands.rgbw.hsvToMilightColor(Array(value, 0, 0))));
		}
	},


	getServices: function() {
		var that = this;
		var services = [{
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
			}, {
				cType: types.MANUFACTURER_CTYPE,
				onUpdate: null,
				perms: ["pr"],
				format: "string",
				initialValue: "MiLight",
				supportEvents: false,
				supportBonjour: false,
				manfDescription: "Manufacturer",
				designedMaxLength: 255
			}, {
				cType: types.MODEL_CTYPE,
				onUpdate: null,
				perms: ["pr"],
				format: "string",
				initialValue: this.type,
				supportEvents: false,
				supportBonjour: false,
				manfDescription: "Model",
				designedMaxLength: 255
			}, {
				cType: types.SERIAL_NUMBER_CTYPE,
				onUpdate: null,
				perms: ["pr"],
				format: "string",
				initialValue: "MILIGHT1234",
				supportEvents: false,
				supportBonjour: false,
				manfDescription: "SN",
				designedMaxLength: 255
			}, {
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
		}, {
			sType: types.LIGHTBULB_STYPE,
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
			}, {
				cType: types.POWER_STATE_CTYPE,
				onUpdate: function(value) {
					that.setPowerState(value);
				},
				perms: ["pw", "pr", "ev"],
				format: "bool",
				initialValue: false,
				supportEvents: false,
				supportBonjour: false,
				manfDescription: "Turn on the light",
				designedMaxLength: 1
			}, {
				cType: types.BRIGHTNESS_CTYPE,
				onUpdate: function(value) {
					that.setBrightnessLevel(value);
				},
				perms: ["pw", "pr", "ev"],
				format: "bool",
				initialValue: 100,
				supportEvents: false,
				supportBonjour: false,
				manfDescription: "Adjust brightness of light",
				designedMinValue: 0,
				designedMaxValue: 100,
				designedMinStep: 1,
				unit: "%"
			}]
		}];
		if (that.type == "rgbw" || that.type == "rgb") {
			services[1].characteristics.push({
				cType: types.HUE_CTYPE,
				onUpdate: function(value) {
					that.setHue(value);
				},
				perms: ["pw", "pr", "ev"],
				format: "int",
				initialValue: 0,
				supportEvents: false,
				supportBonjour: false,
				manfDescription: "Adjust Hue of Light",
				designedMinValue: 0,
				designedMaxValue: 360,
				designedMinStep: 1,
				unit: "arcdegrees"
			});
		}
		return services;
	}
};

module.exports.accessory = MiLight;
