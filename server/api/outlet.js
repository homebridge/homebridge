const axios = require('axios');
const config = require('./config.json');
const getToken = require('./auth');

async function Outlet(accessoryId){
  const bearerToken = await getToken();
  const requestURL = `http://${config.server_ip}:${config.server_port}/api/accessories/${accessoryId}`;

  // Set the headers with token
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${bearerToken}`,
    'accept': '*/*'
  };

  // Status check
  let payload = {};
  try {
    const response = await axios.get(requestURL, { headers });

    if (response.data.values.On) {
      payload = {
        "characteristicType": "On",
        "value": "false"
      };
      console.log('on -> off');
    }
    else {
      payload = {
        "characteristicType": "On",
        "value": "true"
      };
      console.log('off -> on');
    }

  } catch (error) {
    console.log('status check error');
    return error;
  }

  // Send the PUT request to update the On characteristic of the accessory
  try {
    const response = await axios.put(requestURL, payload, { headers });
    return response.status;
  } catch (error) {
    console.error(error);
    return error;
  }
}

module.exports = Outlet;