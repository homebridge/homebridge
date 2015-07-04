var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");

function LockitronAccessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.lockID = config["lock_id"];
  this.accessToken = config["api_token"];
}

LockitronAccessory.prototype = {
  getState: function(callback) {
    this.log("Getting current state...");
    
    var that = this;

    var query = {
      access_token: this.accessToken
    };
    
    request.get({
      url: "https://api.lockitron.com/v2/locks/"+this.lockID,
      qs: query
    }, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        var json = JSON.parse(body);
        var state = json.state; // "lock" or "unlock"
        var locked = state == "lock"
        callback(locked);
      }
      else {
        that.log("Error getting state (status code "+response.statusCode+"): " + err)
        callback(undefined);
      }
    });
  },
  
  setState: function(state) {
    this.log("Set state to " + state);

    var lockitronState = (state == 1) ? "lock" : "unlock";
	  var that = this;

    var query = {
      access_token: this.accessToken,
      state: lockitronState
    };

    request.put({
      url: "https://api.lockitron.com/v2/locks/"+this.lockID,
      qs: query
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
        initialValue: "Apigee",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Rev-2",
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
      sType: types.LOCK_MECHANISM_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Lock Mechanism",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of service",
        designedMaxLength: 255
      },{
        cType: types.CURRENT_LOCK_MECHANISM_STATE_CTYPE,
        onRead: function(callback) { that.getState(callback); },
        onUpdate: function(value) { that.log("Update current state to " + value); },
        perms: ["pr","ev"],
        format: "int",
        initialValue: 0,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "BlaBla",
        designedMinValue: 0,
        designedMaxValue: 3,
        designedMinStep: 1,
        designedMaxLength: 1
      },{
        cType: types.TARGET_LOCK_MECHANISM_STATE_CTYPE,
        onUpdate: function(value) { that.setState(value); },
        perms: ["pr","pw","ev"],
        format: "int",
        initialValue: 0,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "BlaBla",
        designedMinValue: 0,
        designedMaxValue: 1,
        designedMinStep: 1,
        designedMaxLength: 1
      }]
    },{
      sType: types.LOCK_MANAGEMENT_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Lock Management",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of service",
        designedMaxLength: 255
      },{
        cType: types.LOCK_MANAGEMENT_CONTROL_POINT_CTYPE,
        onUpdate: function(value) { that.log("Update control point to " + value); },
        perms: ["pw"],
        format: "data",
        initialValue: 0,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "BlaBla",
        designedMaxLength: 255
      },{
        cType: types.VERSION_CTYPE,
        onUpdate: function(value) { that.log("Update version to " + value); },
        perms: ["pr"],
        format: "string",
        initialValue: "1.0",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "BlaBla",
        designedMaxLength: 255
      }]
    }];
  }
};

module.exports.accessory = LockitronAccessory;