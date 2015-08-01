// FHEM Platform Shim for HomeBridge
//
// Remember to add platform to config.json. Example:
// "platforms": [
//     {
//         'platform': "FHEM",
//         'name': "FHEM",
//         'server': "127.0.0.1",
//         'port': 8083,
//         'ssl': true,
//         'auth': {'user': "fhem", 'pass': "fhempassword"},
//         'filter': "room=xyz"
//     }
// ],
//
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.

var types = require('HAP-NodeJS/accessories/types.js');
var util = require('util');


// cached readings from longpoll & query
var FHEM_cached = {};


// subscriptions to fhem longpoll evens
var FHEM_subscriptions = {};
function
FHEM_subscribe(characteristic, inform_id, accessory) {
  FHEM_subscriptions[inform_id] = { 'characteristic': characteristic, 'accessory': accessory };
  //FHEM_subscriptions[inform_id] = characteristic;
}
function
FHEM_update(inform_id, value, no_update) {
  var subscription = FHEM_subscriptions[inform_id];
  if( subscription != undefined ) {
    if( value == undefined
        || FHEM_cached[inform_id] === value )
      return;

    FHEM_cached[inform_id] = value;
    //FHEM_cached[inform_id] = { 'value': value, 'timestamp': Date.now() };
    console.log("  caching: " + inform_id + ": " + value + " as " + typeof(value) );

    if( !no_update )
      subscription.characteristic.updateValue(value, null);
  }
}


var FHEM_lastEventTimestamp;
var FHEM_longpoll_running = false;
//FIXME: force reconnect on xxx bytes received ?, add filter, add since
function FHEM_startLongpoll(connection) {
  if( FHEM_longpoll_running )
    return;
  FHEM_longpoll_running = true;

  var filter = ".*";
  var since = "null";
  var query = "/fhem.pl?XHR=1"+
              "&inform=type=status;filter="+filter+";since="+since+";fmt=JSON"+
              "&timestamp="+Date.now()

  var url = encodeURI( connection.base_url + query );
  console.log( 'starting longpoll: ' + url );

  var FHEM_longpollOffset = 0;
  var input = "";
  connection.request.get( { url: url } ).on( 'data', function(data) {
//console.log( 'data: '+ data );
                 if( !data )
                   return;

                 input += data;
                 for(;;) {
                   var nOff = input.indexOf("\n", FHEM_longpollOffset);
                   if(nOff < 0)
                     break;
                   var l = input.substr(FHEM_longpollOffset, nOff-FHEM_longpollOffset);
                   FHEM_longpollOffset = nOff+1;
//console.log( "Rcvd: "+(l.length>132 ? l.substring(0,132)+"...("+l.length+")":l) );
                   if(!l.length)
                     continue;

                   var d;
                   if( l.substr(0,1) == '[' )
                     d = JSON.parse(l);
                   else
                     d = l.split("<<", 3);

                   //console.log(d);

                   if(d.length != 3)
                     continue;
                   if(d[0].match(/-ts$/))
                     continue;

//console.log( "Rcvd: "+(l.length>132 ? l.substring(0,132)+"...("+l.length+")":l) );

                   var subscription = FHEM_subscriptions[d[0]];
                   if( subscription != undefined ) {
//console.log( "Rcvd: "+(l.length>132 ? l.substring(0,132)+"...("+l.length+")":l) );
                     FHEM_lastEventTimestamp = Date.now();
                     var accessory = subscription.accessory;

                     var value = d[1];
                     if( value.match( /^set-/ ) )
                       continue;

                     var match = d[0].match(/([^-]*)-(.*)/);
                     var device = match[1];
                     var reading = match[2];
                     if( reading == undefined )
                       continue;

                     if( reading == 'state') {
                       if( match = value.match(/dim(\d*)%/ ) ) {
                         var pct = parseInt( match[1] );

                         FHEM_update( device+'-pct', pct );
                       }

                     } else if(reading == accessory.hasRGB) {
                       var hsv = FHEM_rgb2hsv(value);
                       var hue = parseInt( hsv[0] * 360 );
                       var sat = parseInt( hsv[1] * 100 );
                       var bri = parseInt( hsv[2] * 100 );

                       //FHEM_update( device+'-'+reading, value, false );
                       FHEM_update( device+'-hue', hue );
                       FHEM_update( device+'-sat', sat );
                       FHEM_update( device+'-bri', bri );
                       continue;
                     }

                     value = accessory.reading2homekit(reading, value);
                     FHEM_update( device+'-'+reading, value );

                   } else {
                   }

                 }

                 input = input.substr(FHEM_longpollOffset);
                 FHEM_longpollOffset = 0;

               } ).on( 'end', function() {
                 console.log( "longpoll ended" );

                 FHEM_longpoll_running = false;
                 setTimeout( function(){FHEM_startLongpoll(connection)}, 5000 );

               } ).on( 'close', function() {
                 console.log( "longpoll closed" );

                 FHEM_longpoll_running = false;
                 setTimeout( function(){FHEM_startLongpoll(connection)}, 5000 );

               } ).on( 'finish', function() {
                 console.log( "longpoll finished" );

                 FHEM_longpoll_running = false;
                 setTimeout( function(){FHEM_startLongpoll(connection)}, 5000 );
               } ).on( 'error', function(err) {
                 console.log( "longpoll error: " + err );

                 FHEM_longpoll_running = false;
                 setTimeout( function(){FHEM_startLongpoll(connection)}, 5000 );
               } );
}


