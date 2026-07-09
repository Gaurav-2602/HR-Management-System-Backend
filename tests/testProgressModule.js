require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Intern = require('../src/models/Intern');
const Assignment = require('../src/models/Assignment');
const Progress = require('../src/models/Progress');
const {
  getOngoingInterns,
  recordProgress,
  getProgressHistory,
  completeTraining,
  getInternDetails
} = require('../src/controllers/progressController');
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

async function assignAndAcceptIntern(admin, mentor, intern) {
  const { req: assignReq, res: assignRes } = makeMocks();
  assignReq.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  assignReq.body = { internId: intern._id.toString(), mentorId: mentor._id.toString() };
  
  await createAssignment(assignReq, assignRes);
  if (assignRes.statusCode !== 201) {
    throw new Error(`Helper failed to create assignment: ${JSON.stringify(assignRes.data)}`);
  }
  const assignmentId = assignRes.data.assignment.id;
  tempAssignmentIds.push(assignmentId);

  const { req: acceptReq, res: acceptRes } = makeMocks();
  acceptReq.user = { id: mentor._id.toString(), role: 'MENTOR' };
  acceptReq.params = { id: assignmentId };
  
  await acceptAssignment(acceptReq, acceptRes);
  if (acceptRes.statusCode !== 200) {
    throw new Error(`Helper failed to accept assignment: ${JSON.stringify(acceptRes.data)}`);
  }
  return assignmentId;
}

// Test 1: Mentor ongoing list returns only their own active ONGOING interns
async function testGetOngoingInterns() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t1');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t1');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t1');

  const internA = await createTestIntern('NEW', 'internA-t1');
  const internB = await createTestIntern('NEW', 'internB-t1');
  const internC = await createTestIntern('NEW', 'internC-t1'); // Non-ONGOING (will remain ASSIGNED)

  // 1. Assign and accept Intern A to Mentor A (ONGOING)
  await assignAndAcceptIntern(admin, mentorA, internA);

  // 2. Assign and accept Intern B to Mentor B (ONGOING)
  await assignAndAcceptIntern(admin, mentorB, internB);

  // 3. Assign Intern C to Mentor A (but Mentor A does not accept, status is ASSIGNED)
  const { req: assignReqC, res: assignResC } = makeMocks();
  assignReqC.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  assignReqC.body = { internId: internC._id.toString(), mentorId: mentorA._id.toString() };
  await createAssignment(assignReqC, assignResC);
  if (assignResC.statusCode === 201) {
    tempAssignmentIds.push(assignResC.data.assignment.id);
  }

  // 4. Create a duplicate historical assignment path:
  // Intern A is completed/terminated, then re-assigned. Since status transitions prevent re-assignment 
  // while ONGOING, we will simulate a historical assignment by directly saving another ACCEPTED assignment.
  const histAssignment = new Assignment({
    internId: internA._id,
    mentorId: mentorA._id,
    assignedBy: admin._id,
    status: 'ACCEPTED',
    assignedAt: new Date(Date.now() - 1000000)
  });
  await histAssignment.save();
  tempAssignmentIds.push(histAssignment._id.toString());

  // Call getOngoingInterns for Mentor A
  const { req, res } = makeMocks();
  req.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  await getOngoingInterns(req, res);

  if (res.statusCode !== 200) {
    throw new Error(`Test 1 FAILED: Expected 200, got ${res.statusCode}`);
  }

  const list = res.data.data;
  // Exclude Mentor B's intern (internB)
  const hasInternB = list.some(i => i.id === internB._id.toString());
  // Exclude non-ongoing intern (internC)
  const hasInternC = list.some(i => i.id === internC._id.toString());
  // Exclude duplicate/history entries
  const internAMatches = list.filter(i => i.id === internA._id.toString());

  if (hasInternB) throw new Error('Test 1 FAILED: Returned another mentor\'s intern');
  if (hasInternC) throw new Error('Test 1 FAILED: Returned non-ONGOING intern');
  if (internAMatches.length !== 1) {
    throw new Error(`Test 1 FAILED: Intern A should appear exactly once, got matches: ${internAMatches.length}`);
  }

  console.log('✓ Test 1 PASSED: Mentor list isolates own active ongoing interns without duplication');
}

