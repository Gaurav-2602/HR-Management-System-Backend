const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function authenticateJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'Missing authorization token' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ success: false, message: 'Invalid authorization format' });
    }

    const token = parts[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({ success: false, message: 'Authentication configuration error' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      // jwt.verify throws on expired or invalid tokens
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    const userId = decoded.sub;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (user.isActive === false) {
      return res.status(401).json({ success: false, message: 'Account is inactive' });
    }

    // Attach safe user to req.user
    req.user = {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    };

    next();
  } catch (err) {
    console.error('Authentication middleware error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
    }

    next();
  };
}

module.exports = { authenticateJWT, authorizeRoles };
