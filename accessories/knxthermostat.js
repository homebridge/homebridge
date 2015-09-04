/*
 * This is a demo KNX lamp accessory shim.
 * It can switch a light on and off, and optionally set a brightness if configured to do so
 * 
 */
var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var knxd = require("eibd");
var knxd_registerGA = require('../platforms/KNX.js').registerGA;
var knxd_startMonitor = require('../platforms/KNX.js').startMonitor;



function KNXthermoAccessory(log, config) {
  this.log = log;
  this.config=config;
  
  // knx information on object
  this.curr_temp_address = config.curr_temp_address;
  this.curr_temp_listen_addresses = config.curr_temp_listen_addresses; // supposed to be undefined, an array of strings, or single string
  this.target_temp_address = config.target_temp_address; 
  this.knxd_ip = config.knxd_ip ; // eg 127.0.0.1 if running on localhost
  this.knxd_port = config.knxd_port || 6720; // eg 6720 default knxd port
  if (config.name) {
	  this.name = config.name;
  }
  log("Accessory constructor called");
  
}


module.exports = {
		  accessory: KNXthermoAccessory
		};


KNXthermoAccessory.prototype = {

		
	knxwrite: function(callback, groupAddress, dpt, value) {
		// this.log("DEBUG in knxwrite");
		var knxdConnection = new knxd.Connection();
		// this.log("DEBUG in knxwrite: created empty connection, trying to connect socket to "+this.knxd_ip+":"+this.knxd_port);
		knxdConnection.socketRemote({ host: this.knxd_ip, port: this.knxd_port }, function() {
			var dest = knxd.str2addr(groupAddress);
			// this.log("DEBUG got dest="+dest);
			knxdConnection.openTGroup(dest, 1, function(err) {
				if (err) {
					this.log("[ERROR] knxwrite:openTGroup: " + err);
					callback(err);
				} else {
					// this.log("DEBUG opened TGroup ");
					var msg = knxd.createMessage('write', dpt, parseFloat(value));
					knxdConnection.sendAPDU(msg, function(err) {
						if (err) {
							this.log("[ERROR] knxwrite:sendAPDU: " + err);
							callback(err);
						} else {
							this.log("knx data sent");
							callback();
						}
					}.bind(this));
				}
			}.bind(this));
		}.bind(this));
	},	
	
	// issues a read request on the knx bus
	// DOES NOT WAIT for an answer. Please register the address with a callback using registerGA() function
	knxread: function(groupAddress){
		// this.log("DEBUG in knxread");
		var knxdConnection = new knxd.Connection();
		// this.log("DEBUG in knxread: created empty connection, trying to connect socket to "+this.knxd_ip+":"+this.knxd_port);
		knxdConnection.socketRemote({ host: this.knxd_ip, port: this.knxd_port }, function() {
			var dest = knxd.str2addr(groupAddress);
			// this.log("DEBUG got dest="+dest);
			knxdConnection.openTGroup(dest, 1, function(err) {
				if (err) {
					this.log("[ERROR] knxread:openTGroup: " + err);
				} else {
					// this.log("DEBUG knxread: opened TGroup ");
					var msg = knxd.createMessage('read', 'DPT1', 0);
					knxdConnection.sendAPDU(msg, function(err) {
						if (err) {
							this.log("[ERROR] knxread:sendAPDU: " + err);
						} else {
							this.log("knx request sent");
						}
					}.bind(this));
				}
			}.bind(this));
		}.bind(this));		
	},
	
	knxregister: function(addresses, characteristic) {
		console.log("knx registering " + addresses);
		knxd_registerGA(addresses, function(value){
			// parameters do not match
			this.log("Getting value from bus:"+value);
			characteristic.setValue(value, undefined, 'fromKNXBus');
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
      .setCharacteristic(Characteristic.Manufacturer, "Opensource Community")
      .setCharacteristic(Characteristic.Model, "KNX Thermostat")
      .setCharacteristic(Characteristic.SerialNumber, "Version 1");
    
    var myService = new Service.Thermostat();
    
//    
//    // Required Characteristics
//    this.addCharacteristic(Characteristic.CurrentHeatingCoolingState);
//    this.addCharacteristic(Characteristic.TargetHeatingCoolingState);
//    this.addCharacteristic(Characteristic.CurrentTemperature); //check
//    this.addCharacteristic(Characteristic.TargetTemperature);  //
//    this.addCharacteristic(Characteristic.TemperatureDisplayUnits);
//
//    // Optional Characteristics
//    this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
//    this.addOptionalCharacteristic(Characteristic.TargetRelativeHumidity);
//    this.addOptionalCharacteristic(Characteristic.CoolingThresholdTemperature);
//    this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
//    this.addOptionalCharacteristic(Characteristic.Name);
    
    
    var CurrentTemperatureCharacteristic = myService
      .getCharacteristic(Characteristic.CurrentTemperature)
      // .on('set', this.setPowerState.bind(this));
    CurrentTemperatureCharacteristic.supportsEventNotification=true;
    // register with value update service
    this.addresses1 = [this.curr_temp_address];
    this.addresses1 = this.addresses1.concat(this.curr_temp_listen_addresses || []); // do not join anything if empty (do not add undefined)
    this.knxregister(this.addresses1, CurrentTemperatureCharacteristic);
    this.knxread(this.curr_temp_address); // issue a read request on the bus, maybe the device answers to that!
    
    var TargetTemperatureCharacteristic = myService
    	.getCharacteristic(Characteristic.TargetTemperature)
    	.on('set', function(value, callback, context) {
    		if (context === 'fromKNXBus') {
    			this.log("event ping pong, exit!");
    			if (callback) {
    				callback();
    			}
    		} else {
    			console.log("Setting temperature to %s", value);
    			var numericValue = 0.0;
    			if (value) {
    				numericValue = 0+value; // need to be numeric
    			}
    			this.knxwrite(callback, this.target_temp_address,'DPT9',numericValue);			
    		}
    	}.bind(this));
	TargetTemperatureCharacteristic.supportsEventNotification=true;
	// register with value update service
	this.addresses2 = [this.target_temp_address];
	this.addresses2 = this.addresses2.concat(this.target_temp_listen_addresses || []); // do not join anything if empty (do not add undefined)
	this.knxregister(this.addresses2, TargetTemperatureCharacteristic);
	this.knxread(this.target_temp_address); // issue a read request on the bus, maybe the device answers to that!
    

    knxd_startMonitor({ host: this.knxd_ip, port: this.knxd_port });
    return [informationService, myService];
  }
};
