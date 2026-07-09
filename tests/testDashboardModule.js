require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Intern = require('../src/models/Intern');
const Assignment = require('../src/models/Assignment');
const Progress = require('../src/models/Progress');
const {
  getAdminDashboard,
  getMentorDashboard
} = require('../src/controllers/dashboardController');
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
    passNumber: 'PASS-123'
  });
  await intern.save();
  tempInternIds.push(intern._id.toString());
  return intern;
}

// Test 1: Dashboard authorization
async function testDashboardAuthorization() {
  const { authorizeRoles } = require('../src/middleware/auth');
  const admin = await createTestUser('HR_ADMIN', 'admin-t1');
  const mentor = await createTestUser('MENTOR', 'mentor-t1');

  const hrAdminMiddleware = authorizeRoles('HR_ADMIN');
  const mentorMiddleware = authorizeRoles('MENTOR');

  // A. HR_ADMIN passes authorizeRoles('HR_ADMIN')
  let hrAdminPassed = false;
  const { req: reqA1, res: resA1 } = makeMocks();
  reqA1.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  hrAdminMiddleware(reqA1, resA1, () => { hrAdminPassed = true; });
  if (!hrAdminPassed) {
    throw new Error('Test 1 FAILED: Expected HR_ADMIN to pass authorizeRoles("HR_ADMIN")');
  }

  // B. MENTOR receives 403 from authorizeRoles('HR_ADMIN')
  let mentorPassedHR = false;
  const { req: reqA2, res: resA2 } = makeMocks();
  reqA2.user = { id: mentor._id.toString(), role: 'MENTOR' };
  hrAdminMiddleware(reqA2, resA2, () => { mentorPassedHR = true; });
  if (mentorPassedHR) {
    throw new Error('Test 1 FAILED: Expected MENTOR to fail authorizeRoles("HR_ADMIN")');
  }
  if (resA2.statusCode !== 403) {
    throw new Error(`Test 1 FAILED: Expected 403 for MENTOR, got ${resA2.statusCode}`);
  }

  // C. MENTOR passes authorizeRoles('MENTOR')
  let mentorPassed = false;
  const { req: reqM1, res: resM1 } = makeMocks();
  reqM1.user = { id: mentor._id.toString(), role: 'MENTOR' };
  mentorMiddleware(reqM1, resM1, () => { mentorPassed = true; });
  if (!mentorPassed) {
    throw new Error('Test 1 FAILED: Expected MENTOR to pass authorizeRoles("MENTOR")');
  }

  // D. HR_ADMIN receives 403 from authorizeRoles('MENTOR')
  let hrPassedMentor = false;
  const { req: reqM2, res: resM2 } = makeMocks();
  reqM2.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  mentorMiddleware(reqM2, resM2, () => { hrPassedMentor = true; });
  if (hrPassedMentor) {
    throw new Error('Test 1 FAILED: Expected HR_ADMIN to fail authorizeRoles("MENTOR")');
  }
  if (resM2.statusCode !== 403) {
    throw new Error(`Test 1 FAILED: Expected 403 for HR_ADMIN, got ${resM2.statusCode}`);
  }

  console.log('✓ Test 1 PASSED: Authorization layer enforces role checks correctly');
}

// Test 2: Admin dashboard empty-data behavior
async function testAdminDashboardEmptyDataBehavior() {
  const { req, res } = makeMocks();
  req.user = { role: 'HR_ADMIN' };

  await getAdminDashboard(req, res);

  if (res.statusCode !== 200) {
    throw new Error(`Test 2 FAILED: Expected 200, got ${res.statusCode}`);
  }
  if (res.data.success !== true) {
    throw new Error('Test 2 FAILED: Expected success = true');
  }

  const { stats, breakdowns, recentActivity } = res.data;
  if (!stats || !breakdowns || !recentActivity) {
    throw new Error('Test 2 FAILED: Missing core structural blocks');
  }

  // Verify status keys exist
  const expectedStatusKeys = ['NEW', 'ASSIGNED', 'REJECTED_BY_MENTOR', 'ONGOING', 'COMPLETED', 'ISSUED'];
  expectedStatusKeys.forEach(k => {
    if (stats.interns.byStatus[k] === undefined || typeof stats.interns.byStatus[k] !== 'number') {
      throw new Error(`Test 2 FAILED: Missing or invalid status count for key "${k}"`);
    }
  });

  // Verify type/divisions arrays exist
  if (!Array.isArray(breakdowns.byTrainingType) || !Array.isArray(breakdowns.byDivision) || !Array.isArray(breakdowns.byInstitute) || !Array.isArray(breakdowns.monthlyRegistrations)) {
    throw new Error('Test 2 FAILED: Breakdown fields must return arrays');
  }

  console.log('✓ Test 2 PASSED: Admin dashboard empty-data structures behave gracefully');
}

