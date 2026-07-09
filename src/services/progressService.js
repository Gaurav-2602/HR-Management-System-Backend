const mongoose = require('mongoose');
const Progress = require('../models/Progress');
const Intern = require('../models/Intern');
const Assignment = require('../models/Assignment');
const User = require('../models/User');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function getOngoingInternsForMentor(mentorId) {
  const assignments = await Assignment.find({ mentorId, status: 'ACCEPTED' })
    .populate({
      path: 'internId',
      match: { isActive: true, status: 'ONGOING' },
      select: 'internId fullName email branch trainingType startDate endDate status'
    });

  // Filter out assignments where populate match didn't yield an intern
  const validAssignments = assignments.filter(a => a.internId !== null);
  
  const uniqueInterns = [];
  const seenIds = new Set();
  for (const a of validAssignments) {
    const idStr = String(a.internId._id);
    if (!seenIds.has(idStr)) {
      seenIds.add(idStr);
      uniqueInterns.push(a.internId);
    }
  }
  return uniqueInterns;
}

async function getInternDetails(internId, mentorId) {
  if (!isValidObjectId(internId)) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const assignment = await Assignment.findOne({
    internId,
    mentorId,
    status: 'ACCEPTED'
  }).sort({ assignedAt: -1 });

  if (!assignment) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const intern = await Intern.findOne({ _id: internId, isActive: true, status: 'ONGOING' });
  if (!intern) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return intern;
}

async function recordProgressUpdate(mentorId, { internId, progressPercentage, remarks, performanceRating, skillsCovered, nextGoals }) {
  if (!isValidObjectId(internId)) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const assignment = await Assignment.findOne({
    internId,
    mentorId,
    status: 'ACCEPTED'
  }).sort({ assignedAt: -1 });

  if (!assignment) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const intern = await Intern.findById(internId);
  if (!intern || !intern.isActive) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (intern.status !== 'ONGOING') {
    const err = new Error(`Cannot record progress for intern with status: ${intern.status}`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 1. progressPercentage validations
  if (
    progressPercentage === undefined ||
    progressPercentage === null ||
    typeof progressPercentage !== 'number' ||
    !Number.isInteger(progressPercentage) ||
    progressPercentage < 0 ||
    progressPercentage > 99
  ) {
    const err = new Error('progressPercentage is required and must be an integer between 0 and 99');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 2. remarks validation
  if (!remarks || typeof remarks !== 'string' || !remarks.trim()) {
    const err = new Error('remarks is required and must be a non-empty string');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 3. performanceRating validation (optional)
  if (performanceRating !== undefined) {
    if (
      performanceRating === null ||
      typeof performanceRating !== 'number' ||
      !Number.isInteger(performanceRating) ||
      performanceRating < 1 ||
      performanceRating > 5
    ) {
      const err = new Error('performanceRating must be an integer between 1 and 5');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  // 4. skillsCovered validation (optional)
  if (skillsCovered !== undefined) {
    if (!Array.isArray(skillsCovered)) {
      const err = new Error('skillsCovered must be an array');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    for (const item of skillsCovered) {
      if (typeof item !== 'string' || !item.trim()) {
        const err = new Error('skillsCovered items must be non-empty strings');
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
    }
  }

  // 5. nextGoals validation (optional)
  if (nextGoals !== undefined) {
    if (typeof nextGoals !== 'string' || !nextGoals.trim()) {
      const err = new Error('nextGoals must be a non-empty string');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  // 6. Check strictly increasing constraint
  const latestProgress = await Progress.findOne({ assignmentId: assignment._id })
    .sort({ progressPercentage: -1 });
  const highestPercentage = latestProgress ? latestProgress.progressPercentage : -1;

  if (progressPercentage <= highestPercentage) {
    const err = new Error(`progressPercentage must be strictly greater than the highest existing percentage (${highestPercentage})`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Build document payload (omit undefined optional fields)
  const progressData = {
    internId,
    assignmentId: assignment._id,
    recordedBy: mentorId,
    progressPercentage,
    remarks: remarks.trim()
  };

  if (performanceRating !== undefined) {
    progressData.performanceRating = performanceRating;
  }
  if (skillsCovered !== undefined) {
    progressData.skillsCovered = skillsCovered.map(s => s.trim());
  }
  if (nextGoals !== undefined) {
    progressData.nextGoals = nextGoals.trim();
  }

  const progress = new Progress(progressData);
  await progress.save();
  return progress;
}

async function getInternProgressHistory(internId, requesterId, requesterRole) {
  if (!isValidObjectId(internId)) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (requesterRole === 'MENTOR') {
    const assignment = await Assignment.findOne({
      internId,
      mentorId: requesterId,
      status: 'ACCEPTED'
    }).sort({ assignedAt: -1 });

    if (!assignment) {
      const err = new Error('Intern not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    return await Progress.find({ assignmentId: assignment._id }).sort({ recordedAt: 1 });
  } else if (requesterRole === 'HR_ADMIN') {
    const internExists = await Intern.findById(internId);
    if (!internExists) {
      const err = new Error('Intern not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    return await Progress.find({ internId }).sort({ recordedAt: 1 });
  } else {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
}

async function completeInternTraining(mentorId, internId, { finalRemarks, finalRating }) {
  if (!isValidObjectId(internId)) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const assignment = await Assignment.findOne({
    internId,
    mentorId,
    status: 'ACCEPTED'
  }).sort({ assignedAt: -1 });

  if (!assignment) {
    const err = new Error('Intern not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (!finalRemarks || typeof finalRemarks !== 'string' || !finalRemarks.trim()) {
    const err = new Error('finalRemarks is required and must be a non-empty string');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (
    finalRating === undefined ||
    finalRating === null ||
    typeof finalRating !== 'number' ||
    !Number.isInteger(finalRating) ||
    finalRating < 1 ||
    finalRating > 5
  ) {
    const err = new Error('finalRating is required and must be an integer between 1 and 5');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // 1. Conditionally update Intern status to COMPLETED
    const updatedIntern = await Intern.findOneAndUpdate(
      { _id: internId, isActive: true, status: 'ONGOING' },
      { $set: { status: 'COMPLETED' } },
      { session, new: true }
    );

    if (!updatedIntern) {
      const err = new Error('Intern status changed concurrently or intern was deactivated');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // 2. Create final Progress record (triggers unique index on assignmentId where isFinal: true)
    const finalProgress = new Progress({
      internId,
      assignmentId: assignment._id,
      recordedBy: mentorId,
      progressPercentage: 100,
      remarks: finalRemarks.trim(),
      performanceRating: finalRating,
      isFinal: true
    });

    await finalProgress.save({ session });

    await session.commitTransaction();
    return updatedIntern;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  getOngoingInternsForMentor,
  getInternDetails,
  recordProgressUpdate,
  getInternProgressHistory,
  completeInternTraining
};
