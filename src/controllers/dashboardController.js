const dashboardService = require('../services/dashboardService');

async function getAdminDashboard(req, res) {
  try {
    const data = await dashboardService.getAdminDashboard();
    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (err) {
    // Log exception using same style as rest of project
    console.error('Error in getAdminDashboard:', err && err.message ? err.message : err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

async function getMentorDashboard(req, res) {
  try {
    const mentorId = req.user.id;
    const data = await dashboardService.getMentorDashboard(mentorId);
    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (err) {
    // Log exception using same style as rest of project
    console.error('Error in getMentorDashboard:', err && err.message ? err.message : err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

module.exports = {
  getAdminDashboard,
  getMentorDashboard
};
