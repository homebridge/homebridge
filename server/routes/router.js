const express = require('express');
const router = express.Router();

const jsonpath = require('jsonpath');
const config = require('../config.json');

const {getToken, getKeys} = require('../api/auth');
const SwitchOn = require('../api/switch');
const Outlet = require('../api/outlet');


router.get('/', (req, res) => {
  res.end('../static/index.html');
});

router.get('/api/:id', async (req, res) => {
  const accessId = jsonpath.query(config, `$.accessories..[?(@.name == "${req.params.id}")]`)[0];
  if (!accessId) {
    res.status(404).send('404 Not found');
    return;
  }

  // login & set Header
  const bearerToken = await getToken();

  // Set the headers with token
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${bearerToken}`,
    'accept': '*/*'
  };

  // get keys
  const key_res = await getKeys(headers);
  const key_id = jsonpath.query(key_res, `$..*[?(@.customName == "${accessId.name}")].uniqueId`)[0];

  switch (accessId.type) {
    case 'switch':
      SwitchOn(key_id, headers);
      break;
    case 'outlet':
      Outlet(key_id, headers);
      break;
    default:
      res.status(404).send('404 Not found');
  }

  res.end("Switch on!");
});

module.exports = router;