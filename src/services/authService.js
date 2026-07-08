const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function authenticateUser(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user) {
    const err = new Error('Invalid email or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  if (user.isActive === false) {
    const err = new Error('Account is inactive');
    err.code = 'INACTIVE_ACCOUNT';
    throw err;
  }

  const passwordMatches = await user.comparePassword(password);
  if (!passwordMatches) {
    const err = new Error('Invalid email or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const safeUser = getSafeUser(user);
  const token = generateToken(user);

  return { user: safeUser, token };
}

function generateToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error('JWT secret is not configured');
    err.code = 'CONFIG_ERROR';
    throw err;
  }

  const payload = {
    sub: String(user._id),
    role: user.role
  };

  return jwt.sign(payload, secret, { expiresIn: '1d' });
}

function getSafeUser(user) {
  // Accepts a mongoose document or plain object
  const u = user && user.toObject ? user.toObject() : user || {};
  return {
    id: String(u._id),
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    isActive: u.isActive
  };
}

module.exports = {
  authenticateUser,
  generateToken,
  getSafeUser
};
