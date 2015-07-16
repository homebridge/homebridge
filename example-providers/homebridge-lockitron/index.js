import request from 'request';

// Demonstrate that we were loaded
console.log("Lockitron provider loaded!");

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
    console.log(`Access Token: ${accessToken}`);
  }
}
