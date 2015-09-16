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

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;

var types = require('HAP-NodeJS/accessories/types.js');

var util = require('util');


// subscriptions to fhem longpoll evens
var FHEM_subscriptions = {};
function
FHEM_subscribe(characteristic, inform_id, accessory) {
  FHEM_subscriptions[inform_id] = { 'characteristic': characteristic, 'accessory': accessory };
}

// cached readings from longpoll & query
var FHEM_cached = {};
//var FHEM_internal = {};
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
      subscription.characteristic.setValue(value, undefined, 'fromFhem');
  }
}


var FHEM_lastEventTime;
var FHEM_longpoll_running = false;
//FIXME: add filter
function FHEM_startLongpoll(connection) {
  if( FHEM_longpoll_running )
    return;
  FHEM_longpoll_running = true;

  var filter = ".*";
  var since = "null";
  if( FHEM_lastEventTime )
    since = FHEM_lastEventTime/1000;
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
                 var lastEventTime = Date.now();
                 for(;;) {
                   var nOff = input.indexOf('\n', FHEM_longpollOffset);
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
                     FHEM_lastEventTime = lastEventTime;
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
                       if( accessory.mappings.window ) {
                         var level = 50;
                         if( match = value.match(/^(\d+)/ ) )
                           level = parseInt( match[1] );
                         else if( value == 'locked' )
                           level = 0;

                         FHEM_update( accessory.mappings.window.informId, level );
                         continue;

                       } else if( accessory.mappings.lock ) {
                         var lock = Characteristic.LockCurrentState.UNSECURED;
                         if( value.match( /^locked/ ) )
                           lock = Characteristic.LockCurrentState.SECURED;

                         if( value.match( /uncertain/ ) )
                           level = Characteristic.LockCurrentState.UNKNOWN;

                         FHEM_update( accessory.mappings.lock.informId, lock );
                         continue;

                       } else if( match = value.match(/dim(\d+)%/ ) ) {
                         var pct = parseInt( match[1] );

                         FHEM_update( device+'-pct', pct );
                       }

                     } else if(accessory.mappings.rgb && reading == accessory.mappings.rgb.reading) {
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
                 setTimeout( function(){FHEM_startLongpoll(connection)}, 2000 );

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

    // mechanism to ensure callback is only executed once all requests complete
    var asyncCalls = 0;
    function callbackLater() { if (--asyncCalls == 0) callback(foundAccessories); }

    var cmd = 'jsonlist2';
    if( this.filter )
      cmd += " " + this.filter;
    var url = encodeURI( this.connection.base_url + "/fhem?cmd=" + cmd + "&XHR=1");
    this.log( 'fetching: ' + url );


    asyncCalls++;

    var that = this;
    this.connection.request.get( { url: url, json: true, gzip: true },
                 function(err, response, json) {
                   if( !err && response.statusCode == 200 ) {
                     that.log( 'got: ' + json['totalResultsReturned'] + ' results' );
//that.log("got json: " + util.inspect(json) );
                     if( json['totalResultsReturned'] ) {
                       var sArray=FHEM_sortByKey(json['Results'],"Name");
                       sArray.map(function(s) {

                         var accessory;
                         if( s.Attributes.disable == 1 ) {
                           that.log( s.Internals.NAME + ' is disabled');

                         } else if( s.Internals.TYPE == 'structure' ) {
                           that.log( s.Internals.NAME + ' is a structure');

                         } else if( s.Attributes.genericDisplayType
                                    || s.Attributes.genericDeviceType ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else if( s.PossibleSets.match(/[\^ ]on\b/)
                                    && s.PossibleSets.match(/[\^ ]off\b/) ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else if( s.PossibleSets.match(/[\^ ]Volume\b/) ) { //FIXME: use sets [Pp]lay/[Pp]ause/[Ss]top
                           that.log( s.Internals.NAME + ' has volume');
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else if( s.Attributes.subType == 'thermostat'
                                    || s.Attributes.subType == 'blindActuator'
                                    || s.Attributes.subType == 'threeStateSensor' ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else if( s.Attributes.model == 'HM-SEC-WIN' ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else if( s.Attributes.model == 'HM-SEC-KEY' ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else if( s.Internals.TYPE == 'PRESENCE' ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else if( s.Readings.temperature ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else if( s.Readings.humidity ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else if( s.Readings.voc ) {
                           accessory = new FHEMAccessory(that.log, that.connection, s);

                         } else {
                           that.log( 'ignoring ' + s.Internals.NAME );

                         }

                         if( accessory && Object.getOwnPropertyNames(accessory).length )
                           foundAccessories.push(accessory);

                       });
                     }

                     //callback(foundAccessories);
                     callbackLater();

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

  if( !(this instanceof FHEMAccessory) )
    return new FHEMAccessory(log, connection, s);

  if( s.Attributes.disable == 1 ) {
    that.log( s.Internals.NAME + ' is disabled');
    return null;

  } else if( s.Internals.TYPE == 'structure' ) {
    that.log( s.Internals.NAME + ' is a structure');
    return null;

  }


  this.mappings = {};

  var match;
  if( match = s.PossibleSets.match(/[\^ ]pct\b/) ) {
    this.mappings.pct = { reading: 'pct', cmd: 'pct' };
  } else if( match = s.PossibleSets.match(/[\^ ]dim\d+%/) ) {
    s.hasDim = true;
    s.pctMax = 100;
  }
  if( match = s.PossibleSets.match(/[\^ ]hue[^\b\s]*(,(\d+)?)+\b/) ) {
    s.isLight = true;
    var max = 360;
    if( match[2] != undefined )
      max = match[2];
    this.mappings.hue = { reading: 'hue', cmd: 'hue', min: 0, max: max };
  }
  if( match = s.PossibleSets.match(/[\^ ]sat[^\b\s]*(,(\d+)?)+\b/) ) {
    s.isLight = true;
    var max = 100;
    if( match[2] != undefined )
      max = match[2];
    this.mappings.sat = { reading: 'sat', cmd: 'sat', min: 0, max: max };
  }

  if( s.PossibleSets.match(/[\^ ]rgb\b/) ) {
    s.isLight = true;
    this.mappings.rgb = { reading: 'rgb', cmd: 'rgb' };
    if( s.Internals.TYPE == 'SWAP_0000002200000003' )
      this.mappings.rgb = { reading: '0B-RGBlevel', cmd: 'rgb' };
  } else if( s.PossibleSets.match(/[\^ ]RGB\b/) ) {
    s.isLight = true;
    this.mappings.rgb = { reading: 'RGB', cmd: 'RGB' };
  }

  if( s.Readings['measured-temp'] )
    this.mappings.temperature = { reading: 'measured-temp' };
  else if( s.Readings.temperature )
    this.mappings.temperature = { reading: 'temperature' };

  if( s.Readings.volume )
    this.mappings.volume = { reading: 'volume', cmd: 'volume' };
  else if( s.Readings.Volume ) {
    this.mappings.volume = { reading: 'Volume', cmd: 'Volume', nocache: true };
    if( s.Attributes.generateVolumeEvent == 1 )
      delete this.mappings.volume.nocache;
  }

  if( s.Readings.humidity )
    this.mappings.humidity = { reading: 'humidity' };

  if( s.Readings.voc )
    this.mappings.airquality = { reading: 'voc' };

  if( s.Readings.motor )
    this.mappings.motor = { reading: 'motor' };

  if( s.Readings.direction )
    this.mappings.direction = { reading: 'direction' };


  var genericType = s.Attributes.genericDeviceType;
  if( !genericType )
    genericType = s.Attributes.genericDisplayType;

  if( genericType == 'switch' )
    s.isSwitch = true;

  else if( genericType == 'garage' )
    this.mappings.garage = { cmdOpen: 'on', cmdClose: 'off' };

  else if( genericType == 'light' )
    s.isLight = true;

  else if( genericType == 'blind'
           || s.Attributes.subType == 'blindActuator' ) {
    delete this.mappings.pct;
    this.mappings.blind = { reading: 'pct', cmd: 'pct' };

  } else if( genericType == 'window'
           || s.Attributes.model == 'HM-SEC-WIN' ) {
    this.mappings.window = { reading: 'level', cmd: 'level' };

  } else if( genericType == 'lock'
           || s.Attributes.model == 'HM-SEC-KEY' ) {
    this.mappings.lock = { reading: 'lock' };

  } else if( genericType == 'thermostat'
             || s.Attributes.subType == 'thermostat' ) {
    s.isThermostat = true;

  } else if( s.Internals.TYPE == 'CUL_FHTTK' ) {
    this.mappings.contact = { reading: 'Window' };

  } else if( s.Attributes.subType == 'threeStateSensor' ) {
    this.mappings.contact = { reading: 'contact' };

  } else if( s.Internals.TYPE == 'PRESENCE' )
    this.mappings.occupancy = { reading: 'state' };

  else if( s.Attributes.model == 'fs20di' )
    s.isLight = true;

  if( s.PossibleSets.match(/[\^ ]desired-temp\b/) )
    this.mappings.thermostat = { reading: 'desired-temp', cmd: 'desired-temp' };
  else if( s.PossibleSets.match(/[\^ ]desiredTemperature\b/) )
    this.mappings.thermostat = { reading: 'desiredTemperature', cmd: 'desiredTemperature' };
  else if( s.isThermostat ) {
    s.isThermostat = false;
    delete this.mappings.thermostat;
    log( s.Internals.NAME + ' is NOT a thermostat. set for target temperature missing' );
  }

  if( s.Internals.TYPE == 'SONOSPLAYER' ) //FIXME: use sets [Pp]lay/[Pp]ause/[Ss]top
    this.mappings.onOff = { reading: 'transportState', cmdOn: 'play', cmdOff: 'pause' };
  else if( s.PossibleSets.match(/[\^ ]on\b/)
           && s.PossibleSets.match(/[\^ ]off\b/) ) {
    this.mappings.onOff = { reading: 'state', cmdOn: 'on', cmdOff: 'off' };
    if( !s.Readings.state )
      delete this.mappings.onOff.reading;
  }

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

  if( this.mappings.door )
    log( s.Internals.NAME + ' is door' );
  else if( this.mappings.garage )
    log( s.Internals.NAME + ' is garage' );
  else if( this.mappings.lock )
    log( s.Internals.NAME + ' is lock ['+ this.mappings.lock.reading +']' );
  else if( this.mappings.window )
    log( s.Internals.NAME + ' is window' );
  else if( this.mappings.blind )
    log( s.Internals.NAME + ' is blind ['+ this.mappings.blind.reading +']' );
  else if( this.mappings.thermostat )
    log( s.Internals.NAME + ' is thermostat ['+ this.mappings.thermostat.reading +']' );
  else if( this.mappings.contact )
    log( s.Internals.NAME + ' is contact sensor [' + this.mappings.contact.reading +']' );
  else if( this.mappings.occupancy )
    log( s.Internals.NAME + ' is occupancy sensor' );
  else if( this.mappings.rgb )
    log( s.Internals.NAME + ' has RGB [' + this.mappings.rgb.reading +']');
  else if( this.mappings.pct )
    log( s.Internals.NAME + ' is dimable ['+ this.mappings.pct.reading +']' );
  else if( s.hasDim )
    log( s.Internals.NAME + ' is dimable [0-'+ s.pctMax +']' );
  else if( s.isLight )
    log( s.Internals.NAME + ' is light' );
  else if( this.mappings.onOff || s.isSwitch )
    log( s.Internals.NAME + ' is switchable' );
  else if( !this.mappings )
    return {};


  if( this.mappings.onOff )
    log( s.Internals.NAME + ' has onOff [' +  this.mappings.onOff.reading + ';' + this.mappings.onOff.cmdOn +',' + this.mappings.onOff.cmdOff + ']' );
  if( this.mappings.hue )
    log( s.Internals.NAME + ' has hue [0-' + this.mappings.hue.max +']' );
  if( this.mappings.sat )
    log( s.Internals.NAME + ' has sat [0-' + this.mappings.sat.max +']' );
  if( this.mappings.temperature )
    log( s.Internals.NAME + ' has temperature ['+ this.mappings.temperature.reading +']' );
  if( this.mappings.humidity )
    log( s.Internals.NAME + ' has humidity ['+ this.mappings.humidity.reading +']' );
  if( this.mappings.airquality )
    log( s.Internals.NAME + ' has voc ['+ this.mappings.airquality.reading +']' );
  if( this.mappings.motor )
    log( s.Internals.NAME + ' has motor' );
  if( this.mappings.direction )
    log( s.Internals.NAME + ' has direction' );

//log( util.inspect(s) );

  // device info
  this.name		= s.Internals.NAME;
  this.alias		= s.Attributes.alias ? s.Attributes.alias : s.Internals.NAME;
  this.device		= s.Internals.NAME;
  this.type             = s.Internals.TYPE;
  this.model            = s.Readings.model ? s.Readings.model.Value
                                           : (s.Attributes.model ? s.Attributes.model
                                                                 : ( s.Internals.model ? s.Internals.model : '<unknown>' ) );
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

  this.hasDim   = s.hasDim;
  this.pctMax   = s.pctMax;

  this.isLight           = s.isLight;
  this.isSwitch          = s.isSwitch;

//log( util.inspect(s.Readings) );

  if( this.mappings.blind || this.mappings.door || this.mappings.garage || this.mappings.window || this.mappings.thermostat )
    delete this.mappings.onOff;

  var that = this;
  Object.keys(this.mappings).forEach(function(key) {
    var reading = that.mappings[key].reading;
    if( s.Readings[reading] && s.Readings[reading].Value ) {
      var value = s.Readings[reading].Value;
      value = that.reading2homekit(reading, value);

      if( value != undefined ) {
        var inform_id = that.device +'-'+ reading;
        that.mappings[key].informId = inform_id;

        if( !that.mappings[key].nocache )
          FHEM_cached[inform_id] = value;
      }
    }
  } );

  this.log        = log;
  this.connection = connection;
}

FHEM_dim_values = [ 'dim06%', 'dim12%', 'dim18%', 'dim25%', 'dim31%', 'dim37%', 'dim43%', 'dim50%', 'dim56%', 'dim62%', 'dim68%', 'dim75%', 'dim81%', 'dim87%', 'dim93%' ];

FHEMAccessory.prototype = {
  reading2homekit: function(reading,value) {
    if( value == undefined )
      return undefined;

    if( reading == 'hue' ) {
      value = Math.round(value * 360 / this.mappings.hue ? this.mappings.hue.max : 360);

    } else if( reading == 'sat' ) {
      value = Math.round(value * 100 / this.mappings.sat ? this.mappings.sat.max : 100);

    } else if( reading == 'pct' ) {
      value = parseInt( value );

    } else if(reading == 'motor') {
      if( value.match(/^up/))
        value = Characteristic.PositionState.INCREASING;
      else if( value.match(/^down/))
        value = Characteristic.PositionState.DECREASING;
      else
        value = Characteristic.PositionState.STOPPED;

    } else if(reading == 'direction') {
      if( value.match(/^opening/))
        value = PositionState.INCREASING;
      else if( value.match(/^closing/))
        value = Characteristic.PositionState.DECREASING;
      else
        value = Characteristic.PositionState.STOPPED;

    } else if( reading == 'transportState' ) {
      if( value == 'PLAYING' )
        value = 1;
      else
        value = 0;

    } else if( reading == 'volume'
               || reading == 'Volume' ) {
      value = parseInt( value );

    } else if( reading == 'contact' ) {
        if( value.match( /^closed/ ) )
          value = Characteristic.ContactSensorState.CONTACT_DETECTED;
        else
          value = Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

    } else if( reading == 'Window' ) {
        if( value.match( /^Closed/ ) )
          value = Characteristic.ContactSensorState.CONTACT_DETECTED;
        else
          value = Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;

    } else if( reading == 'lock' ) {
        if( value.match( /uncertain/ ) )
          value = Characteristic.LockCurrentState.UNKNOWN;
        else if( value.match( /^locked/ ) )
          value = Characteristic.LockCurrentState.SECURED;
        else
          value = Characteristic.LockCurrentState.UNSECURED;

    } else if( reading == 'temperature'
               || reading == 'measured-temp'
               || reading == 'desired-temp'
               || reading == 'desiredTemperature' ) {
      value = parseFloat( value );

    } else if( reading == 'humidity' ) {
      value = parseInt( value );

    } else if( reading == 'voc' ) {
      value = parseInt( value );
      if( value > 1500 )
        Characteristic.AirQuality.POOR;
      else if( value > 1000 )
        Characteristic.AirQuality.INFERIOR;
      else if( value > 800 )
        Characteristic.AirQuality.FAIR;
      else if( value > 600 )
        Characteristic.AirQuality.GOOD;
      else if( value > 0 )
        Characteristic.AirQuality.EXCELLENT;
      else
        Characteristic.AirQuality.UNKNOWN;

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
      else if( value == 'present' )
        value = Characteristic.OccupancyDetected.OCCUPANCY_DETECTED;
      else if( value == 'absent' )
        value = Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
      else if( value == '000000' )
        value = 0;
      else if( value.match( /^[A-D]0$/ ) ) //FIXME: is handled by event_map now
        value = 0;
      else
        value = 1;

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
    if( c == 'identify' ) {
      if( this.type == 'HUEDevice' )
        cmd = "set " + this.device + "alert select";
      else
        cmd = "set " + this.device + " toggle; sleep 1; set "+ this.device + " toggle";

    } else if( c == 'set' ) {
      cmd = "set " + this.device + " " + value;

    } else if( c == 'volume' ) {
      cmd = "set " + this.device + " volume " + value;

    } else if( c == 'pct' ) {
      cmd = "set " + this.device + " pct " + value;

    } else if( c == 'dim' ) {
      //if( value < 3 )
      //  cmd = "set " + this.device + " off";
      //else
      if( value > 97 )
        cmd = "set " + this.device + " on";
      else
        cmd = "set " + this.device + " " + FHEM_dim_values[Math.round(value/6.25)];

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
          FHEM_update(this.device + '-hue', value, false );
          h = value / 360;
        } else if( c == 'S-rgb' ) {
          FHEM_update(this.device + '-sat', value, false );
          s = value / 100;
        } else if( c == 'B-rgb' ) {
          FHEM_update(this.device + '-bri', value, false );
          v = value / 100;
        }
        //this.log( this.name + ' new : [' + h + ',' + s + ',' + v + ']' );

        value = FHEM_hsv2rgb( h, s, v );
        //this.log( this.name + ' rgb : [' + value + ']' );
        cmd = "set " + this.device + " " + this.mappings.rgb.cmd + " " + value;

    } else if( c == 'hue' ) {
        value = Math.round(value * this.mappings.hue.max / 360);
        cmd = "set " + this.device + " hue " + value;

    } else if( c == 'sat' ) {
      value = value / 100 * this.mappings.sat.max;
      cmd = "set " + this.device + " sat " + value;

    } else if( c == 'targetTemperature' ) {
      cmd = "set " + this.device + " " + this.mappings.thermostat.cmd + " " + value;

    } else if( c == 'targetPosition' ) {
      if( this.mappings.window ) {
        if( value == 0 )
          value = 'lock';

        cmd = "set " + this.device + " " + this.mappings.window.cmd + " " + value;

      } else if( this.mappings.blind )
        cmd = "set " + this.device + " " + this.mappings.blind.cmd + " " + value;

      else
        this.log(this.name + " Unhandled command! cmd=" + c + ", value=" + value);

    } else {
      this.log(this.name + " Unhandled command! cmd=" + c + ", value=" + value);
      return;

    }

    this.execute(cmd);
  },

  execute: function(cmd,callback) {
    var url = encodeURI( this.connection.base_url + "/fhem?cmd=" + cmd + "&XHR=1");
    this.log( '  executing: ' + url );

    var that = this;
    this.connection.request.get( { url: url, gzip: true },
                 function(err, response, result) {
                   if( !err && response.statusCode == 200 ) {
                     if( callback )
                       callback( result );

                   } else {
                     that.log("There was a problem connecting to FHEM ("+ url +").");
                     if( response )
                       that.log( "  " + response.statusCode + ": " + response.statusMessage );

                   }

                 } ).on( 'error', function(err) {
                     that.log("There was a problem connecting to FHEM ("+ url +"):"+ err);

                 } );
  },

  query: function(reading, callback) {
    if( reading == undefined ) {
      if( callback != undefined )
        callback( 1 );
      return;
    }

    this.log("query: " + this.name + "-" + reading);

    var result = FHEM_cached[this.device + '-' + reading];
    if( result != undefined ) {
      this.log("  cached: " + result);
      if( callback != undefined )
        callback( undefined, result );
      return result;

    } else
      this.log("  not cached" );

    var query_reading = reading;
    if( reading == 'hue' && !this.mappings.hue && this.mappings.rgb ) {
      query_reading = this.mappings.rgb.reading;

    } else if( reading == 'sat' && !this.mappings.sat && this.mappings.rgb ) {
      query_reading = this.mappings.rgb.reading;

    } else if( reading == 'bri' && !this.mappings.pct && this.mappings.rgb ) {
      query_reading = this.mappings.rgb.reading;

    } else if( reading == 'pct' && !this.mappings.pct && this.hasDim ) {
      query_reading = 'state';

    } else if( reading == 'level' && this.mappings.window ) {
      query_reading = 'state';

    } else if( reading == 'lock' && this.mappings.lock ) {
      query_reading = 'state';

    }

    var cmd = '{ReadingsVal("'+this.device+'","'+query_reading+'","")}';

    var that = this;
    this.execute( cmd,
                  function(result) {
                    value = result.replace(/[\r\n]/g, "");
                    that.log("  value: " + value);

                    if( value == undefined )
                      return value;

                    if( reading != query_reading ) {
                      if( reading == 'pct'
                          && query_reading == 'state') {

                        if( match = value.match(/dim(\d+)%/ ) )
                          value = parseInt( match[1] );
                        else if( value == 'off' )
                          value = 0;
                        else
                          value = 100;

                      } else if( reading == 'level'
                                 && query_reading == 'state') {

                        if( match = value.match(/^(\d+)/ ) )
                          value = parseInt( match[1] );
                        else if( value == 'locked' )
                          value = 0;
                        else
                          value = 50;

                      } else if( reading == 'lock'
                                 && query_reading == 'state') {

                        if( value.match( /uncertain/ ) )
                          value = Characteristic.LockCurrentState.UNKNOWN;
                        else if( value.match( /^locked/ ) )
                          value = Characteristic.LockCurrentState.SECURED;
                        else
                          value = Characteristic.LockCurrentState.UNSECURED;

                      } else if(reading == 'hue' && query_reading == that.mappings.rgb) {
                        //FHEM_update( that.device+'-'+query_reading, value );

                        value = parseInt( FHEM_rgb2hsv(value)[0] * 360 );

                      } else if(reading == 'sat' && query_reading == that.mappings.rgb) {
                        //FHEM_update( that.device+'-'+query_reading, value );

                        value = parseInt( FHEM_rgb2hsv(value)[1] * 100 );

                      } else if(reading == 'bri' && query_reading == that.mappings.rgb) {
                        //FHEM_update( that.device+'-'+query_reading, value );

                        value = parseInt( FHEM_rgb2hsv(value)[2] * 100 );

                      }
                    } else {
                      value = that.reading2homekit(reading, value);
                    }

                    that.log("  mapped: " + value);
                    FHEM_update( that.device + '-' + reading, value, true );

                    if( callback != undefined ) {
                      if( value == undefined )
                        callback(1);
                      else
                        callback(undefined, value);
                    }

                    return value ;

                } );
  },

  createDeviceService: function() {
    var name = this.alias + 'xxx';

    if( this.isSwitch ) {
      this.log("  switch service for " + this.name)
      return new Service.Switch(name);
    } else if( this.mappings.garage ) {
      this.log("  garage door opener service for " + this.name)
      return new Service.GarageDoorOpener(name);
    } else if( this.mappings.window ) {
      this.log("  window service for " + this.name)
      return new Service.Window(name);
    } else if( this.mappings.blind ) {
      this.log("  window covering service for " + this.name)
      return new Service.WindowCovering(name);
    } else if( this.mappings.thermostat ) {
      this.log("  thermostat service for " + this.name)
      return new Service.Thermostat(name);
    } else if( this.mappings.contact ) {
      this.log("  contact sensor service for " + this.name)
      return new Service.ContactSensor(name);
    } else if( this.mappings.occupancy ) {
      this.log("  occupancy sensor service for " + this.name)
      return new Service.OccupancySensor(name);
    } else if( this.isLight || this.mappings.pct || this.mappings.hue || this.mappings.rgb ) {
      this.log("  lightbulb service for " + this.name)
      return new Service.Lightbulb(name);
    } else if( this.mappings.temperature ) {
      this.log("  temperature sensor service for " + this.name)
      return new Service.TemperatureSensor(name);
    } else if( this.mappings.humidity ) {
      this.log("  humidity sensor service for " + this.name)
      return new Service.HumiditySensor(name);
    } else if( this.mappings.airquality ) {
      this.log("  humidity sensor service for " + this.name)
      return new Service.AirQualitySensor(name);
    }

    this.log("  switch service for " + this.name)
    return new Service.Switch(name);
  },

  identify: function(callback) {
    this.log('['+this.name+'] identify requested!');
    if( match = this.PossibleSets.match(/[\^ ]toggle\b/) ) {
      this.command( 'identify' );
    }
    callback();
  },

  getServices: function() {
    this.log("creating services for " + this.name)

    this.log("  information service for " + this.name)
    var informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "FHEM:"+this.type)
      .setCharacteristic(Characteristic.Model, "FHEM:"+this.model ? this.model : '<unknown>')
      .setCharacteristic(Characteristic.SerialNumber, this.serial ? this.serial : '<unknown>');

    var controlService = this.createDeviceService();

    var that = this;
    if( this.mappings.onOff ) {
      this.log("    power characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.On);

      FHEM_subscribe(characteristic, that.mappings.onOff.informId, that);
      if( FHEM_cached[that.mappings.onOff.informId] != undefined )
        characteristic.value = FHEM_cached[that.mappings.onOff.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.command( 'set', value == 0 ? that.mappings.onOff.cmdOff : that.mappings.onOff.cmdOn );
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query(that.mappings.onOff.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.pct ) {
      this.log("    brightness characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Brightness);

      FHEM_subscribe(characteristic, that.mappings.pct.informId, that);
      if( FHEM_cached[that.mappings.pct.informId] != undefined )
        characteristic.value = FHEM_cached[that.mappings.pct.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.command('pct', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query(that.mappings.pct.reading, callback);
                   }.bind(this) );

    } else if( this.hasDim ) {
      this.log("    fake brightness characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Brightness);

      FHEM_subscribe(characteristic, that.name+'-pct', that);
      characteristic.value = 0;
      characteristic.maximumValue = this.pctMax;

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.delayed('dim', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query('pct', callback);
                   }.bind(this) );

    }

    if( that.mappings.hue ) {
      this.log("    hue characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Hue);

      FHEM_subscribe(characteristic, that.mappings.hue.informId, that);
      if( FHEM_cached[that.mappings.hue.informId] != undefined )
        characteristic.value = FHEM_cached[that.mappings.hue.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.command('hue', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query(that.mappings.hue.reading, callback);
                   }.bind(this) );

    } else if( this.mappings.rgb ) {
      this.log("    fake hue characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Hue);

      FHEM_subscribe(characteristic, that.name+'-hue', that);
      FHEM_subscribe(characteristic, that.mappings.rgb.informId, that);
      characteristic.value = 0;

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.command('H-rgb', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query('hue', callback);
                   }.bind(this) );

      if( !this.mappings.sat ) {
        this.log("    fake saturation characteristic for " + this.name)

        var characteristic = controlService.addCharacteristic(Characteristic.Saturation);

        FHEM_subscribe(characteristic, that.name+'-sat', that);
        characteristic.value = 100;

        characteristic
          .on('set', function(value, callback, context) {
                       if( context !== 'fromFhem' )
                         that.command('S-rgb', value);
                       callback();
                     }.bind(this) )
          .on('get', function(callback) {
                       that.query('sat', callback);
                     }.bind(this) );
      }

      if( !this.mappings.pct ) {
        this.log("    fake brightness characteristic for " + this.name)

        var characteristic = controlService.addCharacteristic(Characteristic.Brightness);

        FHEM_subscribe(characteristic, that.name+'-bri', that);
        characteristic.value = 0;

        characteristic
          .on('set', function(value, callback, context) {
                       if( context !== 'fromFhem' )
                         that.command('B-rgb', value);
                       callback();
                     }.bind(this) )
          .on('get', function(callback) {
                       that.query('bri', callback);
                     }.bind(this) );
      }

    }

    if( this.mappings.sat ) {
      this.log("    saturation characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Saturation);

      FHEM_subscribe(characteristic, that.mappings.sat.informId, that);
      if( FHEM_cached[that.mappings.sat.informId] != undefined )
        characteristic.value = FHEM_cached[that.mappings.sat.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.command('sat', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query(that.mappings.sat.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.volume ) {
      this.log("    custom volume characteristic for " + this.name)

      var characteristic = new Characteristic('Volume', '00000027-0000-1000-8000-0026BB765291'); // FIXME!!!
      controlService.addCharacteristic(characteristic);

      if( !that.mappings.volume.nocache ) {
        FHEM_subscribe(characteristic, that.mappings.volume.informId, that);
        characteristic.value = FHEM_cached[that.mappings.volume.informId];
      } else {
        characteristic.value = 10;
      }

      characteristic.format = 'uint8';
      characteristic.unit = 'percentage';
      characteristic.maximumValue = 100;
      characteristic.minimumValue = 0;
      characteristic.stepValue = 1;
      characteristic.readable = true;
      characteristic.writable = true;
      characteristic.supportsEventNotification = true;

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.delayed('volume', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query(that.mappings.volume.reading, callback);
                   }.bind(this) );

    }

    if( this.mappings.blind ) {
      this.log("    current position characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.CurrentPosition);

      FHEM_subscribe(characteristic, that.mappings.blind.informId, that);
      characteristic.value = FHEM_cached[that.mappings.blind.informId];

      characteristic
        .on('get', function(callback) {
                     that.query(that.mappings.blind.reading, callback);
                   }.bind(this) );


      this.log("    target position characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.TargetPosition);

      characteristic.value = FHEM_cached[that.mappings.blind.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.delayed('targetPosition', value, 1500);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query(that.mappings.blind.reading, callback);
                   }.bind(this) );


      this.log("    position state characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.PositionState);

      if( that.mappings.motor )
        FHEM_subscribe(characteristic, that.mappings.motor.informId, that);
      characteristic.value = that.mappings.motor?FHEM_cached[that.mappings.motor.informId]:Characteristic.PositionState.STOPPED;

      characteristic
        .on('get', function(callback) {
                     if( that.mappings.motor )
                       that.query(that.mappings.motor.reading, callback);
                   }.bind(this) );

    }

    if( this.mappings.window ) {
      this.log("    current position characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.CurrentPosition);

      FHEM_subscribe(characteristic, that.name+'-state', that);
      FHEM_subscribe(characteristic, that.mappings.window.informId, that);
      characteristic.value = FHEM_cached[that.mappings.window.informId];

      characteristic
        .on('get', function(callback) {
                     that.query(that.mappings.window.reading, callback);
                   }.bind(this) );


      this.log("    target position characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.TargetPosition);

      characteristic.value = FHEM_cached[that.mappings.window.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.delayed('targetPosition', value, 1500);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query(that.mappings.window.reading, callback);
                   }.bind(this) );


      this.log("    position state characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.PositionState);

      if( that.mappings.direction )
        FHEM_subscribe(characteristic, that.mappings.direction.informId, that);
      characteristic.value = that.mappings.direction?FHEM_cached[that.mappings.direction.informId]:Characteristic.PositionState.STOPPED;

      characteristic
        .on('get', function(callback) {
                     if( that.mappings.direction )
                       that.query(that.mappings.direction.reading, callback);
                   }.bind(this) );

    }

    if( this.mappings.garage ) {
      this.log("    current door state characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.CurrentDoorState);

      characteristic.value = Characteristic.CurrentDoorState.STOPPED;

      characteristic
        .on('get', function(callback) {
                     callback(undefined, Characteristic.CurrentDoorState.STOPPED);
                   }.bind(this) );


      this.log("    target door state characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.TargetDoorState);

      characteristic.value = 1;

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.command( 'set', value == 0 ? that.mappings.garage.cmdOpen : that.mappings.garage.cmdClose );
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     callback(undefined,0);
                   }.bind(this) );


      this.log("    obstruction detected characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.ObstructionDetected);

      //FHEM_subscribe(characteristic, that.mappings.direction.informId, that);
      characteristic.value = 0;

      characteristic
        .on('get', function(callback) {
                       callback(undefined,1);
                   }.bind(this) );

    }

    if( this.mappings.temperature ) {
      this.log("    temperature characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.CurrentTemperature)
                           || controlService.addCharacteristic(Characteristic.CurrentTemperature);

      FHEM_subscribe(characteristic, that.mappings.temperature.informId, that);
      characteristic.value = FHEM_cached[that.mappings.temperature.informId];

      characteristic
        .on('get', function(callback) {
                     that.query(that.mappings.temperature.reading, callback);
                   }.bind(this) );

    }

    if( this.mappings.humidity ) {
      this.log("    humidity characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                           || controlService.addCharacteristic(Characteristic.CurrentRelativeHumidity);

      FHEM_subscribe(characteristic, that.mappings.humidity.informId, that);
      characteristic.value = FHEM_cached[that.mappings.humidity.informId];

      characteristic
        .on('get', function(callback) {
                     that.query(that.mappings.humidity.reading, callback);
                   }.bind(this) );

    }

    if( this.mappings.airquality ) {
      this.log("    air quality characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.AirQuality)
                           || controlService.addCharacteristic(Characteristic.AirQuality);

      FHEM_subscribe(characteristic, that.mappings.airquality.informId, that);
      characteristic.value = FHEM_cached[that.mappings.airquality.informId];

      characteristic
        .on('get', function(callback) {
                     that.query(that.mappings.airquality.reading, callback);
                   }.bind(this) );
    }


    //FIXME: parse range and set designedMinValue & designedMaxValue & designedMinStep
    if( this.mappings.thermostat ) {
      this.log("    target temperature characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.TargetTemperature);

      FHEM_subscribe(characteristic, that.mappings.thermostat.informId, that);
      characteristic.value = FHEM_cached[that.mappings.thermostat.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFhem' )
                       that.delayed('targetTemperature', value, 1500);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     that.query(that.mappings.thermostat.reading, callback);
                   }.bind(this) );

    }

    if( this.mappings.contact ) {
      this.log("    contact sensor characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.ContactSensorState);

      FHEM_subscribe(characteristic, that.mappings.contact.informId, that);
      characteristic.value = FHEM_cached[that.mappings.contact.informId];

      characteristic
        .on('get', function(callback) {
                     that.query(that.mappings.contact.reading, callback);
                   }.bind(this) );

    }

    if( this.mappings.occupancy ) {
      this.log("    occupancy detected characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.OccupancyDetected);

      FHEM_subscribe(characteristic, that.mappings.occupancy.informId, that);
      characteristic.value = FHEM_cached[that.mappings.occupancy.informId];

      characteristic
        .on('get', function(callback) {
                     that.query(that.mappings.occupancy.reading, callback);
                   }.bind(this) );

    }

    return [informationService, controlService];
  }

};

//module.exports.accessory = FHEMAccessory;
module.exports.platform = FHEMPlatform;



//http server for debugging
var http = require('http');

const FHEMdebug_PORT=8081;

function FHEMdebug_handleRequest(request, response){
  //console.log( request );

  if( request.url == "/cached" ) {
    response.write( "<a href='/'>home</a><br><br>" );
    if( FHEM_lastEventTime )
      response.write( "FHEM_lastEventTime: "+ new Date(FHEM_lastEventTime) +"<br><br>" );
    response.end( "cached: " + util.inspect(FHEM_cached).replace(/\n/g, '<br>') );

  } else if( request.url == "/subscriptions" ) {
    response.write( "<a href='/'>home</a><br><br>" );
    response.end( "subscriptions: " + util.inspect(FHEM_subscriptions, {depth: 4}).replace(/\n/g, '<br>') );

  } else
    response.end( "<a href='/cached'>cached</a><br><a href='/subscriptions'>subscriptions</a>" );
}

var FHEMdebug_server = http.createServer( FHEMdebug_handleRequest );

FHEMdebug_server.on('error', function (e) {
  console.log("Server error: " + e);
});

//Lets start our server
FHEMdebug_server.listen(FHEMdebug_PORT, function(){
    console.log("Server listening on: http://<ip>:%s", FHEMdebug_PORT);
});

