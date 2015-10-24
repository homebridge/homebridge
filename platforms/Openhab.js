// OpenHAB Platform Shim for HomeBridge
// Written by Tommaso Marchionni
// Based on many of the other HomeBridge platform modules
// 
// Revisions:
//
// 17 October 2015 [tommasomarchionni]
// - Initial release
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
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.
//

var types = require("hap-nodejs/accessories/types.js");
var request = require("request");
var Service = require("hap-nodejs/lib/Service.js").Service;
var Characteristic = require("hap-nodejs").Characteristic;

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
    
    sitemapUrl: function() {
    	var serverString = this.server;
    	//TODO da verificare
    	if (this.user && this.password) {
      		serverString = this.user + ":" + this.password + "@" + serverString;
    	}
    
    	return this.protocol + "://" + serverString + ":" + this.port + "/rest/sitemaps/" + this.sitemap + "?type=json";
  	},
  	
  	parseSitemap: function(sitemap) {
		var widgets = [].concat(sitemap.homepage.widget);
		var result = [];
		for (var i = 0; i < widgets.length; i++) {
			var widget = widgets[i];
			if (!widget.item) {
          		//TODO to handle frame
          		this.log("WARN: The widget '" + widget.label + "' does not reference an item.");
        		continue;
        	}                	
        
        	if (widget.item.type=="SwitchItem" || widget.item.type=="DimmerItem" || widget.item.type == "RollershutterItem"){
        		accessory = new OpenhabAccessory(this.log,this,widget.widgetId,widget.label,widget.item)
            this.log("Accessory Found: " + widget.label);
            result.push(accessory);
        	}
        
        	
        	
    	}
    	return result;
	},
    
    accessories: function(callback) {
        this.log("Fetching OpenHAB devices.");
        var that = this;

		url = that.sitemapUrl();
		this.log("Connecting to " + url);
		request.get({
			url: url,
			json: true
		}, function(err, response, json) {
			if (!err && response.statusCode == 200) {
        		callback(that.parseSitemap(json));
			} else {
				that.log("There was a problem connecting to OpenHAB.");
			}
		});
    }
};

function OpenhabAccessory(log, platform, widgetId, label, detail) {
    this.log = log;
    this.platform = platform;
    this.idx = widgetId;
    this.name = label;
    this.label = label;
    this.type = detail.type;
    this.deviceURL = detail.link;
    this.addressStr = "n/a";
    this.state = detail.state;
    
    if (this.type == "DimmerItem") {
    	this.typeSupportsOnOff = true;
    	this.typeSupportsDim = true;
    }
    
    if (this.type == "SwitchItem") {
    	this.typeSupportsOnOff = true;
    }
    
    if (this.type == "RollershutterItem") {
    	this.typeSupportsWindowCovering = true;    	
    }
    
}

