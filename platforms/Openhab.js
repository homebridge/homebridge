// OpenHAB 1 Platform Shim for HomeBridge
// Written by Tommaso Marchionni
// Based on many of the other HomeBridge platform modules
// 
// Revisions:
//
// 17 October 2015 [tommasomarchionni]
// - Initial release
//
// 25 October 2015 [tommasomarchionni]
// - Added WS listener and new OOP structure
// 
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "Openhab",
//         "name": "Openhab",
//         "server": "127.0.0.1",
//         "port": "8080",
//         "sitemap": "demo"
//     }
// ],
//
// Example of sitemap in OpenHAB:
// sitemap homekit label="HomeKit" {
//	   Switch item=Light_1 label="Light 1"
// }
//
// Rollershutter is tested with this binding in OpenHAB: 
// command=SWITCH_MULTILEVEL,invert_percent=true,invert_state=false"
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.
//

//////// LIBS /////////

var WebSocket = require('ws');
var request = require("request");
var Service = require("hap-nodejs/lib/Service.js").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var currentModule = this;
var util = require('core-util-is');
util.inherits = require('inherits');

//////// PLATFORM /////////

function OpenhabPlatform(log, config){
	this.log      = log;
	this.user     = config["user"];
	this.password = config["password"];
	this.server   = config["server"];
	this.port     = config["port"];
	this.protocol = "http";
	this.sitemap  = "demo";
	if (typeof config["sitemap"] != 'undefined') {
		this.sitemap = config["sitemap"];
	}	
}

OpenhabPlatform.prototype = {
	accessories: function(callback) {
        var that = this;
        this.log("Platform - Fetching OpenHAB devices.");
		var itemFactory = new ItemFactory(this);
		url = itemFactory.sitemapUrl();
		this.log("Platform - Connecting to " + url);
		request.get({
			url: url,
			json: true
		}, function(err, response, json) {
			if (!err && response.statusCode == 200) {
        		callback(itemFactory.parseSitemap(json));
        	} else {
				that.log("Platform - There was a problem connecting to OpenHAB.");
			}
		});
    }
};

//////// END PLATFORM /////////

///////// ACCESSORY /////////

function OpenhabAccessory(widget,platform) {}

///////// ABSTRACT ITEM /////////

function AbstractItem(widget,platform){
	
	AbstractItem.super_.call(this,widget,platform);
	
	this.widget =  widget;
	this.label = widget.label;
	this.name = widget.item.name;
    this.url = widget.item.link;
    this.state = widget.item.state;
    this.platform = platform; 
    this.log = platform.log;
    
    this.setInitialState = false;
    this.setFromOpenHAB = false;
    this.informationService = undefined;
    this.otherService = undefined;
    this.listener = undefined;
    this.ws = undefined;
};

util.inherits(AbstractItem, OpenhabAccessory);

AbstractItem.prototype.getInformationServices = function() {	
	informationService = new Service.AccessoryInformation();
		
	informationService
       	.setCharacteristic(Characteristic.Manufacturer, "OpenHAB")
       	.setCharacteristic(Characteristic.Model, this.constructor.name)
       	.setCharacteristic(Characteristic.SerialNumber, "N/A")
       	.setCharacteristic(Characteristic.Name, this.name);
    return informationService;	
}

AbstractItem.prototype.checkListener = function() {	
	
	if (typeof this.listener == 'undefined' || typeof this.ws == 'undefined') {
		this.ws = undefined;
		this.listener = new WSListener(this, this.updateCharacteristics.bind(this));
   		this.listener.startListener();	
	}
};

///////// END ABSTRACT ITEM /////////

///////// SWITCH ITEM /////////

function SwitchItem(widget,platform){
	SwitchItem.super_.call(this, widget,platform);
};

util.inherits(SwitchItem, AbstractItem);

SwitchItem.prototype.getServices = function() {	

	this.checkListener();
	this.setInitialState = true;
	this.informationService = this.getInformationServices();
	
	this.otherService = new Service.Lightbulb();
	this.otherService.getCharacteristic(Characteristic.On)
		.on('set', this.setItem.bind(this))
		.on('get', this.getItemPowerState.bind(this))
		.setValue(this.state === 'ON');        	

	return [this.informationService, this.otherService];		
};

