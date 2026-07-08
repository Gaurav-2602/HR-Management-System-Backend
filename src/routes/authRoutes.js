const express = require('express');
const { login, getCurrentUser } = require('../controllers/authController');
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', authenticateJWT, getCurrentUser);

module.exports = router;
