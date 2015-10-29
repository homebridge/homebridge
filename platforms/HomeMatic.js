//
// Homematic Platform Shim for HomeBridge 
// 
// V0.1 - 2015/10/29
// - initial version
// - reintegrated Homematic Platform fork from https://github.com/thkl/homebridge/tree/xmlrpc


var types = require("hap-nodejs/accessories/types.js");
var xmlrpc = require('homematic-xmlrpc')

var request = require("request");
var http = require("http");
var path = require("path");

var HomeMaticGenericChannel = require(path.resolve(__dirname, 'HomematicChannel.js'));



function RegaRequest(log,ccuip) {
   this.log = log;
   this.ccuIP = ccuip;
}

RegaRequest.prototype = {

   script: function (script, callback) {

     var post_options = {
            host: this.ccuIP,
            port: '80',
            path: '/tclrega.exe',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': script.length
            }
        };

        var post_req = http.request(post_options, function(res) {
            var data = "";
            res.setEncoding('binary');
            res.on('data', function (chunk) {
                data += chunk.toString();
            });
            res.on('end', function () {
 				var pos = data.lastIndexOf("<xml><exec>");
                var response = (data.substring(0, pos));
                callback(response);
            });
        });

        post_req.on('error', function(e) {
	         callback("{}");
        });

        post_req.write(script);
        post_req.end();


   },
   
  getValue: function(channel,datapoint,callback) {
      var that = this;
      
      var script = "var d = dom.GetObject(\""+channel+"."+datapoint+"\");if (d){Write(d.State());}";
       //that.log("Rega Request " + script);
       var regarequest = this.script(script, function(data) {
		       that.log("Rega Response" + data);
                if (data!=undefined) {
                  callback(parseFloat(data));
                }
        }
       );
  },
  
  setValue: function(channel,datapoint,value) {
      var that = this;
      
      var script = "var d = dom.GetObject(\""+channel+"."+datapoint+"\");if (d){d.State(\""+value+"\");}";
       //that.log("Rega Request " + script);
       var regarequest = this.script(script, function(data) {
       });
  }

}

function HomematicRPC(log,ccuip,platform) {
    this.log = log;
    this.ccuip = ccuip;
    this.platform = platform;
	this.server;
	this.client;
	this.stopping = false;
	this.localIP;
}

HomematicRPC.prototype= {


   init:function() {
	   	var that = this;
	   	
	   	var ip = this.getIPAddress();
	   	if (ip=="0.0.0.0") {
	   	  that.log("Can not fetch IP");
	   	  return;
	   	}
		
		this.localIP = ip;
		this.log("Local IP: "+this.localIP)
		
	    this.server = xmlrpc.createServer({ host: this.localIP , port: 9090 })

	    this.server.on('NotFound', function(method, params) {
    	  that.log('Method ' + method + ' does not exist');
    	});
    	
		this.server.on('system.listMethods', function (err, params, callback) {
    	 that.log('Method call params for \'system.listMethods\': ' + params)
     	 callback(null,['system.listMethods', 'system.multicall']);
	    });

		
		this.server.on('system.multicall', function (err, params, callback) {
 			params.map(function(events) {
   			try {
     			events.map(function(event){
     			if ((event["methodName"]=="event") && (event['params'] != undefined)) {
       			var params = event['params'];
       			var channel = "BidCos-RF." + params[1];
       			var datapoint = params[2];
       			var value = params[3];
	    			that.platform.foundAccessories.map(function(accessory){
	    			if (accessory.adress == channel) {
				  		accessory.event(datapoint,value);
					}
		 		});
      			}
	 		});
     		} catch(err) {}
  			});
	  callback(null);
	  });
	
	this.log('XML-RPC server listening on port 9090')
    this.connect();
    
    
	process.on('SIGINT', function () {
    	if (that.stopping) {
        	return;
    	}
    	that.stopping = true;
    	that.stop();
	});

	process.on('SIGTERM', function () {
    	if (that.stopping) {
        	return;
    	}
    	that.stopping = true;
    	that.stop();
	});

   },
   
   getIPAddress: function() {
      var interfaces = require('os').networkInterfaces();
      for (var devName in interfaces) {
      var iface = interfaces[devName];
      for (var i = 0; i < iface.length; i++) {
       var alias = iface[i];
       if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
        return alias.address;
       }
      }
	  return '0.0.0.0';
   },

   getValue:function(channel,datapoint,callback) {
   
     var that = this;
     if (this.client == undefined) {
     	that.log("Returning cause client is invalid");
     	return;
     }
     if (channel.indexOf("BidCos-RF.")>-1) {
       channel = channel.substr(10);
       this.log("Calling rpc getValue");
       this.client.methodCall('getValue', [channel,datapoint], function (error, value) {
		callback(value);
       });
       return;
     }
   },

   setValue:function(channel,datapoint,value) {
     
     var that = this;
     
     if (this.client == undefined) return;

     if (channel.indexOf("BidCos-RF.")>-1) {
       channel = channel.substr(10);
     }
     
     this.client.methodCall('setValue', [channel,datapoint,value], function (error, value) {

     });
   },

   connect:function(){
   	 var that = this;
   	 this.log('Creating Local HTTP Client for CCU RPC Events');
	 this.client = xmlrpc.createClient({ host: this.ccuip, port: 2001, path: '/'});
  	 this.log('CCU RPC Init Call on port 2001');
	 this.client.methodCall('init', ['http://'+this.localIP+':9090','homebridge'], function (error, value) {
		that.log('CCU Response ....')
     });
   },
   
   
   stop:function() {
    this.log("Removing Event Server");
    this.client.methodCall('init', ['http://'+this.localIP+':9090'], function (error, value) {

    });
   setTimeout(process.exit(0), 1000);
  }

}


