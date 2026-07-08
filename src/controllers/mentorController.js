const mentorService = require('../services/mentorService');

async function createMentor(req, res) {
  try {
    const { fullName, email, password } = req.body;

    const mentor = await mentorService.createMentor(fullName, email, password);

    return res.status(201).json({
      success: true,
      message: 'Mentor created successfully',
      data: mentor
    });
  } catch (err) {
    if (err && err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (err && err.code === 'DUPLICATE_EMAIL') {
      return res.status(409).json({ success: false, message: err.message });
    }

    console.error('Unexpected error creating mentor:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getAllMentors(req, res) {
  try {
    const { page, limit } = req.query;

    const result = await mentorService.getAllMentors(page, limit);

    return res.status(200).json({
      success: true,
      data: result.mentors,
      pagination: result.pagination
    });
  } catch (err) {
    console.error('Unexpected error fetching mentors:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function getMentorById(req, res) {
  try {
    const { id } = req.params;

    const mentor = await mentorService.getMentorById(id);

    return res.status(200).json({
      success: true,
      data: mentor
    });
  } catch (err) {
    if (err && err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }

    console.error('Unexpected error fetching mentor:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updateMentor(req, res) {
  try {
    const { id } = req.params;
    const { fullName, email } = req.body;

    const mentor = await mentorService.updateMentor(id, { fullName, email });

    return res.status(200).json({
      success: true,
      message: 'Mentor updated successfully',
      data: mentor
    });
  } catch (err) {
    if (err && err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (err && err.code === 'DUPLICATE_EMAIL') {
      return res.status(409).json({ success: false, message: err.message });
    }

    if (err && err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }

    console.error('Unexpected error updating mentor:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function updateMentorStatus(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const mentor = await mentorService.updateMentorStatus(id, isActive);

    return res.status(200).json({
      success: true,
      message: 'Mentor status updated successfully',
      data: mentor
    });
  } catch (err) {
    if (err && err.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (err && err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }

    console.error('Unexpected error updating mentor status:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function deleteMentor(req, res) {
  try {
    const { id } = req.params;

    await mentorService.deactivateMentor(id);

    return res.status(200).json({
      success: true,
      message: 'Mentor deactivated successfully'
    });
  } catch (err) {
    if (err && err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message });
    }

    console.error('Unexpected error deleting mentor:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = {
  createMentor,
  getAllMentors,
  getMentorById,
  updateMentor,
  updateMentorStatus,
  deleteMentor
};
