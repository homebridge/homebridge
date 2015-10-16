var debug = require('debug')('ZWayServer');
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");
var tough = require('tough-cookie');
var Q = require("q");

function ZWayServerPlatform(log, config){
    this.log          = log;
    this.url          = config["url"];
    this.login        = config["login"];
    this.password     = config["password"];
    this.opt_in       = config["opt_in"];
    this.name_overrides = config["name_overrides"];
    this.batteryLow   = config["battery_low_level"] || 15;
    this.pollInterval = config["poll_interval"] || 2;
    this.splitServices= config["split_services"] || false;
    this.lastUpdate   = 0;
    this.cxVDevMap    = {};
    this.vDevStore    = {};
    this.sessionId = "";
    this.jar = request.jar(new tough.CookieJar());
}

ZWayServerPlatform.getVDevTypeKey = function(vdev){
    return vdev.deviceType + (vdev.metrics && vdev.metrics.probeTitle ? "." + vdev.metrics.probeTitle : "")
}

ZWayServerPlatform.prototype = {

    zwayRequest: function(opts){
        var that = this;
        var deferred = Q.defer();

        opts.jar = true;//this.jar;
        opts.json = true;
        opts.headers = {
            "Cookie": "ZWAYSession=" + this.sessionId
        };

        request(opts, function(error, response, body){
            if(response.statusCode == 401){
                debug("Authenticating...");
                request({
                    method: "POST",
                    url: that.url + 'ZAutomation/api/v1/login',
                    body: { //JSON.stringify({
                        "form": true,
                        "login": that.login,
                        "password": that.password,
                        "keepme": false,
                        "default_ui": 1
                    },
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    json: true,
                    jar: true//that.jar
                }, function(error, response, body){
                    if(response.statusCode == 200){
                        that.sessionId = body.data.sid;
                        opts.headers["Cookie"] = "ZWAYSession=" + that.sessionId;
                        debug("Authenticated. Resubmitting original request...");
                        request(opts, function(error, response, body){
                            if(response.statusCode == 200){
                                deferred.resolve(body);
                            } else {
                                deferred.reject(response);
                            }
                        });
                    } else {
                        deferred.reject(response);
                    }
                });
            } else if(response.statusCode == 200) {
                deferred.resolve(body);
            } else {
                deferred.reject(response);
            }
        });
        return deferred.promise;
    }
    ,
    getTagValue: function(vdev, tagStem){
        if(!(vdev.tags && vdev.tags.length > 0)) return false;
        var tagStem = "Homebridge." + tagStem;
        if(vdev.tags.indexOf(tagStem) >= 0) return true;
        var tags = vdev.tags, l = tags.length, tag;
        for(var i = 0; i < l; i++){
            tag = tags[i];
            if(tag.indexOf(tagStem + ":") === 0){
                return tag.substr(tagStem.length + 1);
            }
        }
        return false;
    }
    ,
    accessories: function(callback) {
        debug("Fetching Z-Way devices...");

        //TODO: Unify this with getVDevServices, so there's only one place with mapping between service and vDev type.
        //Note: Order matters!
        var primaryDeviceClasses = [
            "thermostat",
            "switchMultilevel",
            "switchBinary",
            "sensorBinary.Door/Window",
            "sensorMultilevel.Temperature"
        ];

        var that = this;
        var foundAccessories = [];

        this.zwayRequest({
            method: "GET",
            url: this.url + 'ZAutomation/api/v1/devices'
        }).then(function(result){
            this.lastUpdate = result.data.updateTime;
            
            var devices = result.data.devices;
            var groupedDevices = {};
            for(var i = 0; i < devices.length; i++){
                var vdev = devices[i];
                if(this.getTagValue("Skip")) { debug("Tag says skip!"); continue; }
                if(this.opt_in && !this.getTagValue(vdev, "Include")) continue;
                
                var gdid = this.getTagValue(vdev, "Accessory.Id");
                if(!gdid){
                    gdid = vdev.id.replace(/^(.*?)_zway_(\d+-\d+)-\d.*/, '$1_$2');
                }
                
                var gd = groupedDevices[gdid] || (groupedDevices[gdid] = { devices: [], types: {}, extras: {}, primary: undefined, cxmap: {} });
                
                gd.devices.push(vdev);
                var vdevIndex = gd.devices.length - 1;
                
                var tk = ZWayServerPlatform.getVDevTypeKey(vdev);
                
                // If this is explicitly set as primary, set it now...
                if(this.getTagValue(vdev, "IsPrimary")){
                    // everybody out of the way! Can't be in "extras" if you're the primary...
                    if(gd.types[tk] !== undefined){
                        gd.extras[tk] = gd.extras[tk] || [];
                        gd.extras[tk].push(gd.types[tk]);
                        delete gd.types[tk]; // clear the way for this one to be set here below...
                    }
                    gd.primary = vdevIndex;
                    //gd.types[tk] = gd.primary;
                }
                
                if(gd.types[tk] === undefined){
                    gd.types[tk] = vdevIndex;
                } else {
                    gd.extras[tk] = gd.extras[tk] || [];
                    gd.extras[tk].push(vdevIndex);
                }
                if(tk !== vdev.deviceType) gd.types[vdev.deviceType] = vdevIndex; // also include the deviceType only as a possibility
                
                // Create a map entry when Homebridge.Characteristic.Type is set...
                var ctype = this.getTagValue(vdev, "Characteristic.Type");
                if(ctype && Characteristic[ctype]){
                    var cx = new Characteristic[ctype]();
                    gd.cxmap[cx.UUID] = vdevIndex;
                }
            }
            
            for(var gdid in groupedDevices) {
                if(!groupedDevices.hasOwnProperty(gdid)) continue;
                
                // Debug/log...
                debug('Got grouped device ' + gdid + ' consiting of devices:');
                var gd = groupedDevices[gdid];
                for(var j = 0; j < gd.devices.length; j++){
                    debug(gd.devices[j].id + " - " + gd.devices[j].deviceType + (gd.devices[j].metrics && gd.devices[j].metrics.probeTitle ? "." + gd.devices[j].metrics.probeTitle : ""));
                }
                
                var accessory = null;
                if(gd.primary !== undefined){
                    var pd = gd.devices[gd.primary];
                    var name = pd.metrics && pd.metrics.title ? pd.metrics.title : pd.id;
                    accessory = new ZWayServerAccessory(name, gd, that);
                }
                else for(var ti = 0; ti < primaryDeviceClasses.length; ti++){
                    if(gd.types[primaryDeviceClasses[ti]] !== undefined){
                        gd.primary = gd.types[primaryDeviceClasses[ti]];
                        var pd = gd.devices[gd.primary];
                        var name = pd.metrics && pd.metrics.title ? pd.metrics.title : pd.id;
                        //debug("Using primary device with type " + primaryDeviceClasses[ti] + ", " + name + " (" + pd.id + ") as primary.");
                        accessory = new ZWayServerAccessory(name, gd, that);
                        break;
                    }
                }
                
                if(!accessory)
                    debug("WARN: Didn't find suitable device class!");
                else
                    foundAccessories.push(accessory);
                
            }
            callback(foundAccessories);
            
            // Start the polling process...
            this.pollingTimer = setTimeout(this.pollUpdate.bind(this), this.pollInterval*1000);
            
        }.bind(this));

    }
    ,
    
    pollUpdate: function(){
        //debug("Polling for updates since " + this.lastUpdate + "...");
        return this.zwayRequest({
            method: "GET",
            url: this.url + 'ZAutomation/api/v1/devices',
            qs: {since: this.lastUpdate}
        }).then(function(result){
            this.lastUpdate = result.data.updateTime;
            if(result.data && result.data.devices && result.data.devices.length){
                var updates = result.data.devices;
                debug("Got " + updates.length + " updates.");
                for(var i = 0; i < updates.length; i++){
                    var upd = updates[i];
                    if(this.cxVDevMap[upd.id]){
                        var vdev = this.vDevStore[upd.id];
                        vdev.metrics.level = upd.metrics.level;
                        if(upd.metrics.color){
                            vdev.metrics.r = upd.metrics.r;
                            vdev.metrics.g = upd.metrics.g;
                            vdev.metrics.b = upd.metrics.b;
                        }
                        vdev.updateTime = upd.updateTime;
                        var cxs = this.cxVDevMap[upd.id];
                        for(var j = 0; j < cxs.length; j++){
                            var cx = cxs[j];
                            if(typeof cx.zway_getValueFromVDev !== "function") continue;
                            var oldValue = cx.value;
                            var newValue = cx.zway_getValueFromVDev(vdev);
                            if(oldValue !== newValue){
                                cx.value = newValue;
                                cx.emit('change', { oldValue:oldValue, newValue:cx.value, context:null });
                                debug("Updated characteristic " + cx.displayName + " on " + vdev.metrics.title);
                            }
                        }
                    }
                }
            }
            
            // setup next poll...
            this.pollingTimer = setTimeout(this.pollUpdate.bind(this), this.pollInterval*1000);
        }.bind(this));
    }

}