SwitchItem.prototype.updateCharacteristics = function(message) {

	this.setFromOpenHAB = true;
   	this.otherService
   		.getCharacteristic(Characteristic.On)
       	.setValue(message === 'ON' ? true : false,
       	function() {
           	this.setFromOpenHAB = false;
       	}.bind(this)
	);
};
	
SwitchItem.prototype.getItemPowerState = function(callback) {	
	
	var self = this;
	this.checkListener();
	
	this.log("iOS - request power state from " + this.name);
	request(this.url + '/state?type=json', function (error, response, body) {
   		if (!error && response.statusCode == 200) {
			self.log("OpenHAB HTTP - response from " + self.name + ": " + body);
			callback(undefined,body == "ON" ? true : false);
		} else {
	  		self.log("OpenHAB HTTP - error from " + self.name + ": " + error);
	  	}
   	})
};
	
SwitchItem.prototype.setItem = function(value, callback) {	
	
	var self = this;
	this.checkListener();
	
	if (this.setInitialState) {
   		this.setInitialState = false;
   		callback();
   		return;
   	}
	
	if (this.setFromOpenHAB) {
   		callback();
   		return;
   	}   	
   	
   	this.log("iOS - send message to " + this.name + ": " + value);
	var command = value ? 'ON' : 'OFF';
   	request.post(
       	this.url,
       	{ body: command },
       	function (error, response, body) {
           	if (!error && response.statusCode == 201) {
				self.log("OpenHAB HTTP - response from " + self.name + ": " + body);
			} else {
	  			self.log("OpenHAB HTTP - error from " + self.name + ": " + error);
	  		}
           	callback();
       	}
   	);
};

///////// END SWITCH ITEM /////////

///////// DIMMER ITEM /////////

function DimmerItem(widget,platform){
	DimmerItem.super_.call(this, widget,platform);
};

util.inherits(DimmerItem, AbstractItem);
	
DimmerItem.prototype.getServices = function() {
	
	this.checkListener();
	this.setInitialState = true;
	
	this.informationService = this.getInformationServices();
		
	this.otherService = new Service.Lightbulb();
	this.otherService.getCharacteristic(Characteristic.On)
		.on('set', this.setItem.bind(this))
		.on('get', this.getItemPowerState.bind(this))
		.setValue(+this.state > 0);
			
	this.setInitialState = true;
			
	this.otherService.addCharacteristic(Characteristic.Brightness)
		.on('set', this.setItem.bind(this))
    	.on('get', this.getItemBrightnessState.bind(this))
    	.setValue(+this.state);
			
	return [this.informationService, this.otherService];		
};

DimmerItem.prototype.updateCharacteristics = function(message) {
    
    this.setFromOpenHAB = true;
    var brightness = +message;
    var steps = 2;
    if (brightness >= 0) {
      	this.otherService.getCharacteristic(Characteristic.Brightness)
   			.setValue(brightness,
        	function() {
           		steps--;
           		if (!steps) {
           			this.setFromOpenHAB = false;
           		}
        	}.bind(this));
      	this.otherService.getCharacteristic(Characteristic.On)
			.setValue(brightness > 0 ? true : false,
       	function() {
        	steps--;
           	if (!steps) {
           		this.setFromOpenHAB = false;
           	}
        }.bind(this));
    }
}
	
DimmerItem.prototype.getItemPowerState = function(callback) {
    
    var self = this;
    this.checkListener();
    
    this.log("iOS - request power state from " + this.name);
    request(this.url + '/state?type=json', function (error, response, body) {
		if (!error && response.statusCode == 200) {
			self.log("OpenHAB HTTP - response from " + self.name + ": " + body);
			callback(undefined,+body > 0 ? true : false);
		} else {
	  		self.log("OpenHAB HTTP - error from " + self.name + ": " + error);
	  	}
	})
};
	