// Test 2: Mentor gets own ongoing intern detail safely
async function testGetInternDetailSafety() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t2');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t2');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t2');
  const intern = await createTestIntern('NEW', 'intern-t2');

  await assignAndAcceptIntern(admin, mentorA, intern);

  // Mentor A queries detail (success)
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  reqA.params = { internId: intern._id.toString() };
  await getInternDetails(reqA, resA);

  if (resA.statusCode !== 200) {
    throw new Error(`Test 2 FAILED: Expected 200 for mentor details lookup, got ${resA.statusCode}`);
  }

  // Verify response fields do not contain sensitive fields
  const data = resA.data;
  if ('aadhaarNumber' in data || 'presentAddress' in data || 'permanentAddress' in data || 'password' in data) {
    throw new Error('Test 2 FAILED: Response leaks sensitive fields directly');
  }

  // Verify serialized string does not contain sensitive test values
  const serialized = JSON.stringify(data);
  if (
    serialized.includes(intern.aadhaarNumber) ||
    serialized.includes(intern.presentAddress) ||
    serialized.includes(intern.permanentAddress) ||
    serialized.includes('TestPassword123!')
  ) {
    throw new Error('Test 2 FAILED: Serialized response leaks sensitive test data');
  }

  // Mentor B queries detail (fails with 404 to hide existence)
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: mentorB._id.toString(), role: 'MENTOR' };
  reqB.params = { internId: intern._id.toString() };
  await getInternDetails(reqB, resB);

  if (resB.statusCode !== 404) {
    throw new Error(`Test 2 FAILED: Expected 404 for unauthorized mentor lookup, got ${resB.statusCode}`);
  }

  console.log('✓ Test 2 PASSED: Details retrieved safely; unauthorized mentor receives 404');
}

// Test 3: Valid normal progress creation
async function testRecordProgressSuccess() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t3');
  const mentor = await createTestUser('MENTOR', 'mentor-t3');
  const intern = await createTestIntern('NEW', 'intern-t3');

  const assignmentId = await assignAndAcceptIntern(admin, mentor, intern);

  const { req, res } = makeMocks();
  req.user = { id: mentor._id.toString(), role: 'MENTOR' };
  req.body = {
    internId: intern._id.toString(),
    progressPercentage: 45,
    remarks: '  Understands mongoose schemas well.  ',
    // Supplied fake fields that should be ignored or not override derived values
    assignmentId: new mongoose.Types.ObjectId().toString(),
    recordedBy: new mongoose.Types.ObjectId().toString()
  };

  await recordProgress(req, res);

  if (res.statusCode === 201 && res.data && res.data.progress && res.data.progress.id) {
    tempProgressIds.push(res.data.progress.id);
  }

  if (res.statusCode !== 201) {
    throw new Error(`Test 3 FAILED: Expected 201, got ${res.statusCode}. Message: ${JSON.stringify(res.data)}`);
  }

  const pDoc = await Progress.findById(res.data.progress.id);
  if (!pDoc) {
    throw new Error('Test 3 FAILED: Progress document not found in DB');
  }

  if (pDoc.progressPercentage !== 45) {
    throw new Error(`Test 3 FAILED: Expected progressPercentage 45, got ${pDoc.progressPercentage}`);
  }

  if (pDoc.remarks !== 'Understands mongoose schemas well.') {
    throw new Error(`Test 3 FAILED: Expected remarks to be trimmed, got "${pDoc.remarks}"`);
  }

  if (pDoc.assignmentId.toString() !== assignmentId) {
    throw new Error(`Test 3 FAILED: assignmentId was not derived correctly. Expected ${assignmentId}, got ${pDoc.assignmentId}`);
  }

  if (pDoc.recordedBy.toString() !== mentor._id.toString()) {
    throw new Error(`Test 3 FAILED: recordedBy was not derived correctly. Expected ${mentor._id}, got ${pDoc.recordedBy}`);
  }

  console.log('✓ Test 3 PASSED: Valid progress created and ownership derived securely');
}

// Test 4: Required-field and percentage validation
async function testRecordProgressValidation() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t4');
  const mentor = await createTestUser('MENTOR', 'mentor-t4');
  const intern = await createTestIntern('NEW', 'intern-t4');

  await assignAndAcceptIntern(admin, mentor, intern);

  const cases = [
    { desc: 'missing progressPercentage', body: { remarks: 'Valid remarks' } },
    { desc: 'decimal percentage', body: { progressPercentage: 12.5, remarks: 'Valid remarks' } },
    { desc: 'percentage below 0', body: { progressPercentage: -5, remarks: 'Valid remarks' } },
    { desc: 'percentage above 99', body: { progressPercentage: 100, remarks: 'Valid remarks' } },
    { desc: 'missing remarks', body: { progressPercentage: 50 } },
    { desc: 'whitespace-only remarks', body: { progressPercentage: 50, remarks: '     ' } }
  ];

  for (const tc of cases) {
    const { req, res } = makeMocks();
    req.user = { id: mentor._id.toString(), role: 'MENTOR' };
    req.body = { internId: intern._id.toString(), ...tc.body };

    await recordProgress(req, res);

    // Safety track in case of unexpected success
    if (res.statusCode === 201 && res.data && res.data.progress) {
      tempProgressIds.push(res.data.progress.id);
    }

    if (res.statusCode !== 400) {
      throw new Error(`Test 4 FAILED: Expected 400 for ${tc.desc}, got ${res.statusCode}`);
    }
  }

  const count = await Progress.countDocuments({ internId: intern._id });
  if (count !== 0) {
    throw new Error(`Test 4 FAILED: Expected 0 progress documents, found ${count}`);
  }

  console.log('✓ Test 4 PASSED: Missing/invalid percentage and remarks validation handled (returns 400)');
}

