const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Intern = require('../models/Intern');
const User = require('../models/User');

function isValidObjectId(id) {
  return /^[0-9a-f]{24}$/i.test(id);
}

async function createAssignment({ internId, mentorId, assignedBy }) {
  if (!isValidObjectId(internId)) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!isValidObjectId(mentorId)) {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Pre-transaction validation
  const intern = await Intern.findById(internId);
  if (!intern || !intern.isActive) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!['NEW', 'REJECTED_BY_MENTOR'].includes(intern.status)) {
    const err = new Error(`Intern status must be NEW or REJECTED_BY_MENTOR. Current: ${intern.status}`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const mentor = await User.findById(mentorId);
  if (!mentor || !mentor.isActive || mentor.role !== 'MENTOR') {
    const err = new Error('Mentor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Conditional/atomic update of Intern status
    const updatedIntern = await Intern.findOneAndUpdate(
      {
        _id: internId,
        isActive: true,
        status: { $in: ['NEW', 'REJECTED_BY_MENTOR'] }
      },
      { $set: { status: 'ASSIGNED' } },
      { session, new: true }
    );

    if (!updatedIntern) {
      const err = new Error('Intern status changed concurrently or intern was deactivated');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // Create pending assignment
    const assignment = new Assignment({
      internId,
      mentorId,
      assignedBy,
      status: 'PENDING'
    });

    await assignment.save({ session });

    await session.commitTransaction();
    return assignment;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function acceptAssignment(assignmentId, loggedInMentorId) {
  if (!isValidObjectId(assignmentId)) {
    const err = new Error('Assignment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Pre-transaction check to hide existence if not belonging to this mentor
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment || String(assignment.mentorId) !== String(loggedInMentorId)) {
    const err = new Error('Assignment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (assignment.status !== 'PENDING') {
    const err = new Error('Assignment is not in PENDING status');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const intern = await Intern.findById(assignment.internId);
  if (!intern || !intern.isActive) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (intern.status !== 'ASSIGNED') {
    const err = new Error('Intern status must be ASSIGNED to accept');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Conditional/atomic update on Assignment status
    const updatedAssignment = await Assignment.findOneAndUpdate(
      { _id: assignmentId, mentorId: loggedInMentorId, status: 'PENDING' },
      { $set: { status: 'ACCEPTED', decidedAt: new Date() } },
      { session, new: true }
    );

    if (!updatedAssignment) {
      const err = new Error('Assignment status changed concurrently');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // Conditional/atomic update on Intern status
    const updatedIntern = await Intern.findOneAndUpdate(
      { _id: assignment.internId, isActive: true, status: 'ASSIGNED' },
      { $set: { status: 'ONGOING' } },
      { session, new: true }
    );

    if (!updatedIntern) {
      const err = new Error('Intern status changed concurrently or intern was deactivated');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    await session.commitTransaction();
    return updatedAssignment;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function rejectAssignment(assignmentId, loggedInMentorId, remarks, suggestedMentorId) {
  if (!isValidObjectId(assignmentId)) {
    const err = new Error('Assignment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Pre-transaction check to hide existence if not belonging to this mentor
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment || String(assignment.mentorId) !== String(loggedInMentorId)) {
    const err = new Error('Assignment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (assignment.status !== 'PENDING') {
    const err = new Error('Assignment is not in PENDING status');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (!remarks || !remarks.trim()) {
    const err = new Error('rejectionRemarks is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (suggestedMentorId) {
    if (!isValidObjectId(suggestedMentorId)) {
      const err = new Error('Suggested mentor not found');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const suggestedMentor = await User.findById(suggestedMentorId);
    if (!suggestedMentor || !suggestedMentor.isActive || suggestedMentor.role !== 'MENTOR') {
      const err = new Error('Suggested mentor must be an active MENTOR');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  const intern = await Intern.findById(assignment.internId);
  if (!intern || !intern.isActive) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Conditional/atomic update on Assignment status
    const updatedAssignment = await Assignment.findOneAndUpdate(
      { _id: assignmentId, mentorId: loggedInMentorId, status: 'PENDING' },
      {
        $set: {
          status: 'REJECTED',
          rejectionRemarks: remarks.trim(),
          suggestedMentorId: suggestedMentorId || undefined,
          decidedAt: new Date()
        }
      },
      { session, new: true }
    );

    if (!updatedAssignment) {
      const err = new Error('Assignment status changed concurrently');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // Conditional/atomic update on Intern status
    const updatedIntern = await Intern.findOneAndUpdate(
      { _id: assignment.internId, isActive: true, status: 'ASSIGNED' },
      { $set: { status: 'REJECTED_BY_MENTOR' } },
      { session, new: true }
    );

    if (!updatedIntern) {
      const err = new Error('Intern status changed concurrently or intern was deactivated');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    await session.commitTransaction();
    return updatedAssignment;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function getAssignmentsForMentor(mentorId, statusFilter) {
  const query = { mentorId };
  const validStatuses = ['PENDING', 'ACCEPTED', 'REJECTED'];
  if (statusFilter === 'ALL') {
    // No status filter
  } else if (validStatuses.includes(statusFilter)) {
    query.status = statusFilter;
  } else {
    query.status = 'PENDING'; // Default
  }

  const assignments = await Assignment.find(query)
    .populate('internId', 'internId fullName email branch trainingType startDate endDate status instituteName educationalQualification')
    .sort({ assignedAt: -1 });

  return assignments;
}

async function getAssignmentByIdAndMentor(assignmentId, mentorId) {
  if (!isValidObjectId(assignmentId)) {
    const err = new Error('Assignment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const assignment = await Assignment.findById(assignmentId)
    .populate('internId', 'internId fullName email branch trainingType startDate endDate status instituteName educationalQualification');

  if (!assignment || String(assignment.mentorId) !== String(mentorId)) {
    const err = new Error('Assignment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return assignment;
}

module.exports = {
  createAssignment,
  acceptAssignment,
  rejectAssignment,
  getAssignmentsForMentor,
  getAssignmentByIdAndMentor,
  isValidObjectId
};
