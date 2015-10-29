var types = require("hap-nodejs/accessories/types.js");
var Characteristic = require("hap-nodejs").Characteristic;
var request = require("request");

function HomeMaticWindow(log, config) {
  this.log = log;
  this.name = config["name"];
  this.ccuID = config["ccu_id"];
  this.ccuIP = config["ccu_ip"];
}

HomeMaticWindow.prototype = {

  
  getPowerState: function(callback) {
    var that = this;
    
    this.log("Getting Window State of CCU");    
    request.get({
      url: "http://"+this.ccuIP+"/config/xmlapi/state.cgi?datapoint_id="+this.ccuID,
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        
        //that.log("Response:"+response.body);
        var responseString = response.body.substring(83,84);
        //that.log(responseString);
	    switch(responseString){
		              case "0": {callback(Characteristic.ContactSensorState.CONTACT_DETECTED);break;}
		              case "1": {callback(Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);break;}
                  case "2": {callback(Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);break;}  
	    }
        that.log("Getting Window State complete.");
      }
      else {
        that.log("Error '"+err+"' getting Window State: " + body);
      }
    });
  },

  getServices: function() {
    var that = this;
    return [{
      sType: types.ACCESSORY_INFORMATION_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: this.name,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of the accessory",
        designedMaxLength: 255
      },{
        cType: types.MANUFACTURER_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Homematic",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "HM-Sec-RHS",
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
      }]
    },{
      sType: types.CONTACT_SENSOR_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: this.name,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of service",
        designedMaxLength: 255
      },{
        cType: types.CONTACT_SENSOR_STATE_CTYPE,
	onRead: function(callback) { that.getPowerState(callback); },
        perms: ["pr","ev"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Get Window state of a Variable",
        designedMaxLength: 1
      }]
    }];
  }
};

module.exports.accessory = HomeMaticWindow;
