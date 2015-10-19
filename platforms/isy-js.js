/*
 ISY-JS
 
 ISY-99 REST / WebSockets based HomeBridge shim. 
 
 Supports the following Insteon devices: Lights (dimmable and non-dimmable), Fans, Outlets, Door/Window Sensors, MorningLinc locks, Inline Lincs and I/O Lincs.
 Also supports ZWave based locks. If elkEnabled is set to true then this will also expose your Elk Alarm Panel and all of your Elk Sensors. 
 
 Turns out that HomeBridge platforms can only return a maximum of 100 devices. So if you end up exposing more then 100 devices through HomeBridge the HomeKit
 software will fail adding the HomeBridge to your HomeKit network. To address this issue this platform provides an option to screen out devices based on 
 criteria specified in the config. 

 Configuration sample:
 
     "platforms": [
        {
            "platform": "isy-js",
            "name": "isy-js",         
            "host": "10.0.1.12",      
            "username": "admin",      
            "password": "password",   
            "elkEnabled": true,       
            "ignoreDevices": [        
                { "nameContains": "ApplianceLinc", "lastAddressDigit": "", "address": ""},
                { "nameContains": "Bedroom.Side Gate", "lastAddressDigit": "", "address": ""},
                { "nameContains": "Remote", "lastAddressDigit": "", "address": "" },    
                { "nameContains": "Keypad", "lastAddressDigit": "2", "address": "" },
            ]
        }
     ]

 Fields: 
 "platform" - Must be set to isy-js
 "name" - Can be set to whatever you want
 "host" - IP address of the ISY
 "username" - Your ISY username
 "password" - Your ISY password
 "elkEnabled" - true if there is an elk alarm panel connected to your ISY
 "ignoreDevices" - Array of objects specifying criteria for screening out devices from the network. nameContains is the only required criteria. If the other criteria
                   are blank all devices will match those criteria (providing they match the name criteria).
		"nameContains" - Specifies a substring to check against the names of the ISY devices. Required field for the criteria.
		"lastAddressDigit" - Specifies a single digit in the ISY address of a device which should be used to match the device. Example use of this is for composite 
		                     devices like keypads so you can screen out the non-main buttons. 
	    "address" - ISY address to match.		   
         
		Examples:
		
		{ "nameContains": "Keypad", "lastAddressDigit": "2", "address": "" } - Ignore all devices which have the word Keypad in their name and whose last address digit is 2.
		{ "nameContains": "Remote", "lastAddressDigit": "", "address": "" } - Ignore all devices which have the word Remote in their name
		{ "nameContains": "", "lastAddressDigit": "", "address": "15 5 3 2"} - Ignore the device with an ISY address of 15 5 3 2.
*/


var types = require("hap-nodejs/accessories/types.js");
var isy = require('isy-js');
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var inherits = require('util').inherits;

// Global device map. Needed to map incoming notifications to the corresponding HomeKit device for update.
var deviceMap = {};

function ISYChangeHandler(isy,device) {
	var deviceToUpdate = deviceMap[device.address];
	if(deviceToUpdate != null) {
		deviceToUpdate.handleExternalChange();
	}
}

function ISYJSDebugMessage(isy,message) {
	if(process.env.ISYJSDEBUG != undefined) {
		isy.log(message);
	}
}

////////////////////////////////////////////////////////////////////////////////////////////////
// PLATFORM

function ISYPlatform(log,config) {
	this.log = log;
	this.config = config;
	this.host = config.host;
	this.username = config.username;
	this.password = config.password;
	this.elkEnabled = config.elkEnabled;
	this.isy = new isy.ISY(this.host, this.username,this.password, config.elkEnabled, ISYChangeHandler);
}

