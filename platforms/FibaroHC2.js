// Fibaro Home Center 2 Platform Shim for HomeBridge
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//            "platform": "FibaroHC2",
//            "name": "FibaroHC2",
//            "host": "PUT IP ADDRESS OF YOUR HC2 HERE",
//            "username": "PUT USERNAME OF YOUR HC2 HERE",
//            "password": "PUT PASSWORD OF YOUR HC2 HERE"
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.

var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");

function FibaroHC2Platform(log, config){
  	this.log          = log;
  	this.host     = config["host"];
  	this.username = config["username"];
  	this.password = config["password"];
  	this.auth = "Basic " + new Buffer(this.username + ":" + this.password).toString("base64");
  	this.url = "http://"+this.host+"/api/devices";
  
	startPollingUpdate( this );
}

FibaroHC2Platform.prototype = {
  accessories: function(callback) {
    this.log("Fetching Fibaro Home Center devices...");

    var that = this;
    var foundAccessories = [];

    request.get({
      url: this.url,
      headers : {
            "Authorization" : this.auth
      },
      json: true
    }, function(err, response, json) {
      if (!err && response.statusCode == 200) {
        if (json != undefined) {
          json.map(function(s) {
          	that.log("Found: " + s.type);
          	if (s.visible == true) {
          		if (s.type == "com.fibaro.multilevelSwitch") {
            		accessory = new FibaroDimmerAccessory(that, s.name, s.id);
            		foundAccessories.push(accessory);
				} else if (s.type == "com.fibaro.FGRM222")
				{
            		accessory = new FibaroRollerShutterAccessory(that, s.name, s.id);
            		foundAccessories.push(accessory);
				} else if (s.type == "com.fibaro.binarySwitch" || s.type == "com.fibaro.developer.bxs.virtualBinarySwitch")
				{
            		accessory = new FibaroBinarySwitchAccessory(that, s.name, s.id);
            		foundAccessories.push(accessory);
				} else if (s.type == "com.fibaro.FGMS001")
				{
            		accessory = new FibaroMotionSensorAccessory(that, s.name, s.id);
            		foundAccessories.push(accessory);
				} else if (s.type == "com.fibaro.temperatureSensor")
				{
            		accessory = new FibaroTemperatureSensorAccessory(that, s.name, s.id);
            		foundAccessories.push(accessory);
				} else if (s.type == "com.fibaro.doorSensor")
				{
            		accessory = new FibaroDoorSensorAccessory(that, s.name, s.id);
            		foundAccessories.push(accessory);
				}

			}
          })
        }
        callback(foundAccessories);
      } else {
        that.log("There was a problem connecting with FibaroHC2.");
      }
    });

  },
  getAccessoryValue: function(callback, returnBoolean, that) {
    var url = "http://"+that.platform.host+"/api/devices/"+that.id+"/properties/value";
    request.get({
          headers : {
            "Authorization" : that.platform.auth
      },
      json: true,
      url: url
    }, function(err, response, json) {
      that.platform.log(url);
      if (!err && response.statusCode == 200) {
      	if (returnBoolean)
      	   	callback(json.value == 0 ? 0 : 1);
		else
	      	callback(json.value);
      } else {
        that.platform.log("There was a problem getting value from" + that.id);
      }
    })
  },
  getAccessoryServices: function(that) {
    var services = [{
      sType: types.ACCESSORY_INFORMATION_STYPE,
      characteristics: this.informationCharacteristics(that),
    },
    {
      sType: that.SERVICE_TYPE,
      characteristics: this.controlCharacteristics(that)
    }];
    this.log("Loaded services for " + that.name)
    return services;
  },
  command: function(c,value, that) {
    var url = "http://"+this.host+"/api/devices/"+that.id+"/action/"+c;
  	var body = value != undefined ? JSON.stringify({
		  "args": [
    				value
  				  ]
	}) : null;
	var method = "post";
    request({
	    url: url,
    	body: body,
		method: method,
        headers: {
            "Authorization" : this.auth
    	},
    }, function(err, response) {
      if (err) {
        that.platform.log("There was a problem sending command " + c + " to" + that.name);
        that.platform.log(url);
      } else {
        that.platform.log(that.name + " sent command " + c);
        that.platform.log(url);
      }
    });
  },
  informationCharacteristics: function(that)
  {
    return [
      {
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: that.name,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of the accessory",
        designedMaxLength: 255
      },{
        cType: types.MANUFACTURER_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Fibaro",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: that.MODEL_TYPE,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Model",
        designedMaxLength: 255
      },{
        cType: types.SERIAL_NUMBER_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "A1S2NASF88EW",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "SN",
        designedMaxLength: 255
      },{
        cType: types.IDENTIFY_CTYPE,
        onUpdate: null,
        perms: ["pw"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Identify Accessory",
        designedMaxLength: 1
      }
    ]
  },
  controlCharacteristics: function(that) {
    var cTypes = [];
  	var l = that.CONTROL_CHARACTERISTICS.length;
	for (var i = 0; i < l; i++) {
		if (that.CONTROL_CHARACTERISTICS[i] == types.NAME_CTYPE) {
			cTypes.push({
				cType: types.NAME_CTYPE,
				onUpdate: null,
				perms: ["pr"],
				format: "string",
				initialValue: that.name,
				supportEvents: true,
				supportBonjour: false,
				manfDescription: "Name of service",
				designedMaxLength: 255
			});
		} else if (that.CONTROL_CHARACTERISTICS[i] == types.POWER_STATE_CTYPE)  {
			cTypes.push({
				cType: types.POWER_STATE_CTYPE,
		        onRegister: function(characteristic) {
    		    	characteristic.eventEnabled = true;
          			subscribeUpdate(characteristic, that, true);
        		},
				onUpdate: function(value) {
					  if (value == 0) {
						that.platform.command("turnOff", null, that)
					  } else {
						that.platform.command("turnOn", null, that)
					  }
				},
				onRead: function(callback) {
					  that.platform.getAccessoryValue(callback, true, that);
				},
				perms: ["pw","pr","ev"],
				format: "bool",
				initialValue: 0,
				supportEvents: true,
				supportBonjour: false,
				manfDescription: "Change the power state",
				designedMaxLength: 1
			});
		} else if (that.CONTROL_CHARACTERISTICS[i] == types.BRIGHTNESS_CTYPE)  {
			cTypes.push({
        		cType: types.BRIGHTNESS_CTYPE,
		        onRegister: function(characteristic) {
    		    	characteristic.eventEnabled = true;
          			subscribeUpdate(characteristic, that, false);
        		},
        		onUpdate: function(value) { that.platform.command("setValue", value, that); },
        		onRead: function(callback) {
          			that.platform.getAccessoryValue(callback, false, that);
        		},
        		perms: ["pw","pr","ev"],
        		format: "int",
        		initialValue:  0,
        		supportEvents: true,
        		supportBonjour: false,
        		manfDescription: "Adjust Brightness of Light",
        		designedMinValue: 0,
        		designedMaxValue: 100,
        		designedMinStep: 10,
        		unit: "%"
      		});
		} else if (that.CONTROL_CHARACTERISTICS[i] == types.WINDOW_COVERING_CURRENT_POSITION_CTYPE)  {
			cTypes.push({
        		cType: types.WINDOW_COVERING_CURRENT_POSITION_CTYPE,
		        onRegister: function(characteristic) {
    		    	characteristic.eventEnabled = true;
          			subscribeUpdate(characteristic, that, false);
        		},
        		onRead: function(callback) {
          			that.platform.getAccessoryValue(callback, false, that);
        		},
        		perms: ["pr","ev"],
        		format: "int",
        		initialValue: 0,
        		supportEvents: false,
        		supportBonjour: false,
        		manfDescription: "Current Blind Position",
        		designedMinValue: 0,
        		designedMaxValue: 100,
        		designedMinStep: 1,
        		unit: "%"
      		});
		} else if (that.CONTROL_CHARACTERISTICS[i] == types.WINDOW_COVERING_TARGET_POSITION_CTYPE)  {
      		cTypes.push({
        		cType: types.WINDOW_COVERING_TARGET_POSITION_CTYPE,
        		onRegister: function(characteristic) {
    		    	characteristic.eventEnabled = true;
          			subscribeUpdate(characteristic, that, false);
        		},
        		onUpdate: function(value) { that.platform.command("setValue", value, that); },
        		onRead: function(callback) {
          			that.platform.getAccessoryValue(callback, false, that);
        		},
        		perms: ["pw","pr","ev"],
        		format: "int",
        		initialValue: 0,
        		supportEvents: false,
        		supportBonjour: false,
        		manfDescription: "Target Blind Position",
        		designedMinValue: 0,
        		designedMaxValue: 100,
        		designedMinStep: 1,
        		unit: "%"
      		});
		} else if (that.CONTROL_CHARACTERISTICS[i] == types.WINDOW_COVERING_OPERATION_STATE_CTYPE)  {
      		cTypes.push({
        		cType: types.WINDOW_COVERING_OPERATION_STATE_CTYPE,
        		perms: ["pr","ev"],
        		format: "int",
        		initialValue: 0,
        		supportEvents: false,
        		supportBonjour: false,
        		manfDescription: "Position State",
        		designedMinValue: 0,
        		designedMaxValue: 2,
        		designedMinStep: 1,
      		});
		} else if (that.CONTROL_CHARACTERISTICS[i] == types.CURRENT_TEMPERATURE_CTYPE) {
	    	cTypes.push({
        		cType: types.CURRENT_TEMPERATURE_CTYPE,
		        onRegister: function(characteristic) {
    		    	characteristic.eventEnabled = true;
          			subscribeUpdate(characteristic, that, false);
        		},
        		onRead: function(callback) {
          			that.platform.getAccessoryValue(callback, false, that);
        		},
        		perms: ["pr","ev"],
        		format: "float",
        		unit: "celsius",
        		stepValue: 0.1,
        		initialValue: 0,
        		supportEvents: true,
        		supportBonjour: false,
        		manfDescription: "Get current temperature"
      		});
		} else if (that.CONTROL_CHARACTERISTICS[i] == types.MOTION_DETECTED_CTYPE) {
	    	cTypes.push({
        		cType: types.MOTION_DETECTED_CTYPE,
		        onRegister: function(characteristic) {
    		    	characteristic.eventEnabled = true;
          			subscribeUpdate(characteristic, that, true);
        		},
        		onRead: function(callback) {
          			that.platform.getAccessoryValue(callback, true, that);
        		},
        		perms: ["pr","ev"],
        		format: "bool",
        		initialValue: 0,
        		supportEvents: true,
        		supportBonjour: false,
        		manfDescription: "Detect motion",
        		designedMaxLength: 1
      		});
		} else if (that.CONTROL_CHARACTERISTICS[i] == types.CONTACT_SENSOR_STATE_CTYPE) {
		    cTypes.push({
        		cType: types.CONTACT_SENSOR_STATE_CTYPE,
		        onRegister: function(characteristic) {
    		    	characteristic.eventEnabled = true;
          			subscribeUpdate(characteristic, that, true);
        		},
        		onRead: function(callback) {
          			that.platform.getAccessoryValue(callback, true, that);
        		},
        		perms: ["pr","ev"],
        		format: "bool",
        		initialValue: 0,
        		supportEvents: true,
        		supportBonjour: false,
        		manfDescription: "Detect door contact",
        		designedMaxLength: 1
      		});
		}
	}
   	return cTypes
  }
}

function FibaroDimmerAccessory(platform, name, id) {
  // device info
  this.platform = platform;
  this.name     = name;
  this.id 		= id;
  this.MODEL_TYPE = "Dimmer";
  this.SERVICE_TYPE   	= types.LIGHTBULB_STYPE;
  this.CONTROL_CHARACTERISTICS = [types.NAME_CTYPE, types.POWER_STATE_CTYPE, types.BRIGHTNESS_CTYPE];
}

FibaroDimmerAccessory.prototype = {
  getServices: function() {
	return this.platform.getAccessoryServices(this);
  } 
};

function FibaroRollerShutterAccessory(platform, name, id) {
  // device info
  this.platform = platform;
  this.name     = name;
  this.id 		= id;
  this.MODEL_TYPE = "Roller Shutter 2";
  this.SERVICE_TYPE   	= types.WINDOW_COVERING_STYPE;
  this.CONTROL_CHARACTERISTICS = [types.NAME_CTYPE, types.WINDOW_COVERING_CURRENT_POSITION_CTYPE, types.WINDOW_COVERING_TARGET_POSITION_CTYPE, types.WINDOW_COVERING_OPERATION_STATE_CTYPE];

}

FibaroRollerShutterAccessory.prototype = {
  getServices: function() {
	return this.platform.getAccessoryServices(this);
  }
};

function FibaroBinarySwitchAccessory(platform, name, id) {
  // device info
  this.platform = platform;
  this.name     = name;
  this.id 		= id;
  this.MODEL_TYPE = "Binary Switch";
  this.SERVICE_TYPE = types.SWITCH_STYPE;
  this.CONTROL_CHARACTERISTICS = [types.NAME_CTYPE, types.POWER_STATE_CTYPE];
}

FibaroBinarySwitchAccessory.prototype = {
  getServices: function() {
	return this.platform.getAccessoryServices(this);
  }
};

function FibaroTemperatureSensorAccessory(platform, name, id) {
  // device info
  this.platform = platform;
  this.name     = name;
  this.id 		= id;
  this.MODEL_TYPE = "Temperature Sensor";
  this.SERVICE_TYPE = types.TEMPERATURE_SENSOR_STYPE;
  this.CONTROL_CHARACTERISTICS = [types.NAME_CTYPE, types.CURRENT_TEMPERATURE_CTYPE];
}

FibaroTemperatureSensorAccessory.prototype = {
  getServices: function() {
	return this.platform.getAccessoryServices(this);
  }
};

function FibaroMotionSensorAccessory(platform, name, id) {
  // device info
  this.platform = platform;
  this.name     = name;
  this.id 		= id;
  this.MODEL_TYPE = "Motion Sensor";
  this.SERVICE_TYPE = types.MOTION_SENSOR_STYPE;
  this.CONTROL_CHARACTERISTICS = [types.NAME_CTYPE, types.MOTION_DETECTED_CTYPE];
}

FibaroMotionSensorAccessory.prototype = {
  getServices: function() {
	return this.platform.getAccessoryServices(this);
  }
};

function FibaroDoorSensorAccessory(platform, name, id) {
  // device info
  this.platform = platform;
  this.name     = name;
  this.id 		= id;
  this.MODEL_TYPE = "Door Sensor";
  this.SERVICE_TYPE = types.CONTACT_SENSOR_STYPE;
  this.CONTROL_CHARACTERISTICS = [types.NAME_CTYPE, types.CONTACT_SENSOR_STATE_CTYPE];
}

FibaroDoorSensorAccessory.prototype = {
  getServices: function() {
	return this.platform.getAccessoryServices(this);
  }
};
var lastPoll=0;
var pollingUpdateRunning = false;

function startPollingUpdate( platform )
{
	if( pollingUpdateRunning )
    	return;
  	pollingUpdateRunning = true;
  	
  	var updateUrl = "http://"+platform.host+"/api/refreshStates?last="+lastPoll;

  	request.get({
      url: updateUrl,
      headers : {
            "Authorization" : platform.auth
      },
      json: true
    }, function(err, response, json) {
      	if (!err && response.statusCode == 200) {
        	if (json != undefined) {
        		lastPoll = json.last;
        		if (json.changes != undefined) {
          			json.changes.map(function(s) {
          				if (s.value != undefined) {
          					
          					var value=parseInt(s.value);
          					if (isNaN(value))
          						value=(s.value === "true");
          					for (i=0;i<updateSubscriptions.length; i++) {
          						var subscription = updateSubscriptions[i];
          						if (subscription.id == s.id) {
	          						if ((subscription.onOff && typeof(value) == "boolean") || !subscription.onOff)
	    	      							subscription.characteristic.updateValue(value, null);
          							else
	    	      							subscription.characteristic.updateValue(value == 0 ? false : true, null);
          						}
          					}
          				}
          			})
          		}
        	}
      	} else {
        	platform.log("There was a problem connecting with FibaroHC2.");
      	}
	  	pollingUpdateRunning = false;
    	setTimeout( function(){startPollingUpdate(platform)}, 2000 );
    });

}

var updateSubscriptions = [];
function subscribeUpdate(characteristic, accessory, onOff)
{
  updateSubscriptions.push({ 'id': accessory.id, 'characteristic': characteristic, 'accessory': accessory, 'onOff': onOff });
}

module.exports.platform = FibaroHC2Platform;
