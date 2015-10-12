var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var request = require("request");

module.exports = {
  accessory: HygrometerAccessory
}

function HygrometerAccessory(log, config) {
  this.log = log;

  // url info
  this.url = config["url"];
  this.http_method = config["http_method"];
}


HygrometerAccessory.prototype = {

  httpRequest: function(url, method, callback) {
    request({
      url: url,
      method: method
    },
    function (error, response, body) {
      callback(error, response, body)
    })
  },


  identify: function(callback) {
    this.log("Identify requested!");
    callback(); // success
  },

  getCurrentRelativeHumidity: function (callback) {
    var that = this;
    that.log ("getting CurrentCurrentRelativeHumidity");

    this.httpRequest(this.url, this.http_method, function(error, response, body) {
      if (error) {
        this.log('HTTP function failed: %s', error);
        callback(error);
      }
      else {
        this.log('HTTP function succeeded - %s', body);
        callback(null, Number(body));
      }
    }.bind(this));
  },  

  getServices: function() {

    // you can OPTIONALLY create an information service if you wish to override
    // the default values for things like serial number, model, etc.
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
      .setCharacteristic(Characteristic.Model, "HTTP Hygrometer")
      .setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");
    
    var humidityService = new Service.HumiditySensor();

    humidityService
	.getCharacteristic(Characteristic.CurrentRelativeHumidity)
	.on('get', this.getCurrentRelativeHumidity.bind(this));
    
    return [informationService, humidityService];
  }
};
