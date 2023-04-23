const axios = require('axios');
const server_ip = "192.168.0.103";
const server_port = "8581";

module.exports = (accessoryId) => {
    const requestURL = `http://${server_ip}}:${server_port}/api/accessories/${accessoryId}`;
    const bearerToken = "your-bearer-token";
    
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
            console.log(response.status);
        })
        .catch(error => {
              console.error(error);
        });
};
