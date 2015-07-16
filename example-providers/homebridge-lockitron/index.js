import request from 'request';

// Create a logger for our provider
let log = homebridge.logger('homebridge-lockitron');

// Demonstrate that we were loaded
log.info("Lockitron provider loaded!");

module.exports = {
  
  config: {
    accessToken: {
      type: 'string',
      description: "You can find your personal Access Token at: https://api.lockitron.com",
      required: true
    }
  },
  
  validateConfig: function(callback) {
    
    // validate the accessToken
    let accessToken = homebridge.config.get('homebridge-lockitron.accessToken');
    
    // prove that we got a value
    log.info(`Access Token: ${accessToken}`);
    
    // all is well.
    callback();
  }
}
