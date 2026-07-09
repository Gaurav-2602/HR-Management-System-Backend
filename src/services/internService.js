const Intern = require('../models/Intern');
const Counter = require('../models/Counter');
const Progress = require('../models/Progress');
const Assignment = require('../models/Assignment');

async function generateInternId() {
  const currentYear = new Date().getFullYear();

  const counter = await Counter.findOneAndUpdate(
    { year: currentYear },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );

  const sequentialNumber = String(counter.count).padStart(5, '0');
  return `INTERN-${currentYear}-${sequentialNumber}`;
}

function maskAadhaar(aadhaar) {
  if (!aadhaar) return undefined;
  const lastFour = aadhaar.slice(-4);
  return `XXXXXXXX${lastFour}`;
}

function getInternListItem(intern) {
  return {
    id: intern._id.toString(),
    internId: intern.internId,
    fullName: intern.fullName,
    email: intern.email,
    mobileNumber: intern.mobileNumber,
    instituteName: intern.instituteName,
    branch: intern.branch,
    trainingType: intern.trainingType,
    startDate: intern.startDate,
    endDate: intern.endDate,
    status: intern.status,
    createdAt: intern.createdAt
  };
}

function getInternDetails(intern) {
  const details = {
    id: intern._id.toString(),
    internId: intern.internId,
    fullName: intern.fullName,
    dateOfBirth: intern.dateOfBirth,
    presentAddress: intern.presentAddress,
    permanentAddress: intern.permanentAddress,
    mobileNumber: intern.mobileNumber,
    email: intern.email,
    photoUrl: intern.photoUrl,
    educationalQualification: intern.educationalQualification,
    instituteName: intern.instituteName,
    branch: intern.branch,
    semesterMarks: intern.semesterMarks,
    familyMembersInForeignOrganizations: intern.familyMembersInForeignOrganizations,
    previousOrganizationExperience: intern.previousOrganizationExperience,
    previousDRDOExperience: intern.previousDRDOExperience,
    trainingType: intern.trainingType,
    startDate: intern.startDate,
    endDate: intern.endDate,
    division: intern.division,
    identificationMark: intern.identificationMark,
    passNumber: intern.passNumber,
    status: intern.status,
    createdAt: intern.createdAt,
    updatedAt: intern.updatedAt
  };

  if (intern.aadhaarNumber) {
    details.aadhaarNumber = maskAadhaar(intern.aadhaarNumber);
  }

  return details;
}

