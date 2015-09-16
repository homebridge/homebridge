// Home Assistant
//
// Current Support: lights
//
// This is a shim to publish lights maintained by Home Assistant.
// Home Assistant is an open-source home automation platform.
// URL:     http://home-assistant.io
// GitHub:  https://github.com/balloob/home-assistant
//
// HA accessories supported: Lights, Switches, Media Players, Scenes.
//
// Optional Devices - Edit the supported_types key in the config to pick which
//                    of the 4 types you would like to expose to HomeKit from
//                    Home Assistant. light, switch, media_player, scene.
//
//
// Scene Support
//
// You can optionally import your Home Assistant scenes. These will appear to
// HomeKit as switches. You can simply say "turn on party time". In some cases
// scenes names are already rerved in HomeKit...like "Good Morning" and
// "Good Night". You will be able to just say "Good Morning" or "Good Night" to
// have these triggered.
//
// You might want to play with the wording to figure out what ends up working well
// for your scene names. It's also important to not populate any actual HomeKit
// scenes with the same names, as Siri will pick these instead of your Home
// Assistant scenes.
//
//
//
// Media Player Support
//
// Media players on your Home Assistant will be added to your HomeKit as a light.
// While this seems like a hack at first, it's actually quite useful. You can
// turn them on, off, and set their volume (as a function of brightness).
//
// There are some rules to know about how on/off treats your media player. If
// your media player supports play/pause, then turning them on and off via
// HomeKit will play and pause them. If they do not support play/pause but then
// support on/off they will be turned on and then off.
//
// HomeKit does not have a characteristic of Volume or a Speaker type. So we are
// using the light device type here. So to turn your speaker up and down, you
// will need to use the same language you use to set the brighness of a light.
// You can play around with language to see what fits best.
//
//
//
// Examples
//
// Dim the Kitchen Speaker to 40% - sets volume to 40%
// Dim the the Kitchen Speaker 10% - lowers the volume by 10%
// Set the brightness of the Kitchen Speaker to 40%
//
// Remember to add platform to config.json. Example:
// "platforms": [
//    {
//        "platform": "HomeAssistant",
//        "name": "HomeAssistant",
//        "host": "http://192.168.1.50:8123",
//        "password": "xxx",
//        "supported_types": ["light", "switch", "media_player", "scene"]
//    }
// ]
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var url = require('url')
var request = require("request");

var communicationError = new Error('Can not communicate with Home Assistant.')

function HomeAssistantPlatform(log, config){

  // auth info
  this.host = config["host"];
  this.password = config["password"];
  this.supportedTypes = config["supported_types"];

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

    this._request('GET', '/states', {}, function(error, response, data){

      for (var i = 0; i < data.length; i++) {
        entity = data[i]
        entity_type = entity.entity_id.split('.')[0]

        if (that.supportedTypes.indexOf(entity_type) == -1) {
          continue;
        }

        var accessory = null

        if (entity_type == 'light') {
          accessory = new HomeAssistantLight(that.log, entity, that)
        }else if (entity_type == 'switch'){
          accessory = new HomeAssistantSwitch(that.log, entity, that)
        }else if (entity_type == 'scene'){
          accessory = new HomeAssistantSwitch(that.log, entity, that, 'scene')
        }else if (entity_type == 'media_player' && entity.attributes && entity.attributes.supported_media_commands){
          accessory = new HomeAssistantMediaPlayer(that.log, entity, that)
        }

        if (accessory) {
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
        callback(null, powerState)
      }else{
        callback(communicationError)
      }
    }.bind(this))
  },
  getBrightness: function(callback){
    this.log("fetching brightness for: " + this.name);

    this.client.fetchState(this.entity_id, function(data){
      if (data && data.attributes) {
        brightness = ((data.attributes.brightness || 0) / 255)*100
        callback(null, brightness)
      }else{
        callback(communicationError)
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
          callback(communicationError)
        }
      }.bind(this))
    }else{
      this.log("Setting power state on the '"+this.name+"' to off");

      this.client.callService(this.domain, 'turn_off', service_data, function(data){
        if (data) {
          that.log("Successfully set power state on the '"+that.name+"' to off");
          callback()
        }else{
          callback(communicationError)
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
        callback(communicationError)
      }
    }.bind(this))
  },
  getServices: function() {
    var lightbulbService = new Service.Lightbulb();
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Home Assistant")
      .setCharacteristic(Characteristic.Model, "Light")
      .setCharacteristic(Characteristic.SerialNumber, "xxx");

    lightbulbService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));

    lightbulbService
      .addCharacteristic(Characteristic.Brightness)
      .on('get', this.getBrightness.bind(this))
      .on('set', this.setBrightness.bind(this));

    return [informationService, lightbulbService];
  }

}

