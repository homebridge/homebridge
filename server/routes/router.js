const express = require('express');
const router = express.Router();

const jsonpath = require('jsonpath');
const config = require('../api/config.json');

const SwitchOn = require('../api/switch');
const Outlet = require('../api/outlet');


router.get('/', (req, res) => {
  res.send('Hello World!');
});

router.get('/api/:id', (req, res) => {
  const accessId = jsonpath.query(config, `$.accessories..[?(@.name == "${req.params.id}")]`)[0];
  if (!accessId) {
    res.status(404).send('404 Not found');
    return;
  }

  switch (accessId.type) {
    case 'switch':
      SwitchOn(accessId.key);
      break;
    case 'outlet':
      Outlet(accessId.key);
      break;
    default:
      res.status(404).send('404 Not found');
  }

  res.end("Switch on!");
});

module.exports = router;