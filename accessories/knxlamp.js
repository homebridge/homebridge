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



function KNXlampAccessory(log, config) {
  this.log = log;

  
  // knx information on object
  this.group_address = config.group_address;
  this.listen_addresses = config.listen_addresses; // supposed to be undefined, an array of strings, or single string
  this.can_dim = config.can_dim; //supposed to be true or false
  this.brightness_group_address = config.brightness_group_address;
  this.brightness_listen_addresses = config.brightness_listen_addresses;
  this.knxd_ip = config.knxd_ip ; // eg 127.0.0.1 if running on localhost
  this.knxd_port = config.knxd_port || 6720; // eg 6720 default knxd port
  if (config.name) {
	  this.name = config.name;
  }
  log("Accessory constructor called");
  
}


module.exports = {
		  accessory: KNXlampAccessory
		};


KNXlampAccessory.prototype = {

		
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
							// this.log("knx data sent");
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
	
	setPowerState: function(value, callback, context) {
		if (context === 'fromKNXBus') {
			this.log("event ping pong, exit!");
			if (callback) {
				callback();
			}
		} else {
			console.log("Setting power to %s", value);
			var numericValue = 0;
			if (value) {
				numericValue = 1; // need 0 or 1, not true or something
			}
			this.knxwrite(callback, this.group_address,'DPT1',numericValue);			
		}

	},
	

  setBrightness: function(value, callback, context) {
		if (context === 'fromKNXBus') {
			this.log("event ping pong, exit!");
			if (callback) {
				callback();
			}
		} else {	  
		  	this.log("Setting brightness to %s", value);
			var numericValue = 0;
			if (value) {
				numericValue = 255*value/100;  // convert 1..100 to 1..255 for KNX bus  
			}
			this.knxwrite(callback, this.brightness_group_address,'DPT5',numericValue);
		}
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
      .setCharacteristic(Characteristic.Model, "KNX Light Switch with or without dimmer")
      .setCharacteristic(Characteristic.SerialNumber, "Version 1");
    
    var lightbulbService = new Service.Lightbulb();
    
    var onCharacteristic = lightbulbService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setPowerState.bind(this));
    onCharacteristic.supportsEventNotification=true;
    // register with value update service
    this.addresses = [this.group_address];
    this.log("DEBUG1 this.addresses = "+this.addresses);
    this.log("DEBUG2 this.listen_addresses = "+this.listen_addresses);
    this.addresses = this.addresses.concat(this.listen_addresses || []); // do not join anything if empty (do not add undefined)
    this.log("DEBUG3 this.addresses = "+this.addresses);
    this.knxregister(this.addresses, onCharacteristic);
    this.knxread(this.group_address); // issue a read request on the bus, maybe the device answers to that!
    
    if (this.can_dim) {
    	var brightnessCharacteristic = lightbulbService
			.addCharacteristic(new Characteristic.Brightness())
			.on('set', this.setBrightness.bind(this));
        // register with value update service
        this.brightness_addresses = [this.brightness_group_address];
        this.brightness_addresses.concat(this.brightness_listen_addresses || []); // do not join anything if empty (do not add undefined)
        this.knxregister(this.brightness_addresses, brightnessCharacteristic);
        this.knxread(this.brightness_group_address); // issue a read request on the bus, maybe the device answers to that!
	}
    knxd_startMonitor({ host: this.knxd_ip, port: this.knxd_port });
    return [informationService, lightbulbService];
  }
};