DimmerItem.prototype.setItem = function(value, callback) {	
	
	var self = this;
	this.checkListener();
	
	if (this.setInitialState) {
   		this.setInitialState = false;
   		callback();
   		return;
   	}
	
	if (this.setFromOpenHAB) {
    	callback();
      	return;
    }
	
	this.log("iOS - send message to " + this.name + ": " + value);
	var command = 0;
	if (typeof value === 'boolean') {
		command = value ? '100' : '0';
	} else {
		command = "" + value;
	}
	request.post(
		this.url,
		{
			body: command,
			headers: {'Content-Type': 'text/plain'}
		},
		function (error, response, body) {
			if (!error && response.statusCode == 201) {
				self.log("OpenHAB HTTP - response from " + self.name + ": " + body);
			} else {
				self.log("OpenHAB HTTP - error from " + self.name + ": " + error);
			}
   	       	callback();
		}
	);
};

DimmerItem.prototype.getItemBrightnessState = function(callback) {	
	
	var self = this;
	
	this.log("iOS - request brightness state from " + this.name);
	request(this.url + '/state?type=json', function (error, response, body) {
		if (!error && response.statusCode == 200) {
	    	self.log("OpenHAB HTTP - response from " + self.name + ": " + body);
	    	callback(undefined,+body);
	  	} else {
	  		self.log("OpenHAB HTTP - error from " + self.name + ": " + error);
	  	}
	})
};

///////// END DIMMER ITEM /////////

///////// ROLLERSHUTTER ITEM /////////

function RollershutterItem(widget,platform){
	RollershutterItem.super_.call(this, widget,platform);
	this.positionState = Characteristic.PositionState.STOPPED;
	this.currentPosition = 100;
	this.targetPosition = 100;
	this.startedPosition = 100;
};

util.inherits(RollershutterItem, AbstractItem);
	
RollershutterItem.prototype.getServices = function() {
	
	this.checkListener();
	
	this.informationService = this.getInformationServices();
		
	this.otherService = new Service.WindowCovering();
	
	this.otherService.getCharacteristic(Characteristic.CurrentPosition)
    	.on('get', this.getItemCurrentPosition.bind(this))
    	.setValue(this.currentPosition);    	

	this.setInitialState = true;

    this.otherService.getCharacteristic(Characteristic.TargetPosition)
   		.on('set', this.setItem.bind(this))
    	.on('get', this.getItemTargetPosition.bind(this))
    	.setValue(this.currentPosition);

    this.otherService.getCharacteristic(Characteristic.PositionState)
    	.on('get', this.getItemPositionState.bind(this))
    	.setValue(this.positionState);
			
	return [this.informationService, this.otherService];
};



RollershutterItem.prototype.updateCharacteristics = function(message) {

	console.log(message);
	console.log(this.targetPosition);
	
	 

	if (parseInt(message) == this.targetPosition) {
		var ps = Characteristic.PositionState.STOPPED;
		var cs = parseInt(message);
	} else if (parseInt(message) > this.targetPosition){
		var ps = Characteristic.PositionState.INCREASING;
		var cs = this.startedPosition;
	} else {
   		var ps = Characteristic.PositionState.DECREASING;
   		var cs = this.startedPosition;
   	}
   	   	
   	this.otherService
   		.getCharacteristic(Characteristic.PositionState)
   		.setValue(ps);
   		
   	this.otherService
   			.getCharacteristic(Characteristic.CurrentPosition)
       		.setValue(parseInt(cs));
    this.currentPosition = parseInt(cs);
};
	
RollershutterItem.prototype.setItem = function(value, callback) {	
	
	var self = this;
	this.checkListener();
	
	if (this.setInitialState) {
   		this.setInitialState = false;
   		callback();
   		return;
   	}
	
	this.startedPosition = this.currentPosition;
	
	this.log("iOS - send message to " + this.name + ": " + value);
		
	var command = 0;
	if (typeof value === 'boolean') {
		command = value ? '100' : '0';
	} else {
		command = "" + value;
	}
	request.post(
		this.url,
		{
			body: command,
			headers: {'Content-Type': 'text/plain'}
		},
		function (error, response, body) {
			if (!error && response.statusCode == 201) {
				self.log("OpenHAB HTTP - response from " + self.name + ": " + body);
				self.targetPosition = parseInt(value);
			} else {
				self.log("OpenHAB HTTP - error from " + self.name + ": " + error);
			}
   	       	callback();
		}
	);
};

