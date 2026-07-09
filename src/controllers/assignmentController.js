const assignmentService = require('../services/assignmentService');

function mapSafeAssignment(assignment) {
  if (!assignment) return null;
  const a = assignment.toObject ? assignment.toObject() : assignment;
  
  const mapped = {
    id: String(a._id),
    status: a.status,
    assignedAt: a.assignedAt,
    decidedAt: a.decidedAt,
    rejectionRemarks: a.rejectionRemarks,
    suggestedMentorId: a.suggestedMentorId ? String(a.suggestedMentorId) : undefined
  };

  if (a.internId) {
    if (a.internId._id) {
      // Populated Intern document
      mapped.intern = {
        id: String(a.internId._id),
        internId: a.internId.internId,
        fullName: a.internId.fullName,
        email: a.internId.email,
        branch: a.internId.branch,
        trainingType: a.internId.trainingType,
        startDate: a.internId.startDate,
        endDate: a.internId.endDate,
        status: a.internId.status,
        instituteName: a.internId.instituteName,
        educationalQualification: a.internId.educationalQualification
      };
    } else {
      // Unpopulated ObjectId reference
      mapped.internId = String(a.internId);
    }
  }

  if (a.mentorId) {
    mapped.mentorId = String(a.mentorId);
  }

  if (a.assignedBy) {
    mapped.assignedBy = String(a.assignedBy);
  }

  return mapped;
}

function handleErrors(err, res) {
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Intern already has a pending assignment' });
  }
  if (err.code === 'NOT_FOUND') {
    return res.status(404).json({ error: err.message });
  }
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Internal server error' });
}

async function createAssignment(req, res) {
  try {
    const { internId, mentorId } = req.body;
    if (!internId || !mentorId) {
      return res.status(400).json({ error: 'internId and mentorId are required' });
    }

    const assignment = await assignmentService.createAssignment({
      internId,
      mentorId,
      assignedBy: req.user.id
    });

    res.status(201).json({
      message: 'Intern assigned successfully',
      assignment: mapSafeAssignment(assignment)
    });
  } catch (err) {
    handleErrors(err, res);
  }
}

async function getMyAssignments(req, res) {
  try {
    const status = req.query.status;
    const assignments = await assignmentService.getAssignmentsForMentor(req.user.id, status);
    res.status(200).json({
      data: assignments.map(mapSafeAssignment)
    });
  } catch (err) {
    handleErrors(err, res);
  }
}

async function getAssignmentById(req, res) {
  try {
    const assignment = await assignmentService.getAssignmentByIdAndMentor(req.params.id, req.user.id);
    res.status(200).json(mapSafeAssignment(assignment));
  } catch (err) {
    handleErrors(err, res);
  }
}

async function acceptAssignment(req, res) {
  try {
    const assignment = await assignmentService.acceptAssignment(req.params.id, req.user.id);
    res.status(200).json({
      message: 'Assignment accepted successfully',
      assignment: mapSafeAssignment(assignment)
    });
  } catch (err) {
    handleErrors(err, res);
  }
}

async function rejectAssignment(req, res) {
  try {
    const { rejectionRemarks, suggestedMentorId } = req.body;
    const assignment = await assignmentService.rejectAssignment(
      req.params.id,
      req.user.id,
      rejectionRemarks,
      suggestedMentorId
    );
    res.status(200).json({
      message: 'Assignment rejected successfully',
      assignment: mapSafeAssignment(assignment)
    });
  } catch (err) {
    handleErrors(err, res);
  }
}

module.exports = {
  createAssignment,
  getMyAssignments,
  getAssignmentById,
  acceptAssignment,
  rejectAssignment
};
