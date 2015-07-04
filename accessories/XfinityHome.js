var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");
var xmldoc = require("xmldoc");

function XfinityHomeAccessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.email = config["email"];
  this.password = config["password"];
  this.dsig = config["dsig"];
  this.pinCode = config["pin"];
}

XfinityHomeAccessory.prototype = {

  armWithType: function(armed, type) {
    this.log("Arming with type " + type + " = " + armed + "...");
    this.targetArmed = armed;
    this.targetArmType = type;
    this.getLoginToken();
  },

  getLoginToken: function() {
    this.log("Retrieving login token...");

    var that = this;

    request.post({
      url: "https://login.comcast.net/api/login",
      form: {
        appkey:"iControl",
        dsig: this.dsig,
        u: this.email,
        p: this.password
      }
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {

        var doc = new xmldoc.XmlDocument(body);
        that.loginToken = doc.valueWithPath("LoginToken");
        that.refreshLoginCookie();
      }
      else {
        that.log("Error '"+err+"' getting login token: " + body);
      }
    });
  },

  refreshLoginCookie: function() {
    this.log("Refreshing login cookie...");

    var that = this;

    request.post({
      url: "https://www.xfinityhomesecurity.com/rest/icontrol/login",
      form: {
        token: this.loginToken
      }
    }, function(err, response, body) {

      if (!err && response.statusCode == 200) {

        // extract our "site" from the login response
        var json = JSON.parse(body);
        that.siteHref = json["login"]["site"]["href"];

        // manual cookie handling
        that.loginCookie = response.headers["set-cookie"];

        that.getInstances();
      }
      else {
        that.log("Error '"+err+"' refreshing login cookie: " + body);
      }
    });
  },

  getInstances: function() {
    this.log("Getting instances for site " + this.siteHref + "...");

    this.panelHref = null;
    var that = this;

    request.get({
      url: "https://www.xfinityhomesecurity.com/"+that.siteHref+"/network/instances",
      headers: { Cookie: this.loginCookie },
      json: true
    }, function(err, response, json) {

      if (!err && response.statusCode == 200) {

        // extract our "instance" from the response. look for the first "panel"
        var instances = json["instances"]["instance"];
        for (var i=0; i<instances.length; i++) {
          var instance = instances[i];

          if (instance["mediaType"] == "instance/panel") {
            that.panelHref = instance.href;
          }
        }

        if (that.panelHref) {
          that.log("Found panel " + that.panelHref + ". Ready to arm.");
          that.finishArm();
        }
        else {
          that.log("Couldn't find a panel.");
        }
      }
      else {
        that.log("Error '"+err+"' getting instances: " + JSON.stringify(json));
      }
    });
  },

  finishArm: function() {
    this.log("Finish arming with type " + this.targetArmType + " = " + this.targetArmed + "...");

    var path, form;
    var that = this;

    if (!this.targetArmed) {
      path = this.panelHref + "/functions/disarm";
      form = {code: this.pinCode};
    }
    else {
      path = this.panelHref + "/functions/arm";
      form = {code: this.pinCode, armType: this.targetArmType };
    }

    request.post({
      url: "https://www.xfinityhomesecurity.com"+path,
      headers: { Cookie: this.loginCookie },
      form: form
    }, function(err, response, body) {

      if (!err && response.statusCode >= 200 && response.statusCode < 300) {
        that.log("Arm response: " + response);
      }
      else {
        that.log("Error '"+err+"' performing arm request: " + body);
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
        initialValue: "Comcast",
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
        initialValue: "Away Mode",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Away Mode service",
        designedMaxLength: 255
      },{
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) { that.armWithType(value, "away"); },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Turn on the Away alarm",
        designedMaxLength: 1
      }]
    },{
      sType: types.SWITCH_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Night Mode",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Night Mode service",
        designedMaxLength: 255
      },{
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) { that.armWithType(value, "night"); },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Turn on the Night alarm",
        designedMaxLength: 1
      }]
    },{
      sType: types.SWITCH_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: "Stay Mode",
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Stay Mode service",
        designedMaxLength: 255
      },{
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) { that.armWithType(value, "stay"); },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: false,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Turn on the Stay alarm",
        designedMaxLength: 1
      }]
    }];
  }
};

// Enable cookie handling and append our expected headers
request = request.defaults({
  headers: {
    "X-appkey": "comcastTokenKey",
    "X-ClientInfo": "5.2.51",
    "X-format": "json"
  }
});

module.exports.accessory = XfinityHomeAccessory;