// Test 3: Admin active intern counts and status breakdown
async function testAdminActiveInternCounts() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t3');
  
  // Capture Baseline
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(reqB, resB);
  const baselineStats = resB.data.stats;

  // Create isolated active interns across statuses
  const activeNew = await createTestIntern('NEW', 't3-new');
  const activeAssigned = await createTestIntern('ASSIGNED', 't3-asg');
  const activeRejected = await createTestIntern('REJECTED_BY_MENTOR', 't3-rej');
  const activeOngoing = await createTestIntern('ONGOING', 't3-ong');
  const activeCompleted = await createTestIntern('COMPLETED', 't3-com');
  const activeIssued = await createTestIntern('ISSUED', 't3-iss');

  // Create inactive interns
  const inactiveNew = await createTestIntern('NEW', 't3-in-new');
  inactiveNew.isActive = false;
  await inactiveNew.save();

  const inactiveOngoing = await createTestIntern('ONGOING', 't3-in-ong');
  inactiveOngoing.isActive = false;
  await inactiveOngoing.save();

  // Run Dashboard Query
  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(req, res);

  const updatedStats = res.data.stats;

  // Assert deltas
  const activeDelta = updatedStats.interns.totalActive - baselineStats.interns.totalActive;
  if (activeDelta !== 6) {
    throw new Error(`Test 3 FAILED: Expected totalActive delta of +6, got +${activeDelta}`);
  }

  const expectedStatuses = ['NEW', 'ASSIGNED', 'REJECTED_BY_MENTOR', 'ONGOING', 'COMPLETED', 'ISSUED'];
  expectedStatuses.forEach(s => {
    const delta = updatedStats.interns.byStatus[s] - baselineStats.interns.byStatus[s];
    if (delta !== 1) {
      throw new Error(`Test 3 FAILED: Expected status delta of +1 for "${s}", got +${delta}`);
    }
  });

  console.log('✓ Test 3 PASSED: Active/Inactive filters and status deltas calculated correctly');
}

// Test 4: Admin breakdowns
async function testAdminBreakdowns() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t4');

  // Capture Baseline
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(reqB, resB);
  const baselineBreakdowns = resB.data.breakdowns;

  // Create interns with controlled breakdown metadata
  // trainingType
  const int1 = await createTestIntern('NEW', 't4-1');
  int1.trainingType = 'INTERNSHIP';
  int1.division = '  RESEARCH  ';
  int1.instituteName = '  IIT DELHI  ';
  await int1.save();

  const int2 = await createTestIntern('NEW', 't4-2');
  int2.trainingType = 'TRAINING';
  int2.division = 'research'; // different casing, but normal trimmed matching after lowercase or exact trim
  int2.instituteName = 'IIT Delhi';
  await int2.save();

  const int3 = await createTestIntern('NEW', 't4-3');
  await Intern.updateOne(
    { _id: int3._id },
    { $set: { trainingType: 'TRAINING', instituteName: '   ', division: '' } }
  );

  const int4 = await createTestIntern('NEW', 't4-4');
  await Intern.updateOne(
    { _id: int4._id },
    { $set: { trainingType: 'INTERNSHIP' }, $unset: { instituteName: 1, division: 1 } }
  );

  // Run Dashboard Query
  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(req, res);

  const updatedBreakdowns = res.data.breakdowns;

  // Helper to extract count from list
  const getCount = (list, key, value) => {
    const found = list.find(item => item[key] === value);
    return found ? found.count : 0;
  };

  // 1. Verify trainingType counts
  const internshipDelta = getCount(updatedBreakdowns.byTrainingType, 'trainingType', 'INTERNSHIP') -
                          getCount(baselineBreakdowns.byTrainingType, 'trainingType', 'INTERNSHIP');
  const trainingDelta = getCount(updatedBreakdowns.byTrainingType, 'trainingType', 'TRAINING') -
                        getCount(baselineBreakdowns.byTrainingType, 'trainingType', 'TRAINING');

  if (internshipDelta !== 2 || trainingDelta !== 2) {
    throw new Error(`Test 4 FAILED: Expected trainingType deltas (+2, +2), got (+${internshipDelta}, +${trainingDelta})`);
  }

  // 2. Verify division trimmed values
  const researchDelta = getCount(updatedBreakdowns.byDivision, 'division', 'RESEARCH') -
                        getCount(baselineBreakdowns.byDivision, 'division', 'RESEARCH');
  const researchLowerDelta = getCount(updatedBreakdowns.byDivision, 'division', 'research') -
                             getCount(baselineBreakdowns.byDivision, 'division', 'research');
  
  if (researchDelta !== 1 || researchLowerDelta !== 1) {
    throw new Error(`Test 4 FAILED: Expected research division trimmed counts (+1 RESEARCH, +1 research), got (+${researchDelta}, +${researchLowerDelta})`);
  }

  // 3. Verify Unknown groupings (empty, whitespace, missing)
  const unknownDivisionDelta = getCount(updatedBreakdowns.byDivision, 'division', 'Unknown') -
                               getCount(baselineBreakdowns.byDivision, 'division', 'Unknown');
  const unknownInstituteDelta = getCount(updatedBreakdowns.byInstitute, 'instituteName', 'Unknown') -
                                getCount(baselineBreakdowns.byInstitute, 'instituteName', 'Unknown');

  if (unknownDivisionDelta !== 2) {
    throw new Error(`Test 4 FAILED: Expected Unknown division delta +2, got +${unknownDivisionDelta}`);
  }
  if (unknownInstituteDelta !== 2) {
    throw new Error(`Test 4 FAILED: Expected Unknown instituteName delta +2, got +${unknownInstituteDelta}`);
  }

  // 4. Verify no MongoDB _id key appears
  const verifyKeys = (list, keyName) => {
    list.forEach(item => {
      if ('_id' in item) {
        throw new Error(`Test 4 FAILED: Exposed internal MongoDB _id key in breakdown list: ${JSON.stringify(item)}`);
      }
      if (!(keyName in item) || !('count' in item)) {
        throw new Error(`Test 4 FAILED: Missing friendly key "${keyName}" in breakdown item`);
      }
    });
  };

  verifyKeys(updatedBreakdowns.byTrainingType, 'trainingType');
  verifyKeys(updatedBreakdowns.byDivision, 'division');
  verifyKeys(updatedBreakdowns.byInstitute, 'instituteName');

  console.log('✓ Test 4 PASSED: Breakdown analytics group, trim, and format keys correctly');
}

