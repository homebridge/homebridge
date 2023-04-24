const axios = require('axios');
const config = require('./config.json');
const getToken = require('./auth');
const bearerToken = '';

async function SwitchOn(accessoryId){
  const bearerToken = await getToken();
  const requestURL = `http://${config.server_ip}:${config.server_port}/api/accessories/${accessoryId}`;
  
  // Create the JSON payload
  const payload = {
      "characteristicType": "On",
      "value": "true"
  };

// Set the headers for the PUT request
  const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
      'accept': '*/*'
  };

// Send the PUT request to update the On characteristic of the accessory
  axios.put(requestURL, payload, { headers })
      .then(response => {
        return response.status;
      })
      .catch(error => {
        console.error(error);
        return error;
      });
};

module.exports = SwitchOn;