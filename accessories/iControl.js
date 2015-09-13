var iControl = require('node-icontrol').iControl;
var Service = require('HAP-NodeJS').Service;
var Characteristic = require('HAP-NodeJS').Characteristic;

module.exports = {
  accessory: iControlAccessory
}

/**
 * Provides a Security System accessory for an iControl-based security system like Xfinity Home.
 */

function iControlAccessory(log, config) {
  this.log = log;
  
  this.iControl = new iControl({
    system: iControl.Systems[config.system],
    email: config.email,
    password: config.password,
    pinCode: config.pin
  });
  
  this.iControl.on('change', this._handleChange.bind(this));
  this.iControl.on('error', this._handleError.bind(this));
  
  this.log("Logging into iControl...");
  this.iControl.login();
  
  this._securitySystem = new Service.SecuritySystem("Security System");
  
  this._securitySystem
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .on('get', this._getTargetState.bind(this))
    .on('set', this._setTargetState.bind(this));
    
  this._securitySystem
    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
    .on('get', this._getCurrentState.bind(this));
}

iControlAccessory.prototype._getTargetState = function(callback) {
  this.iControl.getArmState(function(err, armState) {
    if (err) return callback(err);
    
    var currentState = this._getHomeKitStateFromArmState(armState);
    callback(null, currentState);
    
  }.bind(this));
}

iControlAccessory.prototype._getCurrentState = function(callback) {
  this.iControl.getArmState(function(err, armState) {
    if (err) return callback(err);
    
    var currentState = this._getHomeKitStateFromArmState(armState);
    callback(null, currentState);
    
  }.bind(this));
}

iControlAccessory.prototype._setTargetState = function(targetState, callback, context) {
  if (context == "internal") return callback(null); // we set this state ourself, no need to react to it
  
  var armState = this._getArmStateFromHomeKitState(targetState);
  this.log("Setting target state to %s", armState);
  
  this.iControl.setArmState(armState, function(err) {
    if (err) return callback(err);
    
    this.log("Successfully set target state to %s", armState);
    
    // also update current state
    this._securitySystem
      .getCharacteristic(Characteristic.SecuritySystemCurrentState)
      .setValue(targetState);
    
    callback(null); // success!
    
  }.bind(this));
}

iControlAccessory.prototype._handleChange = function(armState) {
  this.log("Arm state changed to %s", armState);
  
  var homeKitState = this._getHomeKitStateFromArmState(armState);
  
  this._securitySystem
    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
    .setValue(homeKitState);
  
  this._securitySystem
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .setValue(homeKitState, null, "internal"); // these characteristics happen to share underlying values
}

iControlAccessory.prototype._handleError = function(err) {
  this.log(err.message);
}

iControlAccessory.prototype.getServices = function() {
  return [this._securitySystem];
}

iControlAccessory.prototype._getHomeKitStateFromArmState = function(armState) {
  switch (armState) {
    case "disarmed": return Characteristic.SecuritySystemCurrentState.DISARMED;
    case "away": return Characteristic.SecuritySystemCurrentState.AWAY_ARM;
    case "night": return Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
    case "stay": return Characteristic.SecuritySystemCurrentState.STAY_ARM;
  }
}

iControlAccessory.prototype._getArmStateFromHomeKitState = function(homeKitState) {
  switch (homeKitState) {
    case Characteristic.SecuritySystemCurrentState.DISARMED: return "disarmed";
    case Characteristic.SecuritySystemCurrentState.AWAY_ARM: return "away";
    case Characteristic.SecuritySystemCurrentState.NIGHT_ARM: return "night";
    case Characteristic.SecuritySystemCurrentState.STAY_ARM: return "stay";
  }
}


/**
 * TESTING
 */

if (require.main === module) {
  var config = JSON.parse(require('fs').readFileSync("config.json")).accessories[0];
  var accessory = new iControlAccessory(console.log, config);
}