// Test 5: Optional-field validation and trimming
async function testRecordProgressOptionalValidation() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t5');
  const mentor = await createTestUser('MENTOR', 'mentor-t5');
  const intern = await createTestIntern('NEW', 'intern-t5');

  await assignAndAcceptIntern(admin, mentor, intern);

  // Case A: Valid optional fields supplied
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqA.body = {
    internId: intern._id.toString(),
    progressPercentage: 20,
    remarks: 'Good progress',
    performanceRating: 4,
    skillsCovered: ['  Git  ', 'JavaScript'],
    nextGoals: '  Learn Node.js  '
  };

  await recordProgress(reqA, resA);
  if (resA.statusCode === 201 && resA.data && resA.data.progress) {
    tempProgressIds.push(resA.data.progress.id);
  } else {
    throw new Error(`Test 5a FAILED: Expected 201, got ${resA.statusCode}`);
  }

  const pDoc = await Progress.findById(resA.data.progress.id);
  if (pDoc.performanceRating !== 4) throw new Error('Test 5a FAILED: Rating not stored');
  if (pDoc.skillsCovered[0] !== 'Git' || pDoc.skillsCovered[1] !== 'JavaScript') throw new Error('Test 5a FAILED: Skills not trimmed');
  if (pDoc.nextGoals !== 'Learn Node.js') throw new Error('Test 5a FAILED: nextGoals not trimmed');

  // Case B: Invalid optional rating (string)
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqB.body = { internId: intern._id.toString(), progressPercentage: 30, remarks: 'Good', performanceRating: 'four' };
  await recordProgress(reqB, resB);
  if (resB.statusCode === 201) tempProgressIds.push(resB.data.progress.id);
  if (resB.statusCode !== 400) throw new Error(`Test 5b FAILED: Expected 400 for string rating, got ${resB.statusCode}`);

  // Case C: Invalid optional rating (decimal)
  const { req: reqC, res: resC } = makeMocks();
  reqC.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqC.body = { internId: intern._id.toString(), progressPercentage: 30, remarks: 'Good', performanceRating: 4.5 };
  await recordProgress(reqC, resC);
  if (resC.statusCode === 201) tempProgressIds.push(resC.data.progress.id);
  if (resC.statusCode !== 400) throw new Error(`Test 5c FAILED: Expected 400 for decimal rating, got ${resC.statusCode}`);

  // Case D: Invalid optional rating (out-of-range)
  const { req: reqD, res: resD } = makeMocks();
  reqD.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqD.body = { internId: intern._id.toString(), progressPercentage: 30, remarks: 'Good', performanceRating: 6 };
  await recordProgress(reqD, resD);
  if (resD.statusCode === 201) tempProgressIds.push(resD.data.progress.id);
  if (resD.statusCode !== 400) throw new Error(`Test 5d FAILED: Expected 400 for out-of-range rating, got ${resD.statusCode}`);

  // Case E: Non-array skillsCovered
  const { req: reqE, res: resE } = makeMocks();
  reqE.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqE.body = { internId: intern._id.toString(), progressPercentage: 30, remarks: 'Good', skillsCovered: 'Git' };
  await recordProgress(reqE, resE);
  if (resE.statusCode === 201) tempProgressIds.push(resE.data.progress.id);
  if (resE.statusCode !== 400) throw new Error(`Test 5e FAILED: Expected 400 for non-array skills, got ${resE.statusCode}`);

  // Case F: Empty/whitespace skill item
  const { req: reqF, res: resF } = makeMocks();
  reqF.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqF.body = { internId: intern._id.toString(), progressPercentage: 30, remarks: 'Good', skillsCovered: ['Git', '   '] };
  await recordProgress(reqF, resF);
  if (resF.statusCode === 201) tempProgressIds.push(resF.data.progress.id);
  if (resF.statusCode !== 400) throw new Error(`Test 5f FAILED: Expected 400 for whitespace skill item, got ${resF.statusCode}`);

  // Case G: Empty skillsCovered array (allowed)
  const { req: reqG, res: resG } = makeMocks();
  reqG.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqG.body = { internId: intern._id.toString(), progressPercentage: 30, remarks: 'Good', skillsCovered: [] };
  await recordProgress(reqG, resG);
  if (resG.statusCode === 201 && resG.data && resG.data.progress) {
    tempProgressIds.push(resG.data.progress.id);
  } else {
    throw new Error(`Test 5g FAILED: Expected 201 for empty skills array, got ${resG.statusCode}`);
  }

  // Case H: Whitespace-only nextGoals
  const { req: reqH, res: resH } = makeMocks();
  reqH.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqH.body = { internId: intern._id.toString(), progressPercentage: 40, remarks: 'Good', nextGoals: '     ' };
  await recordProgress(reqH, resH);
  if (resH.statusCode === 201) tempProgressIds.push(resH.data.progress.id);
  if (resH.statusCode !== 400) throw new Error(`Test 5h FAILED: Expected 400 for whitespace nextGoals, got ${resH.statusCode}`);

  // Case I: Null rating
  const { req: reqI, res: resI } = makeMocks();
  reqI.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqI.body = { internId: intern._id.toString(), progressPercentage: 45, remarks: 'Good', performanceRating: null };
  await recordProgress(reqI, resI);
  if (resI.statusCode === 201) tempProgressIds.push(resI.data.progress.id);
  if (resI.statusCode !== 400) throw new Error(`Test 5i FAILED: Expected 400 for null rating, got ${resI.statusCode}`);

  // Case J: Below-range rating
  const { req: reqJ, res: resJ } = makeMocks();
  reqJ.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqJ.body = { internId: intern._id.toString(), progressPercentage: 45, remarks: 'Good', performanceRating: 0 };
  await recordProgress(reqJ, resJ);
  if (resJ.statusCode === 201) tempProgressIds.push(resJ.data.progress.id);
  if (resJ.statusCode !== 400) throw new Error(`Test 5j FAILED: Expected 400 for rating 0, got ${resJ.statusCode}`);

  // Case K: Non-string nextGoals
  const { req: reqK, res: resK } = makeMocks();
  reqK.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqK.body = { internId: intern._id.toString(), progressPercentage: 45, remarks: 'Good', nextGoals: 123 };
  await recordProgress(reqK, resK);
  if (resK.statusCode === 201) tempProgressIds.push(resK.data.progress.id);
  if (resK.statusCode !== 400) throw new Error(`Test 5k FAILED: Expected 400 for non-string nextGoals, got ${resK.statusCode}`);

  console.log('✓ Test 5 PASSED: Optional fields validated, formatted, and trimmed correctly');
}

