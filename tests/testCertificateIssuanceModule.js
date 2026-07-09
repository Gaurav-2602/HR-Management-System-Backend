require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Intern = require('../src/models/Intern');
const Assignment = require('../src/models/Assignment');
const Progress = require('../src/models/Progress');
const {
  issueCertificate,
  getIssuanceDetails,
  updateIntern
} = require('../src/controllers/internController');
const {
  createAssignment,
  acceptAssignment
} = require('../src/controllers/assignmentController');

const MONGO_URI = process.env.MONGO_URI;

let tempUserIds = [];
let tempInternIds = [];
let tempAssignmentIds = [];
let tempProgressIds = [];

function makeMocks() {
  const req = {
    headers: {},
    params: {},
    body: {},
    query: {},
    user: null
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
    }
  };

  const next = function () {};

  return { req, res, next };
}

async function setup() {
  if (!MONGO_URI) {
    throw new Error('MONGO_URI not configured');
  }
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');
}

async function createTestUser(role, emailPrefix) {
  const user = new User({
    fullName: `Test ${role}`,
    email: `${emailPrefix}-${Date.now()}-${Math.random()}@test.com`,
    password: 'TestPassword123!',
    role,
    isActive: true
  });
  await user.save();
  tempUserIds.push(user._id.toString());
  return user;
}

