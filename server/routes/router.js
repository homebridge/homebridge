const express = require('express');
const SwitchOn = require('../api/switch');
const router = express.Router();

const jsonpath = require('jsonpath');
const config = require('../api/config.json');


router.get('/', (req, res) => {
  res.send('Hello World!');
});

router.get('/api/:id', (req, res) => {
  const richDoorId = jsonpath.query(config, `$.accessories..[?(@.name == "${req.params.id}")].key`)[0];

  if (!richDoorId) {
    res.status(404).send('404 Not found');
    return;
  }

  SwitchOn(richDoorId);
  res.end("Switch on!");
});

module.exports = router;