ISYPlatform.prototype.shouldIgnore = function(device) {
	var deviceAddress = device.address;
	var deviceName = device.name;		
	for(var index = 0; index < this.config.ignoreDevices.length; index++) {
		var rule = this.config.ignoreDevices[index];
		if(rule.nameContains != "") {
			if(deviceName.indexOf(rule.nameContains) == -1) {
				continue;
			}
		}
		if(rule.lastAddressDigit != "") {
			if(deviceAddress.indexOf(rule.lastAddressDigit,deviceAddress.length-2) == -1) {
				continue;
			}
		}
		if(rule.address != "") {
			if(deviceAddress != rule.address) {
				continue;
			} 
		}
		ISYJSDebugMessage(this,"Ignoring device: "+deviceName+" ["+deviceAddress+"] because of rule ["+rule.nameContains+"] ["+rule.lastAddressDigit+"] ["+rule.address+"]");						
		return true;

	}
	return false;	
}

ISYPlatform.prototype.accessories = function(callback) {
	var that = this;
	this.isy.initialize(function() {
		var results = [];		
		var deviceList = that.isy.getDeviceList();
		for(var index = 0; index < deviceList.length; index++) {
			var device = deviceList[index];
			var homeKitDevice = null;
			if(!that.shouldIgnore(device)) {
				
				if(device.deviceType == that.isy.DEVICE_TYPE_LIGHT || device.deviceType == that.isy.DEVICE_TYPE_DIMMABLE_LIGHT) {
					homeKitDevice = new ISYLightAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_LOCK || device.deviceType == that.isy.DEVICE_TYPE_SECURE_LOCK) {
					homeKitDevice = new ISYLockAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_OUTLET) {
					homeKitDevice = new ISYOutletAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_FAN) {
					homeKitDevice = new ISYFanAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_DOOR_WINDOW_SENSOR) {
					homeKitDevice = new ISYDoorWindowSensorAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_ALARM_DOOR_WINDOW_SENSOR) {
					homeKitDevice = new ISYDoorWindowSensorAccessory(that.log,device);
				} else if(device.deviceType == that.isy.DEVICE_TYPE_ALARM_PANEL) {
					homeKitDevice = new ISYElkAlarmPanelAccessory(that.log,device);
				}
				if(homeKitDevice != null) {
					deviceMap[device.address] = homeKitDevice;
					results.push(homeKitDevice);
				}
			}
		}
		if(that.isy.elkEnabled) {
			var panelDevice = that.isy.getElkAlarmPanel();
			var panelDeviceHK = new ISYElkAlarmPanelAccessory(that.log,panelDevice);
			deviceMap[panelDevice.address] = panelDeviceHK;
			results.push(panelDeviceHK);
		}
		ISYJSDebugMessage(that,"Filtered device has: "+results.length+" devices");
		callback(results);		
	});
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// BASE FOR ALL DEVICES

function ISYAccessoryBaseSetup(accessory,log,device) {
	accessory.log = log;
	accessory.device = device;
	accessory.address = device.address;
	accessory.name = device.name;	
	accessory.uuid_base = device.isy.address+":"+device.address;
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// FANS

function ISYFanAccessory(log,device) {
	ISYAccessoryBaseSetup(this,log,device);
}

ISYFanAccessory.prototype.identify = function(callback) {
	// Do the identify action
	callback();
}

ISYFanAccessory.prototype.translateFanSpeedToHK = function(fanSpeed) {
	if(fanSpeed == "Off") {
		return 0;
	} else if(fanSpeed == "Low") {
		return 32;
	} else if(fanSpeed == "Medium") {
		return 67;
	} else if(fanSpeed == "High") {
		return 100;
	} else {
		ISYJSDebugMessage(this,"!!!! ERROR: Unknown fan speed: "+fanSpeed);
		return 0;
	}
}

ISYFanAccessory.prototype.translateHKToFanSpeed = function(fanStateHK) {
	if(fanStateHK == 0) {
		return "Off";
	} else if(fanStateHK > 0 && fanStateHK <=32) {
		return "Low";
	} else if(fanStateHK > 33 && fanStateHK <= 67) {
		return "Medium";
	} else if(fanStateHK > 67) {
		return "High";
	} else {
		ISYJSDebugMessage(this,"ERROR: Unknown fan state!");
		return "Off";
	}
}

ISYFanAccessory.prototype.getFanRotationSpeed = function(callback) {
	callback(null,this.translateFanSpeedToHK(this.device.getCurrentFanState()));
}

ISYFanAccessory.prototype.setFanRotationSpeed = function(fanStateHK,callback) {
	var newFanState = this.translateHKToFanSpeed(fanStateHK);
	ISYJSDebugMessage(this,"Sending command to set fan state to: "+newFanState);
	if(newFanState != this.device.getCurrentFanState()) {
		this.device.sendFanCommand(newFanState, function(result) {
			callback();		
		});
	} else {
		ISYJSDebugMessage(this,"Fan command does not change actual speed");
		callback();
	}
}


ISYFanAccessory.prototype.getIsFanOn = function() {
	return (this.device.getCurrentFanState() != "Off");
}

ISYFanAccessory.prototype.getFanOnState = function(callback) {
	callback(null,this.getIsFanOn());
}

ISYFanAccessory.prototype.setFanOnState = function(onState,callback) {
	if(onState != this.getIsFanOn()) {
		if(onState) {
			this.setFanRotationSpeed(this.translateFanSpeedToHK("Medium"), callback);
		} else {
			this.setFanRotationSpeed(this.translateFanSpeedToHK("Off"), callback);
		}
	} else {
		ISYJSDebugMessage(this,"Fan command does not change actual state");
		callback();
	} 
}


ISYFanAccessory.prototype.handleExternalChange = function() {
	this.fanService
		.setCharacteristic(Characteristic.On, this.getIsFanOn());
		
	this.fanService
		.setCharacteristic(Characteristic.RotationSpeed, this.translateFanSpeedToHK(this.device.getCurrentFanState()));		
}

ISYFanAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var fanService = new Service.Fan();
	
	this.fanService = fanService;
	this.informationService = informationService;	
    
    fanService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setFanOnState.bind(this));
	  
	fanService
	  .getCharacteristic(Characteristic.On)
	  .on('get', this.getFanOnState.bind(this));
	  
	fanService
	  .addCharacteristic(new Characteristic.RotationSpeed())
	  .on('get', this.getFanRotationSpeed.bind(this));	  
  
	fanService
	  .getCharacteristic(Characteristic.RotationSpeed)	
	  .on('set', this.setFanRotationSpeed.bind(this));	
    
    return [informationService, fanService];	
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// OUTLETS

function ISYOutletAccessory(log,device) {
	ISYAccessoryBaseSetup(this,log,device);
}

ISYOutletAccessory.prototype.identify = function(callback) {
	// Do the identify action
	callback();
}

ISYOutletAccessory.prototype.setOutletState = function(outletState,callback) {
	ISYJSDebugMessage(this,"Sending command to set outlet state to: "+outletState);
	if(outletState != this.device.getCurrentOutletState()) {
		this.device.sendOutletCommand(outletState, function(result) {
			callback();		
		});
	} else {
		callback();
	}
}

ISYOutletAccessory.prototype.getOutletState = function(callback) {
	callback(null,this.device.getCurrentOutletState());
}

ISYOutletAccessory.prototype.getOutletInUseState = function(callback) {
	callback(null, true);
}

ISYOutletAccessory.prototype.handleExternalChange = function() {
	this.outletService
		.setCharacteristic(Characteristic.On, this.device.getCurrentOutletState());
}

ISYOutletAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var outletService = new Service.Outlet();
	
	this.outletService = outletService;
	this.informationService = informationService;	
    
    outletService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setOutletState.bind(this));
	  
	outletService
	  .getCharacteristic(Characteristic.On)
	  .on('get', this.getOutletState.bind(this));
	  
	outletService
	  .getCharacteristic(Characteristic.OutletInUse)
	  .on('get', this.getOutletInUseState.bind(this));
    
    return [informationService, outletService];	
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// LOCKS