// Test 6: Strictly increasing progress
async function testRecordProgressStrictOrdering() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t6');
  const mentor = await createTestUser('MENTOR', 'mentor-t6');
  const intern1 = await createTestIntern('NEW', 'intern1-t6');
  const intern2 = await createTestIntern('NEW', 'intern2-t6'); // For scoping verification

  const aId1 = await assignAndAcceptIntern(admin, mentor, intern1);
  const aId2 = await assignAndAcceptIntern(admin, mentor, intern2);

  // 1. Create first valid progress (35%) on Intern 1
  const { req: req1, res: res1 } = makeMocks();
  req1.user = { id: mentor._id.toString(), role: 'MENTOR' };
  req1.body = { internId: intern1._id.toString(), progressPercentage: 35, remarks: 'Initial progress' };
  await recordProgress(req1, res1);
  if (res1.statusCode === 201) tempProgressIds.push(res1.data.progress.id);

  // 2. Equal percentage returns 400
  const { req: reqEq, res: resEq } = makeMocks();
  reqEq.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqEq.body = { internId: intern1._id.toString(), progressPercentage: 35, remarks: 'Equal progress' };
  await recordProgress(reqEq, resEq);
  if (resEq.statusCode === 201) tempProgressIds.push(resEq.data.progress.id);
  if (resEq.statusCode !== 400) throw new Error(`Test 6 FAILED: Expected 400 for equal progress percentage, got ${resEq.statusCode}`);

  // 3. Lower percentage returns 400
  const { req: reqLo, res: resLo } = makeMocks();
  reqLo.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqLo.body = { internId: intern1._id.toString(), progressPercentage: 30, remarks: 'Lower progress' };
  await recordProgress(reqLo, resLo);
  if (resLo.statusCode === 201) tempProgressIds.push(resLo.data.progress.id);
  if (resLo.statusCode !== 400) throw new Error(`Test 6 FAILED: Expected 400 for lower progress percentage, got ${resLo.statusCode}`);

  // 4. Higher percentage succeeds
  const { req: reqHi, res: resHi } = makeMocks();
  reqHi.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqHi.body = { internId: intern1._id.toString(), progressPercentage: 55, remarks: 'Higher progress' };
  await recordProgress(reqHi, resHi);
  if (resHi.statusCode === 201) {
    tempProgressIds.push(resHi.data.progress.id);
  } else {
    throw new Error(`Test 6 FAILED: Higher progress recording failed with status ${resHi.statusCode}`);
  }

  // 5. Verify ordering rule is scoped to the exact assignment:
  // Intern 2 should be able to create progress at 25% (lower than Intern 1's highest, but valid for its own assignment)
  const { req: reqScope, res: resScope } = makeMocks();
  reqScope.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqScope.body = { internId: intern2._id.toString(), progressPercentage: 25, remarks: 'Intern 2 progress' };
  await recordProgress(reqScope, resScope);
  if (resScope.statusCode === 201) {
    tempProgressIds.push(resScope.data.progress.id);
  } else {
    throw new Error(`Test 6 FAILED: Failed to record independent progress for Intern 2: ${resScope.statusCode}`);
  }

  console.log('✓ Test 6 PASSED: Strictly increasing progress constraint enforced and scoped correctly');
}

