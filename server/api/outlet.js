const axios = require('axios');
const config = require('../config.json');
const getToken = require('./auth');

async function Outlet(accessoryId, headers){
  const requestURL = `http://${config.server_ip}:${config.server_port}/api/accessories/${accessoryId}`;

  // Status check
  const payload = await statusCheck(requestURL, headers);

  // Send the PUT request to update the On characteristic of the accessory
  try {
    const response = await axios.put(requestURL, payload, { headers });
    console.log(response.data.values);
  } catch (error) {
    console.error(error);
    return error;
  }
}

async function statusCheck(requestURL, headers){
  try {
    const response = await axios.get(requestURL, { headers });

    if (response.data.values.On) {
      payload = {
        "characteristicType": "On",
        "value": "false"
      };
      return payload;
    }
    else {
      payload = {
        "characteristicType": "On",
        "value": "true"
      };
      return payload;
    }

  } catch (error) {
    console.log('status check error');
    return error;
  }
}

module.exports = Outlet;