function ZWayServerAccessory(name, devDesc, platform) {
  // device info
  this.name     = name;
  this.devDesc  = devDesc;
  this.platform = platform;
  this.log      = platform.log;
}


ZWayServerAccessory.prototype = {
    
    getVDev: function(vdev){
        return this.platform.zwayRequest({
            method: "GET",
            url: this.platform.url + 'ZAutomation/api/v1/devices/' + vdev.id
        })//.then(function());
    }
    ,
    command: function(vdev, command, value) {
        return this.platform.zwayRequest({
            method: "GET",
            url: this.platform.url + 'ZAutomation/api/v1/devices/' + vdev.id + '/command/' + command,
            qs: (value === undefined ? undefined : value)
        });
    },
    
    rgb2hsv: function(obj) {
        // RGB: 0-255; H: 0-360, S,V: 0-100
        var r = obj.r/255, g = obj.g/255, b = obj.b/255;
        var max, min, d, h, s, v;

        min = Math.min(r, Math.min(g, b));
        max = Math.max(r, Math.max(g, b));

        if (min === max) {
            // shade of gray
            return {h: 0, s: 0, v: r * 100};
        }

        var d = (r === min) ? g - b : ((b === min) ? r - g : b - r);
        h = (r === min) ? 3 : ((b === min) ? 1 : 5);
        h = 60 * (h - d/(max - min));
        s = (max - min) / max;
        v = max;
        return {"h": h, "s": s * 100, "v": v * 100};
    }
    ,
    hsv2rgb: function(obj) {
        // H: 0-360; S,V: 0-100; RGB: 0-255
        var r, g, b;
        var sfrac = obj.s / 100;
        var vfrac = obj.v / 100;
        
        if(sfrac === 0){
            var vbyte = Math.round(vfrac*255);
            return { r: vbyte, g: vbyte, b: vbyte };
        }
        
        var hdb60 = (obj.h % 360) / 60;
        var sector = Math.floor(hdb60);
        var fpart = hdb60 - sector;
        var c = vfrac * (1 - sfrac);
        var x1 = vfrac * (1 - sfrac * fpart);
        var x2 = vfrac * (1 - sfrac * (1 - fpart));
        switch(sector){
            case 0:
                r = vfrac; g = x2;    b = c;      break;
            case 1:
                r = x1;    g = vfrac; b = c;      break;
            case 2:
                r = c;     g = vfrac; b = x2;     break;
            case 3:
                r = c;     g = x1;    b = vfrac;  break;
            case 4:
                r = x2;    g = c;     b = vfrac;  break;
            case 5:
            default:
                r = vfrac; g = c;     b = x1;     break;
        }

        return { "r": Math.round(255 * r), "g": Math.round(255 * g), "b": Math.round(255 * b) };
    }
    ,
    getVDevServices: function(vdev){
        var typeKey = ZWayServerPlatform.getVDevTypeKey(vdev);
        var services = [], service;
        switch (typeKey) {
            case "thermostat":
                services.push(new Service.Thermostat(vdev.metrics.title, vdev.id));
                break;
            case "switchBinary":
                services.push(new Service.Switch(vdev.metrics.title, vdev.id));
                break;
            case "switchRGBW":
            case "switchMultilevel":
                if(this.platform.getTagValue(vdev, "Service.Type") === "Switch"){
                    services.push(new Service.Switch(vdev.metrics.title, vdev.id));
                } else {
                    services.push(new Service.Lightbulb(vdev.metrics.title, vdev.id));
                }
                break;
            case "sensorBinary.Door/Window":
                services.push(new Service.GarageDoorOpener(vdev.metrics.title, vdev.id));
                break;
            case "sensorMultilevel.Temperature":
                services.push(new Service.TemperatureSensor(vdev.metrics.title, vdev.id));
                break;
            case "battery.Battery":
                services.push(new Service.BatteryService(vdev.metrics.title, vdev.id));
                break;
            case "sensorMultilevel.Luminiscence":
                services.push(new Service.LightSensor(vdev.metrics.title, vdev.id));
                break;
            case "sensorBinary":
                var stype = this.platform.getTagValue(vdev, "Service.Type");
                if(stype === "MotionSensor"){
                    services.push(new Service.MotionSensor(vdev.metrics.title, vdev.id));
                }
        }
        
        var validServices =[];
        for(var i = 0; i < services.length; i++){
            if(this.configureService(services[i], vdev))
                validServices.push(services[i]);
        }
        
        return validServices;
    }
    ,
    uuidToTypeKeyMap: null
    ,
    extraCharacteristicsMap: {
        "battery.Battery": [Characteristic.BatteryLevel, Characteristic.StatusLowBattery],
        "sensorMultilevel.Temperature": [Characteristic.CurrentTemperature, Characteristic.TemperatureDisplayUnits],
        "sensorMultilevel.Luminiscence": [Characteristic.CurrentAmbientLightLevel]
    }
    ,
    getVDevForCharacteristic: function(cx, vdevPreferred){
        
        // If we know which vdev should be used for this Characteristic, we're done!
        if(this.devDesc.cxmap[cx.UUID] !== undefined){ 
           return this.devDesc.devices[this.devDesc.cxmap[cx.UUID]];
        }

        var map = this.uuidToTypeKeyMap;
        if(!map){
            this.uuidToTypeKeyMap = map = {};
            map[(new Characteristic.On).UUID] = ["switchBinary","switchMultilevel"];
            map[(new Characteristic.Brightness).UUID] = ["switchMultilevel"];
            map[(new Characteristic.Hue).UUID] = ["switchRGBW"];
            map[(new Characteristic.Saturation).UUID] = ["switchRGBW"];
            map[(new Characteristic.CurrentTemperature).UUID] = ["sensorMultilevel.Temperature","thermostat"];
            map[(new Characteristic.TargetTemperature).UUID] = ["thermostat"];
            map[(new Characteristic.TemperatureDisplayUnits).UUID] = ["sensorMultilevel.Temperature","thermostat"]; //TODO: Always a fixed result
            map[(new Characteristic.CurrentHeatingCoolingState).UUID] = ["thermostat"]; //TODO: Always a fixed result
            map[(new Characteristic.TargetHeatingCoolingState).UUID] = ["thermostat"]; //TODO: Always a fixed result
            map[(new Characteristic.CurrentDoorState).UUID] = ["sensorBinary.Door/Window","sensorBinary"];
            map[(new Characteristic.TargetDoorState).UUID] = ["sensorBinary.Door/Window","sensorBinary"]; //TODO: Always a fixed result
            map[(new Characteristic.ObstructionDetected).UUID] = ["sensorBinary.Door/Window","sensorBinary"]; //TODO: Always a fixed result
            map[(new Characteristic.BatteryLevel).UUID] = ["battery.Battery"];
            map[(new Characteristic.StatusLowBattery).UUID] = ["battery.Battery"];
            map[(new Characteristic.ChargingState).UUID] = ["battery.Battery"]; //TODO: Always a fixed result
            map[(new Characteristic.CurrentAmbientLightLevel).UUID] = ["sensorMultilevel.Luminiscence"];
        }
        
        if(cx instanceof Characteristic.Name) return vdevPreferred;
        
        // Special case!: If cx is a CurrentTemperature, ignore the preferred device...we want the sensor if available!
        if(cx instanceof Characteristic.CurrentTemperature) vdevPreferred = null;
        //
        
        var typekeys = map[cx.UUID];
        if(typekeys === undefined) return null;
        
        if(vdevPreferred && typekeys.indexOf(ZWayServerPlatform.getVDevTypeKey(vdevPreferred)) >= 0){
            return vdevPreferred;
        }
        
        var candidates = this.devDesc.devices;
        for(var i = 0; i < typekeys.length; i++){
            for(var j = 0; j < candidates.length; j++){
                if(ZWayServerPlatform.getVDevTypeKey(candidates[j]) === typekeys[i]) return candidates[j];
            }
        }
        
        return null;
    }
    ,
    configureCharacteristic: function(cx, vdev, service){
        var accessory = this;
        
        // Add this combination to the maps...
        if(!this.platform.cxVDevMap[vdev.id]) this.platform.cxVDevMap[vdev.id] = [];
        this.platform.cxVDevMap[vdev.id].push(cx);
        if(!this.platform.vDevStore[vdev.id]) this.platform.vDevStore[vdev.id] = vdev;
        
        if(cx instanceof Characteristic.Name){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.title;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, accessory.name);
            });
            return cx;
        }
        
        // We don't want to override "Name"'s name...so we just move this below that block.
        var descOverride = this.platform.getTagValue(vdev, "Characteristic.Description");
        if(descOverride){
            cx.displayName = descOverride;
        }
        
        if(cx instanceof Characteristic.On){
            cx.zway_getValueFromVDev = function(vdev){
                var val = false;
                if(vdev.metrics.level === "on"){
                    val = true;
                } else if(vdev.metrics.level <= 5) {
                    val = false;
                } else if (vdev.metrics.level > 5) {
                    val = true;
                }
                return val;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', function(powerOn, callback){
                this.command(vdev, powerOn ? "on" : "off").then(function(result){
                    callback();
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.Brightness){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', function(level, callback){
                this.command(vdev, "exact", {level: parseInt(level, 10)}).then(function(result){
                    callback();
                });
            }.bind(this));
            return cx;
        }

        if(cx instanceof Characteristic.Hue){
            cx.zway_getValueFromVDev = function(vdev){
                debug("Derived value " + accessory.rgb2hsv(vdev.metrics.color).h + " for hue.");
                return accessory.rgb2hsv(vdev.metrics.color).h;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', function(hue, callback){
                var scx = service.getCharacteristic(Characteristic.Saturation);
                var vcx = service.getCharacteristic(Characteristic.Brightness);
                if(!scx || !vcx){
                    debug("Hue without Saturation and Brightness is not supported! Cannot set value!")
                    callback(true, cx.value);
                }
                var rgb = this.hsv2rgb({ h: hue, s: scx.value, v: vcx.value });
                this.command(vdev, "exact", { red: rgb.r, green: rgb.g, blue: rgb.b }).then(function(result){
                    callback();
                });
            }.bind(this));
            
            return cx;
        }

        if(cx instanceof Characteristic.Saturation){
            cx.zway_getValueFromVDev = function(vdev){
                debug("Derived value " + accessory.rgb2hsv(vdev.metrics.color).s + " for saturation.");
                return accessory.rgb2hsv(vdev.metrics.color).s;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', function(saturation, callback){
                var hcx = service.getCharacteristic(Characteristic.Hue);
                var vcx = service.getCharacteristic(Characteristic.Brightness);
                if(!hcx || !vcx){
                    debug("Saturation without Hue and Brightness is not supported! Cannot set value!")
                    callback(true, cx.value);
                }
                var rgb = this.hsv2rgb({ h: hcx.value, s: saturation, v: vcx.value });
                this.command(vdev, "exact", { red: rgb.r, green: rgb.g, blue: rgb.b }).then(function(result){
                    callback();
                });
            }.bind(this));
            
            return cx;
        }

        if(cx instanceof Characteristic.CurrentTemperature){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.setProps({
                minValue: vdev.metrics && vdev.metrics.min !== undefined ? vdev.metrics.min : -40,
                maxValue: vdev.metrics && vdev.metrics.max !== undefined ? vdev.metrics.max : 999
            });
            return cx;
        }

        if(cx instanceof Characteristic.TargetTemperature){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', function(level, callback){
                this.command(vdev, "exact", {level: parseInt(level, 10)}).then(function(result){
                    //debug("Got value: " + result.data.metrics.level + ", for " + vdev.metrics.title + ".");
                    callback();
                });
            }.bind(this));
            cx.setProps({
                minValue: vdev.metrics && vdev.metrics.min !== undefined ? vdev.metrics.min : 5,
                maxValue: vdev.metrics && vdev.metrics.max !== undefined ? vdev.metrics.max : 40
            });
            return cx;
        }

        if(cx instanceof Characteristic.TemperatureDisplayUnits){
            //TODO: Always in °C for now.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.TemperatureDisplayUnits.CELSIUS;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.TemperatureDisplayUnits.CELSIUS);
            });
            cx.setProps({
                perms: [Characteristic.Perms.READ]
            });
            return cx;
        }
        
        if(cx instanceof Characteristic.CurrentHeatingCoolingState){
            //TODO: Always HEAT for now, we don't have an example to work with that supports another function.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.CurrentHeatingCoolingState.HEAT;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.CurrentHeatingCoolingState.HEAT);
            });
            return cx;
        }
        
        if(cx instanceof Characteristic.TargetHeatingCoolingState){
            //TODO: Always HEAT for now, we don't have an example to work with that supports another function.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.TargetHeatingCoolingState.HEAT;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.TargetHeatingCoolingState.HEAT);
            });
            // Hmm... apparently if this is not setable, we can't add a thermostat change to a scene. So, make it writable but a no-op.
            cx.on('set', function(newValue, callback){
                debug("WARN: Set of TargetHeatingCoolingState not yet implemented, resetting to HEAT!")
                callback(undefined, Characteristic.TargetHeatingCoolingState.HEAT);
            }.bind(this));
            return cx;
        }
        
        if(cx instanceof Characteristic.CurrentDoorState){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level === "off" ? Characteristic.CurrentDoorState.CLOSED : Characteristic.CurrentDoorState.OPEN;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
        }
        
        if(cx instanceof Characteristic.TargetDoorState){
            //TODO: We only support this for Door sensors now, so it's a fixed value.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.TargetDoorState.CLOSED;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.TargetDoorState.CLOSED);
            });
            cx.setProps({
                perms: [Characteristic.Perms.READ]
            });
        }
        
        if(cx instanceof Characteristic.ObstructionDetected){
            //TODO: We only support this for Door sensors now, so it's a fixed value.
            cx.zway_getValueFromVDev = function(vdev){
                return false;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, false);
            });
        }
        
        if(cx instanceof Characteristic.BatteryLevel){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
        }
        
        if(cx instanceof Characteristic.StatusLowBattery){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level <= accessory.platform.batteryLow ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
        }
        
        if(cx instanceof Characteristic.ChargingState){
            //TODO: No known chargeable devices(?), so always return false.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.ChargingState.NOT_CHARGING;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.ChargingState.NOT_CHARGING);
            });
        }
     
        if(cx instanceof Characteristic.CurrentAmbientLightLevel){
            cx.zway_getValueFromVDev = function(vdev){
                if(vdev.metrics.scaleTitle === "%"){
                    // Completely unscientific guess, based on test-fit data and Wikipedia real-world lux values.
                    // This will probably change!
                    var lux = 0.0005 * (vdev.metrics.level^3.6);
                    // Bounds checking now done upstream!
                    //if(lux < cx.minimumValue) return cx.minimumValue; if(lux > cx.maximumValue) return cx.maximumValue;
                    return lux;
                } else {
                    return vdev.metrics.level;
                }
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }
        
        if(cx instanceof Characteristic.MotionDetected){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level === "off" ? false : true;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.StatusTampered){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level === "off" ? Characteristic.StatusTampered.NOT_TAMPERED : Characteristic.StatusTampered.TAMPERED;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

    }
    ,
    configureService: function(service, vdev){
        var success = true;
        for(var i = 0; i < service.characteristics.length; i++){
            var cx = service.characteristics[i];
            var vdev = this.getVDevForCharacteristic(cx, vdev);
            if(!vdev){
                success = false;
                debug("ERROR! Failed to configure required characteristic \"" + service.characteristics[i].displayName + "\"!");
            }
            cx = this.configureCharacteristic(cx, vdev, service);
        }
        for(var i = 0; i < service.optionalCharacteristics.length; i++){
            var cx = service.optionalCharacteristics[i];
            var vdev = this.getVDevForCharacteristic(cx, vdev);
            if(!vdev) continue;

            //NOTE: Questionable logic, but if the vdev has already been used for the same 
            // characteristic type elsewhere, lets not duplicate it just for the sake of an 
            // optional characteristic. This eliminates the problem with RGB+W+W bulbs 
            // having the HSV controls shown again, but might have unintended consequences...
            var othercx, othercxs = this.platform.cxVDevMap[vdev.id];
            if(othercxs) for(var j = 0; j < othercxs.length; j++) if(othercxs[j].UUID === cx.UUID) othercx = othercxs[j];
            if(othercx)
                continue;

            cx = this.configureCharacteristic(cx, vdev, service);
            try {
                if(cx) service.addCharacteristic(cx);
            }
            catch (ex) {
                debug('Adding Characteristic "' + cx.displayName + '" failed with message "' + ex.message + '". This may be expected.');
            }
        }
        return success;
    }
    ,
    getServices: function() {
        var that = this;
        
        var vdevPrimary = this.devDesc.devices[this.devDesc.primary];
        var accId = this.platform.getTagValue(vdevPrimary, "Accessory.Id");
        if(!accId){
            accId = "VDev-" + vdevPrimary.h; //FIXME: Is this valid?
        }
        
        var informationService = new Service.AccessoryInformation();
    
        informationService
                .setCharacteristic(Characteristic.Name, this.name)
                .setCharacteristic(Characteristic.Manufacturer, "Z-Wave.me")
                .setCharacteristic(Characteristic.Model, "Virtual Device (VDev version 1)")
                .setCharacteristic(Characteristic.SerialNumber, accId);

        var services = [informationService];
    
        services = services.concat(this.getVDevServices(vdevPrimary));
        
        // Any extra switchMultilevels? Could be a RGBW+W bulb, add them as additional services...
        if(this.devDesc.extras["switchMultilevel"]) for(var i = 0; i < this.devDesc.extras["switchMultilevel"].length; i++){
            var xvdev = this.devDesc.devices[this.devDesc.extras["switchMultilevel"][i]];
            var xservice = this.getVDevServices(xvdev);
            services = services.concat(xservice);
        }

        if(this.platform.splitServices){
            if(this.devDesc.types["battery.Battery"]){
                services = services.concat(this.getVDevServices(this.devDesc.devices[this.devDesc.types["battery.Battery"]]));
            }

            // Odds and ends...if there are sensors that haven't been used, add services for them...

            var tempSensor = this.devDesc.types["sensorMultilevel.Temperature"] !== undefined ? this.devDesc.devices[this.devDesc.types["sensorMultilevel.Temperature"]] : false;
            if(tempSensor && !this.platform.cxVDevMap[tempSensor.id]){
                services = services.concat(this.getVDevServices(tempSensor));
            }

            var lightSensor = this.devDesc.types["sensorMultilevel.Luminiscence"] !== undefined ? this.devDesc.devices[this.devDesc.types["sensorMultilevel.Luminiscence"]] : false;
            if(lightSensor && !this.platform.cxVDevMap[lightSensor.id]){
                services = services.concat(this.getVDevServices(lightSensor));
            }
        } else {
            // Everything outside the primary service gets added as optional characteristics...
            var service = services[1];
            var existingCxUUIDs = {};
            for(var i = 0; i < service.characteristics.length; i++) existingCxUUIDs[service.characteristics[i].UUID] = true;
            
            for(var i = 0; i < this.devDesc.devices.length; i++){
                var vdev = this.devDesc.devices[i];
                if(this.platform.cxVDevMap[vdev.id]) continue; // Don't double-use anything
                var extraCxClasses = this.extraCharacteristicsMap[ZWayServerPlatform.getVDevTypeKey(vdev)];
                var extraCxs = [];
                if(!extraCxClasses || extraCxClasses.length === 0) continue;
                for(var j = 0; j < extraCxClasses.length; j++){
                    var cx = new extraCxClasses[j]();
                    if(existingCxUUIDs[cx.UUID]) continue; // Don't have two of the same Characteristic type in one service!
                    var vdev2 = this.getVDevForCharacteristic(cx, vdev); // Just in case...will probably return vdev.
                    if(!vdev2){
                        // Uh oh... one of the extraCxClasses can't be configured! Abort all extras for this vdev!
                        extraCxs = []; // to wipe out any already setup cxs.
                        break;
                    }
                    this.configureCharacteristic(cx, vdev2, service);
                    extraCxs.push(cx);
                }
                for(var j = 0; j < extraCxs.length; j++)
                    service.addCharacteristic(extraCxs[j]);
            }
        }
        
        debug("Loaded services for " + this.name);
        return services;
    }
};

module.exports.accessory = ZWayServerAccessory;
module.exports.platform = ZWayServerPlatform;
