const authService = require('../services/authService');

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const { user, token } = await authService.authenticateUser(email, password);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { token, user }
    });
  } catch (err) {
    if (err && err.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (err && err.code === 'INACTIVE_ACCOUNT') {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    if (err && err.code === 'CONFIG_ERROR') {
      // minimal logging — do NOT log secrets, tokens, or passwords
      console.error('Authentication configuration error:', err.message);
      return res.status(500).json({ success: false, message: 'Authentication configuration error' });
    }

    // unexpected error
    console.error('Unexpected login error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

function getCurrentUser(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Current user retrieved',
    data: req.user
  });
}

module.exports = { login, getCurrentUser };
