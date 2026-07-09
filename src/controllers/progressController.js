const progressService = require('../services/progressService');

function mapSafeInternListItem(intern) {
  if (!intern) return null;
  const a = intern.toObject ? intern.toObject() : intern;
  return {
    id: String(a._id),
    internId: a.internId,
    fullName: a.fullName,
    email: a.email,
    branch: a.branch,
    trainingType: a.trainingType,
    startDate: a.startDate,
    endDate: a.endDate,
    status: a.status
  };
}

function mapSafeInternDetail(intern) {
  if (!intern) return null;
  const a = intern.toObject ? intern.toObject() : intern;
  return {
    id: String(a._id),
    internId: a.internId,
    fullName: a.fullName,
    email: a.email,
    branch: a.branch,
    trainingType: a.trainingType,
    startDate: a.startDate,
    endDate: a.endDate,
    status: a.status,
    instituteName: a.instituteName,
    educationalQualification: a.educationalQualification,
    semesterMarks: a.semesterMarks,
    division: a.division,
    identificationMark: a.identificationMark,
    passNumber: a.passNumber,
    photoUrl: a.photoUrl
  };
}

function mapSafeProgressItem(p) {
  if (!p) return null;
  const a = p.toObject ? p.toObject() : p;
  const mapped = {
    id: String(a._id),
    internId: String(a.internId),
    assignmentId: String(a.assignmentId),
    progressPercentage: a.progressPercentage,
    remarks: a.remarks,
    isFinal: a.isFinal,
    recordedBy: String(a.recordedBy),
    recordedAt: a.recordedAt
  };
  if (a.performanceRating !== undefined && a.performanceRating !== null) {
    mapped.performanceRating = a.performanceRating;
  }
  if (a.skillsCovered !== undefined && a.skillsCovered !== null) {
    mapped.skillsCovered = a.skillsCovered;
  }
  if (a.nextGoals !== undefined && a.nextGoals !== null) {
    mapped.nextGoals = a.nextGoals;
  }
  return mapped;
}

function handleErrors(err, res) {
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate completion record' });
  }
  if (err.code === 'NOT_FOUND') {
    return res.status(404).json({ error: err.message });
  }
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Internal server error' });
}

async function getOngoingInterns(req, res) {
  try {
    const list = await progressService.getOngoingInternsForMentor(req.user.id);
    res.status(200).json({
      data: list.map(mapSafeInternListItem)
    });
  } catch (err) {
    handleErrors(err, res);
  }
}

async function getInternDetails(req, res) {
  try {
    const intern = await progressService.getInternDetails(req.params.internId, req.user.id);
    res.status(200).json(mapSafeInternDetail(intern));
  } catch (err) {
    handleErrors(err, res);
  }
}

async function recordProgress(req, res) {
  try {
    const { internId, progressPercentage, remarks, performanceRating, skillsCovered, nextGoals } = req.body;
    
    if (!internId) {
      return res.status(400).json({ error: 'internId is required' });
    }

    const progress = await progressService.recordProgressUpdate(req.user.id, {
      internId,
      progressPercentage,
      remarks,
      performanceRating,
      skillsCovered,
      nextGoals
    });

    res.status(201).json({
      message: 'Progress update recorded successfully',
      progress: mapSafeProgressItem(progress)
    });
  } catch (err) {
    handleErrors(err, res);
  }
}

async function getProgressHistory(req, res) {
  try {
    const list = await progressService.getInternProgressHistory(
      req.params.internId,
      req.user.id,
      req.user.role
    );
    res.status(200).json({
      data: list.map(mapSafeProgressItem)
    });
  } catch (err) {
    handleErrors(err, res);
  }
}

async function completeTraining(req, res) {
  try {
    const { finalRemarks, finalRating } = req.body;
    const intern = await progressService.completeInternTraining(
      req.user.id,
      req.params.internId,
      { finalRemarks, finalRating }
    );

    res.status(200).json({
      message: 'Training completed successfully',
      internStatus: intern.status
    });
  } catch (err) {
    handleErrors(err, res);
  }
}

module.exports = {
  getOngoingInterns,
  getInternDetails,
  recordProgress,
  getProgressHistory,
  completeTraining
};
