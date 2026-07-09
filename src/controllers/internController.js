const internService = require('../services/internService');

async function createIntern(req, res) {
  try {
    const intern = await internService.createIntern(req.body);
    res.status(201).json(internService.getInternDetails(intern));
  } catch (err) {
    if (err.name === 'ValidationError' || err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'DUPLICATE_EMAIL' || err.code === 'DUPLICATE_AADHAAR') {
      return res.status(409).json({ error: err.message });
    }
    if (err.code === 11000) {
      if (err.keyValue && err.keyValue.email) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      if (err.keyValue && err.keyValue.aadhaarNumber) {
        return res.status(409).json({ error: 'Aadhaar number already exists' });
      }
      return res.status(409).json({ error: 'Record already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getAllInterns(req, res) {
  try {
    const { page, limit, status, search } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (search) filters.search = search;

    const result = await internService.getAllInterns(page, limit, filters);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getInternById(req, res) {
  try {
    const intern = await internService.getInternById(req.params.id);
    res.status(200).json(internService.getInternDetails(intern));
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateIntern(req, res) {
  try {
    const intern = await internService.updateIntern(req.params.id, req.body);
    res.status(200).json(internService.getInternDetails(intern));
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    if (err.name === 'ValidationError' || err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'DUPLICATE_EMAIL' || err.code === 'DUPLICATE_AADHAAR') {
      return res.status(409).json({ error: err.message });
    }
    if (err.code === 11000) {
      if (err.keyValue && err.keyValue.email) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      if (err.keyValue && err.keyValue.aadhaarNumber) {
        return res.status(409).json({ error: 'Aadhaar number already exists' });
      }
      return res.status(409).json({ error: 'Record already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteIntern(req, res) {
  try {
    await internService.deleteInternSoft(req.params.id);
    res.status(200).json({ message: 'Intern deleted successfully' });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function issueCertificate(req, res) {
  try {
    const internId = req.params.id;
    const adminId = req.user.id;
    const { certificateNumber, finalHrRemarks } = req.body;

    const updatedIntern = await internService.issueCertificate(internId, adminId, {
      certificateNumber,
      finalHrRemarks
    });

    res.status(200).json({
      message: 'Certificate issued successfully',
      intern: internService.mapSafeIssuanceDetails(updatedIntern)
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    if (err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Certificate number already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getIssuanceDetails(req, res) {
  try {
    const internId = req.params.id;
    const intern = await internService.getIssuanceDetails(internId);
    res.status(200).json(internService.mapSafeIssuanceDetails(intern));
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    if (err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  createIntern,
  getAllInterns,
  getInternById,
  updateIntern,
  deleteIntern,
  issueCertificate,
  getIssuanceDetails
};
