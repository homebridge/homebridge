var request = require("request");
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  
  homebridge.registerAccessory("homebridge-lockitron", "Lockitron", LockitronAccessory);
}

function LockitronAccessory(log, config) {
  this.log = log;
  this.name = config["name"];
  this.accessToken = config["api_token"];
  this.lockID = config["lock_id"];
  
  this.service = new Service.LockMechanism(this.name);
  
  this.service
    .getCharacteristic(Characteristic.LockCurrentState)
    .on('get', this.getState.bind(this));
  
  this.service
    .getCharacteristic(Characteristic.LockTargetState)
    .on('get', this.getState.bind(this))
    .on('set', this.setState.bind(this));
}

LockitronAccessory.prototype.getState = function(callback) {
  this.log("Getting current state...");
  
  request.get({
    url: "https://api.lockitron.com/v2/locks/"+this.lockID,
    qs: { access_token: this.accessToken }
  }, function(err, response, body) {
    
    if (!err && response.statusCode == 200) {
      var json = JSON.parse(body);
      var state = json.state; // "lock" or "unlock"
      this.log("Lock state is %s", state);
      var locked = state == "lock"
      callback(null, locked); // success
    }
    else {
      this.log("Error getting state (status code %s): %s", response.statusCode, err);
      callback(err);
    }
  }.bind(this));
}
  
LockitronAccessory.prototype.setState = function(state, callback) {
  var lockitronState = (state == Characteristic.LockTargetState.SECURED) ? "lock" : "unlock";

  this.log("Set state to %s", lockitronState);

  request.put({
    url: "https://api.lockitron.com/v2/locks/"+this.lockID,
    qs: { access_token: this.accessToken, state: lockitronState }
  }, function(err, response, body) {

    if (!err && response.statusCode == 200) {
      this.log("State change complete.");
      
      // we succeeded, so update the "current" state as well
      var currentState = (state == Characteristic.LockTargetState.SECURED) ?
        Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
      
      this.service
        .setCharacteristic(Characteristic.LockCurrentState, currentState);
      
      callback(null); // success
    }
    else {
      this.log("Error '%s' setting lock state. Response: %s", err, body);
      callback(err || new Error("Error setting lock state."));
    }
  }.bind(this));
}

LockitronAccessory.prototype.getServices = function() {
  return [this.service];
}