function ISYLockAccessory(log,device) {
	ISYAccessoryBaseSetup(this,log,device);
}

ISYLockAccessory.prototype.identify = function(callback) {
	callback();
}

ISYLockAccessory.prototype.setTargetLockState = function(lockState,callback) {
	ISYJSDebugMessage(this,"Sending command to set lock state to: "+lockState);
	if(lockState != this.getDeviceCurrentStateAsHK()) {
		var targetLockValue = (lockState == 0) ? false : true;
		this.device.sendLockCommand(targetLockValue, function(result) {
			callback();		
		});
	} else {
		callback();
	}
}

ISYLockAccessory.prototype.getDeviceCurrentStateAsHK = function() {
	return (this.device.getCurrentLockState() ? 1 : 0);
}

ISYLockAccessory.prototype.getLockCurrentState = function(callback) {
	callback(null, this.getDeviceCurrentStateAsHK());
}

ISYLockAccessory.prototype.getTargetLockState = function(callback) {
	this.getLockCurrentState(callback);
}

ISYLockAccessory.prototype.handleExternalChange = function() {
	this.lockService
		.setCharacteristic(Characteristic.LockTargetState, this.getDeviceCurrentStateAsHK());
	this.lockService
		.setCharacteristic(Characteristic.LockCurrentState, this.getDeviceCurrentStateAsHK());
}

ISYLockAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var lockMechanismService = new Service.LockMechanism();
	
	this.lockService = lockMechanismService;
	this.informationService = informationService;	
    
    lockMechanismService
      .getCharacteristic(Characteristic.LockTargetState)
      .on('set', this.setTargetLockState.bind(this));
	  
	lockMechanismService
	  .getCharacteristic(Characteristic.LockTargetState)
	  .on('get', this.getTargetLockState.bind(this));
	  
	lockMechanismService
	  .getCharacteristic(Characteristic.LockCurrentState)
	  .on('get', this.getLockCurrentState.bind(this));
    
    return [informationService, lockMechanismService];	
}

////////////////////////////////////////////////////////////////////////////////////////////////////////
// LIGHTS

function ISYLightAccessory(log,device) {
	ISYAccessoryBaseSetup(this,log,device);
	this.dimmable = (this.device.deviceType == "DimmableLight");
}

ISYLightAccessory.prototype.identify = function(callback) {
	this.device.sendLightCommand(true, function(result) {
		this.device.sendLightCommand(false, function(result) {
			callback();			
		});		
	});
}

ISYLightAccessory.prototype.setPowerState = function(powerOn,callback) {
	ISYJSDebugMessage(this,"Setting powerstate to %s", powerOn);
	if(powerOn != this.device.getCurrentLightState()) {
		ISYJSDebugMessage(this,"Changing powerstate to "+powerOn);
		this.device.sendLightCommand(powerOn, function(result) {
			callback();
		});
	} else {
		ISYJSDebugMessage(this,"Ignoring redundant setPowerState");
		callback();
	}
}

ISYLightAccessory.prototype.handleExternalChange = function() {
	ISYJSDebugMessage(this,"Handling external change for light");
	this.lightService
		.setCharacteristic(Characteristic.On, this.device.getCurrentLightState());
	if(this.device.deviceType == this.device.isy.DEVICE_TYPE_DIMMABLE_LIGHT) {
		this.lightService
			.setCharacteristic(Characteristic.Brightness, this.device.getCurrentLightDimState()	);
	}
}

ISYLightAccessory.prototype.getPowerState = function(callback) { 
	callback(null,this.device.getCurrentLightState());
}

ISYLightAccessory.prototype.setBrightness = function(level,callback) {
	ISYJSDebugMessage(this,"Setting brightness to %s", level);
	if(level != this.device.getCurrentLightDimState()) {
		ISYJSDebugMessage(this,"Changing Brightness to "+level);
		this.device.sendLightDimCommand(level, function(result) {
			callback();			
		});
	} else {
		ISYJSDebugMessage(this,"Ignoring redundant setBrightness");
		callback();
	}
}

ISYLightAccessory.prototype.getBrightness = function(callback) {
	callback(null,this.device.getCurrentLightDimState());
}

ISYLightAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var lightBulbService = new Service.Lightbulb();
	
	this.informationService = informationService;
	this.lightService = lightBulbService; 	
	
    lightBulbService
      .getCharacteristic(Characteristic.On)
      .on('set', this.setPowerState.bind(this));
	  
	lightBulbService
	  .getCharacteristic(Characteristic.On)
	  .on('get', this.getPowerState.bind(this));
	  
	if(this.dimmable) {
		lightBulbService
		.addCharacteristic(new Characteristic.Brightness())
		.on('get', this.getBrightness.bind(this));
		
		lightBulbService
		.getCharacteristic(Characteristic.Brightness)	  
		.on('set', this.setBrightness.bind(this));
	}
	  
    return [informationService, lightBulbService];	
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// CONTACT SENSOR

function ISYDoorWindowSensorAccessory(log,device) {
	ISYAccessoryBaseSetup(this,log,device);
	this.doorWindowState = false;
}

ISYDoorWindowSensorAccessory.prototype.identify = function(callback) {
	// Do the identify action
	callback();
}

ISYDoorWindowSensorAccessory.prototype.translateCurrentDoorWindowState = function() {
	return (this.device.getCurrentDoorWindowState()) ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED;	
}

ISYDoorWindowSensorAccessory.prototype.getCurrentDoorWindowState = function(callback) {
	callback(null,this.translateCurrentDoorWindowState());
}

ISYDoorWindowSensorAccessory.prototype.handleExternalChange = function() {
	this.sensorService
		.setCharacteristic(Characteristic.ContactSensorState, this.translateCurrentDoorWindowState());
}

ISYDoorWindowSensorAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var sensorService = new Service.ContactSensor();
	
	this.sensorService = sensorService;
	this.informationService = informationService;	
    
    sensorService
      .getCharacteristic(Characteristic.ContactSensorState)
      .on('get', this.getCurrentDoorWindowState.bind(this));
    
    return [informationService, sensorService];	
}

/////////////////////////////////////////////////////////////////////////////////////////////////
// ELK SENSOR PANEL

function ISYElkAlarmPanelAccessory(log,device) {
	ISYAccessoryBaseSetup(this,log,device);
}

ISYElkAlarmPanelAccessory.prototype.identify = function(callback) {
	callback();
}

ISYElkAlarmPanelAccessory.prototype.setAlarmTargetState = function(targetStateHK,callback) {
	ISYJSDebugMessage(this,"Sending command to set alarm panel state to: "+targetStateHK);
	var targetState = this.translateHKToAlarmTargetState(targetStateHK);
	ISYJSDebugMessage(this,"Would send the target state of: "+targetState);
	if(this.device.getAlarmMode() != targetState) {
		this.device.sendSetAlarmModeCommand(targetState, function(result) {
			callback();		
		});
	} else {
		ISYJSDebugMessage(this,"Redundant command, already in that state.");
		callback();
	}
}

ISYElkAlarmPanelAccessory.prototype.translateAlarmCurrentStateToHK = function() {
	var tripState = this.device.getAlarmTripState();
	var sourceAlarmState = this.device.getAlarmState();
	
	if(tripState >= this.device.ALARM_TRIP_STATE_TRIPPED) {
		return Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;		
	} else if(sourceAlarmState == this.device.ALARM_STATE_NOT_READY_TO_ARM || 
	    sourceAlarmState == this.device.ALARM_STATE_READY_TO_ARM || 
	    sourceAlarmState == this.device.ALARM_STATE_READY_TO_ARM_VIOLATION) {
		return Characteristic.SecuritySystemCurrentState.DISARMED;	   
	} else {
		if(sourceAlarmState == this.device.ALARM_MODE_STAY || sourceAlarmState == this.device.ALARM_MODE_STAY_INSTANT ) {
			return Characteristic.SecuritySystemCurrentState.STAY_ARM;
		} else if(sourceAlarmState == this.device.ALARM_MODE_AWAY || sourceAlarmState == this.device.ALARM_MODE_VACATION) {
			return Characteristic.SecuritySystemCurrentState.AWAY_ARM;
		} else if(sourceAlarmState == this.device.ALARM_MODE_NIGHT || sourceAlarmState == this.device.ALARM_MODE_NIGHT_INSTANT) {
			return Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
		} else {
			ISYJSDebugMessage(this,"Setting to disarmed because sourceAlarmState is "+sourceAlarmState);
			return Characteristic.SecuritySystemCurrentState.DISARMED;
		}
	}
}

