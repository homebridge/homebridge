var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var request = require("request");
var komponist = require('komponist')

module.exports = {
  accessory: MpdClient
}

function MpdClient(log, config) {
  this.log = log;
  this.host = config["host"] || 'localhost';
  this.port = config["port"] || 6600;
}

MpdClient.prototype = {

  setPowerState: function(powerOn, callback) {

    var log = this.log;
  
    komponist.createConnection(this.port, this.host, function(error, client) {
 
      if (error) {
        return callback(error);
      }
 
      if (powerOn) {
        client.play(function(error) {
          log("start playing");
          client.destroy();
          callback(error);
        });
      } else {
        client.stop(function(error) {  
          log("stop playing");
          client.destroy();
          callback(error);
        });
      }

    });
  },

  getPowerState: function(callback) {
  
    komponist.createConnection(this.port, this.host, function(error, client) {

      if (error) {
        return callback(error);
      }
 
      client.status(function(error, status) {

          client.destroy();

          if (status['state'] == 'play') {
            callback(error, 1);
          } else {
            callback(error, 0);
          }
      });

    });
  },

  identify: function(callback) {
    this.log("Identify requested!");
    callback(); // success
  },
  
  getServices: function() {

    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "MPD")
      .setCharacteristic(Characteristic.Model, "MPD Client")
      .setCharacteristic(Characteristic.SerialNumber, "81536334");
    
    var switchService = new Service.Switch();
    
    switchService.getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));
    
    return [informationService, switchService];
  }
};
