var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");

// This seems to be the "id" of the official LiftMaster iOS app
var APP_ID = "JVM/G9Nwih5BwKgNCjLxiFUQxQijAebyyg8QUHr7JOrP+tuPb8iHfRHKwTmDzHOu"

function LiftMasterAccessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.username = config["username"];
  this.password = config["password"];
  this.requiredDeviceId = config["requiredDeviceId"];
}

LiftMasterAccessory.prototype = {

  setState: function(state) {
    this.targetState = state;
    this.login();
  },

  login: function() {
    var that = this;

    // reset our logged-in state hint until we're logged in
    this.deviceId = null;

    // querystring params
    var query = {
      appId: APP_ID,
      username: this.username,
      password: this.password,
      culture: "en"
    };

    // login to liftmaster
    request.get({
      url: "https://myqexternal.myqdevice.com/api/user/validatewithculture",
      qs: query
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {

        // parse and interpret the response
        var json = JSON.parse(body);
        that.userId = json["UserId"];
        that.securityToken = json["SecurityToken"];
        that.log("Logged in with user ID " + that.userId);
        that.getDevice();
      }
      else {
        that.log("Error '"+err+"' logging in: " + body);
      }
    });
  },

  // find your garage door ID
  getDevice: function() {
    var that = this;

    // querystring params
    var query = {
      appId: APP_ID,
      SecurityToken: this.securityToken,
      filterOn: "true"
    };

    // some necessary duplicated info in the headers
    var headers = {
      MyQApplicationId: APP_ID,
      SecurityToken: this.securityToken
    };

    // request details of all your devices
    request.get({
      url: "https://myqexternal.myqdevice.com/api/v4/userdevicedetails/get",
      qs: query,
      headers: headers
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {

        // parse and interpret the response
        var json = JSON.parse(body);
        var devices = json["Devices"];
        var foundDoors = [];

        // look through the array of devices for an opener
        for (var i=0; i<devices.length; i++) {
          var device = devices[i];

          if (device["MyQDeviceTypeName"] == "GarageDoorOpener") {

            // If we haven't explicity specified a door ID, we'll loop to make sure we don't have multiple openers, which is confusing
            if (!that.requiredDeviceId) {
              var thisDeviceId = device.MyQDeviceId;
              var thisDoorName = "Unknown";
              for (var j = 0; j < device.Attributes.length; j ++) {
                var thisAttributeSet = device.Attributes[j];
                if (thisAttributeSet.AttributeDisplayName == "desc") {
                  thisDoorName = thisAttributeSet.Value;
                  break;
                }
              }
              foundDoors.push(thisDeviceId + " - " + thisDoorName);
              that.deviceId = thisDeviceId;
            }

            // We specified a door ID, sanity check to make sure it's the one we expected
            else if (that.requiredDeviceId == device.MyQDeviceId) {
              that.deviceId = device.MyQDeviceId;
              break;
            }

          }

        }

        // If we have multiple found doors, refuse to proceed
        if (foundDoors.length > 1) {
          that.log("WARNING: You have multiple doors on your MyQ account.");
          that.log("WARNING: Specify the ID of the door you want to control using the 'requiredDeviceId' property in your config.json file.");
          that.log("WARNING: You can have multiple liftmaster accessories to cover your multiple doors");

          for (var j = 0; j < foundDoors.length; j++) {
            that.log("Found Door: " + foundDoors[j]);
          }

          throw "FATAL: Please specify which specific door this Liftmaster accessory should control - you have multiples on your account";

        }

        // Did we get a device ID?
        if (that.deviceId) {
          that.log("Found an opener with ID " + that.deviceId +". Ready to send command...");
          that.setTargetState();
        }
        else
        {
          that.log("Error: Couldn't find a door device, or the ID you specified isn't associated with your account");
        }
      }
      else {
        that.log("Error '"+err+"' getting devices: " + body);
      }
    });
  },

  setTargetState: function() {

    var that = this;
    var liftmasterState = (this.targetState + "") == "1" ? "0" : "1";

    // querystring params
    var query = {
      appId: APP_ID,
      SecurityToken: this.securityToken,
      filterOn: "true"
    };

    // some necessary duplicated info in the headers
    var headers = {
      MyQApplicationId: APP_ID,
      SecurityToken: this.securityToken
    };

    // PUT request body
    var body = {
      AttributeName: "desireddoorstate",
      AttributeValue: liftmasterState,
      ApplicationId: APP_ID,
      SecurityToken: this.securityToken,
      MyQDeviceId: this.deviceId
    };

    // send the state request to liftmaster
    request.put({
      url: "https://myqexternal.myqdevice.com/api/v4/DeviceAttribute/PutDeviceAttribute",
      qs: query,
      headers: headers,
      body: body,
      json: true
    }, function(err, response, json) {

      if (!err && response.statusCode == 200) {

        if (json["ReturnCode"] == "0")
          that.log("State was successfully set.");
        else
          that.log("Bad return code: " + json["ReturnCode"]);
          that.log("Raw response " + JSON.stringify(json));
      }
      else {
        that.log("Error '"+err+"' setting door state: " + JSON.stringify(json));
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
        initialValue: "LiftMaster",
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
      sType: types.GARAGE_DOOR_OPENER_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Garage Door Opener Control",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Name of service",
        designedMaxLength: 255
      },{
        cType: types.CURRENT_DOOR_STATE_CTYPE,
        onUpdate: function(value) { that.log("Update current state to " + value); },
        perms: ["pr","ev"],
        format: "int",
        initialValue: 0,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "BlaBla",
        designedMinValue: 0,
        designedMaxValue: 4,
        designedMinStep: 1,
        designedMaxLength: 1
      },{
        cType: types.TARGET_DOORSTATE_CTYPE,
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
      },{
        cType: types.OBSTRUCTION_DETECTED_CTYPE,
        onUpdate: function(value) { that.log("Obstruction detected: " + value); },
        perms: ["pr","ev"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "BlaBla"
      }]
    }];
  }
};

module.exports.accessory = LiftMasterAccessory;