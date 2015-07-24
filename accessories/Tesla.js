var types = require("HAP-NodeJS/accessories/types.js");
var tesla = require("teslams");

function TeslaAccessory(log, config) {
    this.log = log;
    this.name = config["name"];
    this.username = config["username"];
    this.password = config["password"];
}

TeslaAccessory.prototype = {

    setPowerState: function(powerOn) {
        var that = this;

        tesla.get_vid({email: this.username, password: this.password}, function(vehicle) {

            if (powerOn) {
                tesla.auto_conditioning({id:vehicle, climate: 'start'}, function(response) {
                    if (response.result)
                        that.log("Started climate control.");
                    else
                        that.log("Error starting climate control: " + response.reason);
                });
            }
            else {
                tesla.auto_conditioning({id:vehicle, climate: 'stop'}, function(response) {
                    if (response.result)
                        that.log("Stopped climate control.");
                    else
                        that.log("Error stopping climate control: " + response.reason);
                });
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
                initialValue: "Tesla",
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
                initialValue: this.name,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Name of service",
                designedMaxLength: 255
            },{
                cType: types.POWER_STATE_CTYPE,
                onUpdate: function(value) { that.setPowerState(value); },
                perms: ["pw","pr","ev"],
                format: "bool",
                initialValue: false,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Change the power state of the car",
                designedMaxLength: 1
            }]
        }];
    }
};

module.exports.accessory = TeslaAccessory;
