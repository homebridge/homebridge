var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var request = require("request");

module.exports = {
  accessory: ThermometerAccessory
}

function ThermometerAccessory(log, config) {
  this.log = log;

  // url info
  this.url = config["url"];
  this.http_method = config["http_method"];
}


ThermometerAccessory.prototype = {

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

  getCurrentTemperature: function (callback) {
    var that = this;
    that.log ("getting CurrentTemperature");


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

  getTemperatureUnits: function (callback) {
    var that = this;
    that.log ("getTemperature Units");
    // 1 = F and 0 = C
    callback (null, 0);
  },  

  getServices: function() {

    // you can OPTIONALLY create an information service if you wish to override
    // the default values for things like serial number, model, etc.
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
      .setCharacteristic(Characteristic.Model, "HTTP Thermometer")
      .setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");
    
    var temperatureService = new Service.TemperatureSensor();

    temperatureService
	.getCharacteristic(Characteristic.CurrentTemperature)
	.on('get', this.getCurrentTemperature.bind(this));
    
    return [informationService, temperatureService];
  }
};
