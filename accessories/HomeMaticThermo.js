var types = require("hap-nodejs/accessories/types.js");
var request = require("request");

function HomeMaticThermo(log, config) {
  this.log = log;
  this.name = config["name"];
  this.ccuIDTargetTemp = config["ccu_id_TargetTemp"];
  this.ccuIDCurrentTemp = config["ccu_id_CurrentTemp"];
  this.ccuIDControlMode = config["ccu_id_ControlMode"];
  this.ccuIDManuMode = config["ccu_id_ManuMode"];
  this.ccuIDAutoMode = config["ccu_id_AutoMode"];  
  this.ccuIP = config["ccu_ip"];
}

HomeMaticThermo.prototype = {

  setTargetTemperature: function(value) {

    var that = this;
    
    this.log("Setting target Temperature of CCU to " + value);
    this.log(this.ccuIDTargetTemp + " " + value);
    
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
  getCurrentTemperature: function(callback) {

    var that = this;
    
    this.log("Getting current Temperature of CCU");    
    request.get({
      url: "http://"+this.ccuIP+"/config/xmlapi/state.cgi?datapoint_id="+this.ccuIDCurrentTemp,
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        
        //that.log("Response:"+response.body);
        var responseString = response.body.substring(83,87);
        //that.log(responseString);
        callback(parseFloat(responseString));
        //that.log("Getting current temperature complete.");
      }
      else {
        that.log("Error '"+err+"' getting Temperature: " + body);
      }
    });
  },   
  getTargetTemperature: function(callback) {

    var that = this;
    
this.log("Getting target Temperature of CCU");    
    request.get({
      url: "http://"+this.ccuIP+"/config/xmlapi/state.cgi?datapoint_id="+this.ccuIDTargetTemp,
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        
        //that.log("Response:"+response.body);
        var responseString = response.body.substring(83,87);
        //that.log(responseString);
        callback(parseFloat(responseString));
        //that.log("Getting target temperature complete.");
      }
      else {
        that.log("Error '"+err+"' getting Temperature: " + body);
      }
    });
  },
  getMode: function(callback) {

    var that = this;
    
    //this.log("Getting target Mode of CCU");
    //this.log(this.ccuID+ value);
    
    request.get({
      url: "http://"+this.ccuIP+"/config/xmlapi/state.cgi?datapoint_id="+this.ccuIDControlMode,
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        
        //that.log("Response:"+response.body);
        var responseInt = response.body.substring(83,84);
        //that.log(responseString);
        if (responseInt == 1) 
        { callback(parseInt("0")); }
        if (responseInt == 0) 
        { callback(parseInt("1")); }
        //that.log("Getting mode complete.");
      }
      else {
        that.log("Error '"+err+"' getting Mode: " + body);
      }
    });
  },
  setMode: function(value) {

    var that = this;
    
    //this.log("Seting target Mode of CCU:" + value);
    var modvalue;
	var dpID;
	switch(value) {
		case 3: {modvalue = "true";dpID=this.ccuIDAutoMode;break;} //auto 
		case 1: {modvalue = "true";dpID=this.ccuIDAutoMode;break;} //heating => auto
		default: {modvalue = "1";dpID=this.ccuIDManuMode;}         //default => off (manual)
	}

    request.put({
      url: "http://"+this.ccuIP+"/config/xmlapi/statechange.cgi?ise_id="+dpID+"&new_value="+ modvalue,
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        //that.log("Setting Mode complete.");
      }
      else {
        that.log("Error '"+err+"' setting Mode: " + body);
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
		onRead: function(callback) { that.getMode(callback); },
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
		onRead: function(callback) { that.getMode(callback); },
    	onUpdate: function(value) { that.setMode(value);},
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
		onRead: function(callback) { that.getCurrentTemperature(callback); },
    	onUpdate: null,
    	perms: ["pr","ev"],
		format: "float",
		initialValue: 13.0,
		supportEvents: false,
		supportBonjour: false,
		manfDescription: "Current Temperature",
		unit: "celsius"
    },{
    	cType: types.TARGET_TEMPERATURE_CTYPE,
    	onUpdate: function(value) { that.setTargetTemperature(value); },
	onRead: function(callback) { that.getTargetTemperature(callback); },
    	perms: ["pw","pr","ev"],
		format: "float",
		initialValue: 19.0,
		supportEvents: false,
		supportBonjour: false,
		manfDescription: "Target Temperature",
		designedMinValue: 4,
		designedMaxValue: 25,
		designedMinStep: 0.1,
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