// Test 7: Progress rejected for invalid workflow/access
async function testRecordProgressWorkflowAccess() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t7');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t7');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t7');

  const intern = await createTestIntern('NEW', 'intern-t7');

  await assignAndAcceptIntern(admin, mentorA, intern);

  // Case A: Inactive intern
  intern.isActive = false;
  await intern.save();

  const { req: reqIn, res: resIn } = makeMocks();
  reqIn.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  reqIn.body = { internId: intern._id.toString(), progressPercentage: 40, remarks: 'Progress on inactive' };
  await recordProgress(reqIn, resIn);
  if (resIn.statusCode === 201) tempProgressIds.push(resIn.data.progress.id);
  if (resIn.statusCode !== 404) throw new Error(`Test 7a FAILED: Expected 404 for inactive intern, got ${resIn.statusCode}`);

  // Re-activate intern
  intern.isActive = true;
  await intern.save();

  // Case B: Non-ONGOING intern (we will manually change status to COMPLETED)
  intern.status = 'COMPLETED';
  await intern.save();

  const { req: reqSt, res: resSt } = makeMocks();
  reqSt.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  reqSt.body = { internId: intern._id.toString(), progressPercentage: 40, remarks: 'Progress on completed status' };
  await recordProgress(reqSt, resSt);
  if (resSt.statusCode === 201) tempProgressIds.push(resSt.data.progress.id);
  if (resSt.statusCode !== 400) throw new Error(`Test 7b FAILED: Expected 400 for non-ongoing status, got ${resSt.statusCode}`);

  // Re-set status to ONGOING
  intern.status = 'ONGOING';
  await intern.save();

  // Case C: Another mentor attempting to record progress
  const { req: reqM, res: resM } = makeMocks();
  reqM.user = { id: mentorB._id.toString(), role: 'MENTOR' };
  reqM.body = { internId: intern._id.toString(), progressPercentage: 40, remarks: 'Progress by another mentor' };
  await recordProgress(reqM, resM);
  if (resM.statusCode === 201) tempProgressIds.push(resM.data.progress.id);
  if (resM.statusCode !== 404) throw new Error(`Test 7c FAILED: Expected 404 for unauthorized mentor access, got ${resM.statusCode}`);

  console.log('✓ Test 7 PASSED: Progress rejected for inactive, non-ongoing, and unauthorized access');
}

