// FHEM Platform Shim for HomeBridge
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         "platform": "FHEM",
//         "name": "FHEM",
//         "server": "127.0.0.1",
//         "port": "8083",
//         "filter": "room=xyz"
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.
//
var types = require("HAP-NodeJS/accessories/types.js");
var request = require("request");
var util = require('util');

function FHEMPlatform(log, config) {
  this.log     = log;
  this.server  = config["server"];
  this.port    = config["port"];
  this.filter  = config["filter"];
}

function
FHEM_sortByKey(array, key) {
  return array.sort( function(a, b) {
    var x = a[key]; var y = b[key];
    return ((x < y) ? -1 : ((x > y) ? 1 : 0));
    });
}

function
FHEM_rgb2hex(r,g,b) {
  if( g == undefined )
    return Number(0x1000000 + r[0]*0x10000 + r[1]*0x100 + r[2]).toString(16).substring(1);

  return Number(0x1000000 + r*0x10000 + g*0x100 + b).toString(16).substring(1);
}

function
FHEM_hsv2rgb(h,s,v) {
  var r = 0.0;
  var g = 0.0;
  var b = 0.0;

  if( s == 0 ) {
    r = v;
    g = v;
    b = v;

  } else {
    var i = Math.floor( h * 6.0 );
    var f = ( h * 6.0 ) - i;
    var p = v * ( 1.0 - s );
    var q = v * ( 1.0 - s * f );
    var t = v * ( 1.0 - s * ( 1.0 - f ) );
    i = i % 6;

    if( i == 0 ) {
      r = v;
      g = t;
      b = p;
    } else if( i == 1 ) {
      r = q;
      g = v;
      b = p;
    } else if( i == 2 ) {
      r = p;
      g = v;
      b = t;
    } else if( i == 3 ) {
      r = p;
      g = q;
      b = v;
    } else if( i == 4 ) {
      r = t;
      g = p;
      b = v;
    } else if( i == 5 ) {
      r = v;
      g = p;
      b = q;
    }
  }

  return FHEM_rgb2hex( Math.round(r*255),Math.round(g*255),Math.round(b*255) );
}

function
FHEM_rgb2h(r,g,b){
  if( r == undefined )
    return;

  if( g == undefined ) {
    var str = r;
    r = parseInt( str.substr(0,2), 16 );
    g = parseInt( str.substr(2,2), 16 );
    b = parseInt( str.substr(4,2), 16 );
  }

  var M = Math.max( r, g, b );
  var m = Math.min( r, g, b );
  var c = M - m;

  var h, s, v;
  if( c == 0 ) {
    h = 0;
  } else if( M == r ) {
    h = ( 60 * ( ( g - b ) / c ) % 360 ) / 360;
  } else if( M == g ) {
    h = ( 60 * ( ( b - r ) / c ) + 120 ) / 360;
  } else if( M == b ) {
    h = ( 60 * ( ( r - g ) / c ) + 240 ) / 360;
  }

  return  h;

  if( M == 0 ) {
    s = 0;
  } else {
    s = c / M;
  }

  v = M;

  return  h;
}


FHEMPlatform.prototype = {
  accessories: function(callback) {
    this.log("Fetching FHEM switchable devices...");

    var that = this;
    var foundAccessories = [];

    var cmd = 'jsonlist';
    if( this.filter )
      cmd += " " + this.filter;
    var url = encodeURI("http://" + this.server + ":" + this.port + "/fhem?cmd=" + cmd + "&XHR=1");
    this.log( 'fetching: ' + url );

    request.get( { url: url, json: true },
                 function(err, response, json) {
                   if( !err && response.statusCode == 200 ) {
                     that.log( 'got: ' + json['totalResultsReturned'] + ' results' );
//that.log("got json: " + util.inspect(json) );
                     if( json['totalResultsReturned'] ) {
                       var sArray=FHEM_sortByKey(json['Results'],"Name");
                       sArray.map(function(s) {
                         if( s.Attributes.disable == 1 ) {
                           that.log( s.Internals.NAME + ' is disabled');

                         } else if( s.PossibleSets.match(/\bon\b/)
                             && s.PossibleSets.match(/\boff\b/) ) {
                           accessory = new FHEMAccessory(that.log, that.server, that.port, s);
                           foundAccessories.push(accessory);

                         } else if( s.PossibleSets.match(/\bvolume\b/) ) {
                           that.log( s.Internals.NAME + ' has volume');
                           accessory = new FHEMAccessory(that.log, that.server, that.port, s);
                           foundAccessories.push(accessory);

                         } else if( s.Readings.temperature ) {
                           accessory = new FHEMAccessory(that.log, that.server, that.port, s);
                           foundAccessories.push(accessory);

                         } else if( s.Readings.humidity ) {
                           accessory = new FHEMAccessory(that.log, that.server, that.port, s);
                           foundAccessories.push(accessory);

                         } else {
                           that.log( s.Internals.NAME + ' is not switchable');

                         }
                       });
                     }
                     callback(foundAccessories);

                   } else {
                     that.log("There was a problem connecting to FHEM.");

                   }

                 });
  }
}

