const express = require('express');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');
const {
  getOngoingInterns,
  recordProgress,
  getProgressHistory,
  completeTraining,
  getInternDetails
} = require('../controllers/progressController');

const router = express.Router();

// 1. GET /interns (MENTOR only)
router.get('/interns', authenticateJWT, authorizeRoles('MENTOR'), getOngoingInterns);

// 2. POST / (MENTOR only)
router.post('/', authenticateJWT, authorizeRoles('MENTOR'), recordProgress);

// 3. GET /interns/:internId/history (MENTOR or HR_ADMIN)
router.get('/interns/:internId/history', authenticateJWT, authorizeRoles('MENTOR', 'HR_ADMIN'), getProgressHistory);

// 4. POST /interns/:internId/complete (MENTOR only)
router.post('/interns/:internId/complete', authenticateJWT, authorizeRoles('MENTOR'), completeTraining);

// 5. GET /interns/:internId (MENTOR only)
router.get('/interns/:internId', authenticateJWT, authorizeRoles('MENTOR'), getInternDetails);

module.exports = router;