ISYElkAlarmPanelAccessory.prototype.translateAlarmTargetStateToHK = function() {
	var sourceAlarmState = this.device.getAlarmMode();
	if(sourceAlarmState == this.device.ALARM_MODE_STAY || sourceAlarmState == this.device.ALARM_MODE_STAY_INSTANT ) {
 		return Characteristic.SecuritySystemTargetState.STAY_ARM;
	} else if(sourceAlarmState == this.device.ALARM_MODE_AWAY || sourceAlarmState == this.device.ALARM_MODE_VACATION) {
		return Characteristic.SecuritySystemTargetState.AWAY_ARM;
	} else if(sourceAlarmState == this.device.ALARM_MODE_NIGHT || sourceAlarmState == this.device.ALARM_MODE_NIGHT_INSTANT) {
		return Characteristic.SecuritySystemTargetState.NIGHT_ARM;
	} else {
		return Characteristic.SecuritySystemTargetState.DISARM;
	}
}

ISYElkAlarmPanelAccessory.prototype.translateHKToAlarmTargetState = function(state) {
	if(state == Characteristic.SecuritySystemTargetState.STAY_ARM) {
		return this.device.ALARM_MODE_STAY;
	} else if(state == Characteristic.SecuritySystemTargetState.AWAY_ARM) {
		return this.device.ALARM_MODE_AWAY;
	} else if(state == Characteristic.SecuritySystemTargetState.NIGHT_ARM) {
		return this.device.ALARM_MODE_NIGHT;
	} else {
		return this.device.ALARM_MODE_DISARMED;
	}
}

ISYElkAlarmPanelAccessory.prototype.getAlarmTargetState = function(callback) {
	callback(null,this.translateAlarmTargetStateToHK());
}

ISYElkAlarmPanelAccessory.prototype.getAlarmCurrentState = function(callback) {
	callback(null,this.translateAlarmCurrentStateToHK());
}

ISYElkAlarmPanelAccessory.prototype.handleExternalChange = function() {
	ISYJSDebugMessage(this,"Source device. Currenty state locally -"+this.device.getAlarmStatusAsText());
	ISYJSDebugMessage(this,"Got alarm change notification. Setting HK target state to: "+this.translateAlarmTargetStateToHK()+" Setting HK Current state to: "+this.translateAlarmCurrentStateToHK());
	this.alarmPanelService
		.setCharacteristic(Characteristic.SecuritySystemTargetState, this.translateAlarmTargetStateToHK());
	this.alarmPanelService
		.setCharacteristic(Characteristic.SecuritySystemCurrentState, this.translateAlarmCurrentStateToHK());
}

ISYElkAlarmPanelAccessory.prototype.getServices = function() {
	var informationService = new Service.AccessoryInformation();
	
	informationService
      .setCharacteristic(Characteristic.Manufacturer, "SmartHome")
      .setCharacteristic(Characteristic.Model, this.device.deviceFriendlyName)
      .setCharacteristic(Characteristic.SerialNumber, this.device.address);	
	  
	var alarmPanelService = new Service.SecuritySystem();
	
	this.alarmPanelService = alarmPanelService;
	this.informationService = informationService;	
    
    alarmPanelService
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .on('set', this.setAlarmTargetState.bind(this));
	  
	alarmPanelService
	  .getCharacteristic(Characteristic.SecuritySystemTargetState)
	  .on('get', this.getAlarmTargetState.bind(this));
	  
	alarmPanelService
	  .getCharacteristic(Characteristic.SecuritySystemCurrentState)
	  .on('get', this.getAlarmCurrentState.bind(this));
    
    return [informationService, alarmPanelService];	
}

module.exports.platform = ISYPlatform;
module.exports.accessory = ISYFanAccessory;
module.exports.accessory = ISYLightAccessory;
module.exports.accessory = ISYLockAccessory;
module.exports.accessory = ISYOutletAccessory;
module.exports.accessory = ISYDoorWindowSensorAccessory;
module.exports.accessory = ISYElkAlarmPanelAccessory;
