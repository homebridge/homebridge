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

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
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
  fetchState: function(entity_id, callback){
    this._request('GET', '/states/' + entity_id, {}, function(error, response, data){
      if (error) {
        callback(null)
      }else{
        callback(data)
      }
    })
  },
  callService: function(domain, service, service_data, callback){
    var options = {}
    options.body = service_data

    this._request('POST', '/services/' + domain + '/' + service, options, function(error, response, data){
      if (error) {
        callback(null)
      }else{
        callback(data)
      }
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
          accessory = new HomeAssistantLight(that.log, entity, that)
          foundAccessories.push(accessory)
        }
      }

      callback(foundAccessories)
    })

  }
}

function HomeAssistantLight(log, data, client) {
  // device info
  this.domain = "light"
  this.data = data
  this.entity_id = data.entity_id
  if (data.attributes && data.attributes.friendly_name) {
    this.name = data.attributes.friendly_name
  }else{
    this.name = data.entity_id.split('.').pop().replace(/_/g, ' ')
  }

  this.client = client
  this.log = log;
}

HomeAssistantLight.prototype = {
  getPowerState: function(callback){
    this.log("fetching power state for: " + this.name);
    this.client.fetchState(this.entity_id, function(data){
      if (data) {
        powerState = data.state == 'on'
        callback(powerState)
      }else{
        callback(null)
      }
    }.bind(this))
  },
  getBrightness: function(callback){
    this.log("fetching brightness for: " + this.name);
    that = this
    this.client.fetchState(this.entity_id, function(data){
      if (data && data.attributes) {
        that.log('returned brightness: ' + data.attributes.brightness)
        brightness = ((data.attributes.brightness || 0) / 255)*100
        callback(brightness)
      }else{
        callback(null)
      }
    }.bind(this))
  },
  setPowerState: function(powerOn, callback) {
    var that = this;
    var service_data = {}
    service_data.entity_id = this.entity_id

    if (powerOn) {
      this.log("Setting power state on the '"+this.name+"' to on");

      this.client.callService(this.domain, 'turn_on', service_data, function(data){
        if (data) {
          that.log("Successfully set power state on the '"+that.name+"' to on");
          callback()
        }else{
          callback(new Error('Can not communicate with Home Assistant.'))
        }
      }.bind(this))
    }else{
      this.log("Setting power state on the '"+this.name+"' to off");

      this.client.callService(this.domain, 'turn_off', service_data, function(data){
        if (data) {
          that.log("Successfully set power state on the '"+that.name+"' to off");
          callback()
        }else{
          callback(new Error('Can not communicate with Home Assistant.'))
        }
      }.bind(this))
    }
  },
  setBrightness: function(level, callback) {
    var that = this;
    var service_data = {}
    service_data.entity_id = this.entity_id

    service_data.brightness = 255*(level/100.0)

    this.log("Setting brightness on the '"+this.name+"' to " + level);

    this.client.callService(this.domain, 'turn_on', service_data, function(data){
      if (data) {
        that.log("Successfully set brightness on the '"+that.name+"' to " + level);
        callback()
      }else{
        callback(new Error('Can not communicate with Home Assistant.'))
      }
    }.bind(this))
  },
  getServices: function() {
    var lightbulbService = new Service.Lightbulb();

    lightbulbService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));

    lightbulbService
      .addCharacteristic(Characteristic.Brightness)
      .on('get', this.getBrightness.bind(this))
      .on('set', this.setBrightness.bind(this));

    return [lightbulbService];
  }

}

module.exports.accessory = HomeAssistantLight;
module.exports.platform = HomeAssistantPlatform;
