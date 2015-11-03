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

var types = require("hap-nodejs/accessories/types.js");
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
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
          		var accessory = null;
          		if (s.type == "com.fibaro.multilevelSwitch")
            		accessory = new FibaroBridgedAccessory([{controlService: new Service.Lightbulb(s.name), characteristics: [Characteristic.On, Characteristic.Brightness]}]);
				else if (s.type == "com.fibaro.FGRM222" || s.type == "com.fibaro.FGR221")
            		accessory = new FibaroBridgedAccessory([{controlService: new Service.WindowCovering(s.name), characteristics: [Characteristic.CurrentPosition, Characteristic.TargetPosition, Characteristic.PositionState]}]);
				else if (s.type == "com.fibaro.binarySwitch" || s.type == "com.fibaro.developer.bxs.virtualBinarySwitch")
            		accessory = new FibaroBridgedAccessory([{controlService: new Service.Switch(s.name), characteristics: [Characteristic.On]}]);
				else if (s.type == "com.fibaro.FGMS001" || s.type == "com.fibaro.motionSensor")
            		accessory = new FibaroBridgedAccessory([{controlService: new Service.MotionSensor(s.name), characteristics: [Characteristic.MotionDetected]}]);
				else if (s.type == "com.fibaro.temperatureSensor")
            		accessory = new FibaroBridgedAccessory([{controlService: new Service.TemperatureSensor(s.name), characteristics: [Characteristic.CurrentTemperature]}]);
				else if (s.type == "com.fibaro.doorSensor")
            		accessory = new FibaroBridgedAccessory([{controlService: new Service.ContactSensor(s.name), characteristics: [Characteristic.ContactSensorState]}]);
				else if (s.type == "com.fibaro.lightSensor")
            		accessory = new FibaroBridgedAccessory([{controlService: new Service.LightSensor(s.name), characteristics: [Characteristic.CurrentAmbientLightLevel]}]);
            	else if (s.type == "com.fibaro.FGWP101")
            		accessory = new FibaroBridgedAccessory([{ controlService: new Service.Outlet(s.name), characteristics: [Characteristic.On, Characteristic.OutletInUse]}]);
            	else if (s.type == "virtual_device" && s.name.charAt(0) != "_") {
            		var services = [];
            		for (var r = 0; r < s.properties.rows.length; r++) {
            			if (s.properties.rows[r].type == "button") {
            				for (var e = 0; e < s.properties.rows[r].elements.length; e++) {
            					var service = {
            						controlService: new Service.Switch(s.properties.rows[r].elements[e].caption),
            						characteristics: [Characteristic.On]
            					};
								service.controlService.subtype = s.properties.rows[r].elements[e].id;
            					services.push(service);
            				}
            			} 
            		}
            		accessory = new FibaroBridgedAccessory(services);
            	}
				if (accessory != null) {
					accessory.getServices = function() {
  							return that.getServices(accessory);
  					};
  					accessory.platform 			= that;
				  	accessory.remoteAccessory	= s;
  					accessory.id 				= s.id;
  					accessory.name				= s.name;
  					accessory.model				= s.type;
  					accessory.manufacturer		= "Fibaro";
  					accessory.serialNumber		= "<unknown>";
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
  command: function(c,value, that) {
    var url = "http://"+this.host+"/api/devices/"+that.id+"/action/"+c;
  	var body = value != undefined ? JSON.stringify({
		  "args": [	value ]
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
  getAccessoryValue: function(callback, returnBoolean, homebridgeAccessory, powerValue) {
    var url = "http://"+homebridgeAccessory.platform.host+"/api/devices/"+homebridgeAccessory.id+"/properties/";
    if (powerValue)
    	url = url + "power";
    else    
    	url = url + "value";
    	
    request.get({
          headers : {
            "Authorization" : homebridgeAccessory.platform.auth
      },
      json: true,
      url: url
    }, function(err, response, json) {
      homebridgeAccessory.platform.log(url);
      if (!err && response.statusCode == 200) {
      	if (powerValue) {
      		callback(undefined, parseFloat(json.value) > 1.0 ? true : false);
      	} else if (returnBoolean)
      	   	callback(undefined, json.value == 0 ? 0 : 1);
		else
	      	callback(undefined, json.value);
      } else {
        homebridgeAccessory.platform.log("There was a problem getting value from" + homebridgeAccessory.id);
      }
    })
  },
  getInformationService: function(homebridgeAccessory) {
    var informationService = new Service.AccessoryInformation();
    informationService
                .setCharacteristic(Characteristic.Name, homebridgeAccessory.name)
				.setCharacteristic(Characteristic.Manufacturer, homebridgeAccessory.manufacturer)
			    .setCharacteristic(Characteristic.Model, homebridgeAccessory.model)
			    .setCharacteristic(Characteristic.SerialNumber, homebridgeAccessory.serialNumber);
  	return informationService;
  },
  bindCharacteristicEvents: function(characteristic, service, homebridgeAccessory) {
  	var onOff = characteristic.props.format == "bool" ? true : false;
  	var readOnly = true;
  	for (var i = 0; i < characteristic.props.perms.length; i++)
		if (characteristic.props.perms[i] == "pw")
			readOnly = false;
  	var powerValue = (characteristic.UUID == "00000026-0000-1000-8000-0026BB765291") ? true : false;
	if (service.controlService.subtype != null) {
	    subscribeUpdate(characteristic, homebridgeAccessory, onOff);
	}
	if (!readOnly) {
    	characteristic
    	    .on('set', function(value, callback, context) {
        	            	if( context !== 'fromFibaro' && context !== 'fromSetValue') {
        	            		if (service.controlService.subtype != null) {
									homebridgeAccessory.platform.command("pressButton", service.controlService.subtype, homebridgeAccessory);
									// In order to behave like a push button reset the status to off
							    	setTimeout( function(){
							    		characteristic.setValue(false, undefined, 'fromSetValue');
							    	}, 100 );
        	            		} else if (onOff) {
									homebridgeAccessory.platform.command(value == 0 ? "turnOff": "turnOn", null, homebridgeAccessory);
								} else
									homebridgeAccessory.platform.command("setValue", value, homebridgeAccessory);
							} 
   	            			callback();
        	           }.bind(this) );
    }
    characteristic
        .on('get', function(callback) {
     	            	if (service.controlService.subtype != null) {
     	            		// a push button is normally off
					      	callback(undefined, false);
     	            	} else {
					  		homebridgeAccessory.platform.getAccessoryValue(callback, onOff, homebridgeAccessory, powerValue);
						}
                   }.bind(this) );
  },
  getServices: function(homebridgeAccessory) {
  	var services = [];
  	var informationService = homebridgeAccessory.platform.getInformationService(homebridgeAccessory);
  	services.push(informationService);
  	for (var s = 0; s < homebridgeAccessory.services.length; s++) {
		var service = homebridgeAccessory.services[s];
		for (var i=0; i < service.characteristics.length; i++) {
			var characteristic = service.controlService.getCharacteristic(service.characteristics[i]);
			if (characteristic == undefined)
				characteristic = service.controlService.addCharacteristic(service.characteristics[i]);
			homebridgeAccessory.platform.bindCharacteristicEvents(characteristic, service, homebridgeAccessory);
		}
		services.push(service.controlService);
    }
    return services;
  }  
}

function FibaroBridgedAccessory(services) {
    this.services = services;
}


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
          					for (var i=0;i<updateSubscriptions.length; i++) {
          						var subscription = updateSubscriptions[i];
          						if (subscription.id == s.id) {
          							if (s.power != undefined && subscription.characteristic.UUID == "00000026-0000-1000-8000-0026BB765291") {
          								subscription.characteristic.setValue(parseFloat(s.power) > 1.0 ? true : false, undefined, 'fromFibaro');
          							} else if ((subscription.onOff && typeof(value) == "boolean") || !subscription.onOff)
	    	      						subscription.characteristic.setValue(value, undefined, 'fromFibaro');
          							else
	    	      						subscription.characteristic.setValue(value == 0 ? false : true, undefined, 'fromFibaro');
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
// TODO: optimized management of updateSubscription data structure (no array with sequential access)
  updateSubscriptions.push({ 'id': accessory.id, 'characteristic': characteristic, 'accessory': accessory, 'onOff': onOff });
}

module.exports.platform = FibaroHC2Platform;