// Test 8: History access and ordering
async function testProgressHistoryAccessAndOrdering() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t8');
  const mentorA = await createTestUser('MENTOR', 'mentorA-t8');
  const mentorB = await createTestUser('MENTOR', 'mentorB-t8');
  const intern = await createTestIntern('NEW', 'intern-t8');

  // 1. Create a separate historical Assignment owned by mentorB
  const aIdB = await assignAndAcceptIntern(admin, mentorB, intern);

  // Record one Progress record tied to that historical assignment
  const pB = new Progress({
    internId: intern._id,
    assignmentId: aIdB,
    recordedBy: mentorB._id,
    progressPercentage: 5,
    remarks: 'Historical progress by mentor B',
    recordedAt: new Date(Date.now() - 100000)
  });
  await pB.save();
  tempProgressIds.push(pB._id.toString());

  // Reset intern status back to NEW to allow reassignment to mentorA
  await Intern.updateOne({ _id: intern._id }, { $set: { status: 'NEW' } });
  intern.status = 'NEW';

  // 2. Create the current resolved ACCEPTED assignment owned by mentorA
  const aId = await assignAndAcceptIntern(admin, mentorA, intern);

  // Write three progress records chronologically
  const p1 = new Progress({ internId: intern._id, assignmentId: aId, recordedBy: mentorA._id, progressPercentage: 10, remarks: 'P1', recordedAt: new Date(Date.now() - 50000) });
  await p1.save();
  tempProgressIds.push(p1._id.toString());

  const p2 = new Progress({ internId: intern._id, assignmentId: aId, recordedBy: mentorA._id, progressPercentage: 20, remarks: 'P2', recordedAt: new Date(Date.now() - 25000) });
  await p2.save();
  tempProgressIds.push(p2._id.toString());

  const p3 = new Progress({ internId: intern._id, assignmentId: aId, recordedBy: mentorA._id, progressPercentage: 30, remarks: 'P3', recordedAt: new Date() });
  await p3.save();
  tempProgressIds.push(p3._id.toString());

  // 1. Mentor A views history (succeeds, gets only own assignment history)
  const { req: reqA, res: resA } = makeMocks();
  reqA.user = { id: mentorA._id.toString(), role: 'MENTOR' };
  reqA.params = { internId: intern._id.toString() };
  await getProgressHistory(reqA, resA);

  if (resA.statusCode !== 200) {
    throw new Error(`Test 8 FAILED: Expected 200 for Mentor A history query, got ${resA.statusCode}`);
  }

  const listA = resA.data.data;
  if (listA.length !== 3) {
    throw new Error(`Test 8 FAILED: Expected 3 progress documents in Mentor A history, found ${listA.length}`);
  }

  // Verify oldest-to-newest ordering and that mentorB's historical progress is absent
  if (listA[0].remarks !== 'P1' || listA[1].remarks !== 'P2' || listA[2].remarks !== 'P3') {
    throw new Error('Test 8 FAILED: Mentor A history not sorted chronologically or contains wrong items');
  }

  const hasHistoricalInA = listA.some(p => p.assignmentId === aIdB);
  if (hasHistoricalInA) {
    throw new Error('Test 8 FAILED: Mentor A retrieved history from another mentor\'s assignment');
  }

  // 2. Mentor B views history (succeeds, gets only own historical assignment history)
  const { req: reqB, res: resB } = makeMocks();
  reqB.user = { id: mentorB._id.toString(), role: 'MENTOR' };
  reqB.params = { internId: intern._id.toString() };
  await getProgressHistory(reqB, resB);

  if (resB.statusCode !== 200) {
    throw new Error(`Test 8 FAILED: Expected 200 for Mentor B history query, got ${resB.statusCode}`);
  }

  const listB = resB.data.data;
  if (listB.length !== 1) {
    throw new Error(`Test 8 FAILED: Expected 1 progress document in Mentor B history, found ${listB.length}`);
  }

  if (listB[0].remarks !== 'Historical progress by mentor B') {
    throw new Error(`Test 8 FAILED: Mentor B retrieved incorrect history: ${listB[0].remarks}`);
  }

  const hasAInB = listB.some(p => p.assignmentId === aId);
  if (hasAInB) {
    throw new Error('Test 8 FAILED: Mentor B retrieved history from Mentor A\'s assignment');
  }

  // 3. HR_ADMIN views history (succeeds, views across all assignments)
  const { req: reqAdmin, res: resAdmin } = makeMocks();
  reqAdmin.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqAdmin.params = { internId: intern._id.toString() };
  await getProgressHistory(reqAdmin, resAdmin);

  if (resAdmin.statusCode !== 200) {
    throw new Error(`Test 8 FAILED: Expected 200 for HR Admin history query, got ${resAdmin.statusCode}`);
  }

  const listAdmin = resAdmin.data.data;
  if (listAdmin.length !== 4) {
    throw new Error(`Test 8 FAILED: Expected 4 progress documents in HR Admin history, found ${listAdmin.length}`);
  }

  if (
    listAdmin[0].remarks !== 'Historical progress by mentor B' ||
    listAdmin[1].remarks !== 'P1' ||
    listAdmin[2].remarks !== 'P2' ||
    listAdmin[3].remarks !== 'P3'
  ) {
    throw new Error('Test 8 FAILED: HR Admin history not sorted chronologically across assignments');
  }

  console.log('✓ Test 8 PASSED: History query matches oldest-to-newest order and respects role scope limits');
}

