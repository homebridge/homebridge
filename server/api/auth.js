const axios = require('axios');
const config = require('./config.json');

function getToken() {
    const login_url = `http://${config.server_ip}:${config.server_port}/api/auth/login`;
    const login_data = {
        username: config.hb_id,
        password: config.hb_pw
    };
    
    return axios.post(login_url, login_data)
        .then(response => {
            return response.data.access_token;
        })
        .catch(error => {
            console.log('Unauthorized');
            return error;
        });
}

module.exports = getToken;