async function createTestIntern(status = 'NEW', emailPrefix) {
  const intern = new Intern({
    internId: `INT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    fullName: 'Test Intern',
    dateOfBirth: new Date('2000-01-01'),
    presentAddress: '123 Test St',
    permanentAddress: '456 Perm St',
    mobileNumber: '1234567890',
    email: `${emailPrefix || 'intern'}-${Date.now()}-${Math.random()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'Test College',
    branch: 'CS',
    aadhaarNumber: String(Math.floor(100000000000 + Math.random() * 900000000000)),
    trainingType: 'INTERNSHIP',
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status,
    isActive: true,
    passNumber: 'PASS-INITIAL-123'
  });
  await intern.save();
  tempInternIds.push(intern._id.toString());
  return intern;
}

async function assignAndAcceptIntern(admin, mentor, intern) {
  const { req: assignReq, res: assignRes } = makeMocks();
  assignReq.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  assignReq.body = { internId: intern._id.toString(), mentorId: mentor._id.toString() };
  
  await createAssignment(assignReq, assignRes);
  if (assignRes.statusCode !== 201) {
    throw new Error(`Helper failed to create assignment: ${JSON.stringify(assignRes.data)}`);
  }
  const assignmentId = assignRes.data.assignment.id;
  if (!tempAssignmentIds.includes(assignmentId)) {
    tempAssignmentIds.push(assignmentId);
  }

  const { req: acceptReq, res: acceptRes } = makeMocks();
  acceptReq.user = { id: mentor._id.toString(), role: 'MENTOR' };
  acceptReq.params = { id: assignmentId };
  
  await acceptAssignment(acceptReq, acceptRes);
  if (acceptRes.statusCode !== 200) {
    throw new Error(`Helper failed to accept assignment: ${JSON.stringify(acceptRes.data)}`);
  }
  return assignmentId;
}

async function createEligibleCompletedIntern(admin, mentor, emailPrefix) {
  const intern = await createTestIntern('NEW', emailPrefix);
  const aId = await assignAndAcceptIntern(admin, mentor, intern);

  const progress = new Progress({
    internId: intern._id,
    assignmentId: aId,
    recordedBy: mentor._id,
    progressPercentage: 100,
    remarks: 'Final evaluation complete',
    isFinal: true,
    recordedAt: new Date()
  });
  await progress.save();
  tempProgressIds.push(progress._id.toString());

  intern.status = 'COMPLETED';
  await intern.save();

  return { intern, aId };
}

// Test 1: HR_ADMIN authorization
async function testHrAdminAuthorization() {
  const { authorizeRoles } = require('../src/middleware/auth');
  const admin = await createTestUser('HR_ADMIN', 'admin-t1');
  const mentor = await createTestUser('MENTOR', 'mentor-t1');

  const authMiddleware = authorizeRoles('HR_ADMIN');

  // Case A: HR_ADMIN calls next()
  let hrCalledNext = false;
  const { req: reqAdmin, res: resAdmin } = makeMocks();
  reqAdmin.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  const nextAdmin = () => { hrCalledNext = true; };

  authMiddleware(reqAdmin, resAdmin, nextAdmin);
  if (!hrCalledNext) {
    throw new Error('Test 1 FAILED: Expected authorizeRoles middleware to call next() for HR_ADMIN');
  }

  // Case B: MENTOR returns 403 and does not call next()
  let mentorCalledNext = false;
  const { req: reqMentor, res: resMentor } = makeMocks();
  reqMentor.user = { id: mentor._id.toString(), role: 'MENTOR' };
  const nextMentor = () => { mentorCalledNext = true; };

  authMiddleware(reqMentor, resMentor, nextMentor);
  if (mentorCalledNext) {
    throw new Error('Test 1 FAILED: Expected authorizeRoles middleware NOT to call next() for MENTOR');
  }
  if (resMentor.statusCode !== 403) {
    throw new Error(`Test 1 FAILED: Expected authorizeRoles middleware to return 403 for MENTOR, got ${resMentor.statusCode}`);
  }

  console.log('✓ Test 1 PASSED: HR_ADMIN authorization constraints enforced correctly');
}

// Test 2: Eligible issuance details
async function testEligibleIssuanceDetails() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t2');
  const mentor = await createTestUser('MENTOR', 'mentor-t2');
  const { intern } = await createEligibleCompletedIntern(admin, mentor, 'intern-t2');

  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req.params = { id: intern._id.toString() };
  await getIssuanceDetails(req, res);

  if (res.statusCode !== 200) {
    throw new Error(`Test 2 FAILED: Expected 200, got ${res.statusCode}`);
  }

  const data = res.data;
  const allowedKeys = [
    'id', 'internId', 'fullName', 'email', 'instituteName', 'branch',
    'trainingType', 'startDate', 'endDate', 'status', 'certificateNumber',
    'issuedAt', 'issuedBy', 'finalHrRemarks'
  ];

  Object.keys(data).forEach(key => {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Test 2 FAILED: Prohibited key "${key}" found in details response`);
    }
  });

  if (data.certificateNumber !== undefined || data.issuedAt !== undefined || data.issuedBy !== undefined || data.finalHrRemarks !== undefined) {
    throw new Error('Test 2 FAILED: Certificate fields should be absent before issuance');
  }

  console.log('✓ Test 2 PASSED: Details retrieved safely; certificate fields absent before issuance');
}

// Test 3: Issuance detail privacy
async function testIssuanceDetailPrivacy() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t3');
  const mentor = await createTestUser('MENTOR', 'mentor-t3');
  const { intern } = await createEligibleCompletedIntern(admin, mentor, 'intern-t3');

  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req.params = { id: intern._id.toString() };
  await getIssuanceDetails(req, res);

  if (res.statusCode !== 200) {
    throw new Error(`Test 3 FAILED: Details failed with ${res.statusCode}`);
  }

  const serialized = JSON.stringify(res.data);
  const forbiddenSubstrings = [
    intern.aadhaarNumber,
    '123 Test St',
    '456 Perm St',
    'TestPassword123!',
    'familyMembers'
  ];

  forbiddenSubstrings.forEach(sub => {
    if (serialized.includes(sub)) {
      throw new Error(`Test 3 FAILED: Sensitive substring "${sub}" exposed in details response`);
    }
  });

  const prohibitedFields = ['aadhaarNumber', 'presentAddress', 'permanentAddress', 'password', 'familyMembersInForeignOrganizations'];
  prohibitedFields.forEach(f => {
    if (f in res.data) {
      throw new Error(`Test 3 FAILED: Prohibited key "${f}" present in response data`);
    }
  });

  console.log('✓ Test 3 PASSED: Sensitive information completely shielded in detail view');
}

// Test 4: Invalid intern access
async function testInvalidInternAccess() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t4');
  const mentor = await createTestUser('MENTOR', 'mentor-t4');

  // Case A: Invalid ObjectId -> 404
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqA.params = { id: 'invalid-id' };
  await getIssuanceDetails(reqA, resA);
  if (resA.statusCode !== 404) {
    throw new Error(`Test 4a FAILED: Expected 404 for invalid ObjectId, got ${resA.statusCode}`);
  }

  // Case B: Non-existent intern -> 404
  const fakeId = new mongoose.Types.ObjectId().toString();
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqB.params = { id: fakeId };
  await getIssuanceDetails(reqB, resB);
  if (resB.statusCode !== 404) {
    throw new Error(`Test 4b FAILED: Expected 404 for nonexistent intern, got ${resB.statusCode}`);
  }

  // Case C: Inactive intern -> 404
  const internC = await createTestIntern('COMPLETED', 'intern-t4c');
  internC.isActive = false;
  await internC.save();

  const { req: reqC, res: resC } = makeMocks();
  reqC.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqC.params = { id: internC._id.toString() };
  await getIssuanceDetails(reqC, resC);
  if (resC.statusCode !== 404) {
    throw new Error(`Test 4c FAILED: Expected 404 for inactive intern, got ${resC.statusCode}`);
  }

  // Case D: Unrelated status (ONGOING) -> 400
  const internD = await createTestIntern('NEW', 'intern-t4d');
  await assignAndAcceptIntern(admin, mentor, internD); // becomes ONGOING

  const { req: reqD, res: resD } = makeMocks();
  reqD.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqD.params = { id: internD._id.toString() };
  await getIssuanceDetails(reqD, resD);
  if (resD.statusCode !== 400) {
    throw new Error(`Test 4d FAILED: Expected 400 for ONGOING status details access, got ${resD.statusCode}`);
  }

  console.log('✓ Test 4 PASSED: Invalid and wrong workflow status access rejected correctly');
}

// Test 5: Certificate number validation
async function testCertificateNumberValidation() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t5');
  const mentor = await createTestUser('MENTOR', 'mentor-t5');

  const testPayloads = [
    { label: 'missing', payload: {}, expectedStatus: 400 },
    { label: 'null', payload: { certificateNumber: null }, expectedStatus: 400 },
    { label: 'number', payload: { certificateNumber: 12345 }, expectedStatus: 400 },
    { label: 'empty string', payload: { certificateNumber: '' }, expectedStatus: 400 },
    { label: 'whitespace-only', payload: { certificateNumber: '     ' }, expectedStatus: 400 },
    { label: 'too long trimmed', payload: { certificateNumber: 'c'.repeat(51) }, expectedStatus: 400 },
    { label: 'exact length 50 trimmed', payload: { certificateNumber: 'c'.repeat(50) }, expectedStatus: 200 },
    { label: 'long raw but valid trimmed', payload: { certificateNumber: '   ' + 'k'.repeat(45) + '   ' }, expectedStatus: 200 }
  ];

  for (const item of testPayloads) {
    const safeLabel = item.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const { intern } = await createEligibleCompletedIntern(admin, mentor, `intern-t5-${safeLabel}`);

    const { req, res } = makeMocks();
    req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
    req.params = { id: intern._id.toString() };
    req.body = item.payload;

    await issueCertificate(req, res);

    if (res.statusCode !== item.expectedStatus) {
      throw new Error(`Test 5 FAILED for case "${item.label}": Expected ${item.expectedStatus}, got ${res.statusCode}`);
    }

    if (item.expectedStatus === 400) {
      const doc = await Intern.findById(intern._id);
      if (doc.status !== 'COMPLETED') {
        throw new Error(`Test 5 FAILED for case "${item.label}": Expected status COMPLETED, got ${doc.status}`);
      }
      if (doc.certificateNumber || doc.issuedAt || doc.issuedBy) {
        throw new Error(`Test 5 FAILED for case "${item.label}": Metadata written on invalid attempt`);
      }
    }

    if (item.expectedStatus === 200) {
      const doc = await Intern.findById(intern._id);
      if (doc.status !== 'ISSUED') {
        throw new Error(`Test 5 FAILED for case "${item.label}": Expected status ISSUED, got ${doc.status}`);
      }
      const expectedTrimmed = item.payload.certificateNumber.trim();
      if (doc.certificateNumber !== expectedTrimmed) {
        throw new Error(`Test 5 FAILED for case "${item.label}": Expected trimmed certificate "${expectedTrimmed}", got "${doc.certificateNumber}"`);
      }
    }
  }

  console.log('✓ Test 5 PASSED: Certificate number validation constraints validated successfully');
}

// Test 6: finalHrRemarks validation
async function testFinalHrRemarksValidation() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t6');
  const mentor = await createTestUser('MENTOR', 'mentor-t6');

  const testPayloads = [
    { label: 'omitted', payload: { certificateNumber: 'CERT-RM-001' }, expectedStatus: 200 },
    { label: 'null', payload: { certificateNumber: 'CERT-RM-002', finalHrRemarks: null }, expectedStatus: 400 },
    { label: 'number', payload: { certificateNumber: 'CERT-RM-003', finalHrRemarks: 12345 }, expectedStatus: 400 },
    { label: 'empty string', payload: { certificateNumber: 'CERT-RM-004', finalHrRemarks: '' }, expectedStatus: 400 },
    { label: 'whitespace-only', payload: { certificateNumber: 'CERT-RM-005', finalHrRemarks: '   ' }, expectedStatus: 400 },
    { label: 'too long trimmed', payload: { certificateNumber: 'CERT-RM-006', finalHrRemarks: 'r'.repeat(501) }, expectedStatus: 400 },
    { label: 'exact length 500 trimmed', payload: { certificateNumber: 'CERT-RM-007', finalHrRemarks: 'r'.repeat(500) }, expectedStatus: 200 },
    { label: 'long raw but valid trimmed', payload: { certificateNumber: 'CERT-RM-008', finalHrRemarks: '   ' + 'r'.repeat(490) + '   ' }, expectedStatus: 200 }
  ];

  for (const item of testPayloads) {
    const safeLabel = item.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const { intern } = await createEligibleCompletedIntern(admin, mentor, `intern-t6-${safeLabel}`);

    const { req, res } = makeMocks();
    req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
    req.params = { id: intern._id.toString() };
    req.body = item.payload;

    await issueCertificate(req, res);

    if (res.statusCode !== item.expectedStatus) {
      throw new Error(`Test 6 FAILED for case "${item.label}": Expected ${item.expectedStatus}, got ${res.statusCode}`);
    }

    if (item.expectedStatus === 400) {
      const doc = await Intern.findById(intern._id);
      if (doc.status !== 'COMPLETED') {
        throw new Error(`Test 6 FAILED for case "${item.label}": Expected status COMPLETED, got ${doc.status}`);
      }
      if (doc.certificateNumber || doc.issuedAt || doc.issuedBy || doc.finalHrRemarks) {
        throw new Error(`Test 6 FAILED for case "${item.label}": Metadata written on invalid attempt`);
      }
    }

    if (item.expectedStatus === 200) {
      const doc = await Intern.findById(intern._id);
      if (doc.status !== 'ISSUED') {
        throw new Error(`Test 6 FAILED for case "${item.label}": Expected status ISSUED, got ${doc.status}`);
      }
      if (item.label === 'omitted') {
        if (doc.finalHrRemarks !== undefined && doc.finalHrRemarks !== null) {
          throw new Error(`Test 6 FAILED: Expected finalHrRemarks to be absent, got "${doc.finalHrRemarks}"`);
        }
      } else if (item.label === 'exact length 500 trimmed') {
        if (doc.finalHrRemarks !== 'r'.repeat(500)) {
          throw new Error(`Test 6 FAILED: Stored remarks do not match exactly. Length: ${doc.finalHrRemarks.length}`);
        }
      } else if (item.label === 'long raw but valid trimmed') {
        if (doc.finalHrRemarks !== 'r'.repeat(490)) {
          throw new Error(`Test 6 FAILED: Stored remarks not trimmed. Got "${doc.finalHrRemarks}"`);
        }
      }
    }
  }

  console.log('✓ Test 6 PASSED: finalHrRemarks validation constraints validated successfully');
}

// Test 7: Completion evidence required
async function testCompletionEvidenceRequired() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t7');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t7');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t7');

  // Case A: No final Progress record -> 400
  const internA = await createTestIntern('NEW', 'intern-t7a');
  await assignAndAcceptIntern(admin, mentorA, internA);
  internA.status = 'COMPLETED';
  await internA.save();

  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqA.params = { id: internA._id.toString() };
  reqA.body = { certificateNumber: 'CERT-T7A-001' };
  await issueCertificate(reqA, resA);

  if (resA.statusCode === 200 && resA.data && resA.data.intern && resA.data.intern.certificateNumber) {
    const roll = await Intern.findById(internA._id);
    roll.status = 'COMPLETED';
    roll.certificateNumber = undefined;
    await roll.save();
  }
  if (resA.statusCode !== 400) {
    throw new Error(`Test 7a FAILED: Expected 400 for missing final progress, got ${resA.statusCode}`);
  }

  // Case B: Final Progress tied to an older/wrong Assignment -> 400
  const internB = await createTestIntern('NEW', 'intern-t7b');
  
  // Assignment 1 to Mentor A
  const aId1 = await assignAndAcceptIntern(admin, mentorA, internB);
  const p1 = new Progress({
    internId: internB._id,
    assignmentId: aId1,
    recordedBy: mentorA._id,
    progressPercentage: 100,
    remarks: 'Evaluation 1',
    isFinal: true,
    recordedAt: new Date(Date.now() - 50000)
  });
  await p1.save();
  tempProgressIds.push(p1._id.toString());

  // Reset intern status back to NEW to allow Assignment 2
  await Intern.updateOne({ _id: internB._id }, { $set: { status: 'NEW' } });
  internB.status = 'NEW';

  // Assignment 2 to Mentor B
  const aId2 = await assignAndAcceptIntern(admin, mentorB, internB);
  
  // Directly transition Intern status to COMPLETED (without final progress on Assignment 2 yet)
  internB.status = 'COMPLETED';
  await internB.save();

  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqB.params = { id: internB._id.toString() };
  reqB.body = { certificateNumber: 'CERT-T7B-001' };
  await issueCertificate(reqB, resB);

  if (resB.statusCode === 200 && resB.data && resB.data.intern && resB.data.intern.certificateNumber) {
    const roll = await Intern.findById(internB._id);
    roll.status = 'COMPLETED';
    roll.certificateNumber = undefined;
    await roll.save();
  }
  if (resB.statusCode !== 400) {
    throw new Error(`Test 7b FAILED: Expected 400 when final progress only exists on older assignment, got ${resB.statusCode}`);
  }

  // Case C: Valid final Progress tied to newest ACCEPTED Assignment allows issuance -> 200
  const p2 = new Progress({
    internId: internB._id,
    assignmentId: aId2,
    recordedBy: mentorB._id,
    progressPercentage: 100,
    remarks: 'Evaluation 2',
    isFinal: true,
    recordedAt: new Date()
  });
  await p2.save();
  tempProgressIds.push(p2._id.toString());

  const { req: reqC, res: resC } = makeMocks();
  reqC.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqC.params = { id: internB._id.toString() };
  reqC.body = { certificateNumber: 'CERT-T7B-001' };
  await issueCertificate(reqC, resC);

  if (resC.statusCode !== 200) {
    throw new Error(`Test 7c FAILED: Expected 200 when newest assignment is completed, got ${resC.statusCode}`);
  }

  console.log('✓ Test 7 PASSED: Deterministic assignment completion evidence checking verified');
}

// Test 8: Successful certificate issuance
async function testSuccessfulCertificateIssuance() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t8');
  const mentor = await createTestUser('MENTOR', 'mentor-t8');
  const { intern } = await createEligibleCompletedIntern(admin, mentor, 'intern-t8');

  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req.params = { id: intern._id.toString() };
  req.body = {
    certificateNumber: '   CERT-T8-001   ',
    finalHrRemarks: '   Good job!   ',
    // Try to override server metadata
    issuedBy: '6a4f95a68836486f0313e318',
    issuedAt: new Date(Date.now() - 500000),
    status: 'MUTATED-STATUS'
  };

  await issueCertificate(req, res);

  if (res.statusCode !== 200) {
    throw new Error(`Test 8 FAILED: Expected 200, got ${res.statusCode}`);
  }

  if (res.data.message !== 'Certificate issued successfully') {
    throw new Error(`Test 8 FAILED: Unexpected success message: ${res.data.message}`);
  }

  const updated = await Intern.findById(intern._id);
  if (updated.status !== 'ISSUED') {
    throw new Error(`Test 8 FAILED: Expected status ISSUED, got ${updated.status}`);
  }

  if (updated.certificateNumber !== 'CERT-T8-001') {
    throw new Error(`Test 8 FAILED: Expected trimmed certificate, got "${updated.certificateNumber}"`);
  }

  if (updated.finalHrRemarks !== 'Good job!') {
    throw new Error(`Test 8 FAILED: Expected trimmed remarks, got "${updated.finalHrRemarks}"`);
  }

  if (!updated.issuedAt) {
    throw new Error('Test 8 FAILED: issuedAt field missing');
  }

  if (updated.issuedBy.toString() !== admin._id.toString()) {
    throw new Error(`Test 8 FAILED: Overridden issuedBy detected. Got ${updated.issuedBy}`);
  }

  console.log('✓ Test 8 PASSED: Valid certificate issued and request-supplied metadata overrides ignored');
}

// Test 9: Generic PUT protection
async function testGenericPutProtection() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t9');
  const mentor = await createTestUser('MENTOR', 'mentor-t9');
  const { intern } = await createEligibleCompletedIntern(admin, mentor, 'intern-t9');

  // Issue certificate first
  const { req: reqI, res: resI } = makeMocks();
  reqI.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqI.params = { id: intern._id.toString() };
  reqI.body = { certificateNumber: 'CERT-T9-001', finalHrRemarks: 'Initial remarks' };
  await issueCertificate(reqI, resI);

  if (resI.statusCode !== 200) {
    throw new Error('Test 9 helper issuance failed');
  }

  // Attempt normal PUT through controller
  const { req: reqP, res: resP } = makeMocks();
  reqP.params = { id: intern._id.toString() };
  reqP.body = {
    certificateNumber: 'MUTATED-CERT',
    finalHrRemarks: 'MUTATED-REMARKS',
    issuedAt: new Date(Date.now() - 100000),
    issuedBy: new mongoose.Types.ObjectId().toString(),
    status: 'MUTATED-STATUS',
    passNumber: 'PASS-T9-UPDATED'
  };

  await updateIntern(reqP, resP);

  if (resP.statusCode !== 200) {
    throw new Error(`Test 9 FAILED: Expected 200 for updateIntern, got ${resP.statusCode}`);
  }

  const doc = await Intern.findById(intern._id);
  if (doc.certificateNumber !== 'CERT-T9-001') {
    throw new Error('Test 9 FAILED: certificateNumber was mutated');
  }
  if (doc.finalHrRemarks !== 'Initial remarks') {
    throw new Error('Test 9 FAILED: finalHrRemarks was mutated');
  }
  if (doc.status !== 'ISSUED') {
    throw new Error('Test 9 FAILED: status was mutated');
  }
  if (doc.passNumber !== 'PASS-T9-UPDATED') {
    throw new Error(`Test 9 FAILED: passNumber should remain editable. Got ${doc.passNumber}`);
  }

  console.log('✓ Test 9 PASSED: Certificate metadata and status protected from standard PUT updates');
}

// Test 10: Duplicate issuance prevention
async function testDuplicateIssuancePrevention() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t10');
  const mentor = await createTestUser('MENTOR', 'mentor-t10');
  const { intern } = await createEligibleCompletedIntern(admin, mentor, 'intern-t10');

  // 1. Issue once (succeeds)
  const { req: req1, res: res1 } = makeMocks();
  req1.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req1.params = { id: intern._id.toString() };
  req1.body = { certificateNumber: 'CERT-T10-001' };
  await issueCertificate(req1, res1);

  if (res1.statusCode !== 200) {
    throw new Error('Test 10 helper issuance 1 failed');
  }

  // 2. Issue again (fails 400)
  const { req: req2, res: res2 } = makeMocks();
  req2.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req2.params = { id: intern._id.toString() };
  req2.body = { certificateNumber: 'CERT-T10-002' };
  await issueCertificate(req2, res2);

  if (res2.statusCode !== 400) {
    throw new Error(`Test 10 FAILED: Expected 400 for duplicate issuance, got ${res2.statusCode}`);
  }

  const doc = await Intern.findById(intern._id);
  if (doc.certificateNumber !== 'CERT-T10-001') {
    throw new Error(`Test 10 FAILED: Original metadata altered. Got ${doc.certificateNumber}`);
  }
  if (doc.status !== 'ISSUED') {
    throw new Error(`Test 10 FAILED: Intern status altered. Got ${doc.status}`);
  }

  console.log('✓ Test 10 PASSED: Duplicate issuance attempts blocked and state preserved');
}

// Test 11: Case-insensitive certificate uniqueness
async function testCaseInsensitiveCertificateUniqueness() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t11');
  const mentor = await createTestUser('MENTOR', 'mentor-t11');

  // Verify MongoDB collation index exists on certificateNumber path
  const indexes = await Intern.collection.indexes();
  const indexObj = indexes.find(idx => idx.key.certificateNumber === 1);
  if (!indexObj) {
    console.warn('⚠️ WARNING: Collation index on certificateNumber not found in MongoDB!');
  } else {
    if (!indexObj.unique || !indexObj.sparse || !indexObj.collation || indexObj.collation.strength !== 2) {
      console.warn('⚠️ WARNING: Index exists but does not match collation options:', indexObj);
    }
  }

  const { intern: intern1 } = await createEligibleCompletedIntern(admin, mentor, 'intern-t11-a');
  const { intern: intern2 } = await createEligibleCompletedIntern(admin, mentor, 'intern-t11-b');

  // 1. First issues CERT-CASE-001 (succeeds)
  const { req: req1, res: res1 } = makeMocks();
  req1.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req1.params = { id: intern1._id.toString() };
  req1.body = { certificateNumber: 'CERT-CASE-001' };
  await issueCertificate(req1, res1);

  if (res1.statusCode !== 200) {
    throw new Error(`Test 11 helper issuance 1 failed: ${res1.statusCode}`);
  }

  // 2. Second attempts cert-case-001 (fails 409)
  const { req: req2, res: res2 } = makeMocks();
  req2.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req2.params = { id: intern2._id.toString() };
  req2.body = { certificateNumber: 'cert-case-001' };
  await issueCertificate(req2, res2);

  if (res2.statusCode !== 409) {
    throw new Error(`Test 11 FAILED: Expected 409 for case-insensitive duplicate certificate, got ${res2.statusCode}`);
  }

  const doc2 = await Intern.findById(intern2._id);
  if (doc2.status !== 'COMPLETED') {
    throw new Error(`Test 11 FAILED: Second intern status altered. Got ${doc2.status}`);
  }
  if (doc2.certificateNumber || doc2.issuedAt || doc2.issuedBy) {
    throw new Error('Test 11 FAILED: Second intern has certificate fields partially written on duplicate conflict');
  }

  console.log('✓ Test 11 PASSED: Case-insensitive unique constraints verified and conflict handled');
}

// Test 12: Safe response after issuance
async function testSafeResponseAfterIssuance() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t12');
  const mentor = await createTestUser('MENTOR', 'mentor-t12');
  const { intern } = await createEligibleCompletedIntern(admin, mentor, 'intern-t12');

  const { req: reqI, res: resI } = makeMocks();
  reqI.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqI.params = { id: intern._id.toString() };
  reqI.body = { certificateNumber: 'CERT-T12-001', finalHrRemarks: 'Excellent' };
  await issueCertificate(reqI, resI);

  if (resI.statusCode !== 200) {
    throw new Error('Test 12 helper issuance failed');
  }

  // Check safe fields in POST issue response
  const postIntern = resI.data.intern;
  const allowedKeys = [
    'id', 'internId', 'fullName', 'email', 'instituteName', 'branch',
    'trainingType', 'startDate', 'endDate', 'status', 'certificateNumber',
    'issuedAt', 'issuedBy', 'finalHrRemarks'
  ];

  Object.keys(postIntern).forEach(key => {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Test 12 FAILED: Prohibited key "${key}" found in POST response intern object`);
    }
  });

  const serializedPost = JSON.stringify(resI.data);
  const forbiddenPost = [intern.aadhaarNumber, '123 Test St', '456 Perm St', 'TestPassword123!', 'familyMembers'];
  forbiddenPost.forEach(sub => {
    if (serializedPost.includes(sub)) {
      throw new Error(`Test 12 FAILED: Sensitive substring "${sub}" exposed in POST response`);
    }
  });

  // Check safe fields in GET details response
  const { req: reqG, res: resG } = makeMocks();
  reqG.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqG.params = { id: intern._id.toString() };
  await getIssuanceDetails(reqG, resG);

  if (resG.statusCode !== 200) {
    throw new Error('Test 12 helper details failed');
  }

  Object.keys(resG.data).forEach(key => {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Test 12 FAILED: Prohibited key "${key}" found in GET details response`);
    }
  });

  const serializedGet = JSON.stringify(resG.data);
  forbiddenPost.forEach(sub => {
    if (serializedGet.includes(sub)) {
      throw new Error(`Test 12 FAILED: Sensitive substring "${sub}" exposed in GET details response`);
    }
  });

  console.log('✓ Test 12 PASSED: Safe response mappers applied and sensitive fields masked in responses');
}

async function runTests() {
  try {
    await setup();

    await testHrAdminAuthorization();
    await testEligibleIssuanceDetails();
    await testIssuanceDetailPrivacy();
    await testInvalidInternAccess();
    await testCertificateNumberValidation();
    await testFinalHrRemarksValidation();
    await testCompletionEvidenceRequired();
    await testSuccessfulCertificateIssuance();
    await testGenericPutProtection();
    await testDuplicateIssuancePrevention();
    await testCaseInsensitiveCertificateUniqueness();
    await testSafeResponseAfterIssuance();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL 12 CERTIFICATE ISSUANCE TESTS PASSED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('\n❌ ISSUANCE TEST FAILED:');
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    try {
      console.log('\nCleaning up database records...');

      for (const pId of tempProgressIds) {
        try {
          await Progress.deleteOne({ _id: pId });
        } catch (e) {
          console.log(`Failed to delete test progress ${pId}: ${e.message}`);
        }
      }

      for (const aId of tempAssignmentIds) {
        try {
          await Assignment.deleteOne({ _id: aId });
        } catch (e) {
          console.log(`Failed to delete test assignment ${aId}: ${e.message}`);
        }
      }

      for (const internId of tempInternIds) {
        try {
          await Intern.deleteOne({ _id: internId });
        } catch (e) {
          console.log(`Failed to delete test intern ${internId}: ${e.message}`);
        }
      }

      for (const userId of tempUserIds) {
        try {
          await User.deleteOne({ _id: userId });
        } catch (e) {
          console.log(`Failed to delete test user ${userId}: ${e.message}`);
        }
      }

      await mongoose.connection.close();
      console.log('✓ Cleanup complete. MongoDB connection closed.');
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr.message);
      process.exitCode = 1;
    }
  }
}

runTests();