async function createIntern(data) {
  const normalizedData = {
    ...data,
    email: (data.email || '').trim().toLowerCase()
  };

  const existingEmail = await Intern.findOne({ email: normalizedData.email, isActive: true });
  if (existingEmail) {
    const err = new Error('Email already in use');
    err.code = 'DUPLICATE_EMAIL';
    throw err;
  }

  if (normalizedData.aadhaarNumber) {
    if (!/^\d{12}$/.test(normalizedData.aadhaarNumber)) {
      const err = new Error('Aadhaar number must be exactly 12 digits');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const existingAadhaar = await Intern.findOne({
      aadhaarNumber: normalizedData.aadhaarNumber,
      isActive: true
    });
    if (existingAadhaar) {
      const err = new Error('Aadhaar number already in use');
      err.code = 'DUPLICATE_AADHAAR';
      throw err;
    }
  }

  if (normalizedData.startDate >= normalizedData.endDate) {
    const err = new Error('startDate must be before endDate');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const internId = await generateInternId();
  const intern = new Intern({
    ...normalizedData,
    internId,
    status: 'NEW',
    isActive: true
  });

  await intern.save();
  return intern;
}

async function getAllInterns(page = 1, limit = 10, filters = {}) {
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 10));

  const query = { isActive: true };

  if (filters.status && filters.status !== 'ALL') {
    query.status = filters.status;
  }

  if (filters.search) {
    const searchRegex = new RegExp(filters.search.trim(), 'i');
    query.$or = [
      { internId: searchRegex },
      { fullName: searchRegex },
      { email: searchRegex },
      { instituteName: searchRegex },
      { branch: searchRegex }
    ];
  }

  const total = await Intern.countDocuments(query);
  const interns = await Intern.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    data: interns.map(getInternListItem),
    pagination: {
      currentPage: page,
      pageSize: interns.length,
      totalRecords: total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

function isValidObjectId(id) {
  return /^[0-9a-f]{24}$/i.test(id);
}

async function getInternById(internId) {
  if (!isValidObjectId(internId)) {
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

  return intern;
}

async function updateIntern(internId, updates) {
  const intern = await getInternById(internId);

  const protectedFields = ['internId', 'status', 'isActive', 'createdAt', 'updatedAt', 'certificateNumber', 'issuedAt', 'issuedBy', 'finalHrRemarks'];
  protectedFields.forEach(field => {
    delete updates[field];
  });

  if (updates.email) {
    updates.email = (updates.email || '').trim().toLowerCase();
    if (updates.email !== intern.email) {
      const existingEmail = await Intern.findOne({
        email: updates.email,
        isActive: true,
        _id: { $ne: internId }
      });
      if (existingEmail) {
        const err = new Error('Email already in use');
        err.code = 'DUPLICATE_EMAIL';
        throw err;
      }
    }
  }

  if (updates.aadhaarNumber) {
    if (!/^\d{12}$/.test(updates.aadhaarNumber)) {
      const err = new Error('Aadhaar number must be exactly 12 digits');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (updates.aadhaarNumber !== intern.aadhaarNumber) {
      const existingAadhaar = await Intern.findOne({
        aadhaarNumber: updates.aadhaarNumber,
        isActive: true,
        _id: { $ne: internId }
      });
      if (existingAadhaar) {
        const err = new Error('Aadhaar number already in use');
        err.code = 'DUPLICATE_AADHAAR';
        throw err;
      }
    }
  }

  const newStartDate = updates.startDate || intern.startDate;
  const newEndDate = updates.endDate || intern.endDate;

  if (newStartDate >= newEndDate) {
    const err = new Error('startDate must be before endDate');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  Object.assign(intern, updates);
  await intern.save();
  return intern;
}

async function deleteInternSoft(internId) {
  const intern = await getInternById(internId);

  intern.isActive = false;
  await intern.save();
  return intern;
}

async function issueCertificate(internId, adminId, input) {
  if (!isValidObjectId(internId)) {
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

  if (intern.status !== 'COMPLETED') {
    const err = new Error('Intern status must be COMPLETED');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const { certificateNumber, finalHrRemarks } = input;
  if (!certificateNumber || typeof certificateNumber !== 'string' || certificateNumber.trim() === '') {
    const err = new Error('Certificate number is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const sanitizedCertificateNumber = certificateNumber.trim();
  if (sanitizedCertificateNumber.length > 50) {
    const err = new Error('Certificate number exceeds maximum length of 50 characters');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  let sanitizedRemarks;
  if (finalHrRemarks !== undefined) {
    if (typeof finalHrRemarks !== 'string') {
      const err = new Error('Invalid final HR remarks');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    const trimmedRemarks = finalHrRemarks.trim();
    if (trimmedRemarks === '') {
      const err = new Error('Invalid final HR remarks');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (trimmedRemarks.length > 500) {
      const err = new Error('Final HR remarks exceeds maximum length of 500 characters');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    sanitizedRemarks = trimmedRemarks;
  }

  const currentAssignment = await Assignment.findOne({
    internId,
    status: 'ACCEPTED'
  }).sort({
    assignedAt: -1,
    createdAt: -1
  });

  if (!currentAssignment) {
    const err = new Error('Intern lacks a valid final progress completion record');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const finalProgress = await Progress.findOne({
    internId,
    assignmentId: currentAssignment._id,
    isFinal: true,
    progressPercentage: 100
  });

  if (!finalProgress) {
    const err = new Error('Intern lacks a valid final progress completion record');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const setOps = {
    status: 'ISSUED',
    certificateNumber: sanitizedCertificateNumber,
    issuedAt: new Date(),
    issuedBy: adminId
  };

  if (sanitizedRemarks !== undefined) {
    setOps.finalHrRemarks = sanitizedRemarks;
  }

  const updatedIntern = await Intern.findOneAndUpdate(
    { _id: internId, isActive: true, status: 'COMPLETED' },
    { $set: setOps },
    { new: true, runValidators: true }
  );

  if (!updatedIntern) {
    const err = new Error('Workflow conflict: Intern status was modified by another request');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  return updatedIntern;
}

async function getIssuanceDetails(internId) {
  if (!isValidObjectId(internId)) {
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

  if (intern.status !== 'COMPLETED' && intern.status !== 'ISSUED') {
    const err = new Error('Intern is not in an eligible state for issuance details');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  return intern;
}

function mapSafeIssuanceDetails(intern) {
  const result = {
    id: intern._id.toString(),
    internId: intern.internId,
    fullName: intern.fullName,
    email: intern.email,
    instituteName: intern.instituteName,
    branch: intern.branch,
    trainingType: intern.trainingType,
    startDate: intern.startDate,
    endDate: intern.endDate,
    status: intern.status,
    certificateNumber: intern.certificateNumber,
    issuedAt: intern.issuedAt,
    issuedBy: intern.issuedBy ? intern.issuedBy.toString() : undefined
  };

  if (intern.finalHrRemarks !== undefined && intern.finalHrRemarks !== null) {
    result.finalHrRemarks = intern.finalHrRemarks;
  }

  return result;
}

module.exports = {
  createIntern,
  getAllInterns,
  getInternById,
  updateIntern,
  deleteInternSoft,
  getInternListItem,
  getInternDetails,
  isValidObjectId,
  issueCertificate,
  getIssuanceDetails,
  mapSafeIssuanceDetails
};
