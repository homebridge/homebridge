var types  = require("../lib/HAP-NodeJS/accessories/types.js")
var request = require("request")

function SmartThingsHelloHomeAccessory(log, config) {
  this.log          = log
  this.appId        = config["appId"]
  this.accessToken  = config["accessToken"]
  this.name         = config["name"]
}

SmartThingsHelloHomeAccessory.prototype = {
  execute: function() {
    url = "https://graph.api.smartthings.com/"+this.appId+"?access_token="+this.accessToken
    console.log(url)
    request.get({
      url: url,
    }, function(err, response) {
      console.log("triggered "+this.name)
      console.log(response.body)
    })
  },
  getServices: function() {
    if (this.name == undefined) {
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
          initialValue: this.appId+"-"+this.name,
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

module.exports.accessory = SmartThingsHelloHomeAccessory