function FHEMPlatform(log, config) {
  this.log     = log;
  this.server  = config['server'];
  this.port    = config['port'];
  this.filter  = config['filter'];

  var base_url;
  if( config['ssl'] )
    base_url = 'https://';
  else
    base_url = 'http://';
  base_url += this.server + ':' + this.port;

  var request = require('request');
  var auth = config['auth'];
  if( auth ) {
    if( auth.sendImmediately == undefined )
      auth.sendImmediately = false;

    request = request.defaults( { 'auth': auth, 'rejectUnauthorized': false } );
  }

  this.connection = { 'base_url': base_url, 'request': request };

  FHEM_startLongpoll( this.connection );
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
FHEM_rgb2hsv(r,g,b){
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

  if( M == 0 ) {
    s = 0;
  } else {
    s = c / M;
  }

  v = M/255;

  return  [h,s,v];
}


FHEMPlatform.prototype = {
  accessories: function(callback) {
    this.log("Fetching FHEM switchable devices...");

    var foundAccessories = [];

    var cmd = 'jsonlist2';
    if( this.filter )
      cmd += " " + this.filter;
    var url = encodeURI( this.connection.base_url + "/fhem?cmd=" + cmd + "&XHR=1");
    this.log( 'fetching: ' + url );

    var that = this;
    this.connection.request.get( { url: url, json: true, gzip: true },
                 function(err, response, json) {
                   if( !err && response.statusCode == 200 ) {
                     that.log( 'got: ' + json['totalResultsReturned'] + ' results' );
//that.log("got json: " + util.inspect(json) );
                     if( json['totalResultsReturned'] ) {
                       var sArray=FHEM_sortByKey(json['Results'],"Name");
                       sArray.map(function(s) {
                         if( s.Attributes.disable == 1 ) {
                           that.log( s.Internals.NAME + ' is disabled');

                         } else if( s.Internals.TYPE == 'structure' ) {
                           that.log( s.Internals.NAME + ' is a structure');

                         } else if( s.PossibleSets.match(/\bon\b/)
                             && s.PossibleSets.match(/\boff\b/) ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);
                           foundAccessories.push(accessory);

                         } else if( s.PossibleSets.match(/\bvolume\b/) ) {
                           that.log( s.Internals.NAME + ' has volume');
                           accessory = new FHEMAccessory(that.log, that.connection, s);
                           foundAccessories.push(accessory);

                         } else if( s.Attributes.genericDisplayType
                                    || s.Attributes.genericDeviceType ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);
                           foundAccessories.push(accessory);

                         } else if( s.Attributes.subType == 'thermostat'
                                    || s.Attributes.subType == 'blindActuator'
                                    || s.Attributes.subType == 'threeStateSensor' ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);
                           foundAccessories.push(accessory);

                         } else if( s.Internals.TYPE == 'PRESENCE' ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);
                           foundAccessories.push(accessory);


                         } else if( s.Readings.temperature ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);
                           foundAccessories.push(accessory);

                         } else if( s.Readings.humidity ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);
                           foundAccessories.push(accessory);

                         } else {
                           that.log( 'ignoring ' + s.Internals.NAME );

                         }
                       });
                     }
                     callback(foundAccessories);

                   } else {
                     that.log("There was a problem connecting to FHEM (1).");
                     if( response )
                       that.log( "  " + response.statusCode + ": " + response.statusMessage );

                   }

                 });
  }
}

