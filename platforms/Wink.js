var types = require("hap-nodejs/accessories/types.js");
var wink = require('wink-js');
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var Accessory = require("hap-nodejs").Accessory;
var uuid = require("hap-nodejs").uuid;
var inherits = require('util').inherits;

process.env.WINK_NO_CACHE = true;

var model = {
  light_bulbs: require('wink-js/lib/model/light'),
  refreshUntil: function(that, maxTimes, predicate, callback, interval, incrementInterval) {
    if (!interval) {
      interval = 500;
    }
    if (!incrementInterval) {
      incrementInterval = 500;
    }
    setTimeout(function() {
      that.reloadData(function() {
        if (predicate == undefined || predicate(that.device) == true) {
          if (callback) callback(true);
        } else if (maxTimes > 0) {
          maxTimes = maxTimes - 1;
          interval += incrementInterval;
          model.refreshUntil(that, maxTimes, predicate, callback, interval, incrementInterval);
        } else {
          if (callback) callback(false);
        }
      });
    }, interval);
  }
};

function WinkPlatform(log, config){

  // auth info
  this.client_id = config["client_id"];
  this.client_secret = config["client_secret"];

  this.username = config["username"];
  this.password = config["password"];

  this.log = log;
  this.deviceLookup = {};
}

WinkPlatform.prototype = {
  reloadData: function(callback) {
    this.log("Refreshing Wink Data");
    var that = this;
    wink.user().devices(function(devices) {
      for (var i=0; i<devices.data.length; i++){
        var device = devices.data[i];
        var accessory = that.deviceLookup[device.lock_id | device.light_bulb_id | ""];
        if (accessory != undefined) {
          accessory.device = device;
          accessory.loadData();
        }
      }
      if (callback) callback();
    });
  },
  accessories: function(callback) {
    this.log("Fetching Wink devices.");

    var that = this;
    var foundAccessories = [];
    this.deviceLookup = {};

    var refreshLoop = function(){
      setInterval(that.reloadData.bind(that), 30000);
    };

    wink.init({
        "client_id": this.client_id,
        "client_secret": this.client_secret,
        "username": this.username,
        "password": this.password
    }, function(auth_return) {
      if ( auth_return === undefined ) {
        that.log("There was a problem authenticating with Wink.");
      } else {
        // success
        wink.user().devices(function(devices) {
          for (var i=0; i<devices.data.length; i++){
            var device = devices.data[i];
            var accessory = null;
            if (device.light_bulb_id !== undefined) {
              accessory = new WinkLightAccessory(that.log, device);
            } else if (device.lock_id !== undefined) {
              accessory = new WinkLockAccessory(that.log, device);
            }
            if (accessory != undefined) {
              that.deviceLookup[accessory.deviceId] = accessory;
              foundAccessories.push(accessory);
            }
          }
          refreshLoop();
          callback(foundAccessories);
        });
      }
    });
  }
};


/*
 *   Base Accessory
 */

function WinkAccessory(log, device, type, typeId) {
  // construct base
  this.device = device;
  this.name = device.name;
  this.log = log;
  if (typeId == undefined) {
    typeId = this.name;
    log("WARN: Unable to find id of " + this.name + " so using name instead");
  }
  this.deviceGroup = type + 's';
  this.deviceId = typeId;
  var idKey = 'hbdev:wink:' + type + ':' + typeId;
  var id = uuid.generate(idKey);
  Accessory.call(this, this.name, id);
  this.uuid_base = id;

  this.control = wink.device_group(this.deviceGroup).device_id(this.deviceId);

  // set some basic properties (these values are arbitrary and setting them is optional)
  this
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, this.device.device_manufacturer)
      .setCharacteristic(Characteristic.Model, this.device.model_name);

  WinkAccessory.prototype.loadData.call(this);
}

inherits(WinkAccessory, Accessory);
WinkAccessory.prototype.parent = Accessory.prototype;

WinkAccessory.prototype.getServices = function() {
  return this.services;
};

WinkAccessory.prototype.loadData = function() {
};

WinkAccessory.prototype.handleResponse = function(res) {
  if (!res) {
    return Error("No response from Wink");
  } else if (res.errors && res.errors.length > 0) {
    return res.errors[0];
  } else if (res.data) {
    this.device = res.data;
    this.loadData();
  }
};

WinkAccessory.prototype.reloadData = function(callback){
  var that = this;
  this.control.get(function(res) {
    callback(that.handleResponse(res));
  });
};


/*
 *   Light Accessory
 */

