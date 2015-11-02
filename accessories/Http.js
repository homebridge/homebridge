var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var request = require("request");

module.exports = {
	accessory: HttpAccessory
}

function HttpAccessory(log, config) {
	this.log = log;

	// url info
	this.on_url = config["on_url"];
	this.off_url = config["off_url"];
	this.brightness_url = config["brightness_url"];
	this.http_method = config["http_method"];
	this.username = config["username"];
	this.password = config["password"];
	this.service = config["service"] || "Switch";
	this.name = config["name"];
	this.brightnessHandling = config["brightnessHandling"] || "no";
}

HttpAccessory.prototype = {

	httpRequest: function(url, method, username, password, callback) {
		request({
				url: url,
				method: method,
				auth: {
					user: username,
					pass: password,
					sendImmediately: false
				}
			},
			function(error, response, body) {
				callback(error, response, body)
			})
	},

	setPowerState: function(powerOn, callback) {
		var url;

		if (powerOn) {
			url = this.on_url;
			this.log("Setting power state to on");
		} else {
			url = this.off_url;
			this.log("Setting power state to off");
		}

		this.httpRequest(url, this.http_method, this.username, this.password, function(error, response, body) {
			if (error) {
				this.log('HTTP power function failed: %s', error.message);
				callback(error);
			} else {
				this.log('HTTP power function succeeded!');
				this.log(response);
				this.log(body);
				this.log(this.username);
				this.log(this.password);
				callback();
			}
		}.bind(this));
	},

	setBrightness: function(level, callback) {
		var url = this.brightness_url.replace("%b", level)

		this.log("Setting brightness to %s", level);

		this.httpRequest(url, this.http_method, this.username, this.password, function(error, response, body) {
			if (error) {
				this.log('HTTP brightness function failed: %s', error);
				callback(error);
			} else {
				this.log('HTTP brightness function succeeded!');
				callback();
			}
		}.bind(this));
	},

	identify: function(callback) {
		this.log("Identify requested!");
		callback(); // success
	},

	getServices: function() {

		// you can OPTIONALLY create an information service if you wish to override
		// the default values for things like serial number, model, etc.
		var informationService = new Service.AccessoryInformation();

		informationService
			.setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
			.setCharacteristic(Characteristic.Model, "HTTP Model")
			.setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");

		if (this.service == "Switch") {
			var switchService = new Service.Switch(this.name);

			switchService
				.getCharacteristic(Characteristic.On)
				.on('set', this.setPowerState.bind(this));

			return [switchService];
		} else if (this.service == "Light") {
			var lightbulbService = new Service.Lightbulb(this.name);

			lightbulbService
				.getCharacteristic(Characteristic.On)
				.on('set', this.setPowerState.bind(this));

			if (this.brightnessHandling == "yes") {

				lightbulbService
					.addCharacteristic(new Characteristic.Brightness())
					.on('set', this.setBrightness.bind(this));
			}

			return [informationService, lightbulbService];
		}
	}
};
