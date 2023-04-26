const axios = require('axios');
const config = require('../config.json');
const {getToken, getKeys} = require('./auth');

function SwitchOn(accessoryId, headers){
  const requestURL = `http://${config.server_ip}:${config.server_port}/api/accessories/${accessoryId}`;
  
  // Create the JSON payload
  const payload = {
      "characteristicType": "On",
      "value": "true"
  };

// Send the PUT request to update the On characteristic of the accessory
  axios.put(requestURL, payload, { headers })
      .then(response => {
        console.log(response.data.values);
      })
      .catch(error => {
        console.error(error);
      });
};

module.exports = SwitchOn;