// Test 5: True 12-month registration window
async function testTrue12MonthRegistrationWindow() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t5');

  // Compute boundary
  const boundary = new Date();
  boundary.setDate(1);
  boundary.setMonth(boundary.getMonth() - 11);
  boundary.setHours(0, 0, 0, 0);

  // Capture baseline
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(reqB, resB);
  const baselineMonthly = resB.data.breakdowns.monthlyRegistrations;

  // Create interns around boundary
  // Case A: Just before boundary (1 millisecond before) -> Excluded
  const beforeInt = await createTestIntern('NEW', 't5-before');
  await Intern.collection.updateOne({ _id: beforeInt._id }, { $set: { createdAt: new Date(boundary.getTime() - 1) } });

  // Case B: Exactly at boundary -> Included
  const boundaryInt = await createTestIntern('NEW', 't5-boundary');
  await Intern.collection.updateOne({ _id: boundaryInt._id }, { $set: { createdAt: boundary } });

  // Case C: Inside window (e.g. current month) -> Included
  const insideInt = await createTestIntern('NEW', 't5-inside');
  await Intern.collection.updateOne({ _id: insideInt._id }, { $set: { createdAt: new Date() } });

  // Run Dashboard Query
  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(req, res);

  const updatedMonthly = res.data.breakdowns.monthlyRegistrations;

  // Check delta counts
  const sumCounts = list => list.reduce((sum, item) => sum + item.count, 0);
  const totalDelta = sumCounts(updatedMonthly) - sumCounts(baselineMonthly);

  if (totalDelta !== 2) {
    throw new Error(`Test 5 FAILED: Expected +2 registrations inside the 12-month window, got +${totalDelta}`);
  }

  // Check oldest-to-newest ordering
  for (let i = 1; i < updatedMonthly.length; i++) {
    const prev = updatedMonthly[i - 1];
    const curr = updatedMonthly[i];
    if (prev.year > curr.year || (prev.year === curr.year && prev.month > curr.month)) {
      throw new Error(`Test 5 FAILED: Timeline registration list is not sorted chronologically: ${JSON.stringify(updatedMonthly)}`);
    }
  }

  console.log('✓ Test 5 PASSED: registrations grouped by true 12-month boundary and sorted chronologically');
}

