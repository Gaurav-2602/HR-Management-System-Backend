const express = require('express');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');
const { getAdminDashboard, getMentorDashboard } = require('../controllers/dashboardController');

const router = express.Router();

router.use(authenticateJWT);

router.get('/admin', authorizeRoles('HR_ADMIN'), getAdminDashboard);
router.get('/mentor', authorizeRoles('MENTOR'), getMentorDashboard);

module.exports = router;