function
FHEMAccessory(log, server, port, s) {
//log( 'sets: ' + s.PossibleSets );
//log("got json: " + util.inspect(s) );
//log("got json: " + util.inspect(s.Internals) );

  var match;
  if( match = s.PossibleSets.match(/\bpct\b/) ) {
    s.hasPct = true;
    s.pctMax = 100;
  }
  if( match = s.PossibleSets.match(/\bhue[^\b\s]*(,(\d*)?)+\b/) ) {
    s.hasHue = true;
    s.hueMax = 360;
    if( match[2] != undefined )
      s.hueMax = match[2];
  }
  if( match = s.PossibleSets.match(/\bsat[^\b\s]*(,(\d*)?)+\b/) ) {
    s.hasSat = true;
    s.satMax = 100;
    if( match[2] != undefined )
      s.satMax = match[2];
  }
  if( s.PossibleSets.match(/\brgb\b/) ) {
    s.hasRGB = true;
  } 

  if( s.Readings.temperature )
    s.hasTemperature = true;
  if( s.Readings.humidity )
    s.hasHumidity = true;

  if( s.hasHue )
    log( s.Internals.NAME + ' has hue [0-' + s.hueMax +']');
  else if( s.hasRGB )
    log( s.Internals.NAME + ' has RGB');
  else if( s.hasPct )
    log( s.Internals.NAME + ' is dimable [' + s.pctMax +']');
  else if( s.hasTemperature )
    log( s.Internals.NAME + ' has temperature' );
  else
    log( s.Internals.NAME + ' is switchable');

  if( s.hasHumidity )
    log( s.Internals.NAME + ' has humidity' );

  // device info
  this.name		= s.Attributes.alias ? s.Attributes.alias : s.Internals.NAME;
  this.name		= s.Internals.NAME;
  this.device		= s.Internals.NAME;
  this.type             = s.Internals.TYPE;
  this.model            = s.Attributes.model ? s.Attributes.model : s.Internals.model;
  this.PossibleSets     = s.PossibleSets;

  if( this.type == 'CUL_HM' )
    this.serial = s.Internals.DEF;
  else if( this.type == 'HUEDevice' )
    this.serial = s.Internals.uniqueid;
  else if( this.type == 'SONOSPLAYER' )
    this.serial = s.Internals.UDN;

  this.hasPct   = s.hasPct;
  this.pctMax   = s.pctMax;
  this.hasHue   = s.hasHue;
  this.hueMax   = s.hueMax;
  this.hasSat   = s.hasSat;
  this.satMax   = s.satMax;
  this.hasRGB   = s.hasRGB;

  this.hasTemperature   = s.hasTemperature;
  this.hasHumidity      = s.hasHumidity;

log( util.inspect(s.Readings) );

  this.log 		= log;
  this.server		= server;
  this.port		= port;
}

