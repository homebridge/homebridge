/**
 * This is a KNX universal accessory shim.
 * This is NOT the version for dynamic installation 
 * 
New 2015-09-16: Welcome iOS9.0
new features include:
-  services: 
-  Window
-  WindowCovering
-  ContactSensor
New 2015-0918: 
-  Services Switch and Outlet
-  Code cleanup
 * 
 */
var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var knxd = require("eibd");
var knxd_registerGA = require('../platforms/KNX.js').registerGA;
var knxd_startMonitor = require('../platforms/KNX.js').startMonitor;

var milliTimeout = 300; // used to block responses while swiping


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
		throw new Error("KNX configuration fault: MISSING KNXD IP");
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
								this.log("knx data sent: Value "+value+ " for GA "+groupAddress);
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
/** Write special type routines
 *  
 */
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
/** Registering routines
 * 
 */
		// boolean: get 0 or 1 from the bus, write boolean
		knxregister_bool: function(addresses, characteristic) {
			this.log("knx registering BOOLEAN " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type "+type + " for " + characteristic.displayName);
//				iterate(characteristic);
				characteristic.setValue(val ? 1 : 0, undefined, 'fromKNXBus');
			}.bind(this));
		},
		knxregister_boolReverse: function(addresses, characteristic) {
			this.log("knx registering BOOLEAN " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type "+type + " for " + characteristic.displayName);
//				iterate(characteristic);
				characteristic.setValue(val ? 0 : 1, undefined, 'fromKNXBus');
			}.bind(this));
		},
		// percentage: get 0..255 from the bus, write 0..100 to characteristic
		knxregister_percent: function(addresses, characteristic) {
			this.log("knx registering PERCENT " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type "+type+ " for " + characteristic.displayName);
				if (type !== "DPT5") {
					this.log("[ERROR] Received value cannot be a percentage value");
				} else {
					if (!characteristic.timeout) {
						if (characteristic.timeout < Date.now()) {
							characteristic.setValue(Math.round(val/255*100), undefined, 'fromKNXBus');
						} else {
							this.log("Blackout time");
						}
					} else {
						characteristic.setValue(Math.round(val/255*100), undefined, 'fromKNXBus');
					} // todo get the boolean logic right into one OR expresssion

				}
			}.bind(this));
		},
		// float
		knxregister_float: function(addresses, characteristic) {
			this.log("knx registering FLOAT " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type "+type+ " for " + characteristic.displayName);
				var hk_value = Math.round(val*10)/10;
				if (hk_value>=characteristic.minimumValue && hk_value<=characteristic.maximumValue) {
					characteristic.setValue(hk_value, undefined, 'fromKNXBus'); // 1 decoimal for HomeKit
				} else {
					this.log("Value %s out of bounds %s...%s ",hk_value, characteristic.minimumValue, characteristic.maximumValue);
				}
					
			}.bind(this));
		},
		knxregister_HVAC: function(addresses, characteristic) {
			this.log("knx registering HVAC " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type "+type+ " for " + characteristic.displayName);
				var HAPvalue = 0;
				switch (val){
				case 0: 
					HAPvalue = 1;
					break;
				case 1: 
					HAPvalue = 1;
					break;
				case 2: 
					HAPvalue = 1;
					break;
				case 3: 
					HAPvalue = 1;
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
		/** KNX HVAC (heating, ventilation, and air conditioning) types do not really match to homekit types:
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
		AUTO (3) is not allowed as return type from devices!
*/
		// undefined, has to match!
		knxregister: function(addresses, characteristic) {
			this.log("knx registering " + addresses);
			knxd_registerGA(addresses, function(val, src, dest, type){
				this.log("Received value from bus:"+val+ " for " +dest+ " from "+src+" of type "+type+ " for " + characteristic.displayName);
				characteristic.setValue(val, undefined, 'fromKNXBus');
			}.bind(this));
		},

/** set methods used for creating callbacks
 *  such as
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
		setBooleanReverseState: function(value, callback, context, gaddress) {
			if (context === 'fromKNXBus') {
				this.log(gaddress + " event ping pong, exit!");
				if (callback) {
					callback();
				}
			} else {
				var numericValue = 0;
				if (!value) {
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
					numericValue = value; // homekit expects precision of 1 decimal
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
/** identify dummy
 * 
 */
		identify: function(callback) {
			this.log("Identify requested!");
			callback(); // success
		},
/** bindCharacteristic
 *  initializes callbacks for 'set' events (from HK) and for KNX bus reads (to HK)
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
						this.setBooleanState(value, callback, context, config.Set);
					}.bind(this));
					break;
				case "BoolReverse":
					myCharacteristic.on('set', function(value, callback, context) {
						this.setBooleanReverseState(value, callback, context, config.Set);
					}.bind(this));
					break;
				case "Percent":
					myCharacteristic.on('set', function(value, callback, context) {
						this.setPercentage(value, callback, context, config.Set);
						myCharacteristic.timeout = Date.now()+milliTimeout;
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
				case "BoolReverse":
					this.knxregister_boolReverse([config.Set].concat(config.Listen || []), myCharacteristic);
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
/**
 *  function getXXXXXXXService(config)
 *  returns a configured service object to the caller (accessory/device)
 *  
 *  @param config
 *  pass a configuration array parsed from config.json
 *  specifically for this service
 *  
 */
		getContactSenserService: function(config) {
//			Characteristic.ContactSensorState.CONTACT_DETECTED = 0;
//			Characteristic.ContactSensorState.CONTACT_NOT_DETECTED = 1;
			
			// some sanity checks 
			if (config.type !== "ContactSensor") {
				this.log("[ERROR] ContactSensor Service for non 'ContactSensor' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] ContactSensor Service without 'name' property called");
				return undefined;
			}
			
			var myService = new Service.ContactSensor(config.name,config.name);
			if (config.ContactSensorState) {
				this.log("ContactSensor ContactSensorState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.ContactSensorState, "Bool", config.ContactSensorState);
			} else if (config.ContactSensorStateContact1) {
				this.log("ContactSensor ContactSensorStateContact1 characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.ContactSensorState, "BoolReverse", config.ContactSensorStateContact1);
			} 
			//optionals
			if (config.StatusActive) {
				this.log("ContactSensor StatusActive characteristic enabled");
				myService.addCharacteristic(Characteristic.StatusActive);
				this.bindCharacteristic(myService, Characteristic.StatusActive, "Bool", config.StatusActive);
			} 
			if (config.StatusFault) {
				this.log("ContactSensor StatusFault characteristic enabled");
				myService.addCharacteristic(Characteristic.StatusFault);
				this.bindCharacteristic(myService, Characteristic.StatusFault, "Bool", config.StatusFault);
			} 
			if (config.StatusTampered) {
				this.log("ContactSensor StatusTampered characteristic enabled");
				myService.addCharacteristic(Characteristic.StatusTampered);
				this.bindCharacteristic(myService, Characteristic.StatusTampered, "Bool", config.StatusTampered);
			} 
			if (config.StatusLowBattery) {
				this.log("ContactSensor StatusLowBattery characteristic enabled");
				myService.addCharacteristic(Characteristic.StatusLowBattery);
				this.bindCharacteristic(myService, Characteristic.StatusLowBattery, "Bool", config.StatusLowBattery);
			} 
			return myService;
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
			var myService = new Service.Lightbulb(config.name,config.name);
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
		getLightSensorService: function(config) {

			// some sanity checks 
			if (config.type !== "LightSensor") {
				this.log("[ERROR] LightSensor Service for non 'LightSensor' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] LightSensor Service without 'name' property called");
				return undefined;
			}
			var myService = new Service.LightSensor(config.name,config.name);
			// CurrentTemperature)
			if (config.CurrentAmbientLightLevel) {
				this.log("LightSensor CurrentAmbientLightLevel characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.CurrentAmbientLightLevel, "Float", config.CurrentAmbientLightLevel);
			} 
			return myService;
		},	
		getLockMechanismService: function(config) {

/**			//this.config = config;
//			Characteristic.LockCurrentState.UNSECURED = 0;
//			Characteristic.LockCurrentState.SECURED = 1;
*/			
			// some sanity checks
			if (config.type !== "LockMechanism") {
				this.log("[ERROR] LockMechanism Service for non 'LockMechanism' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] LockMechanism Service without 'name' property called");
				return undefined;
			}
			
			var myService = new Service.LockMechanism(config.name,config.name);
			// LockCurrentState
			if (config.LockCurrentState) {
				// for normal contacts: Secured = 1
				this.log("LockMechanism LockCurrentState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.LockCurrentState, "Bool", config.LockCurrentState);
			} else if (config.LockCurrentStateSecured0) { 
				// for reverse contacts Secured = 0
				this.log("LockMechanism LockCurrentState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.LockCurrentState, "BoolReverse", config.LockCurrentStateSecured0);
			} 
			//  LockTargetState
			if (config.LockTargetState) {
				this.log("LockMechanism LockTargetState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.LockTargetState, "Bool", config.LockTargetState);
			} else 	if (config.LockTargetStateSecured0) {
				this.log("LockMechanism LockTargetState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.LockTargetState, "BoolReverse", config.LockTargetStateSecured0);
			}

			//iterate(myService);
			return myService;
		},
		getOutletService: function(config) {
			/**
			 *   this.addCharacteristic(Characteristic.On);
			 *   this.addCharacteristic(Characteristic.OutletInUse);
			 */
			// some sanity checks
			if (config.type !== "Outlet") {
				this.log("[ERROR] Outlet Service for non 'Outlet' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] Outlet Service without 'name' property called");
				return undefined;
			}
			var myService = new Service.Outlet(config.name,config.name);
			// On (and Off)
			if (config.On) {
				this.log("Outlet on/off characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.On, "Bool", config.On);
			} // OutletInUse characteristic
			if (config.OutletInUse) {
				this.log("Outlet on/off characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.OutletInUse, "Bool", config.OutletInUse);
			}
			return myService;
		},
		getSwitchService: function(config) {
			// some sanity checks
			if (config.type !== "Switch") {
				this.log("[ERROR] Switch Service for non 'Switch' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] Switch Service without 'name' property called");
				return undefined;
			}
			var myService = new Service.Switch(config.name,config.name);
			// On (and Off)
			if (config.On) {
				this.log("Switch on/off characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.On, "Bool", config.On);
			} // On characteristic

			return myService;
		},
		getThermostatService: function(config) {
/**
			// Optional Characteristics
			this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
			this.addOptionalCharacteristic(Characteristic.TargetRelativeHumidity);
			this.addOptionalCharacteristic(Characteristic.CoolingThresholdTemperature);
			this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
*/

			// some sanity checks 
			if (config.type !== "Thermostat") {
				this.log("[ERROR] Thermostat Service for non 'Thermostat' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] Thermostat Service without 'name' property called");
				return undefined;
			}

			var myService = new Service.Thermostat(config.name,config.name);
			// CurrentTemperature)
			if (config.CurrentTemperature) {
				this.log("Thermostat CurrentTemperature characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.CurrentTemperature, "Float", config.CurrentTemperature);
			} 
			// TargetTemperature if available 
			if (config.TargetTemperature) {
				this.log("Thermostat TargetTemperature characteristic enabled");
				
				// DEBUG
				console.log("default value: " + myService.getCharacteristic(Characteristic.TargetTemperature).value);
				// DEBUG
				
				// default boundary too narrow for thermostats
				myService.getCharacteristic(Characteristic.TargetTemperature).minimumValue=0; // °C
				myService.getCharacteristic(Characteristic.TargetTemperature).maximumValue=40; // °C
				this.bindCharacteristic(myService, Characteristic.TargetTemperature, "Float", config.TargetTemperature);
			}
			// HVAC 
			if (config.CurrentHeatingCoolingState) {
				this.log("Thermostat CurrentHeatingCoolingState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.CurrentHeatingCoolingState, "HVAC", config.CurrentHeatingCoolingState);
			}
			// HVAC 
			if (config.TargetHeatingCoolingState) {
				this.log("Thermostat TargetHeatingCoolingState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.TargetHeatingCoolingState, "HVAC", config.TargetHeatingCoolingState);
			}
			return myService;
		},
		getTemperatureSensorService: function(config) {

			// some sanity checks 
			if (config.type !== "TemperatureSensor") {
				this.log("[ERROR] TemperatureSensor Service for non 'TemperatureSensor' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] TemperatureSensor Service without 'name' property called");
				return undefined;
			}
			var myService = new Service.TemperatureSensor(config.name,config.name);
			// CurrentTemperature)
			if (config.CurrentTemperature) {
				this.log("TemperatureSensor CurrentTemperature characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.CurrentTemperature, "Float", config.CurrentTemperature);
			} 
			return myService;
		},		
		getWindowService: function(config) {
/**			
		Optional Characteristics
		this.addOptionalCharacteristic(Characteristic.HoldPosition);
		this.addOptionalCharacteristic(Characteristic.ObstructionDetected);
		this.addOptionalCharacteristic(Characteristic.Name);
		
		PositionState values: The KNX blind actuators I have return only MOVING=1 and STOPPED=0
		Characteristic.PositionState.DECREASING = 0;
		Characteristic.PositionState.INCREASING = 1;
		Characteristic.PositionState.STOPPED = 2;
*/

			// some sanity checks 


			if (config.type !== "Window") {
				this.log("[ERROR] Window Service for non 'Window' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] Window Service without 'name' property called");
				return undefined;
			}
			var myService = new Service.Window(config.name,config.name);

			if (config.CurrentPosition) {
				this.log("Window CurrentPosition characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.CurrentPosition, "Percent", config.CurrentPosition);
			} 
			if (config.TargetPosition) {
				this.log("Window TargetPosition characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.TargetPosition, "Percent", config.TargetPosition);
			} 
			if (config.PositionState) {
				this.log("Window PositionState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.PositionState, "Float", config.PositionState);
			} 
			return myService;
		},			
		getWindowCoveringService: function(config) {
			/**
			  // Optional Characteristics
			  this.addOptionalCharacteristic(Characteristic.HoldPosition);
			  this.addOptionalCharacteristic(Characteristic.TargetHorizontalTiltAngle);
			  this.addOptionalCharacteristic(Characteristic.TargetVerticalTiltAngle);
			  this.addOptionalCharacteristic(Characteristic.CurrentHorizontalTiltAngle);
			  this.addOptionalCharacteristic(Characteristic.CurrentVerticalTiltAngle);
			  this.addOptionalCharacteristic(Characteristic.ObstructionDetected);
	*/
			// some sanity checks 
			if (config.type !== "WindowCovering") {
				this.log("[ERROR] WindowCovering Service for non 'WindowCovering' service called");
				return undefined;
			}
			if (!config.name) {
				this.log("[ERROR] WindowCovering Service without 'name' property called");
				return undefined;
			}

			var myService = new Service.WindowCovering(config.name,config.name);
			if (config.CurrentPosition) {
				this.log("WindowCovering CurrentPosition characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.CurrentPosition, "Percent", config.CurrentPosition);
			} 
			if (config.TargetPosition) {
				this.log("WindowCovering TargetPosition characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.TargetPosition, "Percent", config.TargetPosition);
			} 
			if (config.PositionState) {
				this.log("WindowCovering PositionState characteristic enabled");
				this.bindCharacteristic(myService, Characteristic.PositionState, "Float", config.PositionState);
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

			//iterate(this.config);

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
				this.log("Preparing Service: " + int + " of type "+configService.type)
				switch (configService.type) {
				case "ContactSensor":
					accessoryServices.push(this.getContactSenserService(configService));
					break;				
				case "Lightbulb":
					accessoryServices.push(this.getLightbulbService(configService));
					break;
				case "LightSensor":
					accessoryServices.push(this.getLightSensorService(configService));
					break;
				case "LockMechanism":
					accessoryServices.push(this.getLockMechanismService(configService));
					break;
				case "Switch":
					accessoryServices.push(this.getSwitchService(configService));
					break;					
				case "TemperatureSensor":
					accessoryServices.push(this.getTemperatureSensorService(configService));
					break;
				case "Thermostat":
					accessoryServices.push(this.getThermostatService(configService));
					break;
				case "Window":
					accessoryServices.push(this.getWindowService(configService));
					break;
				case "WindowCovering":
					accessoryServices.push(this.getWindowCoveringService(configService));
					break;
				default:
					this.log("[ERROR] unknown 'type' property of '"+configService.type+"' for service "+ configService.name + " in config.json. KNX platform section fault ");
				//throw new Error("[ERROR] unknown 'type' property for service "+ configService.name + " in config.json. KNX platform section fault ");
				}
			}
			// start listening for events on the bus (if not started yet - will prevent itself)
			knxd_startMonitor({ host: this.knxd_ip, port: this.knxd_port });
			return accessoryServices;
		}
};
