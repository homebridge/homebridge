var types = require("../lib/HAP-NodeJS/accessories/types.js")
var sync = require('http-sync')

function HelloHomeAccessory(log, config) {
  this.log = log

  // config
  this.appId       = config["appId"]
  this.accessToken = config["accessToken"]
  this.phrase      = config["phrase"]
  this.name        = config["name"]

  // load up devices
  var req = sync.request({
    method: 'GET',
    protocol: 'https',
    host: 'graph.api.smartthings.com',
    port: 443,
    path: "/api/smartapps/installations/"+this.appId+"/phrases?access_token="+this.accessToken
  })
  var res = req.end()
  this.phrases = JSON.parse(res.body.toString())

  if (this.phrase == undefined) {
    console.log(this.phrases)
  } else {
    this.phrasePath = this.phrases[this.phrase]
  }
}

HelloHomeAccessory.prototype = {
  execute: function() {
    var req = sync.request({
      method: 'GET',
      protocol: 'https',
      host: 'graph.api.smartthings.com',
      port: 443,
      path: this.phrasePath+"?access_token="+this.accessToken
    })
    var res = req.end()
    console.log("triggered "+this.phrase)
  },
  getServices: function() {
    if (this.phrase == undefined) {
      return []
    } else {
      var that = this
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
          initialValue: "SmartThings",
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
          initialValue: this.phrasePath,
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
          onUpdate: function(value) { that.execute() },
          perms: ["pw","pr","ev"],
          format: "bool",
          initialValue: 0,
          supportEvents: true,
          supportBonjour: false,
          manfDescription: "Change the power state of the Bulb",
          designedMaxLength: 1
        }]
      }]
    }
  }
}

module.exports.accessory = HelloHomeAccessory
