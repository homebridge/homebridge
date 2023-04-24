// express settings
const express = require('express');
const app = express();

const server_ip = "127.0.0.1";
const server_port = "8080";

// express json
app.use(express.json());

// express route
const router = require('./routes/router');
app.use('/', router);

// express error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('500 error');
});

// express listen
app.listen(server_port, server_ip, () => {
    console.log(`Server running at http://${server_ip}:${server_port}/`);
});
