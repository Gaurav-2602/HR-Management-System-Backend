const User = require('../models/User');

async function createMentor(fullName, email, password) {
  if (!fullName || !email || !password) {
    const err = new Error('fullName, email, and password are required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    const err = new Error('Invalid email format');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Check for duplicate email
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const err = new Error('Email already exists');
    err.code = 'DUPLICATE_EMAIL';
    throw err;
  }

  // Create mentor (password will be hashed by User.pre('save'))
  const mentor = await User.create({
    fullName: fullName.trim(),
    email: normalizedEmail,
    password,
    role: 'MENTOR',
    isActive: true
  });

  return getSafeMentor(mentor);
}

async function getAllMentors(page = 1, limit = 10) {
  // Validate pagination
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 10));

  const skip = (page - 1) * limit;

  // Get all MENTOR users (active and inactive)
  const mentors = await User.find({ role: 'MENTOR' })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments({ role: 'MENTOR' });

  return {
    mentors: mentors.map(getSafeMentor),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function getMentorById(mentorId) {
  // Validate ObjectId format
  if (!mentorId || !isValidObjectId(mentorId)) {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const mentor = await User.findById(mentorId);

  if (!mentor || mentor.role !== 'MENTOR') {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return getSafeMentor(mentor);
}

async function updateMentor(mentorId, updates) {
  // Validate ObjectId format
  if (!mentorId || !isValidObjectId(mentorId)) {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Filter updates: only allow fullName and email
  const allowedUpdates = {};
  if (updates.fullName !== undefined) {
    allowedUpdates.fullName = updates.fullName.trim();
  }
  if (updates.email !== undefined) {
    allowedUpdates.email = String(updates.email).trim().toLowerCase();
  }

  if (Object.keys(allowedUpdates).length === 0) {
    const err = new Error('No valid fields to update');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Check for duplicate email if email is being updated
  if (allowedUpdates.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(allowedUpdates.email)) {
      const err = new Error('Invalid email format');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const existing = await User.findOne({
      email: allowedUpdates.email,
      _id: { $ne: mentorId }
    });
    if (existing) {
      const err = new Error('Email already exists');
      err.code = 'DUPLICATE_EMAIL';
      throw err;
    }
  }

  const mentor = await User.findById(mentorId);

  if (!mentor || mentor.role !== 'MENTOR') {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Update fields
  Object.assign(mentor, allowedUpdates);
  await mentor.save();

  return getSafeMentor(mentor);
}

async function updateMentorStatus(mentorId, isActive) {
  // Validate ObjectId format
  if (!mentorId || !isValidObjectId(mentorId)) {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (typeof isActive !== 'boolean') {
    const err = new Error('isActive must be a boolean');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const mentor = await User.findById(mentorId);

  if (!mentor || mentor.role !== 'MENTOR') {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  mentor.isActive = isActive;
  await mentor.save();

  return getSafeMentor(mentor);
}

async function deactivateMentor(mentorId) {
  // Validate ObjectId format
  if (!mentorId || !isValidObjectId(mentorId)) {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const mentor = await User.findById(mentorId);

  if (!mentor || mentor.role !== 'MENTOR') {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Soft delete: set isActive to false
  mentor.isActive = false;
  await mentor.save();

  return getSafeMentor(mentor);
}

function getSafeMentor(user) {
  const u = user && user.toObject ? user.toObject() : user || {};
  return {
    id: String(u._id),
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  };
}

function isValidObjectId(id) {
  // MongoDB ObjectId must be 24 hex characters
  return /^[0-9a-f]{24}$/i.test(id);
}

module.exports = {
  createMentor,
  getAllMentors,
  getMentorById,
  updateMentor,
  updateMentorStatus,
  deactivateMentor
};
