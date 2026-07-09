require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Intern = require('../src/models/Intern');
const Assignment = require('../src/models/Assignment');
const {
  createAssignment,
  getMyAssignments,
  getAssignmentById,
  acceptAssignment,
  rejectAssignment
} = require('../src/controllers/assignmentController');

const MONGO_URI = process.env.MONGO_URI;

let tempUserIds = [];
let tempInternIds = [];
let tempAssignmentIds = [];

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

async function createTestIntern(status, emailPrefix) {
  const currentYear = new Date().getFullYear();
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  const internId = `INTERN-${currentYear}-${randomNum}`;

  const intern = new Intern({
    internId,
    fullName: 'Test Intern',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Plot 123, Sector 5, Bangalore',
    permanentAddress: 'Village XYZ, District ABC',
    mobileNumber: '9876543210',
    email: `${emailPrefix}-${Date.now()}-${Math.random()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'Test IIT',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31'),
    status,
    isActive: true,
    aadhaarNumber: '123456789012'
  });
  await intern.save();
  tempInternIds.push(intern._id.toString());
  return intern;
}

// Test 1: HR_ADMIN successfully assigns active NEW intern to active MENTOR
async function testCreateAssignmentSuccess() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t1');
  const mentor = await createTestUser('MENTOR', 'mentor-t1');
  const intern = await createTestIntern('NEW', 'intern-t1');

  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req.body = { internId: intern._id.toString(), mentorId: mentor._id.toString() };

  await createAssignment(req, res);

  if (res.statusCode === 201 && res.data && res.data.assignment && res.data.assignment.id) {
    tempAssignmentIds.push(res.data.assignment.id);
  }

  if (res.statusCode !== 201) {
    throw new Error(`Test 1 FAILED: Expected 201, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`);
  }

  if (res.data.assignment.status !== 'PENDING') {
    throw new Error(`Test 1 FAILED: Expected status PENDING, got ${res.data.assignment.status}`);
  }

  const updatedIntern = await Intern.findById(intern._id);
  if (updatedIntern.status !== 'ASSIGNED') {
    throw new Error(`Test 1 FAILED: Intern status not updated to ASSIGNED. Got: ${updatedIntern.status}`);
  }

  console.log('✓ Test 1 PASSED: HR_ADMIN successfully assigns NEW intern to active MENTOR');
}

// Test 2: Invalid or inactive mentor cannot be assigned
async function testAssignInvalidOrInactiveMentor() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t2');
  const intern = await createTestIntern('NEW', 'intern-t2');

  // Case A: Non-existent mentor ID
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqA.body = { internId: intern._id.toString(), mentorId: new mongoose.Types.ObjectId().toString() };

  await createAssignment(reqA, resA);
  if (resA.statusCode === 201 && resA.data && resA.data.assignment) {
    tempAssignmentIds.push(resA.data.assignment.id);
  }
  if (resA.statusCode !== 404) {
    throw new Error(`Test 2a FAILED: Expected 404 for non-existent mentor, got ${resA.statusCode}`);
  }

  // Case B: Inactive mentor
  const inactiveMentor = await createTestUser('MENTOR', 'mentor-inactive-t2');
  inactiveMentor.isActive = false;
  await inactiveMentor.save();

  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqB.body = { internId: intern._id.toString(), mentorId: inactiveMentor._id.toString() };

  await createAssignment(reqB, resB);
  if (resB.statusCode === 201 && resB.data && resB.data.assignment) {
    tempAssignmentIds.push(resB.data.assignment.id);
  }
  if (resB.statusCode !== 404) {
    throw new Error(`Test 2b FAILED: Expected 404 for inactive mentor, got ${resB.statusCode}`);
  }

  // Case C: Invalid role (HR_ADMIN) instead of MENTOR
  const otherAdmin = await createTestUser('HR_ADMIN', 'admin-other-t2');
  const { req: reqC, res: resC } = makeMocks();
  reqC.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqC.body = { internId: intern._id.toString(), mentorId: otherAdmin._id.toString() };

  await createAssignment(reqC, resC);
  if (resC.statusCode === 201 && resC.data && resC.data.assignment) {
    tempAssignmentIds.push(resC.data.assignment.id);
  }
  if (resC.statusCode !== 404) {
    throw new Error(`Test 2c FAILED: Expected 404 for non-mentor role, got ${resC.statusCode}`);
  }

  const checkIntern = await Intern.findById(intern._id);
  if (checkIntern.status !== 'NEW') {
    throw new Error(`Test 2 FAILED: Intern status should remain NEW, got: ${checkIntern.status}`);
  }

  console.log('✓ Test 2 PASSED: Invalid or inactive mentor cannot be assigned');
}

// Test 3: Invalid or inactive intern cannot be assigned
async function testAssignInvalidOrInactiveIntern() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t3');
  const mentor = await createTestUser('MENTOR', 'mentor-t3');

  // Case A: Non-existent intern ID
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqA.body = { internId: new mongoose.Types.ObjectId().toString(), mentorId: mentor._id.toString() };

  await createAssignment(reqA, resA);
  if (resA.statusCode === 201 && resA.data && resA.data.assignment) {
    tempAssignmentIds.push(resA.data.assignment.id);
  }
  if (resA.statusCode !== 404) {
    throw new Error(`Test 3a FAILED: Expected 404 for non-existent intern, got ${resA.statusCode}`);
  }

  // Case B: Inactive intern
  const inactiveIntern = await createTestIntern('NEW', 'intern-inactive-t3');
  inactiveIntern.isActive = false;
  await inactiveIntern.save();

  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqB.body = { internId: inactiveIntern._id.toString(), mentorId: mentor._id.toString() };

  await createAssignment(reqB, resB);
  if (resB.statusCode === 201 && resB.data && resB.data.assignment) {
    tempAssignmentIds.push(resB.data.assignment.id);
  }
  if (resB.statusCode !== 404) {
    throw new Error(`Test 3b FAILED: Expected 404 for inactive intern, got ${resB.statusCode}`);
  }

  console.log('✓ Test 3 PASSED: Invalid or inactive intern cannot be assigned');
}

// Test 4: Intern with invalid workflow status such as ONGOING cannot be assigned
async function testAssignInternInvalidWorkflowStatus() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t4');
  const mentor = await createTestUser('MENTOR', 'mentor-t4');
  const ongoingIntern = await createTestIntern('ONGOING', 'intern-ongoing-t4');

  const { req, res } = makeMocks();
  req.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req.body = { internId: ongoingIntern._id.toString(), mentorId: mentor._id.toString() };

  await createAssignment(req, res);
  if (res.statusCode === 201 && res.data && res.data.assignment) {
    tempAssignmentIds.push(res.data.assignment.id);
  }

  if (res.statusCode !== 400) {
    throw new Error(`Test 4 FAILED: Expected 400 for ongoing intern, got ${res.statusCode}`);
  }

  console.log('✓ Test 4 PASSED: Intern with invalid status (ONGOING) cannot be assigned');
}

// Test 5: Duplicate/current PENDING assignment prevention
async function testDuplicatePendingAssignment() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t5');
  const mentor1 = await createTestUser('MENTOR', 'mentor1-t5');
  const mentor2 = await createTestUser('MENTOR', 'mentor2-t5');
  const intern = await createTestIntern('NEW', 'intern-t5');

  // First assignment
  const { req: req1, res: res1 } = makeMocks();
  req1.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req1.body = { internId: intern._id.toString(), mentorId: mentor1._id.toString() };

  await createAssignment(req1, res1);
  if (res1.statusCode === 201 && res1.data && res1.data.assignment) {
    tempAssignmentIds.push(res1.data.assignment.id);
  } else {
    throw new Error(`Test 5 setup failed: first assignment status ${res1.statusCode}`);
  }

  // Try duplicate assignment concurrently/immediately
  const { req: req2, res: res2 } = makeMocks();
  req2.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req2.body = { internId: intern._id.toString(), mentorId: mentor2._id.toString() };

  await createAssignment(req2, res2);
  if (res2.statusCode === 201 && res2.data && res2.data.assignment) {
    tempAssignmentIds.push(res2.data.assignment.id);
  }

  if (res2.statusCode !== 400) {
    throw new Error(`Test 5 FAILED: Expected 400 bad request, got ${res2.statusCode}`);
  }

  if (!res2.data.error || !res2.data.error.includes('must be NEW or REJECTED_BY_MENTOR')) {
    throw new Error(`Test 5 FAILED: Response error should indicate unassignable state. Got: ${JSON.stringify(res2.data)}`);
  }

  const count = await Assignment.countDocuments({ internId: intern._id, status: 'PENDING' });
  if (count !== 1) {
    throw new Error(`Test 5 FAILED: Expected exactly 1 pending assignment in database, found ${count}`);
  }

  console.log('✓ Test 5 PASSED: Duplicate PENDING assignment prevented (returns 400)');
}

// Test 6: GET /mine returns only the logged-in mentor's assignments
async function testGetMineReturnsOnlyOwn() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t6');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t6');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t6');
  const internA = await createTestIntern('NEW', 'internA-t6');
  const internB = await createTestIntern('NEW', 'internB-t6');

  // Assign Intern A to Mentor A
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqA.body = { internId: internA._id.toString(), mentorId: mentorA._id.toString() };
  await createAssignment(reqA, resA);
  if (resA.statusCode === 201) tempAssignmentIds.push(resA.data.assignment.id);

  // Assign Intern B to Mentor B
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqB.body = { internId: internB._id.toString(), mentorId: mentorB._id.toString() };
  await createAssignment(reqB, resB);
  if (resB.statusCode === 201) tempAssignmentIds.push(resB.data.assignment.id);

  // Mentor A queries their assignments
  const { req: queryReq, res: queryRes } = makeMocks();
  queryReq.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  queryReq.query = { status: 'PENDING' };

  await getMyAssignments(queryReq, queryRes);

  if (queryRes.statusCode !== 200) {
    throw new Error(`Test 6 FAILED: Expected 200, got ${queryRes.statusCode}`);
  }

  const list = queryRes.data.data;
  if (list.length !== 1 || list[0].intern.id !== internA._id.toString()) {
    throw new Error(`Test 6 FAILED: Mentor A should only see assignment for Intern A`);
  }

  // Safety/privacy check: verify no sensitive fields are present in list item
  const item = list[0].intern;
  if ('aadhaarNumber' in item || 'presentAddress' in item || 'permanentAddress' in item || 'password' in item) {
    throw new Error(`Test 6 FAILED: Response leaks sensitive fields (Aadhaar or addresses or password)`);
  }

  const serialized = JSON.stringify(queryRes.data);
  if (
    serialized.includes(internA.aadhaarNumber) ||
    serialized.includes(internA.presentAddress) ||
    serialized.includes(internA.permanentAddress) ||
    serialized.includes('TestPassword123!')
  ) {
    throw new Error(`Test 6 FAILED: Serialized response contains sensitive data`);
  }

  console.log('✓ Test 6 PASSED: Mentor retrieves only their own assignments with sensitive fields omitted');
}

// Test 7: GET /mine default filter returns only PENDING assignments
async function testGetMineDefaultFilter() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t7');
  const mentor = await createTestUser('MENTOR', 'mentor-t7');
  const intern1 = await createTestIntern('NEW', 'intern1-t7');
  const intern2 = await createTestIntern('NEW', 'intern2-t7');

  // Assign Intern 1 to Mentor (then accept it)
  const { req: req1, res: res1 } = makeMocks();
  req1.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req1.body = { internId: intern1._id.toString(), mentorId: mentor._id.toString() };
  await createAssignment(req1, res1);
  const aId1 = res1.data.assignment.id;
  tempAssignmentIds.push(aId1);

  const { req: accReq, res: accRes } = makeMocks();
  accReq.user = { id: mentor._id.toString(), role: 'MENTOR' };
  accReq.params = { id: aId1 };
  await acceptAssignment(accReq, accRes);

  // Assign Intern 2 to Mentor (leave PENDING)
  const { req: req2, res: res2 } = makeMocks();
  req2.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req2.body = { internId: intern2._id.toString(), mentorId: mentor._id.toString() };
  await createAssignment(req2, res2);
  const aId2 = res2.data.assignment.id;
  tempAssignmentIds.push(aId2);

  // Query mine without specifying status (defaults to PENDING)
  const { req: queryReq, res: queryRes } = makeMocks();
  queryReq.user = { id: mentor._id.toString(), role: 'MENTOR' };

  await getMyAssignments(queryReq, queryRes);

  if (queryRes.statusCode !== 200) {
    throw new Error(`Test 7 FAILED: Expected 200, got ${queryRes.statusCode}`);
  }

  const list = queryRes.data.data;
  const hasAccepted = list.some(a => a.id === aId1);
  const hasPending = list.some(a => a.id === aId2);

  if (hasAccepted || !hasPending) {
    throw new Error(`Test 7 FAILED: Default query should return only PENDING assignments`);
  }

  console.log('✓ Test 7 PASSED: GET /mine default filter isolates PENDING assignments');
}

// Test 8: Mentor cannot GET another mentor's assignment detail
async function testGetAssignmentDetailPrivacy() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t8');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t8');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t8');
  const intern = await createTestIntern('NEW', 'intern-t8');

  // Assign to Mentor A
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqA.body = { internId: intern._id.toString(), mentorId: mentorA._id.toString() };
  await createAssignment(reqA, resA);
  const aId = resA.data.assignment.id;
  tempAssignmentIds.push(aId);

  // Mentor B queries the assignment ID of Mentor A
  const { req: getReq, res: getRes } = makeMocks();
  getReq.user = { id: mentorB._id.toString(), role: 'MENTOR' };
  getReq.params = { id: aId };

  await getAssignmentById(getReq, getRes);

  if (getRes.statusCode !== 404) {
    throw new Error(`Test 8 FAILED: Expected 404 for unauthorized assignment query, got ${getRes.statusCode}`);
  }

  // Mentor A queries detail
  const { req: getReqA, res: getResA } = makeMocks();
  getReqA.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  getReqA.params = { id: aId };

  await getAssignmentById(getReqA, getResA);
  if (getResA.statusCode !== 200) {
    throw new Error(`Test 8 FAILED: Mentor A could not fetch own detail`);
  }

  // Safety/privacy check: verify no sensitive fields are present in detail response
  const details = getResA.data.intern;
  if ('aadhaarNumber' in details || 'presentAddress' in details || 'permanentAddress' in details || 'password' in details) {
    throw new Error(`Test 8 FAILED: Detail response leaks sensitive fields (Aadhaar or addresses or password)`);
  }

  const serialized = JSON.stringify(getResA.data);
  if (
    serialized.includes(intern.aadhaarNumber) ||
    serialized.includes(intern.presentAddress) ||
    serialized.includes(intern.permanentAddress) ||
    serialized.includes('TestPassword123!')
  ) {
    throw new Error(`Test 8 FAILED: Serialized response contains sensitive data`);
  }

  console.log('✓ Test 8 PASSED: Mentor receives 404 for other mentor assignment; safe detail returns');
}

// Test 9: Mentor cannot accept or reject another mentor's assignment
async function testAcceptRejectAuthorization() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t9');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t9');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t9');
  const intern = await createTestIntern('NEW', 'intern-t9');

  // Assign to Mentor A
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqA.body = { internId: intern._id.toString(), mentorId: mentorA._id.toString() };
  await createAssignment(reqA, resA);
  const aId = resA.data.assignment.id;
  tempAssignmentIds.push(aId);

  // Mentor B tries to Accept
  const { req: accReq, res: accRes } = makeMocks();
  accReq.user = { id: mentorB._id.toString(), role: 'MENTOR' };
  accReq.params = { id: aId };
  await acceptAssignment(accReq, accRes);

  if (accRes.statusCode !== 404) {
    throw new Error(`Test 9a FAILED: Expected 404 when Mentor B accepts Mentor A assignment, got ${accRes.statusCode}`);
  }

  // Mentor B tries to Reject
  const { req: rejReq, res: rejRes } = makeMocks();
  rejReq.user = { id: mentorB._id.toString(), role: 'MENTOR' };
  rejReq.params = { id: aId };
  rejReq.body = { rejectionRemarks: 'Remarks by unauthorized mentor' };
  await rejectAssignment(rejReq, rejRes);

  if (rejRes.statusCode !== 404) {
    throw new Error(`Test 9b FAILED: Expected 404 when Mentor B rejects Mentor A assignment, got ${rejRes.statusCode}`);
  }

  const checkAssignment = await Assignment.findById(aId);
  if (checkAssignment.status !== 'PENDING') {
    throw new Error(`Test 9 FAILED: Assignment status was mutated. Got: ${checkAssignment.status}`);
  }

  const checkIntern = await Intern.findById(intern._id);
  if (checkIntern.status !== 'ASSIGNED') {
    throw new Error(`Test 9 FAILED: Intern status was mutated. Got: ${checkIntern.status}`);
  }

  console.log('✓ Test 9 PASSED: Unauthorized mentors cannot accept or reject assignments (returns 404)');
}

// Test 10: Reject requires non-empty rejectionRemarks
async function testRejectRequiresRemarks() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t10');
  const mentor = await createTestUser('MENTOR', 'mentor-t10');
  const intern = await createTestIntern('NEW', 'intern-t10');

  // Assign
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqA.body = { internId: intern._id.toString(), mentorId: mentor._id.toString() };
  await createAssignment(reqA, resA);
  const aId = resA.data.assignment.id;
  tempAssignmentIds.push(aId);

  // Case A: Missing remarks field
  const { req: rejReqA, res: resRejA } = makeMocks();
  rejReqA.user = { id: mentor._id.toString(), role: 'MENTOR' };
  rejReqA.params = { id: aId };
  rejReqA.body = {};
  await rejectAssignment(rejReqA, resRejA);

  if (resRejA.statusCode !== 400) {
    throw new Error(`Test 10a FAILED: Expected 400 for missing remarks, got ${resRejA.statusCode}`);
  }

  // Case B: Whitespace-only remarks
  const { req: rejReqB, res: resRejB } = makeMocks();
  rejReqB.user = { id: mentor._id.toString(), role: 'MENTOR' };
  rejReqB.params = { id: aId };
  rejReqB.body = { rejectionRemarks: '    ' };
  await rejectAssignment(rejReqB, resRejB);

  if (resRejB.statusCode !== 400) {
    throw new Error(`Test 10b FAILED: Expected 400 for whitespace-only remarks, got ${resRejB.statusCode}`);
  }

  const checkAssignment = await Assignment.findById(aId);
  const checkIntern = await Intern.findById(intern._id);

  if (checkAssignment.status !== 'PENDING' || checkIntern.status !== 'ASSIGNED') {
    throw new Error(`Test 10 FAILED: Pending assignment/intern state corrupted after validation failures`);
  }

  console.log('✓ Test 10 PASSED: Rejection requires non-empty remarks (returns 400)');
}

// Test 11: Successful workflow transitions
async function testWorkflowTransitions() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t11');
  const mentor = await createTestUser('MENTOR', 'mentor-t11');

  // Case A: Accept workflow path
  const internA = await createTestIntern('NEW', 'internA-t11');

  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqA.body = { internId: internA._id.toString(), mentorId: mentor._id.toString() };
  await createAssignment(reqA, resA);
  const aIdA = resA.data.assignment.id;
  tempAssignmentIds.push(aIdA);

  const { req: accReq, res: accRes } = makeMocks();
  accReq.user = { id: mentor._id.toString(), role: 'MENTOR' };
  accReq.params = { id: aIdA };
  await acceptAssignment(accReq, accRes);

  if (accRes.statusCode !== 200) {
    throw new Error(`Test 11a FAILED: Expected 200 for accept request, got ${accRes.statusCode}`);
  }

  const checkAssignmentA = await Assignment.findById(aIdA);
  const checkInternA = await Intern.findById(internA._id);

  if (checkAssignmentA.status !== 'ACCEPTED' || !checkAssignmentA.decidedAt) {
    throw new Error(`Test 11a FAILED: Assignment not updated to ACCEPTED or decidedAt is missing`);
  }
  if (checkInternA.status !== 'ONGOING') {
    throw new Error(`Test 11a FAILED: Intern status not updated to ONGOING, got: ${checkInternA.status}`);
  }

  // Case B: Reject workflow path
  const internB = await createTestIntern('NEW', 'internB-t11');

  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqB.body = { internId: internB._id.toString(), mentorId: mentor._id.toString() };
  await createAssignment(reqB, resB);
  const aIdB = resB.data.assignment.id;
  tempAssignmentIds.push(aIdB);

  const { req: rejReq, res: rejRes } = makeMocks();
  rejReq.user = { id: mentor._id.toString(), role: 'MENTOR' };
  rejReq.params = { id: aIdB };
  rejReq.body = { rejectionRemarks: '  Not my research area  ' };
  await rejectAssignment(rejReq, rejRes);

  if (rejRes.statusCode !== 200) {
    throw new Error(`Test 11b FAILED: Expected 200 for reject request, got ${rejRes.statusCode}`);
  }

  const checkAssignmentB = await Assignment.findById(aIdB);
  const checkInternB = await Intern.findById(internB._id);

  if (checkAssignmentB.status !== 'REJECTED' || !checkAssignmentB.decidedAt) {
    throw new Error(`Test 11b FAILED: Assignment not updated to REJECTED or decidedAt is missing`);
  }
  if (checkAssignmentB.rejectionRemarks !== 'Not my research area') {
    throw new Error(`Test 11b FAILED: Remarks not stored/trimmed correctly. Got: "${checkAssignmentB.rejectionRemarks}"`);
  }
  if (checkInternB.status !== 'REJECTED_BY_MENTOR') {
    throw new Error(`Test 11b FAILED: Intern status not updated to REJECTED_BY_MENTOR, got: ${checkInternB.status}`);
  }

  console.log('✓ Test 11 PASSED: Successful Accept and Reject state transitions executed');
}

// Test 12: Reassignment preserves history
async function testReassignmentHistory() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t12');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t12');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t12');
  const intern = await createTestIntern('NEW', 'intern-t12');

  // 1. HR assigns to Mentor A
  const { req: req1, res: res1 } = makeMocks();
  req1.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req1.body = { internId: intern._id.toString(), mentorId: mentorA._id.toString() };
  await createAssignment(req1, res1);
  const aId1 = res1.data.assignment.id;
  tempAssignmentIds.push(aId1);

  // 2. Mentor A Rejects
  const { req: rejReq, res: rejRes } = makeMocks();
  rejReq.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  rejReq.params = { id: aId1 };
  rejReq.body = { rejectionRemarks: 'Rejecting first assignment' };
  await rejectAssignment(rejReq, rejRes);

  const checkInternAfterRej = await Intern.findById(intern._id);
  if (checkInternAfterRej.status !== 'REJECTED_BY_MENTOR') {
    throw new Error(`Test 12 FAILED: Intern status must be REJECTED_BY_MENTOR before reassignment`);
  }

  // 3. HR assigns same intern to Mentor B (Reassignment)
  const { req: req2, res: res2 } = makeMocks();
  req2.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  req2.body = { internId: intern._id.toString(), mentorId: mentorB._id.toString() };
  await createAssignment(req2, res2);

  if (res2.statusCode !== 201) {
    throw new Error(`Test 12 FAILED: Expected 201 on reassignment, got ${res2.statusCode}`);
  }
  const aId2 = res2.data.assignment.id;
  tempAssignmentIds.push(aId2);

  // 4. Verify intern is back to ASSIGNED status
  const checkInternFinal = await Intern.findById(intern._id);
  if (checkInternFinal.status !== 'ASSIGNED') {
    throw new Error(`Test 12 FAILED: Intern status not updated to ASSIGNED on reassignment, got: ${checkInternFinal.status}`);
  }

  // 5. Verify both assignment documents still exist
  const history = await Assignment.find({ internId: intern._id }).sort({ assignedAt: 1 });
  if (history.length !== 2) {
    throw new Error(`Test 12 FAILED: Expected 2 assignments in history, found ${history.length}`);
  }

  if (history[0]._id.toString() !== aId1 || history[0].status !== 'REJECTED') {
    throw new Error(`Test 12 FAILED: Old rejected assignment corrupted or missing`);
  }

  if (history[1]._id.toString() !== aId2 || history[1].status !== 'PENDING') {
    throw new Error(`Test 12 FAILED: New pending assignment corrupted or missing`);
  }

  console.log('✓ Test 12 PASSED: Reassignment preserves complete assignment history in database');
}

async function runTests() {
  try {
    await setup();

    await testCreateAssignmentSuccess();
    await testAssignInvalidOrInactiveMentor();
    await testAssignInvalidOrInactiveIntern();
    await testAssignInternInvalidWorkflowStatus();
    await testDuplicatePendingAssignment();
    await testGetMineReturnsOnlyOwn();
    await testGetMineDefaultFilter();
    await testGetAssignmentDetailPrivacy();
    await testAcceptRejectAuthorization();
    await testRejectRequiresRemarks();
    await testWorkflowTransitions();
    await testReassignmentHistory();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL 12 ASSIGNMENT TESTS PASSED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('\n❌ ASSIGNMENT TEST FAILED:');
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    try {
      console.log('\nCleaning up database records...');

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