function HomeAssistantMediaPlayer(log, data, client) {
  var SUPPORT_PAUSE = 1
  var SUPPORT_SEEK = 2
  var SUPPORT_VOLUME_SET = 4
  var SUPPORT_VOLUME_MUTE = 8
  var SUPPORT_PREVIOUS_TRACK = 16
  var SUPPORT_NEXT_TRACK = 32
  var SUPPORT_YOUTUBE = 64
  var SUPPORT_TURN_ON = 128
  var SUPPORT_TURN_OFF = 256

  // device info
  this.domain = "media_player"
  this.data = data
  this.entity_id = data.entity_id
  this.supportsVolume = false
  this.supportedMediaCommands = data.attributes.supported_media_commands

  if (data.attributes && data.attributes.friendly_name) {
    this.name = data.attributes.friendly_name
  }else{
    this.name = data.entity_id.split('.').pop().replace(/_/g, ' ')
  }

  if ((this.supportedMediaCommands | SUPPORT_PAUSE) == this.supportedMediaCommands) {
    this.onState = "playing"
    this.offState = "paused"
    this.onService = "media_play"
    this.offService = "media_pause"
  }else if ((this.supportedMediaCommands | SUPPORT_TURN_ON) == this.supportedMediaCommands && (this.supportedMediaCommands | SUPPORT_TURN_OFF) == this.supportedMediaCommands) {
    this.onState = "on"
    this.offState = "off"
    this.onService = "turn_on"
    this.offService = "turn_off"
  }

  if ((this.supportedMediaCommands | SUPPORT_VOLUME_SET) == this.supportedMediaCommands) {
    this.supportsVolume = true
  }

  this.client = client
  this.log = log;
}

HomeAssistantMediaPlayer.prototype = {
  getPowerState: function(callback){
    this.log("fetching power state for: " + this.name);

    this.client.fetchState(this.entity_id, function(data){
      if (data) {
        powerState = data.state == this.onState
        callback(null, powerState)
      }else{
        callback(communicationError)
      }
    }.bind(this))
  },
  getVolume: function(callback){
    this.log("fetching volume for: " + this.name);
    that = this
    this.client.fetchState(this.entity_id, function(data){
      if (data && data.attributes) {
        that.log(JSON.stringify(data.attributes))
        level = data.attributes.volume_level ? data.attributes.volume_level*100 : 0
        callback(null, level)
      }else{
        callback(communicationError)
      }
    }.bind(this))
  },
  setPowerState: function(powerOn, callback) {
    var that = this;
    var service_data = {}
    service_data.entity_id = this.entity_id

    if (powerOn) {
      this.log("Setting power state on the '"+this.name+"' to on");

      this.client.callService(this.domain, this.onService, service_data, function(data){
        if (data) {
          that.log("Successfully set power state on the '"+that.name+"' to on");
          callback()
        }else{
          callback(communicationError)
        }
      }.bind(this))
    }else{
      this.log("Setting power state on the '"+this.name+"' to off");

      this.client.callService(this.domain, this.offService, service_data, function(data){
        if (data) {
          that.log("Successfully set power state on the '"+that.name+"' to off");
          callback()
        }else{
          callback(communicationError)
        }
      }.bind(this))
    }
  },
  setVolume: function(level, callback) {
    var that = this;
    var service_data = {}
    service_data.entity_id = this.entity_id

    service_data.volume_level = level/100.0

    this.log("Setting volume on the '"+this.name+"' to " + level);

    this.client.callService(this.domain, 'volume_set', service_data, function(data){
      if (data) {
        that.log("Successfully set volume on the '"+that.name+"' to " + level);
        callback()
      }else{
        callback(communicationError)
      }
    }.bind(this))
  },
  getServices: function() {
    var lightbulbService = new Service.Lightbulb();
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Home Assistant")
      .setCharacteristic(Characteristic.Model, "Media Player")
      .setCharacteristic(Characteristic.SerialNumber, "xxx");

    lightbulbService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));


    if (this.supportsVolume) {
      lightbulbService
        .addCharacteristic(Characteristic.Brightness)
        .on('get', this.getVolume.bind(this))
        .on('set', this.setVolume.bind(this));
    }

    return [informationService, lightbulbService];
  }

}


function HomeAssistantSwitch(log, data, client, type) {
  // device info
  this.domain = type || "switch"
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

HomeAssistantSwitch.prototype = {
  getPowerState: function(callback){
    this.log("fetching power state for: " + this.name);

    this.client.fetchState(this.entity_id, function(data){
      if (data) {
        powerState = data.state == 'on'
        callback(null, powerState)
      }else{
        callback(communicationError)
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
          callback(communicationError)
        }
      }.bind(this))
    }else{
      this.log("Setting power state on the '"+this.name+"' to off");

      this.client.callService(this.domain, 'turn_off', service_data, function(data){
        if (data) {
          that.log("Successfully set power state on the '"+that.name+"' to off");
          callback()
        }else{
          callback(communicationError)
        }
      }.bind(this))
    }
  },
  getServices: function() {
    var switchService = new Service.Switch();
    var informationService = new Service.AccessoryInformation();
    var model;

    switch (this.domain) {
      case "scene":
        model = "Scene"
        break;
      default:
        model = "Switch"
    }

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Home Assistant")
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(Characteristic.SerialNumber, "xxx");

    if (this.domain == 'switch') {
      switchService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    }else{
      switchService
        .getCharacteristic(Characteristic.On)
        .on('set', this.setPowerState.bind(this));
    }

    return [informationService, switchService];
  }

}

module.exports.accessory = HomeAssistantLight;
module.exports.accessory = HomeAssistantMediaPlayer;
module.exports.accessory = HomeAssistantSwitch;
module.exports.platform = HomeAssistantPlatform;
