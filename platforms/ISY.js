var types = require("HAP-NodeJS/accessories/types.js");
var xml2js = require('xml2js');
var request = require('request');
var util = require('util');

var parser = new xml2js.Parser();


var power_state_ctype = {
    cType: types.POWER_STATE_CTYPE,
    onUpdate: function(value) { return; },
    perms: ["pw","pr","ev"],
    format: "bool",
    initialValue: 0,
    supportEvents: true,
    supportBonjour: false,
    manfDescription: "Change the power state",
    designedMaxLength: 1
};

function ISYURL(user, pass, host, port, path) {
    return util.format("http://%s:%s@%s:%d%s", user, pass, host, port, encodeURI(path));
}

function ISYPlatform(log, config) {
    this.host = config["host"];
    this.port = config["port"];
    this.user = config["username"];
    this.pass = config["password"];

    this.log = log;
}

ISYPlatform.prototype = {
    accessories: function(callback) {
        this.log("Fetching ISY Devices.");

        var that = this;
        var url = ISYURL(this.user, this.pass, this.host, this.port, "/rest/nodes");

        var options = {
            url: url,
            method: 'GET'
        };

        var foundAccessories = [];

        request(options, function(error, response, body) {
            if (error)
            {
                console.trace("Requesting ISY devices.");
                that.log(error);
                return error;
            }

            parser.parseString(body, function(err, result) {
                result.nodes.node.forEach(function(obj) {
                    var enabled = obj.enabled[0] == 'true';

                    if (enabled)
                    {
                        var device = new ISYAccessory(
                                that.log,
                                that.host,
                                that.port,
                                that.user,
                                that.pass,
                                obj.name[0],
                                obj.address[0],
                                obj.property[0].$.uom
                                );

                        foundAccessories.push(device);
                    }
                });
            });

            callback(foundAccessories.sort(function (a,b) {
                return (a.name > b.name) - (a.name < b.name);
            }));
        });
    }
}

function ISYAccessory(log, host, port, user, pass, name, address, uom) {
    this.log = log;
    this.host = host;
    this.port = port;
    this.user = user;
    this.pass = pass;
    this.name = name;
    this.address = address;
    this.uom = uom;
}

ISYAccessory.prototype = {
    query: function() {
        var path = util.format("/rest/status/%s", encodeURI(this.address));
        var url = ISYURL(this.user, this.pass, this.host, this.port, path);

        var options = { url: url, method: 'GET' };
        request(options, function(error, response, body) {
            if (error)
            {
                console.trace("Requesting Device Status.");
                that.log(error);
                return error;
            }

            parser.parseString(body, function(err, result) {
                var value = result.properties.property[0].$.value;
                return value;
            });

        });
    },

    command: function(c, value) {
        this.log(this.name + " sending command " + c + " with value " + value);

        switch (c)
        {
            case 'On':
                path = "/rest/nodes/" + this.address + "/cmd/DFON";
                break;
            case 'Off':
                path = "/rest/nodes/" + this.address + "/cmd/DFOF";
                break;
            case 'Low':
                path = "/rest/nodes/" + this.address + "/cmd/DON/85";
                break;
            case 'Medium':
                path = "/rest/nodes/" + this.address + "/cmd/DON/128";
                break;
            case 'High':
                path = "/rest/nodes/" + this.address + "/cmd/DON/255";
                break;
            case 'setLevel':
                if (value > 0)
                {
                    path = "/rest/nodes/" + this.address + "/cmd/DON/" + Math.floor(255 * (value / 100));
                }
                break;
            default:
                this.log("Unimplemented command sent to " + this.name + " Command " + c);
                break;
        }

        if (path)
        {
            var url = ISYURL(this.user, this.pass, this.host, this.port, path);
            var options = {
                url: url,
                method: 'GET'
            };

            var that = this;
            request(options, function(error, response, body) {
                if (error)
                {
                    console.trace("Sending Command.");
                    that.log(error);
                    return error;
                }
                that.log("Sent command " + path + " to " + that.name);
            });
        }
    },

    informationCharacteristics: function() {
    return [
      {
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
        initialValue: "SmartHome",
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
        initialValue: this.address,
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
      }
    ]
  },

  controlCharacteristics: function(that) {
    cTypes = [{
      cType: types.NAME_CTYPE,
      onUpdate: null,
      perms: ["pr"],
      format: "string",
      initialValue: this.name,
      supportEvents: true,
      supportBonjour: false,
      manfDescription: "Name of service",
      designedMaxLength: 255
    }]

    if (this.uom == "%/on/off") {
        cTypes.push({
            cType: types.POWER_STATE_CTYPE,
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: 0,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Change the power state",
            designedMaxLength: 1,
            onUpdate: function(value) {
                if (value == 0) {
                    that.command("Off")
                } else {
                    that.command("On")
                }
            },
            onRead: function() {
                return this.query();
            }
        });
        cTypes.push({
            cType: types.BRIGHTNESS_CTYPE,
            perms: ["pw","pr","ev"],
            format: "int",
            initialValue:  0,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Adjust Brightness of Light",
            designedMinValue: 0,
            designedMaxValue: 100,
            designedMinStep: 1,
            unit: "%",
            onUpdate: function(value) {
                that.command("setLevel", value);
            },
            onRead: function() {
                var val = this.query();
                that.log("Query: " + val);
                return val;
            }
        });
    }
    else if (this.uom == "off/low/med/high")
    {
        cTypes.push({
            cType: types.POWER_STATE_CTYPE,
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: 0,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Change the power state",
            designedMaxLength: 1,
            onUpdate: function(value) {
                if (value == 0) {
                    that.command("Off")
                } else {
                    that.command("On")
                }
            },
            onRead: function() {
                return this.query();
            }
        });
        cTypes.push({
            cType: types.ROTATION_SPEED_CTYPE,
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: 0,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Change the speed of the fan",
            designedMaxLength: 1,
            onUpdate: function(value) {
                if (value == 0) {
                    that.command("Off");
                } else if (value > 0 && value < 40) {
                    that.command("Low");
                } else if (value > 40 && value < 75) {
                    that.command("Medium");
                } else {
                    that.command("High");
                }
            },
            onRead: function() {
                return this.query();
            }
        });
    }
    else if (this.uom == "on/off")
    {
        cTypes.push({
            cType: types.POWER_STATE_CTYPE,
            perms: ["pw","pr","ev"],
            format: "bool",
            initialValue: 0,
            supportEvents: true,
            supportBonjour: false,
            manfDescription: "Change the power state",
            designedMaxLength: 1,
            onUpdate: function(value) {
                if (value == 0) {
                    that.command("Off")
                } else {
                    that.command("On")
                }
            },
            onRead: function() {
                return this.query();
            }
        });
    }

    return cTypes;
  },

  sType: function() {
    if (this.uom == "%/on/off") {
        return types.LIGHTBULB_STYPE;
    } else if (this.uom == "on/off") {
        return types.SWITCH_STYPE;
    } else if (this.uom == "off/low/med/high") {
        return types.FAN_STYPE;
    }

    return types.SWITCH_STYPE;
  },

  getServices: function() {
    var that = this;
    var services = [{
      sType: types.ACCESSORY_INFORMATION_STYPE,
      characteristics: this.informationCharacteristics(),
    },
    {
      sType: this.sType(),
      characteristics: this.controlCharacteristics(that)
    }];

    //that.log("Loaded services for " + that.name);
    return services;
  }
};

module.exports.accessory = ISYAccessory;
module.exports.platform = ISYPlatform;
