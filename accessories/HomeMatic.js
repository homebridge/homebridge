var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");

function HomeMatic(log, config) {
  this.log = log;
  this.name = config["name"];
  this.ccuID = config["ccu_id"];
  this.ccuIP = config["ccu_ip"];
}

HomeMatic.prototype = {

  setPowerState: function(powerOn) {

    var binaryState = powerOn ? 1 : 0;
    var that = this;
    
    this.log("Setting power state of CCU to " + powerOn);
    this.log(this.ccuID+ powerOn);
    
    	request.put({
      url: "http://"+this.ccuIP+"/config/xmlapi/statechange.cgi?ise_id="+this.ccuID+"&new_value="+ powerOn,
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        that.log("State change complete.");
      }
      else {
        that.log("Error '"+err+"' setting lock state: " + body);
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
        initialValue: "WeMo",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Rev-1",
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
      sType: types.SWITCH_STYPE,
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
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) { that.setPowerState(value); },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Change the power state of a Variable",
        designedMaxLength: 1
      }]
    }];
  }
};

module.exports.accessory = HomeMatic;
