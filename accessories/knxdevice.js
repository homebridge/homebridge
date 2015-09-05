/*
 * This is a KNX universal accessory shim.
 * 
 * 
 */
var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var knxd = require("eibd");
var knxd_registerGA = require('../platforms/KNX.js').registerGA;
var knxd_startMonitor = require('../platforms/KNX.js').startMonitor;



function KNXDevice(log, config) {
	this.log = log;
	// everything in one object, do not copy individually
	this.config = config;
	log("Accessory constructor called");
	if (config.name) {
		this.name = config.name;
	}
	if (config.knxd_ip){
		this.knxd_ip = config.knxd_ip;
	} else {
		throw new Error("MISSING KNXD IP");
	}
	if (config.knxd_port){
		this.knxd_port = config.knxd_port;
	} else {
		throw new Error("MISSING KNXD PORT");
	}

}


//debugging helper only
//inspects an object and prints its properties (also inherited properties) 
var iterate = function nextIteration(myObject, path){
	// this function iterates over all properties of an object and print them to the console
	// when finding objects it goes one level  deeper
	var name;
	if (!path){ 
		console.log("---iterating--------------------")
	}
	for (name in myObject) {
		if (typeof myObject[name] !== 'function') {
			if (typeof myObject[name] !== 'object' ) {
				console.log((path  || "") + name + ': ' + myObject[name]);
			} else {
				nextIteration(myObject[name], path ? path + name + "." : name + ".");
			}
		} else {
			console.log((path  || "") + name + ': (function)' );
		}
	}
	if (!path) {
		console.log("================================");
	}
};


module.exports = {
		accessory: KNXDevice
};


KNXDevice.prototype = {

		// all purpose / all types write function	
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

		// issues an all purpose read request on the knx bus
		// DOES NOT WAIT for an answer. Please register the address with a callback using registerGA() function
		knxread: function(groupAddress){
			// this.log("DEBUG in knxread");
			if (!groupAddress) {
				return null;
			}
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
								this.log("knx request sent for "+groupAddress);
							}
						}.bind(this));
					}
				}.bind(this));
			}.bind(this));		
		},

		// issuing multiple read requests at once 
		knxreadarray: function (groupAddresses) {
			if (groupAddresses.constructor.toString().indexOf("Array") > -1) {
				// handle multiple addresses
				for (var i = 0; i < groupAddresses.length; i++) {
					if (groupAddresses[i]) { // do not bind empty addresses
						this.knxread (groupAddresses[i]);
					}
				}
			} else {
				// it's only one
				this.knxread (groupAddresses);
			}
		},

		// special types
		knxwrite_percent: function(callback, groupAddress, value) {
			var numericValue = 0;
			if (value && value>=0 && value <= 100)  {
				numericValue = 255*value/100;  // convert 1..100 to 1..255 for KNX bus  
			} else {
				this.log("[ERROR] Percentage value ot of bounds ");
				numericValue = 0;
			}
			this.knxwrite(callback, groupAddress,'DPT5',numericValue);
		},


		// need to spit registers into types

		// boolean: get 0 or 1 from the bus, write boolean
		knxregister_bool: function(addresses, characteristic) {
			this.log("knx registering BOOLEAN " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type"+type + " for " + characteristic.displayName);
//				iterate(characteristic);
				characteristic.setValue(val ? 1 : 0, undefined, 'fromKNXBus');
			}.bind(this));
		},

		// percentage: get 0..255 from the bus, write 0..100 to characteristic
		knxregister_percent: function(addresses, characteristic) {
			this.log("knx registering PERCENT " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type"+type+ " for " + characteristic.displayName);
				if (type !== "DPT5") {
					this.log("[ERROR] Received value cannot be a percentage value");
				} else {
					characteristic.setValue(Math.round(val/255*100), undefined, 'fromKNXBus');
				}
			}.bind(this));
		},

		// float
		knxregister_float: function(addresses, characteristic) {
			this.log("knx registering FLOAT " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type"+type+ " for " + characteristic.displayName);
				characteristic.setValue(val, undefined, 'fromKNXBus');
			}.bind(this));
		},

		// what about HVAC heating cooling types?
		knxregister_HVAC: function(addresses, characteristic) {
			this.log("knx registering HVAC " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type"+type+ " for " + characteristic.displayName);
				var HAPvalue = 0;
				switch (val){
				case 0: 
					HAPvalue = 3;
					break;
				case 1: 
					HAPvalue = 3;
					break;
				case 2: 
					HAPvalue = 3;
					break;
				case 3: 
					HAPvalue = 3;
					break;
				case 4: 
					HAPvalue = 0;
					break;
				default:
					HAPvalue = 0;
				}
				characteristic.setValue(HAPvalue, undefined, 'fromKNXBus');
			}.bind(this));
		},
		// to do! KNX: DPT 20.102 = One Byte like DPT5
