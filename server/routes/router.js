const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.send('Hello World!');
});


router.get('/api/:id:token', (req, res) => {
  const token = req.query.token;
});

module.exports = router;