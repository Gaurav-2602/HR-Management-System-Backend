const express = require('express');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');
const {
  createAssignment,
  getMyAssignments,
  getAssignmentById,
  acceptAssignment,
  rejectAssignment
} = require('../controllers/assignmentController');

const router = express.Router();

// 1. POST / (HR_ADMIN only)
router.post('/', authenticateJWT, authorizeRoles('HR_ADMIN'), createAssignment);

// 2. GET /mine (MENTOR only)
router.get('/mine', authenticateJWT, authorizeRoles('MENTOR'), getMyAssignments);

// 3. GET /:id (MENTOR only)
router.get('/:id', authenticateJWT, authorizeRoles('MENTOR'), getAssignmentById);

// 4. POST /:id/accept (MENTOR only)
router.post('/:id/accept', authenticateJWT, authorizeRoles('MENTOR'), acceptAssignment);

// 5. POST /:id/reject (MENTOR only)
router.post('/:id/reject', authenticateJWT, authorizeRoles('MENTOR'), rejectAssignment);

module.exports = router;