function HomeMaticPlatform(log, config) {
   this.log 	= log;
   this.ccuIP 	= config["ccu_ip"];
   this.filter_device  = config["filter_device"];
   this.filter_channel  = config["filter_channel"];
   this.outlets  = config["outlets"];

   this.sendQueue = [];
   this.timer   = 0;
   
   this.foundAccessories = [];
   this.adressesToQuery = [];
   
   this.xmlrpc = new HomematicRPC(this.log,this.ccuIP,this);
   this.xmlrpc.init();
}

HomeMaticPlatform.prototype = {
   
  

  accessories: function(callback) {
    this.log("Fetching Homematic devices...");
	var that = this;
    that.foundAccessories = [];
     
    var script = "string sDeviceId;string sChannelId;boolean df = true;Write(\'{\"devices\":[\');foreach(sDeviceId, root.Devices().EnumIDs()){object oDevice = dom.GetObject(sDeviceId);if(oDevice){var oInterface = dom.GetObject(oDevice.Interface());if(df) {df = false;} else { Write(\',\');}Write(\'{\');Write(\'\"id\": \"\' # sDeviceId # \'\",\');Write(\'\"name\": \"\' # oDevice.Name() # \'\",\');Write(\'\"address\": \"\' # oDevice.Address() # \'\",\');Write(\'\"channels\": [\');boolean bcf = true;foreach(sChannelId, oDevice.Channels().EnumIDs()){object oChannel = dom.GetObject(sChannelId);if(bcf) {bcf = false;} else {Write(\',\');}Write(\'{\');Write(\'\"cId\": \' # sChannelId # \',\');Write(\'\"name\": \"\' # oChannel.Name() # \'\",\');if(oInterface){Write(\'\"address\": \"\' # oInterface.Name() #\'.'\ # oChannel.Address() # \'\",\');}Write(\'\"type\": \"\' # oChannel.HssType() # \'\"\');Write(\'}\');}Write(\']}\');}}Write(\']}\');";

    var regarequest = new RegaRequest(this.log,this.ccuIP).script(script, function(data) {
                var json  = JSON.parse(data);
				if (json['devices'] != undefined) {
				      json['devices'].map(function(device) {
				            var isFiltered = false;

				            if ((that.filter_device != undefined) && (that.filter_device.indexOf(device.address) > -1)) {
				              isFiltered = true;
				            } else {
				              isFiltered = false;
				            }
                    // that.log('device address:', device.address);

             				if ((device['channels'] != undefined) && (!isFiltered)) {

             				device['channels'].map(function(ch) {
				            var isChannelFiltered = false;

				            if ((that.filter_channel != undefined) && (that.filter_channel.indexOf(ch.address) > -1)) {
				              isChannelFiltered = true;
				            } else {
				              isChannelFiltered = false;
				            }
                    // that.log('name', ch.name, ' -> address:', ch.address);
             				  if ((ch.address != undefined) && (!isChannelFiltered)) {
             				  
								if ((ch.type=="SWITCH") || (ch.type=="BLIND") || (ch.type=="SHUTTER_CONTACT")
								 || (ch.type=="DIMMER") || (ch.type=="CLIMATECONTROL_RT_TRANSCEIVER")
								 || (ch.type=="MOTION_DETECTOR") || (ch.type=="KEYMATIC")
								 ) {
             				    // Switch found
                        // Check if marked as Outlet
                        var special = (that.outlets.indexOf(ch.address) > -1) ? 'OUTLET' : undefined;
              				  accessory = new HomeMaticGenericChannel(that.log, that, ch.id , ch.name , ch.type , ch.address, special);
				                that.foundAccessories.push(accessory);
             				   }
								

							 } else {
							   that.log(device.name + " has no address");
							 }

             				});
             		     } else {
             		      that.log(device.name + " has no channels or is filtered");
             		     }

          			  });

/*
              				    accessory = new HomeMaticGenericChannel(that.log, that, "1234" , "DummyKM" , "KEYMATIC" , "1234");
				                that.foundAccessories.push(accessory);

              				    accessory = new HomeMaticGenericChannel(that.log, that, "5678" , "DummyBLIND" , "BLIND" , "5678");
				                that.foundAccessories.push(accessory);
          			  
				                */
				 callback(that.foundAccessories);
				} else {
				 callback(that.foundAccessories);
				}
    });
   
  },
  
  setValue:function(channel,datapoint,value) {
    if (channel.indexOf("BidCos-RF.")>-1) { 
    	this.xmlrpc.setValue(channel,datapoint,value);
    	return;
    }

  	if (channel.indexOf("VirtualDevices.")>-1) { 
  	    var rega = new RegaRequest(this.log,this.ccuIP);
  	    rega.setValue(channel,datapoint,value);
  	    return;
  	}
    
  },
 
 
  getValue:function(channel,datapoint,callback) {
    
    if (channel.indexOf("BidCos-RF.")>-1) { 
  		this.xmlrpc.getValue(channel,datapoint,callback);
  		return;
  	}
  	
  	if (channel.indexOf("VirtualDevices.")>-1) { 
  	    var rega = new RegaRequest(this.log,this.ccuIP);
  	    rega.getValue(channel,datapoint,callback);
  	    return;
  	}
  	
  },
  
  prepareRequest: function(accessory,script) {
    var that = this;
    this.sendQueue.push(script);
    that.delayed(100);
  },

  sendPreparedRequests: function() {
    var that = this;
    var script = "var d;";
    this.sendQueue.map(function(command) {
      script = script + command;
    });
    this.sendQueue = [];
    //this.log("RegaSend: " + script);
    var regarequest = new RegaRequest(this.log,this.ccuIP).script(script, function(data) {
    });
  },

  sendRequest: function(accessory,script,callback) {
    var that = this;
    var regarequest = new RegaRequest(this.log,this.ccuIP).script(script, function(data) {
     if (data != undefined) {
       try {
         var json  = JSON.parse(data);
         callback(json);
       } catch (err) {
         callback(undefined);
       }
       return;
     }
    });
  },

  delayed: function(delay) {
    var timer = this.delayed[delay];
    if( timer ) {
      this.log("removing old command");
      clearTimeout( timer );
    }

    var that = this;
    this.delayed[delay] = setTimeout( function(){clearTimeout(that.delayed[delay]);that.sendPreparedRequests()}, delay?delay:100);
    this.log("New Timer was set");
  }
}



module.exports.platform = HomeMaticPlatform;