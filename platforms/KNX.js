/** Sample platform outline
 *  based on Sonos platform
 */
'use strict';
var types = require("HAP-NodeJS/accessories/types.js");
//var hardware = require('myHardwareSupport'); //require any additional hardware packages
var knxd = require('eibd');

function KNXPlatform(log, config){
	this.log = log;
	this.config = config;
//	this.property1 = config.property1;
//	this.property2 = config.property2;


	// initiate connection to bus for listening ==> done with first shim

};

KNXPlatform.prototype = {
		accessories: function(callback) {
			this.log("Fetching KNX devices.");
			var that = this;


			// iterate through all devices the platform my offer
			// for each device, create an accessory

			// read accessories from file !!!!!
			var foundAccessories = this.config.accessories; 


			//create array of accessories
			var myAccessories = [];

			for (var int = 0; int < foundAccessories.length; int++) {
				this.log("parsing acc " + int + " of " + foundAccessories.length);
				// instantiate and push to array
				switch (foundAccessories[int].accessory_type) {
				case "knxdevice":
					this.log("push new universal device "+foundAccessories[int].name);
					// push knxd connection setting to each device from platform
					foundAccessories[int].knxd_ip = this.config.knxd_ip;
					foundAccessories[int].knxd_port = this.config.knxd_port;
					var accConstructor = require('./../accessories/knxdevice.js');
					var acc = new accConstructor.accessory(this.log,foundAccessories[int]);
					this.log("created "+acc.name+" universal accessory");	
					myAccessories.push(acc);
					break;
				default:
					// do something else
					this.log("unkown accessory type found")
				} 

			};	
			// if done, return the array to callback function
			this.log("returning "+myAccessories.length+" accessories");
			callback(myAccessories);
		}
};


/**
 * The buscallbacks module is to expose a simple function to listen on the bus and register callbacks for value changes
 * of registered addresses.
 * 
 * Usage:
 *	 You can start the monitoring process at any time
	 startMonitor({host: name-ip, port: port-num });

 *	 You can add addresses to the subscriptions using 

registerGA(groupAddress, callback)

 *	 groupAddress has to be an groupAddress in common knx notation string '1/2/3'
 *	 the callback has to be a 
 *	 	var f = function(value) { handle value update;}
 *	 so you can do a 
 *	 	registerGA('1/2/3', function(value){
 *	 		console.log('1/2/3 got a hit with '+value);
 *	 		});
 *	 but of course it is meant to be used programmatically, not literally, otherwise it has no advantage
 *	
 *	 You can also use arrays of addresses if your callback is supposed to listen to many addresses:

registerGA(groupAddresses[], callback)

 *	as in 
 *	 	registerGA(['1/2/3','1/0/0'], function(value){
 *	 		console.log('1/2/3 or 1/0/0 got a hit with '+value);
 *	 		});
 *  if you are having central addresses like "all lights off" or additional response objects
 *  
 *  
 *  callbacks can have a signature of
 *  function(value, src, dest, type) but do not have to support these parameters (order matters)
 *  src = physical address such as '1.1.20'
 *  dest = groupAddress hit (you subscribed to that address, remember?), as '1/2/3'
 *  type = Data point type, as 'DPT1' 
 *  
 *  	
 */



//array of registered addresses and their callbacks
var subscriptions = []; 
//check variable to avoid running two listeners
var running; 

function groupsocketlisten(opts, callback) {
	var conn = knxd.Connection();
	conn.socketRemote(opts, function() {
		conn.openGroupSocket(0, callback);
	});
}


var registerSingleGA = function registerSingleGA (groupAddress, callback, reverse) {
	subscriptions.push({address: groupAddress, callback: callback, reverse:reverse });
}

/*
 * public busMonitor.startMonitor()
 * starts listening for telegrams on KNX bus
 * 
 */ 
var startMonitor = function startMonitor(opts) {  // using { host: name-ip, port: port-num } options object
	if (!running) {
		running = true;
	} else {
		console.log("<< knxd socket listener already running >>");
		return null;
	}
	console.log(">>> knxd groupsocketlisten starting <<<");	
	groupsocketlisten(opts, function(parser) {
		//console.log("knxfunctions.read: in callback parser");
		parser.on('write', function(src, dest, type, val){
			// search the registered group addresses
			//console.log('recv: Write from '+src+' to '+dest+': '+val+' ['+type+'], listeners:' + subscriptions.length);
			for (var i = 0; i < subscriptions.length; i++) {
				// iterate through all registered addresses
				if (subscriptions[i].address === dest) {
					// found one, notify
					console.log('HIT: Write from '+src+' to '+dest+': '+val+' ['+type+']');
					subscriptions[i].callback(val, src, dest, type, subscriptions[i].reverse);
				}
			}
		});

		parser.on('response', function(src, dest, type, val) {
			// search the registered group addresses
//			console.log('recv: resp from '+src+' to '+dest+': '+val+' ['+type+']');
			for (var i = 0; i < subscriptions.length; i++) {
				// iterate through all registered addresses
				if (subscriptions[i].address === dest) {
					// found one, notify
//					console.log('HIT: Response from '+src+' to '+dest+': '+val+' ['+type+']');
					subscriptions[i].callback(val, src, dest, type, subscriptions[i].reverse);
				}
			}

		});

		//dont care about reads here
//		parser.on('read', function(src, dest) {
//		console.log('Read from '+src+' to '+dest);
//		});
		//console.log("knxfunctions.read: in callback parser at end");
	}); // groupsocketlisten parser
}; //startMonitor


/*
 *  public registerGA(groupAdresses[], callback(value))
 *  parameters
 *  	callback: function(value, src, dest, type) called when a value is sent on the bus
 *  	groupAddresses: (Array of) string(s) for group addresses
 * 
 *  
 *  
 */
var registerGA = function (groupAddresses, callback) {
	// check if the groupAddresses is an array
	if (groupAddresses.constructor.toString().indexOf("Array") > -1) {
		// handle multiple addresses
		for (var i = 0; i < groupAddresses.length; i++) {
			if (groupAddresses[i] && groupAddresses[i].match(/(\d*\/\d*\/\d*)/)) { // do not bind empty addresses or invalid addresses
				// clean the addresses
				registerSingleGA (groupAddresses[i].match(/(\d*\/\d*\/\d*)/)[0], callback,groupAddresses[i].match(/\d*\/\d*\/\d*(R)/) ? true:false );
			}
		}
	} else {
		// it's only one
		if (groupAddresses.match(/(\d*\/\d*\/\d*)/)) {
			registerSingleGA (groupAddresses.match(/(\d*\/\d*\/\d*)/)[0], callback, groupAddresses[i].match(/\d*\/\d*\/\d*(R)/) ? true:false);
		}
	}
//	console.log("listeners now: " + subscriptions.length);
};



module.exports.platform = KNXPlatform;
module.exports.registerGA = registerGA;
module.exports.startMonitor = startMonitor;