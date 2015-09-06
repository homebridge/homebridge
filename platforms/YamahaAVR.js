var types = require("HAP-NodeJS/accessories/types.js");
var Yamaha = require('yamaha-nodejs');
var mdns = require('mdns');
//workaround for raspberry pi
var sequence = [
    mdns.rst.DNSServiceResolve(),
    'DNSServiceGetAddrInfo' in mdns.dns_sd ? mdns.rst.DNSServiceGetAddrInfo() : mdns.rst.getaddrinfo({families:[4]}),
    mdns.rst.makeAddressesUnique()
];

function YamahaAVRPlatform(log, config){
    this.log = log;
    this.config = config;
    this.playVolume = config["play_volume"];
    this.setMainInputTo = config["setMainInputTo"];
    this.browser = mdns.createBrowser(mdns.tcp('http'), {resolverSequence: sequence});
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
                var accessory = new YamahaAVRAccessory(that.log, that.config, service, yamaha, sysConfig);
                callback([accessory]);
            }, function(err){
                return;
            })
        });       
        browser.start();
    }
};

function YamahaAVRAccessory(log, config, mdnsService, yamaha, sysConfig) {
    this.log = log;
    this.config = config;
    this.mdnsService = mdnsService;
    this.yamaha = yamaha;
    this.sysConfig = sysConfig;
    
    this.name = mdnsService.name;
    this.serviceName = mdnsService.name + " Speakers";
    this.setMainInputTo = config["setMainInputTo"];
    this.playVolume = this.config["play_volume"];
}

YamahaAVRAccessory.prototype = {

    setPlaying: function(playing) {
        var that = this;
        var yamaha = this.yamaha;

        if (playing) {
            
            yamaha.powerOn().then(function(){
                if (that.playVolume) return yamaha.setVolumeTo(that.playVolume*10);
                else return { then: function(f, r){ f(); } }; 
            }).then(function(){
                if (that.setMainInputTo) return yamaha.setMainInputTo(that.setMainInputTo);
                else return { then: function(f, r){ f(); } }; 
            }).then(function(){
                if (that.setMainInputTo == "AirPlay") return yamaha.SendXMLToReceiver(
                    '<YAMAHA_AV cmd="PUT"><AirPlay><Play_Control><Playback>Play</Playback></Play_Control></AirPlay></YAMAHA_AV>'
                );
                else return { then: function(f, r){ f(); } }; 
                //else return Promise.fulfilled(undefined);
            });
        }
        else {
            yamaha.powerOff();
        }
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
                initialValue: this.sysConfig.YAMAHA_AV.System[0].Config[0].System_ID[0],
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