RollershutterItem.prototype.getItemPositionState = function(callback) {
	this.log("iOS - request position state from " + this.name);
	this.log("Platform - response from " + this.name + ": " + this.positionState);
	callback(undefined,this.positionState);
};

RollershutterItem.prototype.getItemTargetPosition = function(callback) {
	this.log("iOS - get target position state from " + this.name);
	this.log("Platform - response from " + this.name + ": " + this.targetPosition);
	callback(undefined,this.targetPosition);
}

RollershutterItem.prototype.getItemCurrentPosition = function(callback) {	
 	var self = this;
 	this.log("iOS - request current position state from " + this.name);
 	
 	request(this.url + '/state?type=json', function (error, response, body) {
 		if (!error && response.statusCode == 200) {
 			
 			self.log("OpenHAB HTTP - response from " + self.name + ": " +body);
 			self.currentPosition = parseInt(body);
 			callback(undefined,parseInt(body));
 		
 		} else {
 			self.log("OpenHAB HTTP - error from " + self.name + ": " + error);
 		}
 	})
};

///////// END ROLLERSHUTTER ITEM /////////

///////// ITEM UTILITY /////////

function ItemFactory(openhabPlatform){
    this.platform = openhabPlatform;
    this.log = this.platform.log;
}

ItemFactory.prototype = {
  	sitemapUrl: function() {
    	var serverString = this.platform.server;
    	//TODO da verificare
    	if (this.platform.user && this.platform.password) {
      		serverString = this.platform.user + ":" + this.platform.password + "@" + serverString;
    	}
    
    	return this.platform.protocol + "://" + serverString + ":" + this.platform.port + "/rest/sitemaps/" + this.platform.sitemap + "?type=json";
  	},
  	
  	parseSitemap: function(jsonSitemap) {
		var widgets = [].concat(jsonSitemap.homepage.widget);
		
		var result = [];
		for (var i = 0; i < widgets.length; i++) {
			var widget = widgets[i];
			if (!widget.item) {
          		//TODO to handle frame
          		this.log("Platform - The widget '" + widget.label + "' is not an item.");
        		continue;
        	}                	
        	
        	if (currentModule[widget.item.type] != undefined) {
        		var accessory = new currentModule[widget.item.type](widget,this.platform);
			} else {
        		this.log("Platform - The widget '" + widget.label + "' of type "+widget.item.type+" is an item not handled.");
        		continue;
        	}        	
        	 
        	this.log("Platform - Accessory Found: " + widget.label);
            result.push(accessory);	
    	}
    	return result;
	}
	
};

///////// END ITEM UTILITY /////////

///////// WS LISTENER /////////

function WSListener(item, callback){
	this.item = item;	
	this.callback = callback;
}

WSListener.prototype = {
  	startListener: function() {	
		var self = this;	
		
		if (typeof this.item.ws == 'undefined') {
			this.item.ws = new WebSocket(this.item.url.replace('http:', 'ws:') + '/state?type=json');
		}
		
		this.item.ws.on('open', function() {
      		self.item.log("OpenHAB WS - new connection for "+self.item.name);
    	});
    	
    	this.item.ws.on('message', function(message) {
      		self.item.log("OpenHAB WS - message from " +self.item.name+": "+ message);
      		self.callback(message);
    	});
    	
    	this.item.ws.on('close', function close() {
  			self.item.log("OpenHAB WS - closed connection for "+self.item.name);
  			self.item.listener = undefined;
  			self.item.ws = undefined;
		});
	}
	
};

///////// END WS LISTENER /////////

///////// SUPPORTED ITEMS /////////
module.exports.SwitchItem = SwitchItem;
module.exports.DimmerItem = DimmerItem;
module.exports.RollershutterItem = RollershutterItem;
///////// END SUPPORTED ITEMS /////////

module.exports.accessory = OpenhabAccessory;
module.exports.platform = OpenhabPlatform;