FHEMAccessory.prototype = {
  command: function(c,value) {
    this.log(this.name + " sending command " + c + " with value " + value);
    if( c == 'on' ) {
      if( this.PossibleSets.match(/\bplay\b/i) )
        url = "http://" + this.server + ":" + this.port + "/fhem?cmd=set " + this.device + " play&XHR=1";
      else if( this.PossibleSets.match(/\bon\b/) )
        url = "http://" + this.server + ":" + this.port + "/fhem?cmd=set " + this.device + " on&XHR=1";
      else
        this.log(this.name + " Unhandled command! cmd=" + c + ", value=" + value);

    } else if( c == 'off' ) {
      if( this.PossibleSets.match(/\bpause\b/i) )
        url = "http://" + this.server + ":" + this.port + "/fhem?cmd=set " + this.device + " pause&XHR=1";
      else if( this.PossibleSets.match(/\boff\b/) )
        url = "http://" + this.server + ":" + this.port + "/fhem?cmd=set " + this.device + " off&XHR=1";
      else
        this.log(this.device + " Unhandled command! cmd=" + c + ", value=" + value);

    } else if( c == 'pct' ) {
      url = "http://" + this.server + ":" + this.port + "/fhem?cmd=set " + this.device + " pct " + value + "&XHR=1";

    } else if( c == 'hue' ) {
      if( !this.hasHue ) {
        value = FHEM_hsv2rgb( value/360.0, this.sat?this.sat/100.0:1.0, this.pct?this.pct/100.0:1.0 );
        url = "http://" + this.server + ":" + this.port + "/fhem?cmd=set " + this.device + " rgb " + value + "&XHR=1";

      } else {
        value = Math.round(value * this.hueMax / 360);
        url = "http://" + this.server + ":" + this.port + "/fhem?cmd=set " + this.device + " hue " + value + "&XHR=1";
      }

    } else if( c == 'sat' ) {
      value = value / 100 * this.satMax;
      url = "http://" + this.server + ":" + this.port + "/fhem?cmd=set " + this.device + " sat " + value + "&XHR=1";

    } else if( value != undefined ) {
      this.log(this.name + " Unhandled command! cmd=" + c + ", value=" + value);

    }

    var that = this;
    request.put(  { url: encodeURI(url) },
                  function(err, response) {
                    if( err ) {
                      that.log("There was a problem sending command " + c + " to" + that.name);
                      that.log(url);
                    } else {
                      that.log(that.name + " sent command " + c);
                      that.log(url);
                    }
                  } );
  },

  query: function(reading, callback) {
    this.log("query: " + reading);

    var rgb_to_hue = false;
    if( reading == 'hue' && !this.hasHue && this.hasRGB ) {
      reading = 'rgb';
      rgb_to_hue = true;

    } else if( reading == 'state'
               && this.type == 'SONOSPLAYER' ) {
        reading = 'transportState';
    
    }

    if( reading == 'rgb'
               && this.type == 'SWAP_0000002200000003' ) {
        reading = '0B-RGBlevel';
    
    }

    var cmd = '{ReadingsVal("'+this.device+'","'+reading+'","")}';
    var url = encodeURI("http://" + this.server + ":" + this.port + "/fhem?cmd=" + cmd + "&XHR=1");
    this.log( '  querying: ' + url );

    var that = this;
    request.get( { url: url },
                 function(err, response, result) {
                   if( !err && response.statusCode == 200 ) {
                     result = result.replace(/[\r\n]/g, "");
                     that.log("  result: " + result);

                     if( rgb_to_hue ) {
                       result = FHEM_rgb2h(result) * 360;
                       that.hue = result;
                     } else if( reading == 'hue' ) {
                       result = Math.round(result * 360 / that.hueMax);
                       that.hue = result;
                     } else if( reading == 'sat' ) {
                       result = Math.round(result * 100 / that.satMax);
                       that.sat = result;
                     } else if( reading == 'pct' ) {
                       that.pct = result;
                     } else if( reading == 'transportState' ) {
                       if( result == 'PLAYING' )
                         result = 1;
                       else
                         result = 0;
                       that.state = result;
                     } else if( reading == 'state' ) {
                       if( result == 'off' )
                         result = 0;
                       else if( result == 'on' )
                         result = 1;
                       else if( result == '000000' )
                         result = 0;
                       else
                         result = 1;

                       that.state = result;
                     }
                     that.log("  mapped: " + result);

                     callback(result);

                   } else {
                     that.log("There was a problem connecting to FHEM.");

                   }
                 } );
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
        initialValue: "FHEM:"+this.type,
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Manufacturer",
        designedMaxLength: 255
      },{
        cType: types.MODEL_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: this.model ? this.model : '<unknown>',
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Model",
        designedMaxLength: 255
      },{
        cType: types.SERIAL_NUMBER_CTYPE,
        onUpdate: null,
        perms: ["pr"],
        format: "string",
        initialValue: this.serial ? this.serial : "A1S2NASF88EW",
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

    if( this.name != undefined
        && !this.hasTemperature ) {
      cTypes.push({
        cType: types.POWER_STATE_CTYPE,
        onRegister: function(assignedCharacteristic) {
//that.log("onRegister: " + util.inspect(assignedCharacteristic) );
        },
        onUpdate: function(value) {
          if( value == 0 ) {
            that.command("off")
          } else {
            that.command("on")
          }
        },
        onRead: function(callback) {
          that.query('state', function(powerState){
            callback(powerState);
          });
        },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: 0,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Change the power state",
        designedMaxLength: 1
      })
    }

    if( this.hasPct == true ) {
      cTypes.push({
        cType: types.BRIGHTNESS_CTYPE,
        onUpdate: function(value) { that.command('pct', value); },
        onRead: function(callback) {
          that.query('pct', function(pct){
            callback(pct);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  0,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust Brightness of the Light",
        designedMinValue: 0,
        designedMaxValue: this.pctMax,
        designedMinStep: 1,
        unit: "%"
      })
    }

    if( this.hasHue == true || this.hasRGB == true ) {
      cTypes.push({
        cType: types.HUE_CTYPE,
        onUpdate: function(value) { that.command('hue', value); },
        onRead: function(callback) {
          that.query('hue', function(hue){
            callback(hue);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  0,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust the Hue of the Light",
        designedMinValue: 0,
        designedMaxValue: 360,
        designedMinStep: 1,
        unit: "arcdegrees"
      })
    }

    if( this.hasSat == true ) {
      cTypes.push({
        cType: types.SATURATION_CTYPE,
        onUpdate: function(value) { that.command('sat', value); },
        onRead: function(callback) {
          that.query('sat', function(sat){
            callback(sat);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  100,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust the Saturation of the Light",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      })
    }

    if( match = this.PossibleSets.match(/\bvolume\b/) ) {
      cTypes.push({
        cType: types.OUTPIUTVOLUME_CTYPE,
        onUpdate: function(value) { that.command('volume', value); },
        onRead: function(callback) {
          that.query('volume', function(vol){
            callback(vol);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  10,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust the Volume of the device",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      })
    }

    if( this.hasTemperature ) {
      cTypes.push({
        cType: types.CURRENT_TEMPERATURE_CTYPE,
        //onUpdate: function(value) { console.log("Change:",value); execute("Thermostat", "Current Temperature", value); },
        onRead: function(callback) {
          that.query('temperature', function(temperature){
            callback(parseFloat(temperature));
          });
        },
        perms: ["pr","ev"],
                format: "float",
                initialValue: 20,
                supportEvents: true,
                supportBonjour: false,
                manfDescription: "Current Temperature",
                unit: "celsius"
      })
    }

    if( this.hasHumidity ) {
      cTypes.push({
        cType: types.CURRENT_RELATIVE_HUMIDITY_CTYPE,
        //onUpdate: function(value) { console.log("Change:",value); execute("Thermostat", "Current Temperature", value); },
        onRead: function(callback) {
          that.query('humidity', function(humidity){
            callback(parseInt(humidity));
          });
        },
        perms: ["pr","ev"],
                format: "int",
                initialValue: 50,
                designedMinValue: 0,
                designedMaxValue: 100,
                supportEvents: true,
                supportBonjour: false,
                manfDescription: "Current Humidity",
                unit: "%"
      })

    }

    return cTypes;
  },

  sType: function() {
    if( match = this.PossibleSets.match(/\bvolume\b/) ) {
      return types.SPEAKER_STYPE
    } else if( this.hasTemperature ) {
      return types.TEMPERATURE_SENSOR_STYPE
    } else if( this.hasHumidity ) {
      return types.HUMIDITY_SENSOR_STYPE
    } else if( this.hasPct || this.hasHue || this.hasRGB ) {
      return types.LIGHTBULB_STYPE
    } else {
      return types.SWITCH_STYPE
    }
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
    this.log("Loaded services for " + this.name)
    return services;
  }
};

//module.exports.accessory = FHEMAccessory;
module.exports.platform = FHEMPlatform;