// Test 9: History privacy
async function testProgressHistoryPrivacy() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t9');
  const mentor = await createTestUser('MENTOR', 'mentor-t9');
  const intern = await createTestIntern('NEW', 'intern-t9');

  const aId = await assignAndAcceptIntern(admin, mentor, intern);

  const p = new Progress({
    internId: intern._id,
    assignmentId: aId,
    recordedBy: mentor._id,
    progressPercentage: 50,
    remarks: 'Testing privacy constraints'
  });
  await p.save();
  tempProgressIds.push(p._id.toString());

  // 1. Mentor queries history
  const { req: reqM, res: resM } = makeMocks();
  reqM.user = { id: mentor._id.toString(), role: 'MENTOR' };
  reqM.params = { internId: intern._id.toString() };
  await getProgressHistory(reqM, resM);

  const dataM = resM.data.data[0];
  if ('aadhaarNumber' in dataM || 'presentAddress' in dataM || 'permanentAddress' in dataM || 'password' in dataM) {
    throw new Error('Test 9 FAILED: Mentor history list item exposes sensitive fields');
  }

  const serializedM = JSON.stringify(resM.data);
  if (
    serializedM.includes(intern.aadhaarNumber) ||
    serializedM.includes(intern.presentAddress) ||
    serializedM.includes(intern.permanentAddress) ||
    serializedM.includes('TestPassword123!')
  ) {
    throw new Error('Test 9 FAILED: Mentor history serialized response leaks sensitive test values');
  }

  // 2. HR Admin queries history
  const { req: reqAd, res: resAd } = makeMocks();
  reqAd.user = { id: admin._id.toString(), role: 'HR_ADMIN' };
  reqAd.params = { internId: intern._id.toString() };
  await getProgressHistory(reqAd, resAd);

  const dataAd = resAd.data.data[0];
  if ('aadhaarNumber' in dataAd || 'presentAddress' in dataAd || 'permanentAddress' in dataAd || 'password' in dataAd) {
    throw new Error('Test 9 FAILED: HR Admin history list item exposes sensitive fields');
  }

  const serializedAd = JSON.stringify(resAd.data);
  if (
    serializedAd.includes(intern.aadhaarNumber) ||
    serializedAd.includes(intern.presentAddress) ||
    serializedAd.includes(intern.permanentAddress) ||
    serializedAd.includes('TestPassword123!')
  ) {
    throw new Error('Test 9 FAILED: HR Admin history serialized response leaks sensitive test values');
  }

  console.log('✓ Test 9 PASSED: History responses successfully sanitize sensitive database contents');
}

// Test 10: Completion input validation
async function testCompleteTrainingValidation() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t10');
  const mentor = await createTestUser('MENTOR', 'mentor-t10');
  const intern = await createTestIntern('NEW', 'intern-t10');

  await assignAndAcceptIntern(admin, mentor, intern);

  const cases = [
    { desc: 'missing finalRemarks', body: { finalRating: 5 } },
    { desc: 'whitespace-only finalRemarks', body: { finalRemarks: '    ', finalRating: 5 } },
    { desc: 'missing finalRating', body: { finalRemarks: 'Completed' } },
    { desc: 'invalid rating (string)', body: { finalRemarks: 'Completed', finalRating: 'five' } },
    { desc: 'invalid rating (decimal)', body: { finalRemarks: 'Completed', finalRating: 4.8 } },
    { desc: 'invalid rating (out-of-range)', body: { finalRemarks: 'Completed', finalRating: 0 } }
  ];

  for (const tc of cases) {
    const { req, res } = makeMocks();
    req.user = { id: mentor._id.toString(), role: 'MENTOR' };
    req.params = { internId: intern._id.toString() };
    req.body = tc.body;

    await completeTraining(req, res);

    // Negative tracking check in case of unexpected final Progress creation
    const unexpectedProgress = await Progress.findOne({ internId: intern._id, progressPercentage: 100 });
    if (unexpectedProgress) {
      tempProgressIds.push(unexpectedProgress._id.toString());
    }

    if (res.statusCode !== 400) {
      throw new Error(`Test 10 FAILED: Expected 400 for ${tc.desc}, got ${res.statusCode}`);
    }
  }

  // Ensure database remains unchanged
  const checkIntern = await Intern.findById(intern._id);
  if (checkIntern.status !== 'ONGOING') {
    throw new Error(`Test 10 FAILED: Intern status mutated. Got: ${checkIntern.status}`);
  }

  const checkFinalRecord = await Progress.findOne({ internId: intern._id, isFinal: true });
  if (checkFinalRecord) {
    throw new Error('Test 10 FAILED: Final Progress record was created in error');
  }

  console.log('✓ Test 10 PASSED: Training completion input validation handled (returns 400)');
}