function
FHEMAccessory(log, connection, s) {
//log( 'sets: ' + s.PossibleSets );
//log("got json: " + util.inspect(s) );
//log("got json: " + util.inspect(s.Internals) );

  //FIXME: replace hasPct(true/false) by hasBri(reading)
  var match;
  if( match = s.PossibleSets.match(/\bpct\b/) ) {
    s.hasPct = true;
    s.pctMax = 100;
  } else if( match = s.PossibleSets.match(/\bdim\d*%/) ) {
    s.hasDim = true;
    s.pctMax = 100;
  }
  if( match = s.PossibleSets.match(/\bhue[^\b\s]*(,(\d*)?)+\b/) ) {
    s.isLight = true;
    s.hasHue = true;
    s.hueMax = 360;
    if( match[2] != undefined )
      s.hueMax = match[2];
  }
  if( match = s.PossibleSets.match(/\bsat[^\b\s]*(,(\d*)?)+\b/) ) {
    s.isLight = true;
    s.hasSat = true;
    s.satMax = 100;
    if( match[2] != undefined )
      s.satMax = match[2];
  }
  if( s.PossibleSets.match(/\brgb\b/) ) {
    s.isLight = true;
    s.hasRGB = 'rgb';
    if( s.Internals.TYPE == 'SWAP_0000002200000003' )
      s.hasRGB = '0B-RGBlevel';
  } else if( s.PossibleSets.match(/\bRGB\b/) ) {
    s.isLight = true;
    s.hasRGB = 'RGB';
  }

  if( s.Readings['measured-temp'] )
    s.hasTemperature = "measured-temp";
  else if( s.Readings.temperature )
    s.hasTemperature = "temperature";

  if( s.Readings.humidity )
    s.hasHumidity = 'humidity';

  if( s.Readings.motor )
    s.hasMotor = 'motor';


  var genericType = s.Attributes.genericDeviceType;
  if( !genericType )
    genericType = s.Attributes.genericDisplayType;

  if( genericType == 'switch' )
    s.isSwitch = true;
  else if( genericType == 'light' )
    s.isLight = true;
  else if( genericType == 'blind' ) {
    s.isBlind = 'pct';
  } else if( genericType == 'thermostat' )
    s.isThermostat = true;
  else if( s.Attributes.subType == 'thermostat' )
    s.isThermostat = true;
  else if( s.Attributes.subType == 'blindActuator' ) {
    s.isBlind = 'pct';
  } else if( s.Attributes.subType == 'threeStateSensor' ) {
    s.isContactSensor = true;
    if( s.Attributes.model == 'HM-SEC-RHS' )
      s.isWindow = true;
  } else if( s.Internals.TYPE == 'PRESENCE' )
    s.isOccupancySensor = true;
  else if( s.Attributes.model == 'fs20di' )
    s.isLight = true;

  if( s.PossibleSets.match(/\bdesired-temp\b/) )
    s.isThermostat = 'desired-temp';
  else if( s.PossibleSets.match(/\bdesiredTemperature\b/) )
    s.isThermostat = 'desiredTemperature';
  else if( s.isThermostat ) {
    s.isThermostat = false;
    log( s.Internals.NAME + ' is NOT a thermostat. set for target temperature missing' );
  }

  this.endpoints = {};
  if( s.Internals.TYPE == 'SONOSPLAYER' )
    this.endpoints.onOff = { reading: 'transportState', cmdOn: 'play', cmdOff: 'pause' };
  else if( s.PossibleSets.match(/\bon\b/)
           && s.PossibleSets.match(/\boff\b/) )
    this.endpoints.onOff = { reading: 'state', cmdOn: 'on', cmdOff: 'off' };

  var event_map = s.Attributes.eventMap;
  if( event_map ) {
    var parts = event_map.split( ' ' );
    for( var p = 0; p < parts.length; p++ ) {
      var map = parts[p].split( ':' );
      if( map[1] == 'on'
          || map[1] == 'off' ) {
        if( !this.event_map )
          this.event_map = {}
        this.event_map[map[0]] = map[1];
      }
    }
  }

  if( s.hasHue )
    log( s.Internals.NAME + ' has hue [0-' + s.hueMax +']' );
  else if( s.hasRGB )
    log( s.Internals.NAME + ' has RGB [0-' + s.hasRGB +']');
  else if( s.hasPct )
    log( s.Internals.NAME + ' is dimable [0-'+ s.pctMax +']' );
  else if( s.hasDim )
    log( s.Internals.NAME + ' is dimable [0-'+ s.pctMax +']' );
  else if( s.isThermostat )
    log( s.Internals.NAME + ' is thermostat ['+ s.isThermostat +']' );
  else if( s.isContactSensor )
    log( s.Internals.NAME + ' is contactsensor' );
  else if( s.isOccupancySensor )
    log( s.Internals.NAME + ' is occupancysensor' );
  else if( s.isBlind )
    log( s.Internals.NAME + ' is blind ['+ s.isBlind +']' );
  else if( s.isLight )
    log( s.Internals.NAME + ' is light' );
  else
    log( s.Internals.NAME + ' is switchable' );

  if(  this.hasOnOff )
    log( s.Internals.NAME + ' has OnOff [' +  this.hasOnOff + ']' );

  if( s.hasTemperature )
    log( s.Internals.NAME + ' has temperature ['+ s.hasTemperature +']' );
  if( s.hasHumidity )
    log( s.Internals.NAME + ' has humidity ['+ s.hasHumidity +']' );
  if( s.hasMotor )
    log( s.Internals.NAME + ' has motor' );

  // device info
  this.name		= s.Internals.NAME;
  this.alias		= s.Attributes.alias ? s.Attributes.alias : s.Internals.NAME;
  this.device		= s.Internals.NAME;
  this.type             = s.Internals.TYPE;
  this.model            = s.Attributes.model ? s.Attributes.model : s.Internals.model;
  this.PossibleSets     = s.PossibleSets;

  if( this.type == 'CUL_HM' ) {
    this.serial = s.Internals.DEF;
    if( s.Attributes.serialNr )
      this.serial = s.Attributes.serialNr;
    else if( s.Readings['D-serialNr'] && s.Readings['D-serialNr'].Value )
      this.serial = s.Readings['D-serialNr'].Value;
  } else if( this.type == 'CUL_WS' )
    this.serial = s.Internals.DEF;
  else if( this.type == 'FS20' )
    this.serial = s.Internals.DEF;
  else if( this.type == 'IT' )
    this.serial = s.Internals.DEF;
  else if( this.type == 'HUEDevice' )
    this.serial = s.Internals.uniqueid;
  else if( this.type == 'SONOSPLAYER' )
    this.serial = s.Internals.UDN;

  this.hasPct   = s.hasPct;
  this.hasDim   = s.hasDim;
  this.pctMax   = s.pctMax;
  this.hasHue   = s.hasHue;
  this.hueMax   = s.hueMax;
  this.hasSat   = s.hasSat;
  this.satMax   = s.satMax;
  this.hasRGB   = s.hasRGB;

  this.hasTemperature   = s.hasTemperature;
  this.hasHumidity      = s.hasHumidity;
  this.hasMotor         = s.hasMotor;

  this.isLight           = s.isLight;
  this.isBlind           = s.isBlind;
  this.isThermostat      = s.isThermostat;
  this.isContactSensor   = s.isContactSensor;
  this.isOccupancySensor = s.isOccupancySensor;
  this.isWindow          = s.isWindow;

//log( util.inspect(s.Readings) );

  this.log        = log;
  this.connection = connection;
}

