// FHEM Platform Shim for HomeBridge
// current version on https://github.com/justme-1968/homebridge
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

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;


var util = require('util');


// subscriptions to fhem longpoll evens
var FHEM_subscriptions = {};
function
FHEM_subscribe(characteristic, inform_id, accessory) {
  FHEM_subscriptions[inform_id] = { 'characteristic': characteristic, 'accessory': accessory };
}

function
FHEM_isPublished(device) {
  var keys = Object.keys(FHEM_subscriptions);
  for( var i = 0; i < keys.length; i++ ) {
    var key = keys[i];

    var subscription = FHEM_subscriptions[key];
    var accessory = subscription.accessory;

    if( accessory.device === device )
      return true;
  };

  return false;
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
      subscription.characteristic.setValue(value, undefined, 'fromFHEM');
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

                     } else if( reading == 'activity') {

                       FHEM_update( device+'-'+reading, value, true );

                       Object.keys(FHEM_subscriptions).forEach(function(key) {
                         var parts = key.split( '-', 3 );
                         if( parts[0] != '#' + device )
                           return;
                         if( parts[1] != reading )
                           return;

                         var subscription = FHEM_subscriptions[key];
                         var accessory = subscription.accessory;

                         var activity = parts[2];

                         subscription.characteristic.setValue(value==activity?1:0, undefined, 'fromFHEM');
                       } );

                       continue;

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

                     } else if(accessory.mappings.colormode) {
                       //FIXME: add colormode ct
                       if( reading == 'xy') {
                         var xy = value.split(',');
                         var rgb = FHEM_xyY2rgb(xy[0], xy[1] , 1);
                         var hsv = FHEM_rgb2hsv(rgb);
                         var hue = parseInt( hsv[0] * 360 );
                         var sat = parseInt( hsv[1] * 100 );
                         var bri = parseInt( hsv[2] * 100 );

                         FHEM_update( device+'-hue', hue );
                         FHEM_update( device+'-sat', sat );
                         FHEM_update( device+'-bri', bri );
                       }

                       FHEM_update( device+'-'+reading, value, false );
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
FHEM_ct2rgb(ct)
{
  // calculation from http://www.tannerhelland.com/4435/convert-temperature-rgb-algorithm-code
  // adjusted by 1000K
  var temp = (1000000/ct)/100 + 10;

  var r = 0;
  var g = 0;
  var b = 0;

  r = 255;
  if( temp > 66 )
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
  if( r < 0 )
    r = 0;
  if( r > 255 )
    r = 255;

  if( temp <= 66 )
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  else
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  if( g < 0 )
    g = 0;
  if( g > 255 );
    g = 255;

  b = 255;
  if( temp <= 19 )
    b = 0;
  if( temp < 66 )
    b = 138.5177312231 * log(temp-10) - 305.0447927307;
  if( b < 0 )
    b = 0;
  if( b > 255 )
    b = 255;

  return FHEM_rgb2hex( Math.round(r*255),Math.round(g*255),Math.round(b*255) );
}

function
FHEM_xyY2rgb(x,y,Y)
{
  // calculation from http://www.brucelindbloom.com/index.html

  var r = 0;
  var g = 0;
  var b = 0;

  if( y > 0 ) {
    var X = x * Y / y;
    var Z = (1 - x - y)*Y / y;

    if( X > 1
        || Y > 1
        || Z > 1 ) {
      var f = Math.max(X,Y,Z);
      X /= f;
      Y /= f;
      Z /= f;
    }

    r =  0.7982 * X + 0.3389 * Y - 0.1371 * Z;
    g = -0.5918 * X + 1.5512 * Y + 0.0406 * Z;
    b =  0.0008 * X + 0.0239 * Y + 0.9753 * Z;

    if( r > 1
        || g > 1
        || b > 1 ) {
      var f = Math.max(r,g,b);
      r /= f;
      g /= f;
      b /= f;
    }

    r *= 255;
    g *= 255;
    b *= 255;
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

    this.connection.request.get( { url: url, json: true, gzip: true },
                 function(err, response, json) {
                   if( !err && response.statusCode == 200 ) {
                     this.log( 'got: ' + json['totalResultsReturned'] + ' results' );
//this.log("got json: " + util.inspect(json) );
                     if( json['totalResultsReturned'] ) {
                       var sArray=FHEM_sortByKey(json['Results'],"Name");
                       sArray.map(function(s) {

                         var accessory;
                         if( FHEM_isPublished(s.Internals.NAME) )
                           this.log( s.Internals.NAME + ' is already published');

                         else if( s.Attributes.disable == 1 ) {
                           this.log( s.Internals.NAME + ' is disabled');

                         } else if( s.Internals.TYPE == 'structure' ) {
                           this.log( 'ignoring structure ' + s.Internals.NAME );

                         } else if( s.Attributes.genericDisplayType
                                    || s.Attributes.genericDeviceType ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.PossibleSets.match(/(^| )on\b/)
                                    && s.PossibleSets.match(/(^| )off\b/) ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.Attributes.subType == 'thermostat'
                                    || s.Attributes.subType == 'blindActuator'
                                    || s.Attributes.subType == 'threeStateSensor' ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.Attributes.model == 'HM-SEC-WIN' ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.Attributes.model == 'HM-SEC-KEY' ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.Internals.TYPE == 'PRESENCE' ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.Internals.TYPE == 'SONOSPLAYER' ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.Readings.temperature ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.Readings.humidity ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.Readings.voc ) {
                           accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else if( s.Internals.TYPE == 'harmony' ) {
                             accessory = new FHEMAccessory(this.log, this.connection, s);

                         } else {
                           this.log( 'ignoring ' + s.Internals.NAME + ' (' + s.Internals.TYPE + ')' );

                         }

                         if( accessory && Object.getOwnPropertyNames(accessory).length )
                           foundAccessories.push(accessory);

                       }.bind(this) );
                     }

                     callback(foundAccessories);
                     //callbackLater();

                   } else {
                     this.log("There was a problem connecting to FHEM (1).");
                     if( response )
                       this.log( "  " + response.statusCode + ": " + response.statusMessage );

                   }

                 }.bind(this) );
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
    this.log( s.Internals.NAME + ' is disabled');
    return null;

  } else if( s.Internals.TYPE == 'structure' ) {
    this.log( 'ignoring structure ' + s.Internals.NAME );
    return null;

  }


  this.mappings = {};

  var match;
  if( match = s.PossibleSets.match(/(^| )pct\b/) ) {
    this.mappings.pct = { reading: 'pct', cmd: 'pct' };
  } else if( match = s.PossibleSets.match(/(^| )dim\d+%/) ) {
    s.hasDim = true;
    s.pctMax = 100;
  }
  if( match = s.PossibleSets.match(/(^| )hue[^\b\s]*(,(\d+)?)+\b/) ) {
    s.isLight = true;
    var max = 360;
    if( match[3] != undefined )
      max = match[3];
    this.mappings.hue = { reading: 'hue', cmd: 'hue', min: 0, max: max };
  }
  if( match = s.PossibleSets.match(/(^| )sat[^\b\s]*(,(\d+)?)+\b/) ) {
    s.isLight = true;
    var max = 100;
    if( match[3] != undefined )
      max = match[3];
    this.mappings.sat = { reading: 'sat', cmd: 'sat', min: 0, max: max };
  }

  if( s.Readings.colormode )
    this.mappings.colormode = { reading: 'colormode' };
  if( s.Readings.xy )
    this.mappings.xy = { reading: 'xy' };
  //FIXME: add ct/colortemperature

  if( s.PossibleSets.match(/(^| )rgb\b/) ) {
    s.isLight = true;
    this.mappings.rgb = { reading: 'rgb', cmd: 'rgb' };
    if( s.Internals.TYPE == 'SWAP_0000002200000003' )
      this.mappings.rgb = { reading: '0B-RGBlevel', cmd: 'rgb' };
  } else if( s.PossibleSets.match(/(^| )RGB\b/) ) {
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

  if( s.Readings.battery )
    this.mappings.battery = { reading: 'battery' };

  if( s.Readings.direction )
    this.mappings.direction = { reading: 'direction' };


  var genericType = s.Attributes.genericDeviceType;
  if( !genericType )
    genericType = s.Attributes.genericDisplayType;

  if( genericType == 'ignore' )
    return null;

  else if( genericType == 'switch' )
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

  } else if( s.Internals.TYPE == 'MAX'
             && s.Internals.type == 'ShutterContact' ) {
    this.mappings.contact = { reading: 'state' };

  } else if( s.Attributes.subType == 'threeStateSensor' ) {
    this.mappings.contact = { reading: 'contact' };

  } else if( s.Internals.TYPE == 'PRESENCE' )
    this.mappings.occupancy = { reading: 'state' };

  else if( s.Attributes.model == 'fs20di' )
    s.isLight = true;

  //if( s.PossibleSets.match(/(^| )desired-temp\b/) ) {
  if( match = s.PossibleSets.match(/(^| )desired-temp(:[^\d]*([^\$ ]*))?/) ) {
    this.mappings.thermostat = { reading: 'desired-temp', cmd: 'desired-temp' };

    if( s.Readings.controlMode )
      this.mappings.thermostat_mode = { reading: 'controlMode', cmd: 'controlMode' };

    if( match[3] ) {
      var values = match[3].split(',');
      this.mappings.thermostat.min = parseFloat(values[0]);
      this.mappings.thermostat.max = parseFloat(values[values.length-1]);
      this.mappings.thermostat.step = values[1] - values[0];
    }

  //} else if( s.PossibleSets.match(/(^| )desiredTemperature\b/) ) {
  } else if( match = s.PossibleSets.match(/(^| )desiredTemperature(:[^\d]*([^\$ ]*))?/) ) {
    this.mappings.thermostat = { reading: 'desiredTemperature', cmd: 'desiredTemperature' };
    if( s.Readings.mode )
      this.mappings.thermostat_mode = { reading: 'mode', cmd: 'desiredTemperature' };

    if( match[3] ) {
      var values = match[3].split(',');
      this.mappings.thermostat.min = values[0];
      this.mappings.thermostat.max = values[values.length-2];
      this.mappings.thermostat.step = values[1] - values[0];
    }

  } else if( s.isThermostat ) {
    s.isThermostat = false;
    delete this.mappings.thermostat;
    log( s.Internals.NAME + ' is NOT a thermostat. set for target temperature missing' );

  }

  if( s.Internals.TYPE == 'SONOSPLAYER' ) //FIXME: use sets [Pp]lay/[Pp]ause/[Ss]top
    this.mappings.onOff = { reading: 'transportState', cmdOn: 'play', cmdOff: 'pause' };

  else if( s.Internals.TYPE == 'harmony' ) {
    if( s.Internals.id != undefined ) {
      if( s.Attributes.genericDeviceType )
        this.mappings.onOff = { reading: 'power', cmdOn: 'on', cmdOff: 'off' };
      else
        return null;

    } else
      this.mappings.onOff = { reading: 'activity', cmdOn: 'activity', cmdOff: 'off' };

  } else if( s.PossibleSets.match(/(^| )on\b/)
           && s.PossibleSets.match(/(^| )off\b/) ) {
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
    log( s.Internals.NAME + ' is thermostat ['+ this.mappings.thermostat.reading + ';' + this.mappings.thermostat.min + '-' + this.mappings.thermostat.max + ':' + this.mappings.thermostat.step +']' );
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
    log( s.Internals.NAME + ' has hue [' + this.mappings.hue.reading + ';0-' + this.mappings.hue.max +']' );
  if( this.mappings.sat )
    log( s.Internals.NAME + ' has sat [' + this.mappings.sat.reading + ';0-' + this.mappings.sat.max +']' );
  if( this.mappings.colormode )
    log( s.Internals.NAME + ' has colormode [' + this.mappings.colormode.reading +']' );
  if( this.mappings.xy )
    log( s.Internals.NAME + ' has xy [' + this.mappings.xy.reading +']' );
  if( this.mappings.thermostat_mode )
    log( s.Internals.NAME + ' has thermostat mode ['+ this.mappings.thermostat_mode.reading + ';' + this.mappings.thermostat_mode.cmd +']' );
  if( this.mappings.temperature )
    log( s.Internals.NAME + ' has temperature ['+ this.mappings.temperature.reading +']' );
  if( this.mappings.humidity )
    log( s.Internals.NAME + ' has humidity ['+ this.mappings.humidity.reading +']' );
  if( this.mappings.airquality )
    log( s.Internals.NAME + ' has voc ['+ this.mappings.airquality.reading +']' );
  if( this.mappings.motor )
    log( s.Internals.NAME + ' has motor ['+ this.mappings.motor.reading +']' );
  if( this.mappings.battery )
    log( s.Internals.NAME + ' has battery ['+ this.mappings.battery.reading +']' );
  if( this.mappings.direction )
    log( s.Internals.NAME + ' has direction ['+ this.mappings.direction.reading +']' );
  if( this.mappings.volume )
    log( s.Internals.NAME + ' has volume ['+ this.mappings.volume.reading + ':' + (this.mappings.volume.nocache ? 'not cached' : 'cached' )  +']' );

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

  Object.keys(this.mappings).forEach(function(key) {
    var reading = this.mappings[key].reading;
    if( s.Readings[reading] && s.Readings[reading].Value ) {
      var value = s.Readings[reading].Value;
      value = this.reading2homekit(reading, value);

      if( value != undefined ) {
        var inform_id = this.device +'-'+ reading;
        this.mappings[key].informId = inform_id;

        if( !this.mappings[key].nocache )
          FHEM_cached[inform_id] = value;
      }
    }
  }.bind(this) );

  this.log        = log;
  this.connection = connection;
}

FHEM_dim_values = [ 'dim06%', 'dim12%', 'dim18%', 'dim25%', 'dim31%', 'dim37%', 'dim43%', 'dim50%', 'dim56%', 'dim62%', 'dim68%', 'dim75%', 'dim81%', 'dim87%', 'dim93%' ];

FHEMAccessory.prototype = {
  reading2homekit: function(reading,value) {
    if( value == undefined )
      return undefined;

    if( reading == 'hue' ) {
      value = Math.round(value * 360 / (this.mappings.hue ? this.mappings.hue.max : 360) );

    } else if( reading == 'sat' ) {
      value = Math.round(value * 100 / (this.mappings.sat ? this.mappings.sat.max : 100) );

    } else if( reading == 'pct' ) {
      value = parseInt( value );

    } else if(reading == 'motor') {
      if( value.match(/^up/))
        value = Characteristic.PositionState.INCREASING;
      else if( value.match(/^down/))
        value = Characteristic.PositionState.DECREASING;
      else
        value = Characteristic.PositionState.STOPPED;

    } else if(reading == 'controlMode') {
      if( value.match(/^auto/))
        value = Characteristic.TargetHeatingCoolingState.AUTO;
      else if( value.match(/^manu/))
        value = Characteristic.TargetHeatingCoolingState.HEAT;
      else
        value = Characteristic.TargetHeatingCoolingState.OFF;

    } else if(reading == 'mode') {
      if( value.match(/^auto/))
        value = Characteristic.TargetHeatingCoolingState.AUTO;
      else
        value = Characteristic.TargetHeatingCoolingState.HEAT;

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

      if( this.mappings.thermostat
          && reading == this.mappings.thermostat.reading ) {
        if( value < this.mappings.thermostat.min )
          value = this.mappings.thermostat.min;
        else if( value > this.mappings.thermostat.max )
          value = this.mappings.thermostat.min;

        value = Math.round(value / this.mappings.thermostat.step) * this.mappings.thermostat.step;
      }

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

    } else if( reading == 'battery' ) {
      if( value == 'ok' )
        value = Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      else
        value = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;

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
      else if( value == 'opened' )
        value = Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
      else if( value == 'closed' )
        value = Characteristic.ContactSensorState.CONTACT_DETECTED;
      else if( value == 'present' )
        value = Characteristic.OccupancyDetected.OCCUPANCY_DETECTED;
      else if( value == 'absent' )
        value = Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
      else if( value == '000000' )
        value = 0;
      else if( value.match( /^[A-D]0$/ ) ) //FIXME: not necessary any more. handled by event_map now.
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
    this.delayed[c] = setTimeout( function(){clearTimeout(this.delayed[c]); this.command(c,value);}.bind(this),
                                  delay?delay:1000 );
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

    } else if( c == 'targetMode' ) {
      var set = this.mappings.thermostat_mode.cmd;
      if( value == Characteristic.TargetHeatingCoolingState.OFF ) {
        value = 'off'
        if( this.mappings.thermostat_mode.cmd == 'controlMode' )
          set = 'desired-temp';

      } else if( value == Characteristic.TargetHeatingCoolingState.AUTO ) {
        value = 'auto'

      }else {
        if( this.mappings.thermostat_mode == 'controlMode' )
          value = 'manu';
        else {
          value = FHEM_cached[this.mappings.thermostat.informId];
          set = 'desired-temp';
        }

      }
      cmd = "set " + this.device + " " + set + " " + value;

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

    this.connection.request
                     .get( { url: url, gzip: true },
                           function(err, response, result) {
                             if( !err && response.statusCode == 200 ) {
                               if( callback )
                                 callback( result );

                             } else {
                               this.log("There was a problem connecting to FHEM ("+ url +").");
                               if( response )
                                 this.log( "  " + response.statusCode + ": " + response.statusMessage );

                             }

                           }.bind(this) )
                     .on( 'error', function(err) { this.log("There was a problem connecting to FHEM ("+ url +"):"+ err); }.bind(this) );
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

    this.execute( cmd,
                  function(result) {
                    value = result.replace(/[\r\n]/g, "");
                    this.log("  value: " + value);

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

                      } else if(reading == 'hue' && query_reading == this.mappings.rgb) {
                        //FHEM_update( this.device+'-'+query_reading, value );

                        value = parseInt( FHEM_rgb2hsv(value)[0] * 360 );

                      } else if(reading == 'sat' && query_reading == this.mappings.rgb) {
                        //FHEM_update( this.device+'-'+query_reading, value );

                        value = parseInt( FHEM_rgb2hsv(value)[1] * 100 );

                      } else if(reading == 'bri' && query_reading == this.mappings.rgb) {
                        //FHEM_update( this.device+'-'+query_reading, value );

                        value = parseInt( FHEM_rgb2hsv(value)[2] * 100 );

                      }
                    } else {
                      value = this.reading2homekit(reading, value);
                    }

                    this.log("  mapped: " + value);
                    FHEM_update( this.device + '-' + reading, value, true );

                    if( callback != undefined ) {
                      if( value == undefined )
                        callback(1);
                      else
                        callback(undefined, value);
                    }

                    return value ;

                }.bind(this) );
  },

  createDeviceService: function(subtype) {
    var name = this.alias + ' (' + this.name + ')';
    if( subtype )
      name = subtype + ' (' + this.name + ')';

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

    this.log("  switch service for " + this.name + ' (' + subtype + ')' )
    return new Service.Switch(name, subtype);
  },

  identify: function(callback) {
    this.log('['+this.name+'] identify requested!');
    if( match = this.PossibleSets.match(/(^| )toggle\b/) ) {
      this.command( 'identify' );
    }
    callback();
  },

  getServices: function() {
    var services = [];

    this.log("creating services for " + this.name)

    this.log("  information service for " + this.name)
    var informationService = new Service.AccessoryInformation();
    services.push( informationService );

    informationService
      .setCharacteristic(Characteristic.Manufacturer, "FHEM:"+this.type)
      .setCharacteristic(Characteristic.Model, "FHEM:"+ (this.model ? this.model : '<unknown>') )
      .setCharacteristic(Characteristic.SerialNumber, this.serial ? this.serial : '<unknown>');


    // FIXME: allow multiple switch characteristics also for other types. check if this.mappings.onOff an array.
    if( this.type == 'harmony'
        && this.mappings.onOff.reading == 'activity' ) {

      FHEM_subscribe(undefined, this.mappings.onOff.informId, this);

      var match;
      if( match = this.PossibleSets.match(/(^| )activity:([^\s]*)/) ) {
        var activities = match[2].split(',');
        for( var i = 0; i < activities.length; i++ ) {
          var activity = activities[i];

          var controlService = this.createDeviceService(activity);
          services.push( controlService );

          this.log("      power characteristic for " + this.name + ' ' + activity);

          var characteristic = controlService.getCharacteristic(Characteristic.On);

          FHEM_subscribe(characteristic, '#' + this.device + '-' + this.mappings.onOff.reading + '-' + activity, this);

          characteristic.value = (FHEM_cached[this.mappings.onOff.informId]==activity?1:0);

          characteristic
            .on('set', function(activity, value, callback, context) {
                         if( context !== 'fromFHEM' )
                           this.command( 'set', value == 0 ? this.mappings.onOff.cmdOff : this.mappings.onOff.cmdOn + ' ' + activity );
                         callback();
                       }.bind(this, activity) )
            .on('get', function(activity, callback) {
                         var result = this.query(this.mappings.onOff.reading);
                         callback( undefined, result==activity?1:0 );
                       }.bind(this, activity) );
          }
      }

      return services;
    }

    if( this.mappings.xy
        && this.mappings.colormode ) {
      FHEM_subscribe(undefined, this.mappings.xy.informId, this);
      FHEM_subscribe(undefined, this.mappings.colormode.informId, this);


      //FIXME: add colormode ct
      if( FHEM_cached[this.mappings.colormode.informId] == 'xy' ) {
        var value = FHEM_cached[this.mappings.xy.informId];
        var xy = value.split(',');
        var rgb = FHEM_xyY2rgb(xy[0], xy[1] , 1);
        var hsv = FHEM_rgb2hsv(rgb);
        var hue = parseInt( hsv[0] * 360 );
        var sat = parseInt( hsv[1] * 100 );
        var bri = parseInt( hsv[2] * 100 );

        //FHEM_update( device+'-'+reading, value, false );
        FHEM_update( this.device+'-hue', hue );
        FHEM_update( this.device+'-sat', sat );
        FHEM_update( this.device+'-bri', bri );
      }
    }

    var controlService = this.createDeviceService();
    services.push( controlService );

    if( this.mappings.onOff ) {
      this.log("    power characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.On);

      FHEM_subscribe(characteristic, this.mappings.onOff.informId, this);

      if( FHEM_cached[this.mappings.onOff.informId] != undefined )
        characteristic.value = FHEM_cached[this.mappings.onOff.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.command( 'set', value == 0 ? this.mappings.onOff.cmdOff : this.mappings.onOff.cmdOn );
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query(this.mappings.onOff.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.pct ) {
      this.log("    brightness characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Brightness);

      FHEM_subscribe(characteristic, this.mappings.pct.informId, this);
      if( FHEM_cached[this.mappings.pct.informId] != undefined )
        characteristic.value = FHEM_cached[this.mappings.pct.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.command('pct', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query(this.mappings.pct.reading, callback);
                   }.bind(this) );

    } else if( this.hasDim ) {
      this.log("    fake brightness characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Brightness);

      FHEM_subscribe(characteristic, this.name+'-pct', this);
      characteristic.value = 0;
      characteristic.maximumValue = this.pctMax;

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.delayed('dim', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query('pct', callback);
                   }.bind(this) );
    }

    if( this.mappings.hue ) {
      this.log("    hue characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Hue);

      FHEM_subscribe(characteristic, this.mappings.hue.informId, this);
      if( FHEM_cached[this.mappings.hue.informId] != undefined )
        characteristic.value = FHEM_cached[this.mappings.hue.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.command('hue', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query(this.mappings.hue.reading, callback);
                   }.bind(this) );

    } else if( this.mappings.rgb ) {
      this.log("    fake hue characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Hue);

      FHEM_subscribe(characteristic, this.name+'-hue', this);
      FHEM_subscribe(characteristic, this.mappings.rgb.informId, this);
      characteristic.value = 0;

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.command('H-rgb', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query('hue', callback);
                   }.bind(this) );

      if( !this.mappings.sat ) {
        this.log("    fake saturation characteristic for " + this.name)

        var characteristic = controlService.addCharacteristic(Characteristic.Saturation);

        FHEM_subscribe(characteristic, this.name+'-sat', this);
        characteristic.value = 100;

        characteristic
          .on('set', function(value, callback, context) {
                       if( context !== 'fromFHEM' )
                         this.command('S-rgb', value);
                       callback();
                     }.bind(this) )
          .on('get', function(callback) {
                       this.query('sat', callback);
                     }.bind(this) );
      }

      if( !this.mappings.pct ) {
        this.log("    fake brightness characteristic for " + this.name)

        var characteristic = controlService.addCharacteristic(Characteristic.Brightness);

        FHEM_subscribe(characteristic, this.name+'-bri', this);
        characteristic.value = 0;

        characteristic
          .on('set', function(value, callback, context) {
                       if( context !== 'fromFHEM' )
                         this.command('B-rgb', value);
                       callback();
                     }.bind(this) )
          .on('get', function(callback) {
                       this.query('bri', callback);
                     }.bind(this) );
      }
    }

    if( this.mappings.sat ) {
      this.log("    saturation characteristic for " + this.name)

      var characteristic = controlService.addCharacteristic(Characteristic.Saturation);

      FHEM_subscribe(characteristic, this.mappings.sat.informId, this);
      if( FHEM_cached[this.mappings.sat.informId] != undefined )
        characteristic.value = FHEM_cached[this.mappings.sat.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.command('sat', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query(this.mappings.sat.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.volume ) {
      this.log("    custom volume characteristic for " + this.name)

      var characteristic = new Characteristic('Volume', '00000027-0000-1000-8000-0026BB765291'); // FIXME!!!
      controlService.addCharacteristic(characteristic);

      if( !this.mappings.volume.nocache ) {
        FHEM_subscribe(characteristic, this.mappings.volume.informId, this);
        characteristic.value = FHEM_cached[this.mappings.volume.informId];
      } else {
        characteristic.value = 10;
      }

      characteristic.setProps({
        format: Characteristic.Formats.UINT8,
        unit: Characteristic.Units.PERCENTAGE,
        maxValue: 100,
        minValue: 0,
        minStep: 1,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
      });

      characteristic.readable = true;
      characteristic.writable = true;
      characteristic.supportsEventNotification = true;

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.delayed('volume', value);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query(this.mappings.volume.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.blind ) {
      this.log("    current position characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.CurrentPosition);

      var step = 1;
      FHEM_subscribe(characteristic, this.mappings.blind.informId, this);
      characteristic.value = Math.round(FHEM_cached[this.mappings.blind.informId] / step) * step;

      characteristic
        .on('get', function(callback) {
                     this.query(this.mappings.blind.reading, callback);
                   }.bind(this) );


      this.log("    target position characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.TargetPosition);
      characteristic.setProps( {
        minStep: step,
      } );

      characteristic.value = FHEM_cached[this.mappings.blind.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.delayed('targetPosition', value, 1500);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query(this.mappings.blind.reading, callback);
                   }.bind(this) );


      this.log("    position state characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.PositionState);

      if( this.mappings.motor )
        FHEM_subscribe(characteristic, this.mappings.motor.informId, this);
      characteristic.value = this.mappings.motor?FHEM_cached[this.mappings.motor.informId]:Characteristic.PositionState.STOPPED;

      characteristic
        .on('get', function(callback) {
                     if( this.mappings.motor )
                       this.query(this.mappings.motor.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.window ) {
      this.log("    current position characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.CurrentPosition);

      FHEM_subscribe(characteristic, this.name+'-state', this);
      FHEM_subscribe(characteristic, this.mappings.window.informId, this);
      characteristic.value = FHEM_cached[this.mappings.window.informId];

      characteristic
        .on('get', function(callback) {
                     this.query(this.mappings.window.reading, callback);
                   }.bind(this) );


      this.log("    target position characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.TargetPosition);

      characteristic.value = FHEM_cached[this.mappings.window.informId];

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.delayed('targetPosition', value, 1500);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query(this.mappings.window.reading, callback);
                   }.bind(this) );


      this.log("    position state characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.PositionState);

      if( this.mappings.direction )
        FHEM_subscribe(characteristic, this.mappings.direction.informId, this);
      characteristic.value = this.mappings.direction?FHEM_cached[this.mappings.direction.informId]:Characteristic.PositionState.STOPPED;

      characteristic
        .on('get', function(callback) {
                     if( this.mappings.direction )
                       this.query(this.mappings.direction.reading, callback);
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
                     if( context !== 'fromFHEM' )
                       this.command( 'set', value == 0 ? this.mappings.garage.cmdOpen : this.mappings.garage.cmdClose );
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     callback(undefined,0);
                   }.bind(this) );


      this.log("    obstruction detected characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.ObstructionDetected);

      //FHEM_subscribe(characteristic, this.mappings.direction.informId, this);
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

      FHEM_subscribe(characteristic, this.mappings.temperature.informId, this);
      characteristic.value = FHEM_cached[this.mappings.temperature.informId];

      characteristic
        .on('get', function(callback) {
                     this.query(this.mappings.temperature.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.humidity ) {
      this.log("    humidity characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                           || controlService.addCharacteristic(Characteristic.CurrentRelativeHumidity);

      FHEM_subscribe(characteristic, this.mappings.humidity.informId, this);
      characteristic.value = FHEM_cached[this.mappings.humidity.informId];

      characteristic
        .on('get', function(callback) {
                     this.query(this.mappings.humidity.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.airquality ) {
      this.log("    air quality characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.AirQuality)
                           || controlService.addCharacteristic(Characteristic.AirQuality);

      FHEM_subscribe(characteristic, this.mappings.airquality.informId, this);
      characteristic.value = FHEM_cached[this.mappings.airquality.informId];

      characteristic
        .on('get', function(callback) {
                     this.query(this.mappings.airquality.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.battery ) {
      this.log("    battery status characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.StatusLowBattery)
                           || controlService.addCharacteristic(Characteristic.StatusLowBattery);

      FHEM_subscribe(characteristic, this.mappings.battery.informId, this);
      characteristic.value = FHEM_cached[this.mappings.battery.informId];

      characteristic
        .on('get', function(callback) {
                     this.query(this.mappings.battery.reading, callback);
                   }.bind(this) );
    }


    if( this.mappings.thermostat ) {
      this.log("    target temperature characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.TargetTemperature);

      FHEM_subscribe(characteristic, this.mappings.thermostat.informId, this);
      characteristic.value = FHEM_cached[this.mappings.thermostat.informId];

      characteristic.setProps( {
        maxValue: this.mappings.thermostat.max,
        minValue: this.mappings.thermostat.min,
        minStep: this.mappings.thermostat.step,
      } );

      characteristic
        .on('set', function(value, callback, context) {
                     if( context !== 'fromFHEM' )
                       this.delayed('targetTemperature', value, 1500);
                     callback();
                   }.bind(this) )
        .on('get', function(callback) {
                     this.query(this.mappings.thermostat.reading, callback);
                   }.bind(this) );

      if( this.mappings.thermostat_mode ) {
        this.log("    current mode characteristic for " + this.name)

        var characteristic = controlService.getCharacteristic(Characteristic.CurrentHeatingCoolingState);

        FHEM_subscribe(characteristic, this.mappings.thermostat_mode.informId, this);
        characteristic.value = FHEM_cached[this.mappings.thermostat_mode.informId];

        characteristic
          .on('get', function(callback) {
                       this.query(this.mappings.thermostat_mode.reading, callback);
                     }.bind(this) );
      }

      if( this.mappings.thermostat_mode ) {
        this.log("    target mode characteristic for " + this.name)

        var characteristic = controlService.getCharacteristic(Characteristic.TargetHeatingCoolingState);

        FHEM_subscribe(characteristic, this.mappings.thermostat_mode.informId, this);
        characteristic.value = FHEM_cached[this.mappings.thermostat_mode.informId];

        characteristic
          .on('set', function(value, callback, context) {
                       if( context !== 'fromFHEM' )
                         this.command('targetMode', value);
                       callback();
                     }.bind(this) )
          .on('get', function(callback) {
                       this.query(this.mappings.thermostat_mode.reading, callback);
                     }.bind(this) );
      }
    }

    if( this.mappings.contact ) {
      this.log("    contact sensor characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.ContactSensorState);

      FHEM_subscribe(characteristic, this.mappings.contact.informId, this);
      characteristic.value = FHEM_cached[this.mappings.contact.informId];

      characteristic
        .on('get', function(callback) {
                     this.query(this.mappings.contact.reading, callback);
                   }.bind(this) );
    }

    if( this.mappings.occupancy ) {
      this.log("    occupancy detected characteristic for " + this.name)

      var characteristic = controlService.getCharacteristic(Characteristic.OccupancyDetected);

      FHEM_subscribe(characteristic, this.mappings.occupancy.informId, this);
      characteristic.value = FHEM_cached[this.mappings.occupancy.informId];

      characteristic
        .on('get', function(callback) {
                     this.query(this.mappings.occupancy.reading, callback);
                   }.bind(this) );
    }

    return services;
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