//		0 = Auto
//		1 = Comfort
//		2 = Standby
//		3 = Night
//		4 = Freezing/Heat Protection
//		5 – 255 = not allowed”
		// The value property of TargetHeatingCoolingState must be one of the following:
//		Characteristic.TargetHeatingCoolingState.OFF = 0;
//		Characteristic.TargetHeatingCoolingState.HEAT = 1;
//		Characteristic.TargetHeatingCoolingState.COOL = 2;
//		Characteristic.TargetHeatingCoolingState.AUTO = 3;


		// undefined, has to match!
		knxregister: function(addresses, characteristic) {
			this.log("knx registering " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type"+type+ " for " + characteristic.displayName);
				characteristic.setValue(val, undefined, 'fromKNXBus');
			}.bind(this));
		},

		/*
		 *  set methods used for creating callbacks, such as
		 *  		var Characteristic = myService.addCharacteristic(new Characteristic.Brightness())
		 *				.on('set', function(value, callback, context) {
		 *					this.setPercentage(value, callback, context, this.config[index].Set)
		 *				}.bind(this));
		 *  
		 */
		setBooleanState: function(value, callback, context, gaddress) {
			if (context === 'fromKNXBus') {
				this.log(gaddress + " event ping pong, exit!");
				if (callback) {
					callback();
				}
			} else {
				var numericValue = 0;
				if (value) {
					numericValue = 1; // need 0 or 1, not true or something
				}
				this.log("Setting "+gaddress+" Boolean to %s", numericValue);
				this.knxwrite(callback, gaddress,'DPT1',numericValue);			
			}

		},


		setPercentage: function(value, callback, context, gaddress) {
			if (context === 'fromKNXBus') {
				this.log("event ping pong, exit!");
				if (callback) {
					callback();
				}
			} else {	  
				var numericValue = 0;
				if (value) {
					numericValue = Math.round(255*value/100);  // convert 1..100 to 1..255 for KNX bus  
				}
				this.log("Setting "+gaddress+" percentage to %s (%s)", value, numericValue);
				this.knxwrite(callback, gaddress,'DPT5',numericValue);
			}
		},

		setFloat: function(value, callback, context, gaddress) {
			if (context === 'fromKNXBus') {
				this.log(gaddress + " event ping pong, exit!");
				if (callback) {
					callback();
				}
			} else {
				var numericValue = 0;
				if (value) {
					numericValue = value; // need 0 or 1, not true or something
				}
				this.log("Setting "+gaddress+" Float to %s", numericValue);
				this.knxwrite(callback, gaddress,'DPT9',numericValue);			
			}
		},

		setHVACState: function(value, callback, context, gaddress) {
			if (context === 'fromKNXBus') {
				this.log(gaddress + " event ping pong, exit!");
				if (callback) {
					callback();
				}
			} else {
				var numericValue = 0;
				switch (value){
				case 0: 
					KNXvalue = 4;
					break;
				case 1: 
					KNXvalue = 1;
					break;
				case 2: 
					KNXvalue = 1;
					break;
				case 3: 
					KNXvalue = 1;
					break;
				default:
					KNXvalue = 1;
				}

				this.log("Setting "+gaddress+" HVAC to %s", KNXvalue);
				this.knxwrite(callback, gaddress,'DPT5',KNXvalue);			
			}

		},


		identify: function(callback) {
			this.log("Identify requested!");
			callback(); // success
		},


		/*
		 *  function getXXXXXXXService(config)
		 *  
		 *  returns a configured service object to the caller (accessory/device)
		 *  
		 */

		bindCharacteristic: function(myService, characteristicType, valueType, config) {
			var myCharacteristic = myService.getCharacteristic(characteristicType);
			if (myCharacteristic === undefined) {
				throw new Error("unknown characteristics cannot be bound");
			}
			if (config.Set) {
				// can write
				switch (valueType) {
				case "Bool":
					myCharacteristic.on('set', function(value, callback, context) {
//						this.log("ITERATE DEBUG");
//						iterate(config);
						this.setBooleanState(value, callback, context, config.Set);
					}.bind(this));
					break;
				case "Percent":
					myCharacteristic.on('set', function(value, callback, context) {
						this.setPercentage(value, callback, context, config.Set);
					}.bind(this));	
					break;
				case "Float":
					myCharacteristic.on('set', function(value, callback, context) {
						this.setFloat(value, callback, context, config.Set);
					}.bind(this));
					break;
				case "HVAC":
					myCharacteristic.on('set', function(value, callback, context) {
						this.setHVACState(value, callback, context, config.Set);
					}.bind(this));
					break;
				default:
					this.log("[ERROR] unknown type passed");
				throw new Error("[ERROR] unknown type passed");
				} 
			}
			if ([config.Set].concat(config.Listen || []).length>0) {
				//this.log("Binding LISTEN");
				// can read
				switch (valueType) {
				case "Bool":
					this.knxregister_bool([config.Set].concat(config.Listen || []), myCharacteristic);
					break;
				case "Percent":
					this.knxregister_percent([config.Set].concat(config.Listen || []), myCharacteristic);
					break;
				case "Float":
					this.knxregister_float([config.Set].concat(config.Listen || []), myCharacteristic);
					break;
				case "HVAC":
					this.knxregister_HVAC([config.Set].concat(config.Listen || []), myCharacteristic);
					break;
				default:
					this.log("[ERROR] unknown type passed");
				throw new Error("[ERROR] unknown type passed");
				} 
				this.log("Issuing read requests on the KNX bus...");
				this.knxreadarray([config.Set].concat(config.Listen || []));
			}
			return myCharacteristic; // for chaining or whatsoever
		},

		getLightbulbService: function(config) {
			// some sanity checks
			//this.config = config;

			if (config.type !== "Lightbulb") {
				this.log("[ERROR] Lightbulb Service for non 'Lightbulb' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] Lightbulb Service without 'name' property called");
				return undefined;
			}
			var myService = new Service.Lightbulb() //(config.name,config.name);
			// On (and Off)
			if (config.On) {
				this.log("Lightbulb on/off characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.On, "Bool", config.On);
			} // On characteristic
			// Brightness if available
			if (config.Brightness) {
				this.log("Lightbulb Brightness characteristic enabled");
				myService.addCharacteristic(Characteristic.Brightness); // it's an optional
				this.bindCharacteristic(myService, Characteristic.Brightness, "Percent", config.Brightness);
			}
			// Hue and Saturation could be added here if available in KNX lamps
			//iterate(myService);
			return myService;
		},

		getThermostatService: function(config) {


//			// Required Characteristics
//			this.addCharacteristic(Characteristic.CurrentHeatingCoolingState);
//			this.addCharacteristic(Characteristic.TargetHeatingCoolingState);
//			this.addCharacteristic(Characteristic.CurrentTemperature); //check
//			this.addCharacteristic(Characteristic.TargetTemperature);  //
//			this.addCharacteristic(Characteristic.TemperatureDisplayUnits);
			//
//			// Optional Characteristics
//			this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
//			this.addOptionalCharacteristic(Characteristic.TargetRelativeHumidity);
//			this.addOptionalCharacteristic(Characteristic.CoolingThresholdTemperature);
//			this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);


			// some sanity checks 


			if (config.type !== "Thermostat") {
				this.log("[ERROR] Thermostat Service for non 'Thermostat' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] Thermostat Service without 'name' property called");
				return undefined;
			}
			var myService = new Service.Thermostat() //(config.name,config.name);
			// CurrentTemperature)
			if (config.CurrentTemperature) {
				this.log("Thermostat CurrentTemperature characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.CurrentTemperature, "Float", config.CurrentTemperature);
			} 
			// TargetTemperature if available
			if (config.TargetTemperature) {
				this.log("Thermostat TargetTemperature characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.TargetTemperature, "Float", config.TargetTemperature);
			}
			// HVAC missing yet
			if (config.CurrentHeatingCoolingState) {
				this.log("Thermostat CurrentHeatingCoolingState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.CurrentHeatingCoolingState, "HVAC", config.CurrentHeatingCoolingState);
			}
			return myService;
		},



		/* assemble the device ***************************************************************************************************/


		getServices: function() {

			// you can OPTIONALLY create an information service if you wish to override
			// the default values for things like serial number, model, etc.

			var accessoryServices = [];

			var informationService = new Service.AccessoryInformation();

			informationService
			.setCharacteristic(Characteristic.Manufacturer, "Opensource Community")
			.setCharacteristic(Characteristic.Model, "KNX Universal Device")
			.setCharacteristic(Characteristic.SerialNumber, "Version 1.1");

			accessoryServices.push(informationService);

			iterate(this.config);
//			throw new Error("STOP");
			if (!this.config.services){
				this.log("No services found in accessory?!")
			}
			var currServices = this.config.services;
			this.log("Preparing Services: " + currServices.length)
			// go through the config thing and look for services
			for (var int = 0; int < currServices.length; int++) {
				var configService = currServices[int];
				// services need to have type and name properties
				if (!configService.type && !configService.name) {
					this.log("[ERROR] must specify 'type' and 'name' properties for each service in config.json. KNX platform section fault ");
					throw new Error("Must specify 'type' and 'name' properties for each service in config.json");
				}
				switch (configService.type) {
				case "Lightbulb":
					accessoryServices.push(this.getLightbulbService(configService));
					break;
				case "Thermostat":
					accessoryServices.push(this.getThermostatService(configService));
					break;
				default:
					this.log("[ERROR] unknown 'type' property for service "+ configService.name + " in config.json. KNX platform section fault ");
				//throw new Error("[ERROR] unknown 'type' property for service "+ configService.name + " in config.json. KNX platform section fault ");
				}
			}
			// start listening for events on the bus (if not started yet - will prevent itself)
			knxd_startMonitor({ host: this.knxd_ip, port: this.knxd_port });
			return accessoryServices;
		}
};