FHEM_dim_values = [ 'dim06%', 'dim12%', 'dim18%', 'dim25%', 'dim31%', 'dim37%', 'dim43%', 'dim50%', 'dim56%', 'dim62%', 'dim68%', 'dim75%', 'dim81%', 'dim87%', 'dim93%' ];

FHEMAccessory.prototype = {
  reading2homekit: function(reading,value) {
    if( reading == 'hue' ) {
      value = Math.round(value * 360 / this.hueMax);

    } else if( reading == 'sat' ) {
      value = Math.round(value * 100 / this.satMax);

    } else if( reading == 'pct' ) {
      value = parseInt( value );

    } else if(reading == 'motor') {
      if( value.match(/^opening/))
        value = 1;
      else if( value.match(/^up/))
        value = 1;
      else if( value.match(/^closing/))
        value = 0;
      else if( value.match(/^down/))
        value = 0;
      else
        value = 2;

      value = parseInt(value);

    } else if( reading == 'transportState' ) {
      if( value == 'PLAYING' )
        value = 1;
      else
        value = 0;

      value = parseInt(value);

    } else if( reading == 'Volume' ) {
      value = parseInt( value );

    } else if( reading == 'contact' ) {
        if( value.match( /^closed/ ) )
          value = 1;
        else
          value = 0;

      value = parseInt(value);

    } else if( reading == 'temperature'
               || reading == 'measured-temp'
               || reading == 'desired-temp'
               || reading == 'desiredTemperature' ) {
      value = parseFloat( value );

    } else if( reading == 'humidity' ) {
      value = parseInt( value );

    } else if( reading == 'state' ) {
      if( value.match(/^set-/ ) )
        return undefined;

      if( this.event_map != undefined ) {
        var mapped = this.event_map[value];
        if( mapped != undefined )
          value = mapped;
      }

      if( value == 'off' )
        value = 0;
      else if( value == 'absent' )
        value = 0;
      else if( value == '000000' )
        value = 0;
      else if( value.match( /^[A-D]0$/ ) )
        value = 0;
      else
        value = 1;

      value = parseInt( value );

    }

    return(value);
  },

  delayed: function(c,value,delay) {
    var timer = this.delayed[c];
    if( timer ) {
      //this.log(this.name + " removing old command " + c);
      clearTimeout( timer );
    }

    this.log(this.name + " delaying command " + c + " with value " + value);
    var that = this;
    this.delayed[c] = setTimeout( function(){clearTimeout(that.delayed[c]);that.command(c,value)}, delay?delay:1000 );
  },

  command: function(c,value) {
    this.log(this.name + " sending command " + c + " with value " + value);
    if( c == 'on' ) {
      if( this.PossibleSets.match(/\bplay\b/i) )
        url = this.connection.base_url + "/fhem?cmd=set " + this.device + " play&XHR=1";
      else if( this.PossibleSets.match(/\bon\b/) )
        url = this.connection.base_url + "/fhem?cmd=set " + this.device + " on&XHR=1";
      else
        this.log(this.name + " Unhandled command! cmd=" + c + ", value=" + value);

    } else if( c == 'off' ) {
      if( this.PossibleSets.match(/\bpause\b/i) )
        url = this.connection.base_url + "/fhem?cmd=set " + this.device + " pause&XHR=1";
      else if( this.PossibleSets.match(/\boff\b/) )
        url = this.connection.base_url + "/fhem?cmd=set " + this.device + " off&XHR=1";
      else
        this.log(this.device + " Unhandled command! cmd=" + c + ", value=" + value);

    } else if( c == 'volume' ) {
      url = this.connection.base_url + "/fhem?cmd=set " + this.device + " volume " + value + "&XHR=1";

    } else if( c == 'pct' ) {
      url = this.connection.base_url + "/fhem?cmd=set " + this.device + " pct " + value + "&XHR=1";

    } else if( c == 'dim' ) {
      //if( value < 3 )
      //  url = this.connection.base_url + "/fhem?cmd=set " + this.device + " off&XHR=1";
      //else
      if( value > 97 )
        url = this.connection.base_url + "/fhem?cmd=set " + this.device + " on&XHR=1";
      else
        url = this.connection.base_url + "/fhem?cmd=set " + this.device + " " + FHEM_dim_values[Math.round(value/6.25)] + "&XHR=1";

    } else if( c == 'H-rgb' || c == 'S-rgb' || c == 'B-rgb' ) {
        var h = FHEM_cached[this.device + '-hue' ] / 360;
        var s = FHEM_cached[this.device + '-sat' ] / 100;
        var v = FHEM_cached[this.device + '-bri' ] / 100;
        //this.log( this.name + ' cached : [' + h + ',' + s + ',' + v + ']' );
        if( h == undefined ) h = 0.0;
        if( s == undefined ) s = 1.0;
        if( v == undefined ) v = 1.0;
        //this.log( this.name + ' old : [' + h + ',' + s + ',' + v + ']' );

        if( c == 'H-rgb' ) {
          FHEM_update(this.device + '-hue',  value, false );
          h = value / 360;
        } else if( c == 'S-rgb' ) {
          FHEM_update(this.device + '-sat',  value, false );
          s = value / 100;
        } else if( c == 'B-rgb' ) {
          FHEM_update(this.device + '-bri',  value, false );
          v = value / 100;
        }
        //this.log( this.name + ' new : [' + h + ',' + s + ',' + v + ']' );

        value = FHEM_hsv2rgb( h, s, v );
        //this.log( this.name + ' rgb : [' + value + ']' );
        if( this.PossibleSets.match(/\brgb\b/) )
          url = this.connection.base_url + "/fhem?cmd=set " + this.device + " rgb " + value + "&XHR=1";
        else
          url = this.connection.base_url + "/fhem?cmd=set " + this.device + " RGB " + value + "&XHR=1";

    } else if( c == 'hue' ) {
        value = Math.round(value * this.hueMax / 360);
        url = this.connection.base_url + "/fhem?cmd=set " + this.device + " hue " + value + "&XHR=1";

    } else if( c == 'sat' ) {
      value = value / 100 * this.satMax;
      url = this.connection.base_url + "/fhem?cmd=set " + this.device + " sat " + value + "&XHR=1";

    } else if( c == 'targetTemperature' ) {
      url = this.connection.base_url + "/fhem?cmd=set " + this.device + " " + this.isThermostat + " " + value + "&XHR=1";

    } else if( c == 'targetPosition' ) {
      url = this.connection.base_url + "/fhem?cmd=set " + this.device + " " + this.isBlind + " " + value + "&XHR=1";

    } else {
      this.log(this.name + " Unhandled command! cmd=" + c + ", value=" + value);
      return;

    }

    var that = this;
    this.connection.request.put(  { url: encodeURI(url), gzip: true },
                  function(err, response) {
                    if( err ) {
                      that.log("There was a problem sending command " + c + " to" + that.name);
                      that.log(url);
                      if( response )
                        that.log( "  " + response.statusCode + ": " + response.statusMessage );

                    } else {
                      that.log(that.name + " sent command " + c);
                      that.log(url);

                    }

                  } );
  },

  query: function(reading, callback) {
    this.log("query: " + this.name + "-" + reading);

    var result = FHEM_cached[this.device + '-' + reading];
    if( result != undefined ) {
      this.log("  cached: " + result);
      if( callback != undefined )
        callback(result);
      return(result);
    } else
      this.log("  not cached" );

    var query_reading = reading;
    if( reading == 'hue' && !this.hasHue && this.hasRGB ) {
      query_reading = this.hasRGB;

    } else if( reading == 'sat' && !this.hasSat && this.hasRGB ) {
      query_reading = this.hasRGB;

    } else if( reading == 'bri' && !this.hasPct && this.hasRGB ) {
      query_reading = this.hasRGB;

    } else if( reading == 'pct' && !this.hasPct && this.hasDim ) {
      query_reading = 'state';
    }

    var cmd = '{ReadingsVal("'+this.device+'","'+query_reading+'","")}';
    var url = encodeURI( this.connection.base_url + "/fhem?cmd=" + cmd + "&XHR=1");
    this.log( '  querying: ' + url );

    var that = this;
    that.connection.request.get( { url: url, gzip: true },
                 function(err, response, result) {
                   if( !err && response.statusCode == 200 ) {
                     value = result.replace(/[\r\n]/g, "");
                     that.log("  value: " + value);

                     if( value == undefined )
                       return value;

                     if( reading != query_reading ) {
                       if( reading == 'pct'
                           && query_reading == 'state') {
                         //FHEM_update( that.device+'-'+query_reading,  that.reading2homekit(query_reading, value) );

                         if( match = value.match(/dim(\d*)%/ ) )
                           value = parseInt( match[1] );
                         else if( value == 'off' )
                           value = 0;
                         else
                           value = 100;

                       } else if(reading == 'hue' && query_reading == that.hasRGB) {
                         //FHEM_update( that.device+'-'+query_reading, value );

                         value = parseInt( FHEM_rgb2hsv(value)[0] * 360 );

                       } else if(reading == 'sat' && query_reading == that.hasRGB) {
                         //FHEM_update( that.device+'-'+query_reading, value );

                         value = parseInt( FHEM_rgb2hsv(value)[1] * 100 );

                       } else if(reading == 'bri' && query_reading == that.hasRGB) {
                         //FHEM_update( that.device+'-'+query_reading, value );

                         value = parseInt( FHEM_rgb2hsv(value)[2] * 100 );

                       }
                     } else {
                       value = that.reading2homekit(reading, value);
                     }

                     that.log("  mapped: " + value);
                     FHEM_update( that.device + '-' + reading, value, true );

                     if( value == undefined )
                       return;
                     if( callback != undefined )
                       callback(value);
                     return(value);

                   } else {
                     that.log("There was a problem connecting to FHEM (2).");
                     if( response )
                       that.log( "  " + response.statusCode + ": " + response.statusMessage );

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
        initialValue: this.alias,
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
      initialValue: this.alias,
      supportEvents: true,
      supportBonjour: false,
      manfDescription: "Name of service",
      designedMaxLength: 255
    }]

    //if( this.name != undefined
    //    && !this.hasTemperature
    //    && !this.hasHumidity
    //    && !this.isBlind
    //    && !this.isThermostat
    //    && !this.isContactSensor
    //    && !this.isOccupancySensor ) {
    if( this.endpoints.onOff ) {
      cTypes.push({
        cType: types.POWER_STATE_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-'+that.endpoints.onOff.reading, that);
        },
        onUpdate: function(value) {
          that.command( value == 0 ? 'off' : 'on' );
        },
        onRead: function(callback) {
          that.query( that.endpoints.onOff.reading, function(state){ callback(state) } );
        },
        perms: ["pw","pr","ev"],
        format: "bool",
        initialValue: 0,
        //initialValue: that.query( that.endpoints.onOff.reading );
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Change the power state",
        designedMaxLength: 1
      });
    }

    if( this.hasPct && !this.isBlind ) {
      cTypes.push({
        cType: types.BRIGHTNESS_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-pct', that);
        },
        onUpdate: function(value) { that.command('pct', value); },
        onRead: function(callback) {
          that.query('pct', function(pct){
            callback(pct);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  0,
        //initialValue: that.query( 'pct' ),
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust Brightness of the Light",
        designedMinValue: 0,
        designedMaxValue: this.pctMax,
        designedMinStep: 1,
        unit: "%"
      });
    } else if( this.hasDim ) {
      cTypes.push({
        cType: types.BRIGHTNESS_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-pct', that);
        },
        onUpdate: function(value) { that.delayed('dim', value); },
        onRead: function(callback) {
          that.query('pct', function(pct){
            callback(pct);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  0,
        //initialValue: that.query( 'state' ),
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust Brightness of the Light",
        designedMinValue: 0,
        designedMaxValue: this.pctMax,
        designedMinStep: 1,
        unit: "%"
      });
    }

    if( this.hasHue ) {
      cTypes.push({
        cType: types.HUE_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-hue', that);
        },
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
      });
    } else if( this.hasRGB ) {
      cTypes.push({
        cType: types.HUE_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-hue', that);
          FHEM_subscribe(characteristic, that.name+'-'+that.hasRGB, that);
        },
        onUpdate: function(value) { that.command('H-rgb', value); },
        onRead: function(callback) {
          that.query('hue', function(hue){
            callback(hue);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  0,
        //initialValue: that.query( 'hue' ),
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust the Hue of the Light",
        designedMinValue: 0,
        designedMaxValue: 360,
        designedMinStep: 1,
        unit: "arcdegrees"
      });

      if( !this.hasSat )
      cTypes.push({
        cType: types.SATURATION_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-sat', that);
        },
        onUpdate: function(value) { that.command('S-rgb', value); },
        onRead: function(callback) {
          that.query('sat', function(sat){
            callback(sat);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  100,
        //initialValue: that.query( 'sat' ),
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust the Saturation of the Light",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      });

      if( !this.hasPct )
      cTypes.push({
        cType: types.BRIGHTNESS_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-bri', that);
        },
        onUpdate: function(value) { that.command('B-rgb', value); },
        onRead: function(callback) {
          that.query('bri', function(bri){
            callback(bri);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  0,
        //initialValue: that.query( 'bri' ),
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust Brightness of the Light",
        designedMinValue: 0,
        designedMaxValue: this.pctMax,
        designedMinStep: 1,
        unit: "%"
      });
    }

    if( this.hasSat == true ) {
      cTypes.push({
        cType: types.SATURATION_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-sat', that);
        },
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
      });
    }

    //FIXME: parse range and set designedMinValue & designedMaxValue & designedMinStep
    if( match = this.PossibleSets.match(/\bVolume\b/) ) {
      cTypes.push({
        cType: types.OUTPUTVOLUME_CTYPE,
        onUpdate: function(value) { that.delayed('volume', value); },
        onRegister: function(characteristic) {
          //characteristic.eventEnabled = true;
          //FHEM_subscribe(characteristic, that.name+'-Volume', that);
        },
        onRead: function(callback) {
          that.query('Volume', function(vol){
            callback(vol);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  10,
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Adjust the Volume of this device",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1
        //unit: "%"
      });
    }

    //FIXME: parse range and set designedMinValue & designedMaxValue & designedMinStep
    if( this.isBlind ) {
      cTypes.push({
        cType: types.WINDOW_COVERING_TARGET_POSITION_CTYPE,
        onUpdate: function(value) { that.delayed('targetPosition', value, 1500); },
        //onRegister: function(characteristic) {
        //  characteristic.eventEnabled = true;
        //  FHEM_subscribe(characteristic, that.name+'-'+that.isBlind, that);
        //},
        onRead: function(callback) {
          that.query(that.isBlind, function(pct){
            callback(pct);
          });
        },
        perms: ["pw","pr","ev"],
        format: "int",
        initialValue:  0,
        //initialValue: that.query( that.isBlind ),
        supportEvents: false,
        supportBonjour: false,
        manfDescription: "Target Blind Position",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      });
      cTypes.push({
        cType: types.WINDOW_COVERING_CURRENT_POSITION_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-'+that.isBlind, that);
        },
        onRead: function(callback) {
          that.query(that.isBlind, function(pos){
            callback(pos);
          });
        },
        perms: ["pr","ev"],
        format: "int",
        initialValue:  0,
        //initialValue: that.query( that.isBlind ),
        supportEvents: true,
        supportBonjour: false,
        manfDescription: "Current Blind Position",
        designedMinValue: 0,
        designedMaxValue: 100,
        designedMinStep: 1,
        unit: "%"
      });
      cTypes.push({
        cType: types.WINDOW_COVERING_OPERATION_STATE_CTYPE,
        onRegister: function(characteristic) {
          if( that.hasMotor ) {
            characteristic.eventEnabled = true;
            FHEM_subscribe(characteristic, that.name+'-'+that.hasMotor, that);
          }
        },
        onRead: function(callback) {
          if( that.hasMotor )
            that.query(that.hasMotor, function(state){
              callback(state);
            });
        },
        perms: ["pr","ev"],
                format: "int",
                initialValue: 2,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Position State",
                designedMinValue: 0,
                designedMaxValue: 2,
                designedMinStep: 1,
      });
    }

    //FIXME: parse range and set designedMinValue & designedMaxValue & designedMinStep
    if( this.isThermostat ) {
      cTypes.push({
        cType: types.TARGET_TEMPERATURE_CTYPE,
        onUpdate: function(value) { that.delayed('targetTemperature', value, 1500); },
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-'+that.isThermostat, that);
        },
        onRead: function(callback) {
          that.query(that.isThermostat, function(temperature){
            callback(temperature);
          });
        },
        perms: ["pw","pr","ev"],
                format: "float",
                initialValue: 20,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Target Temperature",
                designedMinValue: 5.0,
                designedMaxValue: 30.0,
                //designedMinStep: 0.5,
                unit: "celsius"
      });
      cTypes.push({
        cType: types.CURRENTHEATINGCOOLING_CTYPE,
        perms: ["pr","ev"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Current Mode",
                designedMaxLength: 1,
                designedMinValue: 0,
                designedMaxValue: 2,
                designedMinStep: 1,
      });
      cTypes.push({
        cType: types.TARGETHEATINGCOOLING_CTYPE,
        onUpdate: function(value) { that.command('targetMode', value); },
        perms: ["pw","pr","ev"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Target Mode",
                designedMinValue: 0,
                designedMaxValue: 3,
                designedMinStep: 1,
      });

      cTypes.push({
        cType: types.TEMPERATURE_UNITS_CTYPE,
        perms: ["pr","ev"],
                format: "int",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Unit",
      });
    }

    if( this.isWindow ) {
      cTypes.push({
        cType: types.CONTACT_SENSOR_STATE_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-contact', that);
        },
        onRead: function(callback) {
          that.query('contact', function(state){
            callback(state);
          });
        },
        perms: ["pr","ev"],
                format: "bool",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Contact State",
                designedMaxLength: 1
      });
    } else if( this.isContactSensor ) {
      cTypes.push({
        cType: types.CONTACT_SENSOR_STATE_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-contact', that);
        },
        onRead: function(callback) {
          that.query('contact', function(state){
            callback(state);
          });
        },
        perms: ["pr","ev"],
                format: "bool",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Contact State",
                designedMaxLength: 1
      });
    }

    if( this.isOccupancySensor ) {
      cTypes.push({
        cType: types.OCCUPANCY_DETECTED_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-state', that);
        },
        onRead: function(callback) {
          that.query('state', function(state){
            callback(state);
          });
        },
        perms: ["pr","ev"],
                format: "bool",
                initialValue: 0,
                supportEvents: false,
                supportBonjour: false,
                manfDescription: "Occupancy State",
                designedMaxLength: 1
      });
    }

    if( this.hasTemperature ) {
      cTypes.push({
        cType: types.CURRENT_TEMPERATURE_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-'+that.hasTemperature, that);
        },
        onRead: function(callback) {
          that.query(that.hasTemperature, function(temperature){
            callback(temperature);
          });
        },
        perms: ["pr","ev"],
                format: "float",
                initialValue: 20,
                //initialValue: that.query(that.hasTemperature),
                supportEvents: true,
                supportBonjour: false,
                manfDescription: "Current Temperature",
                unit: "celsius"
      });
    }

    if( this.hasHumidity ) {
      cTypes.push({
        cType: types.CURRENT_RELATIVE_HUMIDITY_CTYPE,
        onRegister: function(characteristic) {
          characteristic.eventEnabled = true;
          FHEM_subscribe(characteristic, that.name+'-'+that.hasHumidity, that);
        },
        onRead: function(callback) {
          that.query(that.hasHumidity, function(humidity){
            callback(humidity);
          });
        },
        perms: ["pr","ev"],
                format: "int",
                initialValue: 50,
                //initialValue: that.query(that.hasHumidity),
                designedMinValue: 0,
                designedMaxValue: 100,
                supportEvents: true,
                supportBonjour: false,
                manfDescription: "Current Humidity",
                unit: "%"
      });

    }

    return cTypes;
  },

  sType: function() {
    if( match = this.PossibleSets.match(/\bvolume\b/) ) {
      return types.SPEAKER_STYPE;
    } else if( this.isSwitch ) {
      return types.SWITCH_STYPE;
    } else if( this.isBlind ) {
      return types.WINDOW_COVERING_STYPE;
    } else if( this.isThermostat ) {
      return types.THERMOSTAT_STYPE;
    } else if( this.isWindow ) {
      return types.CONTACT_SENSOR_STYPE;
    } else if( this.isContactSensor ) {
      return types.CONTACT_SENSOR_STYPE;
    } else if( this.isOccupancySensor ) {
      return types.OCCUPANCY_SENSOR_STYPE;
    } else if( this.isLight || this.hasPct || this.hasHue || this.hasRGB ) {
      return types.LIGHTBULB_STYPE;
    } else if( this.hasTemperature ) {
      return types.TEMPERATURE_SENSOR_STYPE;
    } else if( this.hasHumidity ) {
      return types.HUMIDITY_SENSOR_STYPE;
    } else {
      return types.SWITCH_STYPE;
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



//http server for debugging
var http = require('http');

const FHEMdebug_PORT=8080;

function FHEMdebug_handleRequest(request, response){
  //console.log( request );

  if( request.url == "/cached" ) {
    response.write( "<a href='/'>home</a><br>" );
    if( FHEM_lastEventTimestamp )
      response.write( "FHEM_lastEventTime: "+ new Date(FHEM_lastEventTimestamp) +"<br>" );
    response.end( "cached: " + util.inspect(FHEM_cached).replace(/\n/g, '<br>') );

  } else if( request.url == "/subscriptions" ) {
    response.write( "<a href='/'>home</a><br>" );
    response.end( "subscriptions: " + util.inspect(FHEM_subscriptions, {depth: 3}).replace(/\n/g, '<br>') );

  } else if( request.url == "/persist" ) {
    response.write( "<a href='/'>home</a><br>" );
    var unique = {};
    Object.keys(FHEM_subscriptions).forEach(function(key) {
      var characteristic = FHEM_subscriptions[key].characteristic;
      var info = characteristic.accessoryController.tcpServer.accessoryInfo;
      if( unique[info.displayName] )
        return;
      unique[info.displayName] = info.username;
    } );

    var keys = Object.keys(unique);
    keys.sort();
    for( i = 0; i < keys.length; i++ ) {
      var k = keys[i];
      response.write( k +': '+ unique[k] +'<br>' );
    }
    response.end( "" );

  } else
    response.end( "<a href='/cached'>cached</a><br><a href='/persist'>persist</a><br><a href='/subscriptions'>subscriptions</a>" );
}

var FHEMdebug_server = http.createServer( FHEMdebug_handleRequest );

FHEMdebug_server.on('error', function (e) {
  console.log("Server error: " + e);
});

//Lets start our server
FHEMdebug_server.listen(FHEMdebug_PORT, function(){
    console.log("Server listening on: http://<ip>:%s", FHEMdebug_PORT);
});