// Test 11: Successful completion
async function testCompleteTrainingSuccess() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t11');
  const mentor = await createTestUser('MENTOR', 'mentor-t11');
  const intern = await createTestIntern('NEW', 'intern-t11');

  const aId = await assignAndAcceptIntern(admin, mentor, intern);

  const { req, res } = makeMocks();
  req.user = { id: mentor._id.toString(), role: 'MENTOR' };
  req.params = { internId: intern._id.toString() };
  req.body = {
    finalRemarks: '  Outstanding dedication and performance.  ',
    finalRating: 5
  };

  await completeTraining(req, res);

  // Immediately query and track the final Progress ID if created
  const finalRecord = await Progress.findOne({ internId: intern._id, isFinal: true });
  if (finalRecord) {
    tempProgressIds.push(finalRecord._id.toString());
  }

  if (res.statusCode !== 200) {
    throw new Error(`Test 11 FAILED: Expected 200, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`);
  }

  // Verify Intern status changed to COMPLETED
  const checkIntern = await Intern.findById(intern._id);
  if (checkIntern.status !== 'COMPLETED') {
    throw new Error(`Test 11 FAILED: Intern status not updated to COMPLETED. Got: ${checkIntern.status}`);
  }

  // Verify final record properties
  if (!finalRecord) {
    throw new Error('Test 11 FAILED: Final Progress document not created');
  }

  if (
    finalRecord.progressPercentage !== 100 ||
    finalRecord.isFinal !== true ||
    finalRecord.remarks !== 'Outstanding dedication and performance.' ||
    finalRecord.performanceRating !== 5 ||
    finalRecord.assignmentId.toString() !== aId ||
    finalRecord.recordedBy.toString() !== mentor._id.toString()
  ) {
    throw new Error('Test 11 FAILED: Final Progress record has incorrect parameters');
  }

  // Verify exactly one final record exists
  const finalCount = await Progress.countDocuments({ assignmentId: aId, isFinal: true });
  if (finalCount !== 1) {
    throw new Error(`Test 11 FAILED: Expected exactly 1 final Progress document, found ${finalCount}`);
  }

  console.log('✓ Test 11 PASSED: Training completed successfully via atomic transaction');
}

// Test 12: Duplicate completion prevention
async function testCompleteTrainingDuplicate() {
  const admin = await createTestUser('HR_ADMIN', 'admin-t12');
  const mentor = await createTestUser('MENTOR', 'mentor-t12');
  const intern = await createTestIntern('NEW', 'intern-t12');

  const aId = await assignAndAcceptIntern(admin, mentor, intern);

  // 1. First completion
  const { req: req1, res: res1 } = makeMocks();
  req1.user = { id: mentor._id.toString(), role: 'MENTOR' };
  req1.params = { internId: intern._id.toString() };
  req1.body = { finalRemarks: 'First completion remarks', finalRating: 4 };

  await completeTraining(req1, res1);

  // Track the created final record ID
  const finalRecord1 = await Progress.findOne({ internId: intern._id, isFinal: true });
  if (finalRecord1) {
    tempProgressIds.push(finalRecord1._id.toString());
  }

  if (res1.statusCode !== 200) {
    throw new Error(`Test 12 setup failed: first completion returned ${res1.statusCode}`);
  }

  // 2. Sequential second completion
  const { req: req2, res: res2 } = makeMocks();
  req2.user = { id: mentor._id.toString(), role: 'MENTOR' };
  req2.params = { internId: intern._id.toString() };
  req2.body = { finalRemarks: 'Second completion remarks', finalRating: 5 };

  await completeTraining(req2, res2);

  // Capture any unexpectedly created second progress record for cleanup
  const allFinalRecords = await Progress.find({ assignmentId: aId, isFinal: true });
  for (const r of allFinalRecords) {
    if (!tempProgressIds.includes(r._id.toString())) {
      tempProgressIds.push(r._id.toString());
    }
  }

  if (res2.statusCode !== 400) {
    throw new Error(`Test 12 FAILED: Expected 400 for repeated completion, got ${res2.statusCode}`);
  }

  // Verify database invariants remain intact
  const finalCount = await Progress.countDocuments({ assignmentId: aId, isFinal: true });
  if (finalCount !== 1) {
    throw new Error(`Test 12 FAILED: Expected exactly 1 final Progress document, found ${finalCount}`);
  }

  const checkIntern = await Intern.findById(intern._id);
  if (checkIntern.status !== 'COMPLETED') {
    throw new Error(`Test 12 FAILED: Intern status corrupted. Got: ${checkIntern.status}`);
  }

  const finalRecordDb = await Progress.findOne({ assignmentId: aId, isFinal: true });
  if (finalRecordDb.remarks !== 'First completion remarks' || finalRecordDb.performanceRating !== 4) {
    throw new Error('Test 12 FAILED: Original final progress record was modified');
  }

  console.log('✓ Test 12 PASSED: Repeated completion rejected; database invariants preserved');
}

async function runTests() {
  try {
    await setup();

    await testGetOngoingInterns();
    await testGetInternDetailSafety();
    await testRecordProgressSuccess();
    await testRecordProgressValidation();
    await testRecordProgressOptionalValidation();
    await testRecordProgressStrictOrdering();
    await testRecordProgressWorkflowAccess();
    await testProgressHistoryAccessAndOrdering();
    await testProgressHistoryPrivacy();
    await testCompleteTrainingValidation();
    await testCompleteTrainingSuccess();
    await testCompleteTrainingDuplicate();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL 12 PROGRESS & COMPLETION TESTS PASSED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('\n❌ PROGRESS TEST FAILED:');
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
