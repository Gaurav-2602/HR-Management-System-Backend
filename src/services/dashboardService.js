const mongoose = require('mongoose');
const User = require('../models/User');
const Intern = require('../models/Intern');
const Assignment = require('../models/Assignment');
const Progress = require('../models/Progress');

async function getAdminDashboard() {
  // 1. Calculate boundary for monthly registrations (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setDate(1); // First day of the current month
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11); // Go back 11 months
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  // 2. Run Promise.all for concurrent queries
  const [
    totalActiveInterns,
    internStatusCounts,
    totalActiveMentors,
    assignmentCounts,
    byTrainingType,
    byDivision,
    byInstitute,
    monthlyRegistrations,
    recentRegistrations,
    recentAssignments,
    recentCertificates
  ] = await Promise.all([
    // A. totalActiveInterns (isActive: true only)
    Intern.countDocuments({ isActive: true }),

    // B. Intern status counts (isActive: true only)
    Intern.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),

    // C. totalActiveMentors (role: 'MENTOR', isActive: true only)
    User.countDocuments({ role: 'MENTOR', isActive: true }),

    // D. assignmentCounts (pendingCurrent, acceptedAllTime, rejectedAllTime)
    Promise.all([
      Assignment.countDocuments({ status: 'PENDING' }),
      Assignment.countDocuments({ status: 'ACCEPTED' }),
      Assignment.countDocuments({ status: 'REJECTED' })
    ]),

    // E. byTrainingType (active interns only, deterministic sort)
    Intern.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$trainingType', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),

    // F. byDivision (active interns only, trim/group blank, missing, null as 'Unknown')
    Intern.aggregate([
      { $match: { isActive: true } },
      {
        $project: {
          division: {
            $cond: {
              if: { $eq: [{ $trim: { input: { $ifNull: ['$division', ''] } } }, ''] },
              then: 'Unknown',
              else: { $trim: { input: { $ifNull: ['$division', ''] } } }
            }
          }
        }
      },
      { $group: { _id: '$division', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),

    // G. byInstitute (active interns only, trim/group blank, missing, null as 'Unknown')
    Intern.aggregate([
      { $match: { isActive: true } },
      {
        $project: {
          instituteName: {
            $cond: {
              if: { $eq: [{ $trim: { input: { $ifNull: ['$instituteName', ''] } } }, ''] },
              then: 'Unknown',
              else: { $trim: { input: { $ifNull: ['$instituteName', ''] } } }
            }
          }
        }
      },
      { $group: { _id: '$instituteName', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),

    // H. monthlyRegistrations (active interns only, createdAt >= boundary, oldest to newest)
    Intern.aggregate([
      { $match: { isActive: true, createdAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1
        }
      }
    ]),

    // I. recentRegistrations (maximum 5, isActive: true, newest first deterministically)
    Intern.find({ isActive: true })
      .sort({ createdAt: -1, _id: -1 })
      .limit(5)
      .select('_id fullName internId createdAt'),

    // J. recentAssignments (maximum 5, filter/join invalid references before limit, newest first)
    Assignment.aggregate([
      // Join Intern and verify active
      {
        $lookup: {
          from: 'interns',
          localField: 'internId',
          foreignField: '_id',
          as: 'intern'
        }
      },
      { $unwind: '$intern' },
      { $match: { 'intern.isActive': true } },

      // Join Mentor and verify active
      {
        $lookup: {
          from: 'users',
          localField: 'mentorId',
          foreignField: '_id',
          as: 'mentor'
        }
      },
      { $unwind: '$mentor' },
      { $match: { 'mentor.role': 'MENTOR', 'mentor.isActive': true } },

      // Sort, limit, and project safe fields
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 1,
          internName: '$intern.fullName',
          mentorName: '$mentor.fullName',
          status: 1,
          assignedAt: 1
        }
      }
    ]),

    // K. recentCertificates (maximum 5, isActive: true, status: 'ISSUED', metadata exists)
    Intern.find({
      isActive: true,
      status: 'ISSUED',
      certificateNumber: {
        $exists: true,
        $ne: null,
        $regex: /\S/
      },
      issuedAt: {
        $exists: true,
        $ne: null
      }
    })
      .sort({ issuedAt: -1, _id: -1 })
      .limit(5)
      .select('_id fullName certificateNumber issuedAt')
  ]);

  // 3. Process status breakdown (initialize to zero)
  const statusSummary = {
    NEW: 0,
    ASSIGNED: 0,
    REJECTED_BY_MENTOR: 0,
    ONGOING: 0,
    COMPLETED: 0,
    ISSUED: 0
  };
  internStatusCounts.forEach(g => {
    if (g._id in statusSummary) {
      statusSummary[g._id] = g.count;
    }
  });

  // 4. Format breakdown responses (removing Mongo _id mapping)
  const formattedTrainingType = byTrainingType.map(item => ({
    trainingType: item._id,
    count: item.count
  }));

  const formattedDivision = byDivision.map(item => ({
    division: item._id,
    count: item.count
  }));

  const formattedInstitute = byInstitute.map(item => ({
    instituteName: item._id,
    count: item.count
  }));

  const formattedMonthly = monthlyRegistrations.map(item => ({
    year: item._id.year,
    month: item._id.month,
    count: item.count
  }));

  // 5. Build safe recent activity mapping
  const mappedRegistrations = recentRegistrations.map(item => ({
    id: item._id.toString(),
    fullName: item.fullName,
    internId: item.internId,
    createdAt: item.createdAt
  }));

  const mappedAssignments = recentAssignments.map(item => ({
    id: item._id.toString(),
    internName: item.internName,
    mentorName: item.mentorName,
    status: item.status,
    assignedAt: item.assignedAt
  }));

  const mappedCertificates = recentCertificates.map(item => ({
    id: item._id.toString(),
    fullName: item.fullName,
    certificateNumber: item.certificateNumber,
    issuedAt: item.issuedAt
  }));

  return {
    stats: {
      interns: {
        totalActive: totalActiveInterns,
        byStatus: statusSummary
      },
      mentors: {
        totalActive: totalActiveMentors
      },
      assignments: {
        pendingCurrent: assignmentCounts[0],
        acceptedAllTime: assignmentCounts[1],
        rejectedAllTime: assignmentCounts[2]
      }
    },
    breakdowns: {
      byTrainingType: formattedTrainingType,
      byDivision: formattedDivision,
      byInstitute: formattedInstitute,
      monthlyRegistrations: formattedMonthly
    },
    recentActivity: {
      recentRegistrations: mappedRegistrations,
      recentAssignments: mappedAssignments,
      recentCertificates: mappedCertificates
    }
  };
}

async function getMentorDashboard(mentorId) {
  const mObjectId = new mongoose.Types.ObjectId(mentorId);

  // 1. Run concurrent queries
  const [
    assignmentCounts,
    ongoingInterns,
    completedInterns,
    issuedInterns,
    recentAssignments,
    recentProgressUpdates
  ] = await Promise.all([
    // A. mentor assignment counts
    Promise.all([
      Assignment.countDocuments({ mentorId: mObjectId, status: 'PENDING' }),
      Assignment.countDocuments({ mentorId: mObjectId, status: 'ACCEPTED' }),
      Assignment.countDocuments({ mentorId: mObjectId, status: 'REJECTED' })
    ]),

    // B. ongoing interns count: unique active ONGOING interns where mentor has ACCEPTED assignment
    Assignment.aggregate([
      { $match: { mentorId: mObjectId, status: 'ACCEPTED' } },
      {
        $lookup: {
          from: 'interns',
          localField: 'internId',
          foreignField: '_id',
          as: 'intern'
        }
      },
      { $unwind: '$intern' },
      { $match: { 'intern.isActive': true, 'intern.status': 'ONGOING' } },
      { $group: { _id: '$internId' } }
    ]),

    // C. completed interns count: final Progress recordedBy = mentor, isFinal = true, progressPercentage = 100, join to active Intern, status = COMPLETED
    Progress.aggregate([
      { $match: { recordedBy: mObjectId, isFinal: true, progressPercentage: 100 } },
      {
        $lookup: {
          from: 'interns',
          localField: 'internId',
          foreignField: '_id',
          as: 'intern'
        }
      },
      { $unwind: '$intern' },
      { $match: { 'intern.isActive': true, 'intern.status': 'COMPLETED' } },
      { $group: { _id: '$internId' } }
    ]),

    // D. issued interns count: final Progress recordedBy = mentor, isFinal = true, progressPercentage = 100, join to active Intern, status = ISSUED
    Progress.aggregate([
      { $match: { recordedBy: mObjectId, isFinal: true, progressPercentage: 100 } },
      {
        $lookup: {
          from: 'interns',
          localField: 'internId',
          foreignField: '_id',
          as: 'intern'
        }
      },
      { $unwind: '$intern' },
      { $match: { 'intern.isActive': true, 'intern.status': 'ISSUED' } },
      { $group: { _id: '$internId' } }
    ]),

    // E. mentor recent assignments: max 5, mentorId = mentor, Intern exists and is active
    Assignment.aggregate([
      { $match: { mentorId: mObjectId } },
      {
        $lookup: {
          from: 'interns',
          localField: 'internId',
          foreignField: '_id',
          as: 'intern'
        }
      },
      { $unwind: '$intern' },
      { $match: { 'intern.isActive': true } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 1,
          internName: '$intern.fullName',
          status: 1,
          assignedAt: 1
        }
      }
    ]),

    // F. mentor recent progress updates: max 5, recordedBy = mentor, join only active Intern
    Progress.aggregate([
      { $match: { recordedBy: mObjectId } },
      {
        $lookup: {
          from: 'interns',
          localField: 'internId',
          foreignField: '_id',
          as: 'intern'
        }
      },
      { $unwind: '$intern' },
      { $match: { 'intern.isActive': true } },
      { $sort: { recordedAt: -1, _id: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 1,
          internName: '$intern.fullName',
          progressPercentage: 1,
          recordedAt: 1
        }
      }
    ])
  ]);

  // 2. Format mentor output
  const mappedAssignments = recentAssignments.map(item => ({
    id: item._id.toString(),
    internName: item.internName,
    status: item.status,
    assignedAt: item.assignedAt
  }));

  const mappedProgressUpdates = recentProgressUpdates.map(item => ({
    id: item._id.toString(),
    internName: item.internName,
    progressPercentage: item.progressPercentage,
    recordedAt: item.recordedAt
  }));

  return {
    stats: {
      assignments: {
        pendingCurrent: assignmentCounts[0],
        acceptedAllTime: assignmentCounts[1],
        rejectedAllTime: assignmentCounts[2]
      },
      interns: {
        ongoing: ongoingInterns.length,
        completed: completedInterns.length,
        issued: issuedInterns.length
      }
    },
    recentActivity: {
      recentAssignments: mappedAssignments,
      recentProgressUpdates: mappedProgressUpdates
    }
  };
}

module.exports = {
  getAdminDashboard,
  getMentorDashboard
};
