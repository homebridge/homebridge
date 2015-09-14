// Home Assistant
//
// Current Support: lights
//
// This is a shim to publish lights maintained by Home Assistant.
// Home Assistant is an open-source home automation platform.
// URL:     http://home-assistant.io
// GitHub:  https://github.com/balloob/home-assistant
//
// Remember to add platform to config.json. Example:
// "platforms": [
//    {
//        "platform": "HomeAssistant",
//        "name": "HomeAssistant",
//        "host": "http://192.168.1.50:8123",
//        "password": "xxx"
//    }
// ]
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.

var types = require("HAP-NodeJS/accessories/types.js");
var url = require('url')
var request = require("request");

function HomeAssistantPlatform(log, config){

  // auth info
  this.host = config["host"];
  this.password = config["password"];

  this.log = log;
}

HomeAssistantPlatform.prototype = {
  _request: function(method, path, options, callback) {
    var self = this
    var requestURL = this.host + '/api' + path
    options = options || {}
    options.query = options.query || {}

    var reqOpts = {
      url: url.parse(requestURL),
      method: method || 'GET',
      qs: options.query,
      body: JSON.stringify(options.body),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-ha-access': this.password
      }
    }

    request(reqOpts, function onResponse(error, response, body) {
      if (error) {
        callback(error, response)
        return
      }

      if (response.statusCode === 401) {
        callback(new Error('You are not authenticated'), response)
        return
      }

      json = JSON.parse(body)
      callback(error, response, json)
    })

  },
  accessories: function(callback) {
    this.log("Fetching HomeAssistant devices.");

    var that = this;
    var foundAccessories = [];
    var lightsRE = /^light\./i


    this._request('GET', '/states', {}, function(error, response, data){

      for (var i = 0; i < data.length; i++) {
        entity = data[i]

        if (entity.entity_id.match(lightsRE)) {
          accessory = new HomeAssistantAccessory(that.log, entity, that)
          foundAccessories.push(accessory)
        }
      }

      callback(foundAccessories)
    })

  }
}

function HomeAssistantAccessory(log, data, client) {
  // device info
  this.data = data
  this.entity_id = data.entity_id
  this.name = data.attributes.friendly_name

  this.client = client
  this.log = log;
}

HomeAssistantAccessory.prototype = {
  _callService: function(service, service_data, callback){
    var options = {}
    options.body = service_data

    this.client._request('POST', '/services/light/' + service, options, function(error, response, data){
      if (error) {
        callback(null)
      }else{
        callback(data)
      }
    })
  },
  _fetchState: function(callback){
    this.client._request('GET', '/states/' + this.entity_id, {}, function(error, response, data){
      if (error) {
        callback(null)
      }else{
        callback(data)
      }
    })
  },
  getPowerState: function(callback){
    this.log("fetching power state for: " + this.name);
    this._fetchState(function(data){
      if (data) {
        powerState = data.state == 'on'
        callback(powerState)
      }else{
        callback(null)
      }
    })
  },
  getBrightness: function(callback){
    this.log("fetching brightness for: " + this.name);
    that = this
    this._fetchState(function(data){
      if (data && data.attributes) {
        that.log('returned brightness: ' + data.attributes.brightness)
        brightness = ((data.attributes.brightness || 0) / 255)*100
        callback(brightness)
      }else{
        callback(null)
      }
    })
  },
  setPowerState: function(powerOn) {
    var that = this;
    var service_data = {}
    service_data.entity_id = this.entity_id

    if (powerOn) {
      this.log("Setting power state on the '"+this.name+"' to on");

      this._callService('turn_on', service_data, function(data){
        if (data) {
          that.log("Successfully set power state on the '"+that.name+"' to on");
        }
      })
    }else{
      this.log("Setting power state on the '"+this.name+"' to off");

      this._callService('turn_off', service_data, function(data){
        if (data) {
          that.log("Successfully set power state on the '"+that.name+"' to off");
        }
      })
    }
  },
  setBrightness: function(level) {
    var that = this;
    var service_data = {}
    service_data.entity_id = this.entity_id

    service_data.brightness = 255*(level/100.0)

    this.log("Setting brightness on the '"+this.name+"' to " + level);

    this._callService('turn_on', service_data, function(data){
      if (data) {
        that.log("Successfully set brightness on the '"+that.name+"' to " + level);
      }
    })
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
        initialValue: "HomeAssistant",
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
      sType: types.LIGHTBULB_STYPE,
      characteristics: [{
        cType: types.NAME_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: this.name,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Name of service",
        designedMaxLength: 255
      },{
        cType: types.POWER_STATE_CTYPE,
        onUpdate: function(value) {
          that.setPowerState(value);
        },
        onRead: function(callback) {
          that.getPowerState(function(powerState){
            callback(powerState);
          });
        },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: 0,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Change the power state of the Bulb",
        designedMaxLength: 1
      },{
        cType: types.BRIGHTNESS_CTYPE,
        onUpdate: function(value) {
          that.setBrightness(value);
        },
        onRead: function(callback) {
          that.getBrightness(function(level){
            callback(level);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  0,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust Brightness of Light",
        designedMinValue: 0,
        designedMaxValue: 255,
        designedMinStep: 1,
        unit: "%"
      }]
    }];
  }

}

module.exports.accessory = HomeAssistantAccessory;
module.exports.platform = HomeAssistantPlatform;
