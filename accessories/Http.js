var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
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
}

HttpAccessory.prototype = {

  httpRequest: function(url, method, callback) {
    request({
      url: url,
      method: method
    },
    function (error, response, body) {
      callback(error, response, body)
    })
  },

  setPowerState: function(powerOn, callback) {
    var url;

    if (powerOn) {
      url = this.on_url;
      this.log("Setting power state to on");
    }
    else {
      url = this.off_url;
      this.log("Setting power state to off");
    }

    this.httpRequest(url, this.http_method, function(error, response, body) {
      if (error) {
        this.log('HTTP power function failed: %s', error.message);
        callback(error);
      }
      else {
        this.log('HTTP power function succeeded!');
        callback();
      }
    }.bind(this));
  },

  setBrightness: function(level, callback) {
    var url = this.brightness_url.replace("%b", level)

    this.log("Setting brightness to %s", level);

    this.httpRequest(url, this.http_method, function(error, response, body) {
      if (error) {
        this.log('HTTP brightness function failed: %s', error);
        callback(error);
      }
      else {
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
    
    var lightbulbService = new Service.Lightbulb();
    
    lightbulbService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setPowerState.bind(this));
    
    lightbulbService
      .addCharacteristic(new Characteristic.Brightness())
      .on('set', this.setBrightness.bind(this));
    
    return [informationService, lightbulbService];
  }
};
