var types = require("HAP-NodeJS/accessories/types.js");
var Yamaha = require('yamaha-nodejs');
var mdns = require('mdns');

function YamahaAVRPlatform(log, config){
    this.log = log;
    this.config = config;
    this.playVolume = config["play_volume"];
    this.browser = mdns.createBrowser(mdns.tcp('http'));
}

YamahaAVRPlatform.prototype = {
    accessories: function(callback) {
        this.log("Getting Yamaha AVR devices.");
        var that = this;

        var browser = this.browser;
        browser.stop();
        browser.removeAllListeners('serviceUp'); // cleanup listeners

        browser.on('serviceUp', function(service){
            var name = service.name;
            //console.log('Found HTTP service "' + name + '"');
            // We can't tell just from mdns if this is an AVR...
            if (service.port != 80) return; // yamaha-nodejs assumes this, so finding one on another port wouldn't do any good anyway.
            var yamaha = new Yamaha(service.host);
            yamaha.getSystemConfig().then(function(sysConfig){
                var sysModel = sysConfig.YAMAHA_AV.System[0].Config[0].Model_Name[0];
                var sysId = sysConfig.YAMAHA_AV.System[0].Config[0].System_ID[0];
                that.log("Found Yamaha " + sysModel + " - " + sysId + ", \"" + name + "\"");
                var accessory = new YamahaAVRAccessory(that.log, that.config, service, sysConfig);
                callback([accessory]);
            }, function(err){
                return;
            })
        });       
        browser.start();
    }
};

function YamahaAVRAccessory(log, config, mdnsService, sysConfig) {
    this.log = log;
    this.config = config;
    this.mdnsService = mdnsService;
    this.sysConfig = sysConfig;
    
    this.name = service.name;
    this.serviceName = service.name + " Speakers";
    this.playVolume = this.config["play_volume"];
}

YamahaAVRAccessory.prototype = {

    setPlaying: function(playing) {

        if (!this.device) {
            this.log("No device found (yet?)");
            return;
        }

        var that = this;

        if (playing) {
            /*
            this.device.play(function(err, success) {
                that.log("Playback attempt with success: " + success);
            });

            if (this.playVolume) {
                this.device.setVolume(this.playVolume, function(err, success) {
                    if (!err) {
                        that.log("Set volume to " + that.playVolume);
                    }
                    else {
                        that.log("Problem setting volume: " + err);
                    }
                });
            }
            */
        }
        else {
            /*
            this.device.stop(function(err, success) {
                that.log("Stop attempt with success: " + success);
            });
            */
        }
    },

    getServices: function() {
console.log('getServices called on "' + this.name + '"...');
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
                initialValue: "Yamaha",
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Manufacturer",
                designedMaxLength: 255
            },{
                cType: types.MODEL_CTYPE,
                onUpdate: null,
                perms: ["pr"],
                format: "string",
                initialValue: this.sysConfig.YAMAHA_AV.System[0].Config[0].Model_Name[0],
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Model",
                designedMaxLength: 255
            },{
                cType: types.SERIAL_NUMBER_CTYPE,
                onUpdate: null,
                perms: ["pr"],
                format: "string",
                initialValue: this.sysConfig.YAMAHA_AV.System[0].Config[0].System_Id[0],
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
                initialValue: this.serviceName,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Name of service",
                designedMaxLength: 255
            },{
                cType: types.POWER_STATE_CTYPE,
                onUpdate: function(value) { that.setPlaying(value); },
                perms: ["pw","pr","ev"],
                format: "bool",
                initialValue: false,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Change the playback state of the Yamaha AV Receiver",
                designedMaxLength: 1
            }]
        }];
    }
};

module.exports.accessory = YamahaAVRAccessory;
module.exports.platform = YamahaAVRPlatform;
