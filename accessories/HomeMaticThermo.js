var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");

function HomeMaticThermo(log, config) {
  this.log = log;
  this.name = config["name"];
//  this.ccuIDMode = config["ccu_id_Mode"];
  this.ccuIDTargetTemp = config["ccu_id_TargetTemp"];
  this.ccuIDCurrentTemp = config["ccu_id_CurrentTemp"];
  this.ccuIP = config["ccu_ip"];
}

HomeMaticThermo.prototype = {

  setTargetTemperature: function(value) {

    var that = this;
    
    this.log("Setting target Temperature of CCU to " + value);
    this.log(this.ccuID+ value);
    
    request.put({
      url: "http://"+this.ccuIP+"/config/xmlapi/statechange.cgi?ise_id="+this.ccuIDTargetTemp+"&new_value="+ value,
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        that.log("State change complete.");
      }
      else {
        that.log("Error '"+err+"' setting Temperature: " + body);
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
        initialValue: "test",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "test",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Model",
        designedMaxLength: 255
      },{
        cType: types.SERIAL_NUMBER_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "A1S2NREF88EW",
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
      sType: types.THERMOSTAT_STYPE,
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
		cType: types.CURRENTHEATINGCOOLING_CTYPE,
    	onUpdate: function(value) { console.log("Change:",value);},
    	perms: ["pr","ev"],
		format: "int",
		initialValue: 0,
		supportEvents: false,
		supportBonjour: false,
		manfDescription: "Current Mode",
		designedMaxLength: 1,
		designedMinValue: 0,
		designedMaxValue: 2,
		designedMinStep: 1,    
    },{
    	cType: types.TARGETHEATINGCOOLING_CTYPE,
    	onUpdate: function(value) { console.log("Change:",value);},
    	perms: ["pw","pr","ev"],
		format: "int",
		initialValue: 0,
		supportEvents: false,
		supportBonjour: false,
		manfDescription: "Target Mode",
		designedMinValue: 0,
		designedMaxValue: 3,
		designedMinStep: 1,
    },{
    	cType: types.CURRENT_TEMPERATURE_CTYPE,
    	onUpdate: null,
    	perms: ["pr","ev"],
		format: "int",
		initialValue: 20,
		supportEvents: false,
		supportBonjour: false,
		manfDescription: "Current Temperature",
		unit: "celsius"
    },{
    	cType: types.TARGET_TEMPERATURE_CTYPE,
    	onUpdate: function(value) { that.setTargetTemperature(value); },
    	perms: ["pw","pr","ev"],
		format: "int",
		initialValue: 20,
		supportEvents: false,
		supportBonjour: false,
		manfDescription: "Target Temperature",
		designedMinValue: 4,
		designedMaxValue: 35,
		designedMinStep: 1,
		unit: "celsius"
      },{
      	cType: types.TEMPERATURE_UNITS_CTYPE,
      	onUpdate: null,
      	perms: ["pr","ev"],
	  	format: "int",
	  	initialValue: 0,
	  	supportEvents: false,
	  	supportBonjour: false,
	  	manfDescription: "Unit"
      }]
    }];
  }
};

module.exports.accessory = HomeMaticThermo;
