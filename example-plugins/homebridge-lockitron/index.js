var request = require('basic-request');
var hap = require('HAP-NodeJS');

module.exports = {
  providers: [LockitronProvider]
}

function LockitronProvider(log, config) {
  this._log = log;
  this._config = config;
}

LockitronProvider.title = "Lockitron";

LockitronProvider.config = {
  accessToken: {
    type: 'string',
    description: "You can find your personal Access Token at: https://api.lockitron.com",
    required: true
  },
  lockID: {
    type: 'string',
    description: "If specified, only the lock with this ID will be exposed as an accessory.",
  }
}

LockitronProvider.prototype.validateConfig = function(callback) {
    
  // validate the accessToken
  var accessToken = this._config.accessToken;
  
  // prove that we got a value
  this._log.info('Access Token: ' + accessToken);
  
  // all is well.
  callback();
}

LockitronProvider.prototype.getAccessories = function(callback) {
  
}
