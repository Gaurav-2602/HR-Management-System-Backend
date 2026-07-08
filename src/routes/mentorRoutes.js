const express = require('express');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');
const {
  createMentor,
  getAllMentors,
  getMentorById,
  updateMentor,
  updateMentorStatus,
  deleteMentor
} = require('../controllers/mentorController');

const router = express.Router();

// All routes protected by authentication and HR_ADMIN role
router.post('/', authenticateJWT, authorizeRoles('HR_ADMIN'), createMentor);
router.get('/', authenticateJWT, authorizeRoles('HR_ADMIN'), getAllMentors);
router.get('/:id', authenticateJWT, authorizeRoles('HR_ADMIN'), getMentorById);
router.put('/:id', authenticateJWT, authorizeRoles('HR_ADMIN'), updateMentor);
router.patch('/:id/status', authenticateJWT, authorizeRoles('HR_ADMIN'), updateMentorStatus);
router.delete('/:id', authenticateJWT, authorizeRoles('HR_ADMIN'), deleteMentor);

module.exports = router;