// Test 6: Admin recent activity
async function testAdminRecentActivity() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t6');
  const mentor = await createTestUser('MENTOR', 'mentor-t6');

  // 1. Create active interns for recentRegistrations (Newest first)
  const reg1 = await createTestIntern('NEW', 't6-reg1');
  await Intern.collection.updateOne({ _id: reg1._id }, { $set: { createdAt: new Date(Date.now() - 30000) } });
  
  const reg2 = await createTestIntern('NEW', 't6-reg2');
  await Intern.collection.updateOne({ _id: reg2._id }, { $set: { createdAt: new Date(Date.now() - 20000) } });

  const reg3 = await createTestIntern('NEW', 't6-reg3');
  await Intern.collection.updateOne({ _id: reg3._id }, { $set: { createdAt: new Date(Date.now() - 10000) } });

  const reg4 = await createTestIntern('NEW', 't6-reg4');
  await Intern.collection.updateOne({ _id: reg4._id }, { $set: { createdAt: new Date() } });

  // 2. Create assignments for recentAssignments
  // A: Valid active intern + active mentor
  const internA = await createTestIntern('ASSIGNED', 't6-asg-a');
  const assignmentA = new Assignment({
    internId: internA._id,
    mentorId: mentor._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await assignmentA.save();
  tempAssignmentIds.push(assignmentA._id.toString());

  // B: Inactive intern reference (should be excluded)
  const internB = await createTestIntern('ASSIGNED', 't6-asg-b');
  internB.isActive = false;
  await internB.save();

  const assignmentB = new Assignment({
    internId: internB._id,
    mentorId: mentor._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await assignmentB.save();
  tempAssignmentIds.push(assignmentB._id.toString());

  // C: Inactive mentor reference (should be excluded)
  const mentorC = await createTestUser('MENTOR', 'mentorC-t6');
  mentorC.isActive = false;
  await mentorC.save();

  const internC = await createTestIntern('ASSIGNED', 't6-asg-c');
  const assignmentC = new Assignment({
    internId: internC._id,
    mentorId: mentorC._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await assignmentC.save();
  tempAssignmentIds.push(assignmentC._id.toString());

  // 3. Create certificates for recentCertificates
  // A: Active ISSUED intern with valid certificate -> Included
  const certA = await createTestIntern('ISSUED', 't6-cert-a');
  certA.certificateNumber = 'CERT-T6-A';
  certA.issuedAt = new Date();
  certA.issuedBy = admin._id;
  await certA.save();

  // B: Inactive ISSUED intern -> Excluded
  const certB = await createTestIntern('ISSUED', 't6-cert-b');
  certB.certificateNumber = 'CERT-T6-B';
  certB.issuedAt = new Date();
  certB.issuedBy = admin._id;
  certB.isActive = false;
  await certB.save();

  // C: Active but non-ISSUED intern -> Excluded
  const certC = await createTestIntern('COMPLETED', 't6-cert-c');
  certC.certificateNumber = 'CERT-T6-C';
  certC.issuedAt = new Date();
  await certC.save();

  // D: Whitespace-only certificateNumber -> Excluded
  const certD = await createTestIntern('ISSUED', 't6-cert-d');
  await Intern.collection.updateOne(
    { _id: certD._id },
    { $set: { certificateNumber: '     ', issuedAt: new Date(), issuedBy: admin._id } }
  );

  // E: Null issuedAt -> Excluded
  const certE = await createTestIntern('ISSUED', 't6-cert-e');
  await Intern.collection.updateOne(
    { _id: certE._id },
    { $set: { certificateNumber: 'CERT-T6-E', issuedAt: null, issuedBy: admin._id } }
  );

  // Run Dashboard Query
  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(req, res);

  const { recentRegistrations, recentAssignments, recentCertificates } = res.data.recentActivity;

  // Validate Registrations
  if (recentRegistrations.length > 5) {
    throw new Error(`Test 6 FAILED: Expected maximum 5 recent registrations, got ${recentRegistrations.length}`);
  }
  // Check newest first
  for (let i = 1; i < recentRegistrations.length; i++) {
    if (new Date(recentRegistrations[i - 1].createdAt) < new Date(recentRegistrations[i].createdAt)) {
      throw new Error('Test 6 FAILED: Recent registrations not sorted newest first');
    }
  }
  // Check safe fields only
  recentRegistrations.forEach(r => {
    const keys = Object.keys(r);
    const allowed = ['id', 'fullName', 'internId', 'createdAt'];
    keys.forEach(k => {
      if (!allowed.includes(k)) {
        throw new Error(`Test 6 FAILED: Prohibited key "${k}" exposed in recentRegistrations`);
      }
    });
  });

  // Validate Assignments (B and C must be excluded)
  const bEx = recentAssignments.find(a => a.id === assignmentB._id.toString());
  const cEx = recentAssignments.find(a => a.id === assignmentC._id.toString());
  if (bEx || cEx) {
    throw new Error('Test 6 FAILED: Recent assignments containing inactive intern/mentor references were not excluded');
  }

  recentAssignments.forEach(a => {
    const keys = Object.keys(a);
    const allowed = ['id', 'internName', 'mentorName', 'status', 'assignedAt'];
    keys.forEach(k => {
      if (!allowed.includes(k)) {
        throw new Error(`Test 6 FAILED: Prohibited key "${k}" exposed in recentAssignments`);
      }
    });
  });

  // Validate Certificates
  const hasA = recentCertificates.some(c => c.fullName === 'Test Intern' && c.certificateNumber === 'CERT-T6-A');
  const hasB = recentCertificates.some(c => c.certificateNumber === 'CERT-T6-B');
  const hasC = recentCertificates.some(c => c.certificateNumber === 'CERT-T6-C');
  const hasD = recentCertificates.some(c => c.certificateNumber === '     ');
  const hasE = recentCertificates.some(c => c.certificateNumber === 'CERT-T6-E');

  if (!hasA) {
    throw new Error('Test 6 FAILED: Expected valid certificate certA to be included');
  }
  if (hasB || hasC || hasD || hasE) {
    throw new Error('Test 6 FAILED: Excluded certificates (inactive, non-issued, whitespace-only, null-date) found in response');
  }

  console.log('✓ Test 6 PASSED: Recent activity metrics sorted, limited, and whitelisted correctly');
}

// Test 7: Admin assignment metrics
async function testAdminAssignmentMetrics() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t7');
  const mentor = await createTestUser('MENTOR', 'mentor-t7');

  // Baseline
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(reqB, resB);
  const baselineAssignments = resB.data.stats.assignments;

  // Create assignments across states
  const intern1 = await createTestIntern('ASSIGNED', 't7-1');
  const asg1 = new Assignment({
    internId: intern1._id,
    mentorId: mentor._id,
    assignedBy: admin._id,
    status: 'PENDING'
  });
  await asg1.save();
  tempAssignmentIds.push(asg1._id.toString());

  const intern2 = await createTestIntern('ONGOING', 't7-2');
  const asg2 = new Assignment({
    internId: intern2._id,
    mentorId: mentor._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asg2.save();
  tempAssignmentIds.push(asg2._id.toString());

  const intern3 = await createTestIntern('REJECTED_BY_MENTOR', 't7-3');
  const asg3 = new Assignment({
    internId: intern3._id,
    mentorId: mentor._id,
    assignedBy: admin._id,
    status: 'REJECTED'
  });
  await asg3.save();
  tempAssignmentIds.push(asg3._id.toString());

  // Run Dashboard Query
  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(req, res);

  const updatedAssignments = res.data.stats.assignments;

  // Check deltas
  const pendingDelta = updatedAssignments.pendingCurrent - baselineAssignments.pendingCurrent;
  const acceptedDelta = updatedAssignments.acceptedAllTime - baselineAssignments.acceptedAllTime;
  const rejectedDelta = updatedAssignments.rejectedAllTime - baselineAssignments.rejectedAllTime;

  if (pendingDelta !== 1 || acceptedDelta !== 1 || rejectedDelta !== 1) {
    throw new Error(`Test 7 FAILED: Expected deltas (+1, +1, +1), got (+${pendingDelta}, +${acceptedDelta}, +${rejectedDelta})`);
  }

  console.log('✓ Test 7 PASSED: HR Admin assignment workload and historical stats calculated accurately');
}

// Test 8: Mentor assignment scoping
async function testMentorAssignmentScoping() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t8');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t8');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t8');

  // Baseline for Mentor A
  const { req: reqBA, res: resBA } = makeMocks();
  reqBA.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(reqBA, resBA);
  const baselineA = resBA.data.stats.assignments;

  // Create assignments
  // For Mentor A: 1 Pending, 1 Accepted
  const intern1 = await createTestIntern('ASSIGNED', 't8-1');
  const asgA1 = new Assignment({
    internId: intern1._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'PENDING'
  });
  await asgA1.save();
  tempAssignmentIds.push(asgA1._id.toString());

  const intern2 = await createTestIntern('ONGOING', 't8-2');
  const asgA2 = new Assignment({
    internId: intern2._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asgA2.save();
  tempAssignmentIds.push(asgA2._id.toString());

  // For Mentor B: 1 Accepted
  const intern3 = await createTestIntern('ONGOING', 't8-3');
  const asgB1 = new Assignment({
    internId: intern3._id,
    mentorId: mentorB._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asgB1.save();
  tempAssignmentIds.push(asgB1._id.toString());

  // Run Dashboard for Mentor A
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(reqA, resA);

  const updatedA = resA.data.stats.assignments;

  const pendingDelta = updatedA.pendingCurrent - baselineA.pendingCurrent;
  const acceptedDelta = updatedA.acceptedAllTime - baselineA.acceptedAllTime;
  const rejectedDelta = updatedA.rejectedAllTime - baselineA.rejectedAllTime;

  if (pendingDelta !== 1 || acceptedDelta !== 1 || rejectedDelta !== 0) {
    throw new Error(`Test 8 FAILED: Expected Mentor A deltas (+1, +1, +0), got (+${pendingDelta}, +${acceptedDelta}, +${rejectedDelta})`);
  }

  console.log('✓ Test 8 PASSED: Mentor assignment counts scoped strictly to requesting mentor');
}

// Test 9: Mentor ongoing deduplication
async function testMentorOngoingDeduplication() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t9');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t9');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t9');

  // Baseline for Mentor A
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(reqB, resB);
  const baselineOngoing = resB.data.stats.interns.ongoing;

  // 1. Create active ONGOING intern
  const internTarget = await createTestIntern('ONGOING', 't9-target');

  // 2. Create MULTIPLE ACCEPTED assignments for same intern under Mentor A
  const asg1 = new Assignment({
    internId: internTarget._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED',
    assignedAt: new Date(Date.now() - 10000)
  });
  await asg1.save();
  tempAssignmentIds.push(asg1._id.toString());

  const asg2 = new Assignment({
    internId: internTarget._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED',
    assignedAt: new Date()
  });
  await asg2.save();
  tempAssignmentIds.push(asg2._id.toString());

  // 3. Create another mentor's ONGOING intern
  const internB = await createTestIntern('ONGOING', 't9-other-m');
  const asgB = new Assignment({
    internId: internB._id,
    mentorId: mentorB._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asgB.save();
  tempAssignmentIds.push(asgB._id.toString());

  // 4. Create inactive ONGOING intern under Mentor A
  const internIn = await createTestIntern('ONGOING', 't9-inactive');
  internIn.isActive = false;
  await internIn.save();

  const asgIn = new Assignment({
    internId: internIn._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asgIn.save();
  tempAssignmentIds.push(asgIn._id.toString());

  // 5. Create non-ONGOING intern under Mentor A
  const internNew = await createTestIntern('NEW', 't9-new');
  const asgNew = new Assignment({
    internId: internNew._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asgNew.save();
  tempAssignmentIds.push(asgNew._id.toString());

  // Run Dashboard for Mentor A
  const { req, res } = makeMocks();
  req.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(req, res);

  const updatedOngoing = res.data.stats.interns.ongoing;
  const delta = updatedOngoing - baselineOngoing;

  if (delta !== 1) {
    throw new Error(`Test 9 FAILED: Expected ongoing delta +1 for Mentor A, got +${delta}`);
  }

  console.log('✓ Test 9 PASSED: Mentor ongoing intern metrics properly deduplicated and scoped');
}

// Test 10: Mentor completed and issued attribution
async function testMentorCompletedIssuedAttribution() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t10');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t10');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t10');

  // Baseline Mentor A
  const { req: reqBA, res: resBA } = makeMocks();
  reqBA.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(reqBA, resBA);
  const baselineA = resBA.data.stats.interns;

  // Baseline Mentor B
  const { req: reqBB, res: resBB } = makeMocks();
  reqBB.user = { id: mentorB._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(reqBB, resBB);
  const baselineB = resBB.data.stats.interns;

  // Scenario A:
  // - Mentor A has historical ACCEPTED assignment
  // - Mentor B records final Progress (isFinal: true, percentage: 100)
  // - Intern current status = COMPLETED
  const internA = await createTestIntern('COMPLETED', 't10-sa');
  const asgA1 = new Assignment({
    internId: internA._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED',
    assignedAt: new Date(Date.now() - 50000)
  });
  await asgA1.save();
  tempAssignmentIds.push(asgA1._id.toString());

  const asgA2 = new Assignment({
    internId: internA._id,
    mentorId: mentorB._id,
    assignedBy: admin._id,
    status: 'ACCEPTED',
    assignedAt: new Date()
  });
  await asgA2.save();
  tempAssignmentIds.push(asgA2._id.toString());

  const progressA = new Progress({
    internId: internA._id,
    assignmentId: asgA2._id,
    recordedBy: mentorB._id,
    progressPercentage: 100,
    remarks: 'Mentor B completed this',
    isFinal: true
  });
  await progressA.save();
  tempProgressIds.push(progressA._id.toString());

  // Scenario B:
  // - Mentor A records final Progress
  // - Intern current status = ISSUED
  const internB = await createTestIntern('ISSUED', 't10-sb');
  const asgB1 = new Assignment({
    internId: internB._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asgB1.save();
  tempAssignmentIds.push(asgB1._id.toString());

  const progressB = new Progress({
    internId: internB._id,
    assignmentId: asgB1._id,
    recordedBy: mentorA._id,
    progressPercentage: 100,
    remarks: 'Mentor A completed this',
    isFinal: true
  });
  await progressB.save();
  tempProgressIds.push(progressB._id.toString());

  // Scenario C: Duplicate final Progress records for the same intern and same mentor
  // In the real system, the assignmentId partial unique index protects duplicates on the same assignment.
  // But let's verify if they existed, aggregate groups by internId to count only once.
  // We can simulate this by recording progress under a different assignment for the same intern and same mentor.
  const asgB2 = new Assignment({
    internId: internB._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asgB2.save();
  tempAssignmentIds.push(asgB2._id.toString());

  const progressC = new Progress({
    internId: internB._id,
    assignmentId: asgB2._id,
    recordedBy: mentorA._id,
    progressPercentage: 100,
    remarks: 'Another completion for same intern',
    isFinal: true
  });
  await progressC.save();
  tempProgressIds.push(progressC._id.toString());

  // Run Mentor A Query
  const { req: reqQA, res: resQA } = makeMocks();
  reqQA.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(reqQA, resQA);
  const updatedA = resQA.data.stats.interns;

  // Run Mentor B Query
  const { req: reqQB, res: resQB } = makeMocks();
  reqQB.user = { id: mentorB._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(reqQB, resQB);
  const updatedB = resQB.data.stats.interns;

  // Assert Mentor A deltas
  const deltaACompleted = updatedA.completed - baselineA.completed;
  const deltaAIssued = updatedA.issued - baselineA.issued;

  if (deltaACompleted !== 0) {
    throw new Error(`Test 10 FAILED: Expected Mentor A completed delta of +0, got +${deltaACompleted}`);
  }
  if (deltaAIssued !== 1) { // Scenario C deduplicated to 1 instead of 2
    throw new Error(`Test 10 FAILED: Expected Mentor A issued delta of +1 (deduplicated), got +${deltaAIssued}`);
  }

  // Assert Mentor B deltas
  const deltaBCompleted = updatedB.completed - baselineB.completed;
  const deltaBIssued = updatedB.issued - baselineB.issued;

  if (deltaBCompleted !== 1) {
    throw new Error(`Test 10 FAILED: Expected Mentor B completed delta of +1, got +${deltaBCompleted}`);
  }
  if (deltaBIssued !== 0) {
    throw new Error(`Test 10 FAILED: Expected Mentor B issued delta of +0, got +${deltaBIssued}`);
  }

  console.log('✓ Test 10 PASSED: Completed/Issued interns attributed strictly by final Progress recorder');
}

// Test 11: Mentor recent activity
async function testMentorRecentActivity() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t11');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t11');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t11');

  // 1. Create assignments for mentor recentAssignments
  const intern1 = await createTestIntern('ONGOING', 't11-int1');
  const asg1 = new Assignment({
    internId: intern1._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asg1.save();
  tempAssignmentIds.push(asg1._id.toString());

  // Inactive intern (should be excluded)
  const intern2 = await createTestIntern('ONGOING', 't11-int2');
  intern2.isActive = false;
  await intern2.save();

  const asg2 = new Assignment({
    internId: intern2._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED'
  });
  await asg2.save();
  tempAssignmentIds.push(asg2._id.toString());

  // 2. Create progress logs for mentor recentProgressUpdates
  const prog1 = new Progress({
    internId: intern1._id,
    assignmentId: asg1._id,
    recordedBy: mentorA._id,
    progressPercentage: 30,
    remarks: 'Good progress'
  });
  await prog1.save();
  tempProgressIds.push(prog1._id.toString());

  // Progress under Mentor B (should be excluded from Mentor A's log)
  const prog2 = new Progress({
    internId: intern1._id,
    assignmentId: asg1._id,
    recordedBy: mentorB._id,
    progressPercentage: 40,
    remarks: 'B recorded this'
  });
  await prog2.save();
  tempProgressIds.push(prog2._id.toString());

  // Run Dashboard for Mentor A
  const { req, res } = makeMocks();
  req.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(req, res);

  const { recentAssignments, recentProgressUpdates } = res.data.recentActivity;

  // Validate assignments scoping and limit
  const hasInactive = recentAssignments.some(a => a.id === asg2._id.toString());
  if (hasInactive) {
    throw new Error('Test 11 FAILED: Inactive intern references found in mentor recentAssignments');
  }

  recentAssignments.forEach(a => {
    const keys = Object.keys(a);
    const allowed = ['id', 'internName', 'status', 'assignedAt'];
    keys.forEach(k => {
      if (!allowed.includes(k)) {
        throw new Error(`Test 11 FAILED: Prohibited key "${k}" in mentor recentAssignments`);
      }
    });
  });

  // Validate progress updates scoping and fields
  const hasMentorBProg = recentProgressUpdates.some(p => p.id === prog2._id.toString());
  if (hasMentorBProg) {
    throw new Error('Test 11 FAILED: Progress updates from another mentor leaked into dashboard');
  }

  recentProgressUpdates.forEach(p => {
    const keys = Object.keys(p);
    const allowed = ['id', 'internName', 'progressPercentage', 'recordedAt'];
    keys.forEach(k => {
      if (!allowed.includes(k)) {
        throw new Error(`Test 11 FAILED: Prohibited key "${k}" in mentor recentProgressUpdates`);
      }
    });
  });

  console.log('✓ Test 11 PASSED: Mentor recent activity properly scoped and projected');
}

// Test 12: Dashboard privacy and response safety
async function testDashboardPrivacyAndResponseSafety() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t12');
  const mentor = await createTestUser('MENTOR', 'mentor-t12');

  const { intern } = await (async () => {
    const int = await createTestIntern('NEW', 't12-int');
    // Assign and Accept
    const { req: reqAssign, res: resAssign } = makeMocks();
    reqAssign.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
    reqAssign.body = { internId: int._id.toString(), mentorId: mentor._id.toString() };
    await createAssignment(reqAssign, resAssign);
    const aId = resAssign.data.assignment.id;
    tempAssignmentIds.push(aId);

    const { req: reqAccept, res: resAccept } = makeMocks();
    reqAccept.user = { id: mentor._id.toString(), role: 'MENTOR' };
    reqAccept.params = { id: aId };
    await acceptAssignment(reqAccept, resAccept);

    const prog = new Progress({
      internId: int._id,
      assignmentId: aId,
      recordedBy: mentor._id,
      progressPercentage: 100,
      remarks: 'Final evaluation',
      isFinal: true
    });
    await prog.save();
    tempProgressIds.push(prog._id.toString());

    int.status = 'ISSUED';
    int.certificateNumber = 'CERT-T12';
    int.issuedAt = new Date();
    int.issuedBy = admin._id;
    await int.save();

    return { intern: int };
  })();

  // Case A: Verify Admin Dashboard Response
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  await getAdminDashboard(reqA, resA);

  const serializedAdmin = JSON.stringify(resA.data);
  const forbiddenSubstrings = [
    intern.aadhaarNumber,
    '123 Test St',
    '456 Perm St',
    'TestPassword123!',
    'familyMembersInForeignOrganizations',
    'previousOrganizationExperience'
  ];

  forbiddenSubstrings.forEach(sub => {
    if (serializedAdmin.includes(sub)) {
      throw new Error(`Test 12 FAILED: Sensitive string "${sub}" leaked in Admin Dashboard`);
    }
  });

  // Case B: Verify Mentor Dashboard Response
  const { req: reqM, res: resM } = makeMocks();
  reqM.user = { id: mentor._id.toString(), role: 'MENTOR' };
  await getMentorDashboard(reqM, resM);

  const serializedMentor = JSON.stringify(resM.data);
  forbiddenSubstrings.forEach(sub => {
    if (serializedMentor.includes(sub)) {
      throw new Error(`Test 12 FAILED: Sensitive string "${sub}" leaked in Mentor Dashboard`);
    }
  });

  console.log('✓ Test 12 PASSED: Sensitive fields fully protected and raw models not leaked');
}

async function runTests() {
  try {
    await setup();

    await testDashboardAuthorization();
    await testAdminDashboardEmptyDataBehavior();
    await testAdminActiveInternCounts();
    await testAdminBreakdowns();
    await testTrue12MonthRegistrationWindow();
    await testAdminRecentActivity();
    await testAdminAssignmentMetrics();
    await testMentorAssignmentScoping();
    await testMentorOngoingDeduplication();
    await testMentorCompletedIssuedAttribution();
    await testMentorRecentActivity();
    await testDashboardPrivacyAndResponseSafety();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL 12 DASHBOARD & STATISTICS TESTS PASSED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('\n❌ DASHBOARD TEST FAILED:');
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
