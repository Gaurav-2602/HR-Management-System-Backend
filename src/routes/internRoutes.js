const express = require('express');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');
const {
  createIntern,
  getAllInterns,
  getInternById,
  updateIntern,
  deleteIntern,
  issueCertificate,
  getIssuanceDetails
} = require('../controllers/internController');

const router = express.Router();

router.use(authenticateJWT);
router.use(authorizeRoles('HR_ADMIN'));

router.post('/', createIntern);
router.get('/', getAllInterns);

router.get('/:id/issuance', getIssuanceDetails);
router.post('/:id/issue', issueCertificate);

router.get('/:id', getInternById);
router.put('/:id', updateIntern);
router.delete('/:id', deleteIntern);

module.exports = router;
