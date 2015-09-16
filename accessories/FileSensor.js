var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var chokidar = require("chokidar");
var debug = require("debug")("FileSensorAccessory");
var crypto = require("crypto");

module.exports = {
  accessory: FileSensorAccessory
}

function FileSensorAccessory(log, config) {
  this.log = log;

  // url info
  this.name = config["name"];
  this.path = config["path"];
  this.window_seconds = config["window_seconds"] || 5;
  this.sensor_type = config["sensor_type"] || "m";
  this.inverse = config["inverse"] || false;
  
  if(config["sn"]){
      this.sn = config["sn"];
  } else {
      var shasum = crypto.createHash('sha1');
      shasum.update(this.path);
      this.sn = shasum.digest('base64');
      debug('Computed SN ' + this.sn);
  }
}

FileSensorAccessory.prototype = {

  getServices: function() {

    // you can OPTIONALLY create an information service if you wish to override
    // the default values for things like serial number, model, etc.
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, "Homebridge")
      .setCharacteristic(Characteristic.Model, "File Sensor")
      .setCharacteristic(Characteristic.SerialNumber, this.sn);
    
    var service, changeAction;
    if(this.sensor_type === "c"){
        service = new Service.ContactSensor();
        changeAction = function(newState){
            service.getCharacteristic(Characteristic.ContactSensorState)
                    .setValue(newState ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
        };
    } else {
        service = new Service.MotionSensor();
        changeAction = function(newState){
            service.getCharacteristic(Characteristic.MotionDetected)
                    .setValue(newState);
        };
    }
    
    var changeHandler = function(path, stats){
        var d = new Date();
        if(d.getTime() - stats.mtime.getTime() <= (this.window_seconds * 1000)){
            var newState = this.inverse ? false : true;
            changeAction(newState);
            if(this.timer !== undefined) clearTimeout(this.timer);
            this.timer = setTimeout(function(){changeAction(!newState);}, this.window_seconds * 1000);
        }
    }.bind(this);
    
    var watcher = chokidar.watch(this.path, {alwaysStat: true});
    watcher.on('add', changeHandler);
    watcher.on('change', changeHandler);
    
    return [informationService, service];
  }
};