function WinkLightAccessory(log, device) {
  // construct base
  WinkAccessory.call(this, log, device, 'light_bulb', device.light_bulb_id);

  // accessor
  var that = this;

  that.device = device;
  that.deviceControl = model.light_bulbs(device, wink);

  this
      .addService(Service.Lightbulb)
      .getCharacteristic(Characteristic.On)
      .on('get', function(callback) {
        var powerState = that.device.desired_state.powered;
        that.log("power state for " + that.name + " is: " + powerState);
        callback(null, powerState != undefined ? powerState : false);
      })
      .on('set', function(powerOn, callback) {
        if (powerOn) {
          that.log("Setting power state on the '"+that.name+"' to on");
          that.deviceControl.power.on(function(response) {
            if (response === undefined) {
              that.log("Error setting power state on the '"+that.name+"'");
              callback(Error("Error setting power state on the '"+that.name+"'"));
            } else {
              that.log("Successfully set power state on the '"+that.name+"' to on");
              callback(null, powerOn);
            }
          });
        }else{
          that.log("Setting power state on the '"+that.name+"' to off");
          that.deviceControl.power.off(function(response) {
            if (response === undefined) {
              that.log("Error setting power state on the '"+that.name+"'");
              callback(Error("Error setting power state on the '"+that.name+"'"));
            } else {
              that.log("Successfully set power state on the '"+that.name+"' to off");
              callback(null, powerOn);
            }
          });
        }
      });

  this
      .getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.Brightness)
      .on('get', function(callback) {
        var level = that.device.desired_state.brightness * 100;
        that.log("brightness level for " + that.name + " is: " + level);
        callback(null, level);
      })
      .on('set', function(level, callback) {
        that.log("Setting brightness on the '"+this.name+"' to " + level);
        that.deviceControl.brightness(level, function(response) {
          if (response === undefined) {
            that.log("Error setting brightness on the '"+that.name+"'");
            callback(Error("Error setting brightness on the '"+that.name+"'"));
          } else {
            that.log("Successfully set brightness on the '"+that.name+"' to " + level);
            callback(null, level);
          }
        });
      });

  WinkLightAccessory.prototype.loadData.call(this);
}

inherits(WinkLightAccessory, WinkAccessory);
WinkLightAccessory.prototype.parent = WinkAccessory.prototype;

WinkLightAccessory.prototype.loadData = function() {
  this.parent.loadData.call(this);
  this.getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.On)
      .getValue();
  this.getService(Service.Lightbulb)
      .getCharacteristic(Characteristic.Brightness)
      .getValue();
};


/*
 *   Lock Accessory
 */

function WinkLockAccessory(log, device) {
  // construct base
  WinkAccessory.call(this, log, device, 'lock', device.lock_id);

  // accessor
  var that = this;

  this
      .addService(Service.LockMechanism)
      .getCharacteristic(Characteristic.LockTargetState)
      .on('get', function(callback) {
        callback(null, that.isLockTarget());
      })
      .on('set', function(value, callback) {
        var locked = that.fromLockState(value);

        if (locked == undefined) {
          callback(Error("Unsupported"));
          return;
        }

        that.log("Changing target lock state of " + that.name + " to " + (locked ? "locked" : "unlocked"));

        var update = function(retry) {
          that.control.update({ "desired_state": { "locked": locked } }, function(res) {
            var err = that.handleResponse(res);
            if (!err) {
              model.refreshUntil(that, 5,
                  function() { return that.isLocked() == that.isLockTarget(); },
                  function(completed) {
                    if (completed) {
                      that.log("Successfully changed lock status to " + (that.isLocked() ? "locked" : "unlocked"));
                    } else if (retry) {
                      that.log("Unable to determine if update was successful. Retrying update.");
                      retry();
                    } else {
                      that.log("Unable to determine if update was successful.");
                    }
                  });
            }
            if (callback)
            {
              callback(err);
              callback = null;
            }
          });
        };
        update(update);
      });

  WinkLockAccessory.prototype.loadData.call(this);
}

inherits(WinkLockAccessory, WinkAccessory);
WinkLockAccessory.prototype.parent = WinkAccessory.prototype;

WinkLockAccessory.prototype.loadData = function() {
  this.parent.loadData.call(this);
  this.getService(Service.LockMechanism)
      .setCharacteristic(Characteristic.LockCurrentState, this.isLocked());
  this.getService(Service.LockMechanism)
      .getCharacteristic(Characteristic.LockTargetState)
      .getValue();
};

WinkLockAccessory.prototype.toLockState= function(isLocked) {
  return isLocked  ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
};

WinkLockAccessory.prototype.fromLockState= function(lockState) {
  switch (lockState) {
    case Characteristic.LockCurrentState.SECURED:
      return true;
    case Characteristic.LockCurrentState.UNSECURED:
      return false;
    default:
      return undefined;
  }
};

WinkLockAccessory.prototype.isLockTarget= function() {
  return this.toLockState(this.device.desired_state.locked);
};

WinkLockAccessory.prototype.isLocked= function() {
  return this.toLockState(this.device.last_reading.locked);
};

module.exports.accessory = WinkAccessory;
module.exports.lockAccessory = WinkLockAccessory;
module.exports.lightAccessory = WinkLightAccessory;
module.exports.platform = WinkPlatform;
