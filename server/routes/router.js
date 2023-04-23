const express = require('express');
const router = express.Router();

// 라우트 정의 예시
router.get('/api', (req, res) => {
  res.send('Hello, world!');
});

module.exports = router;