OpenhabAccessory.prototype = {

    updateStatus: function(command) {
        var that = this;
        
        var options = {
            url: this.deviceURL,
            method: 'POST',
            body: "" + command
        };
        if (this.auth) {
            options['auth'] = this.auth;
        }
        
        that.log("eseguo post");
        
        request(options, function(error, response, body) {
            if (error) {
                console.trace("Updating Device Status.");
                that.log(error);
                return error;
            }
            
        	that.log("updateStatus of " + that.name + ": " + command);        	
            
        });        
    },
	
 	getServiceType: function() {
     	if (this.typeSupportsWindowCovering){
     		return new Service.WindowCovering;
     	} else if (this.typeSupportsDim) {
         	return new Service.Lightbulb;
     	} else if (this.typeSupportsOnOff) {
         	return new Service.Switch;
     	}
   	},
	
	updateStatus: function(command, callback) {
        var that = this;
        
        var options = {
            url: this.deviceURL,
            method: 'POST',
            body: "" + command
        };
        if (this.auth) {
            options['auth'] = this.auth;
        }
        
        request(options, function(error, response, body) {
            if (error) {
                //console.trace("Updating Device Status.");
                //that.log(error);
                //return error;
                callback(new Error(error));
            } else {
            	that.log("updateStatus of " + that.name + ": " + command); 
            	callback(true);
            }
        }.bind(this));      
    },
	
	setPowerState: function(powerOn, callback) {
    	var that = this;
		
        if (this.typeSupportsOnOff) {
            if (powerOn) {
            	var command = "ON";
            } else {
            	var command = "OFF";
            }
            
            this.log("Setting power state on the '"+this.name+"' to " + command);
            this.updateStatus(command, function(noError){
            	if (noError) {
        			that.log("Successfully set '"+that.name+"' to " + command);
        			callback();
      			} else {
      				callback(new Error('Can not communicate with OpenHAB.'));
            	}
            }.bind(this));
            
        }else{
        	callback(new Error(this.name + " not supports ONOFF"));
        }
  	},
	
	getStatus: function(callback){
		var that = this;
    	this.log("Fetching status brightness for: " + this.name);

		var options = {
            url: this.deviceURL + '/state?type=json',
            method: 'GET'
        };
        
        if (this.auth) {
            options['auth'] = this.auth;
        }

		request(options, function(error, response, body) {
            if (error) {
                //console.trace("Requesting Device Status.");
                //that.log(error);
                //return error;
                callback(new Error('Can not communicate with Home Assistant.'));
            } else {
            	that.log("getStatus of " + that.name + ": " + body);
            	callback(null,body);
            }

            
            
        }.bind(this));

  	},
  	
  	getCurrentPosition: function(callback){
  		callback(100);
  	},
  	
  	getPositionState: function(callback){
		this.log("Fetching position state for: " + this.name);
		callback(Characteristic.PositionState.STOPPED);
  	},
	
	setTargetPosition: function(level, callback) {
    	var that = this;
    	
        this.log("Setting target position on the '"+this.name+"' to " + level);
            
        this.updateStatus(level, function(noError){
            if (noError) {
        		that.log("Successfully set position on the '"+that.name+"' to " + level);
        		callback();
      		} else {
      			callback(new Error('Can not communicate with OpenHAB.'));
            }
        }.bind(this));
        
  	},
	
	setBrightness: function(level, callback) {
    	var that = this;
    	
		if (this.typeSupportsDim && level >= 0 && level <= 100) {
            
            this.log("Setting brightness on the '"+this.name+"' to " + level);
            
            this.updateStatus(level, function(noError){
            	if (noError) {
        			that.log("Successfully set brightness on the '"+that.name+"' to " + level);
        			callback();
      			} else {
      				callback(new Error('Can not communicate with OpenHAB.'));
            	}
            }.bind(this));
        }
  	},
	
	getServices: function() {
    	
	    var informationService = new Service.AccessoryInformation();

    	informationService
      		.setCharacteristic(Characteristic.Manufacturer, "OpenHAB")
      		.setCharacteristic(Characteristic.Model, this.type)
      		.setCharacteristic(Characteristic.SerialNumber, "1234567890")
      		.setCharacteristic(Characteristic.Name, this.label);

		var otherService = this.getServiceType();
    	
    	if (this.typeSupportsOnOff) {
    		otherService
      			.getCharacteristic(Characteristic.On)
      			.on('get', this.getStatus.bind(this))
      			.on('set', this.setPowerState.bind(this));
      			
      	}
		
		if (this.typeSupportsDim) {
    		otherService
      			.addCharacteristic(Characteristic.Brightness)
      			.on('get', this.getStatus.bind(this))
      			.on('set', this.setBrightness.bind(this));
      	}
      	
      	if (this.typeSupportsWindowCovering) {
      		var currentPosition = 100;
      		
      		otherService
      			.getCharacteristic(Characteristic.CurrentPosition)
  				.on('get', this.getCurrentPosition.bind(this))
  				.setValue(currentPosition);	
  			
  			otherService
  				.getCharacteristic(Characteristic.PositionState)
  				.on('get', this.getPositionState.bind(this))
  				.setValue(Characteristic.PositionState.STOPPED);
  				
  			otherService
  				.getCharacteristic(Characteristic.TargetPosition)
  				.on('get', this.getCurrentPosition.bind(this))
  				.on('set', this.setTargetPosition.bind(this));
  		
  		}

		console.log(informationService);
		
    	return [informationService, otherService];
  	}
    	
}

module.exports.accessory = OpenhabAccessory;
module.exports.platform = OpenhabPlatform;
