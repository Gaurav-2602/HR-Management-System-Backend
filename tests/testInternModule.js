require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Intern = require('../src/models/Intern');
const authService = require('../src/services/authService');
const internService = require('../src/services/internService');
const {
  createIntern,
  getAllInterns,
  getInternById,
  updateIntern,
  deleteIntern
} = require('../src/controllers/internController');
const { authenticateJWT, authorizeRoles } = require('../src/middleware/auth');

const MONGO_URI = process.env.MONGO_URI;

let tempUserIds = [];
let tempInternIds = [];
let testToken = '';
let testUserId = '';

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

  const testAdmin = new User({
    fullName: 'Test HR Admin Intern',
    email: `hr-admin-intern-${Date.now()}@test.com`,
    password: 'TestPassword123!',
    role: 'HR_ADMIN',
    isActive: true
  });

  await testAdmin.save();
  tempUserIds.push(testAdmin._id.toString());
  testUserId = testAdmin._id.toString();

  testToken = authService.generateToken(testAdmin);

  console.log('✓ Setup complete: HR_ADMIN user created');
}

async function testCreateValidIntern() {
  const { req, res } = makeMocks();
  req.body = {
    fullName: 'Rajesh Kumar',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Plot 123, Sector 5, Bangalore',
    permanentAddress: 'Village XYZ, District ABC',
    mobileNumber: '9876543210',
    email: `intern-valid-${Date.now()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'IIT Bangalore',
    branch: 'Computer Science',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31')
  };

  await createIntern(req, res);

  if (res.statusCode !== 201) {
    throw new Error(
      `Test 1 FAILED: Expected 201, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`
    );
  }

  const internIdRegex = /^INTERN-\d{4}-\d{5}$/;
  if (!internIdRegex.test(res.data.internId)) {
    throw new Error(`Test 1 FAILED: internId ${res.data.internId} does not match pattern`);
  }

  if (res.data.status !== 'NEW') {
    throw new Error(`Test 1 FAILED: Expected status NEW, got ${res.data.status}`);
  }

  tempInternIds.push(res.data.id);
  console.log('✓ Test 1 PASSED: HR_ADMIN creates valid intern (201, internId pattern, status NEW)');
}

async function testMissingRequiredField() {
  const { req, res } = makeMocks();
  req.body = {
    fullName: 'John Doe',
    dateOfBirth: new Date('2002-05-15'),
    mobileNumber: '9876543210',
    email: `intern-missing-${Date.now()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'IIT',
    branch: 'CS'
  };

  await createIntern(req, res);

  if (res.statusCode === 201 && res.data && res.data.id) {
    tempInternIds.push(res.data.id);
  }

  if (res.statusCode !== 400) {
    throw new Error(
      `Test 2 FAILED: Expected 400, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`
    );
  }

  console.log('✓ Test 2 PASSED: Missing required field returns 400');
}

async function testInvalidEmail() {
  const { req, res } = makeMocks();
  req.body = {
    fullName: 'John Doe',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Address 1',
    permanentAddress: 'Address 2',
    mobileNumber: '9876543210',
    email: 'not-an-email',
    educationalQualification: 'B.Tech',
    instituteName: 'IIT',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31')
  };

  await createIntern(req, res);

  if (res.statusCode === 201 && res.data && res.data.id) {
    tempInternIds.push(res.data.id);
  }

  if (res.statusCode !== 400) {
    throw new Error(
      `Test 3 FAILED: Expected 400 for invalid email, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`
    );
  }

  console.log('✓ Test 3 PASSED: Invalid email returns 400');
}

async function testDateValidation() {
  const { req, res } = makeMocks();
  req.body = {
    fullName: 'John Doe',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Address 1',
    permanentAddress: 'Address 2',
    mobileNumber: '9876543210',
    email: `intern-baddate-${Date.now()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'IIT',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-08-31'),
    endDate: new Date('2024-06-01')
  };

  await createIntern(req, res);

  if (res.statusCode === 201 && res.data && res.data.id) {
    tempInternIds.push(res.data.id);
  }

  if (res.statusCode !== 400) {
    throw new Error(
      `Test 4 FAILED: Expected 400 for bad dates, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`
    );
  }

  console.log('✓ Test 4 PASSED: startDate >= endDate returns 400');
}

async function testDuplicateEmail() {
  const email = `intern-dup-${Date.now()}@test.com`;

  const { req: req1, res: res1 } = makeMocks();
  req1.body = {
    fullName: 'First Intern',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Address 1',
    mobileNumber: '9876543210',
    email,
    educationalQualification: 'B.Tech',
    instituteName: 'IIT',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31')
  };

  await createIntern(req1, res1);
  if (res1.statusCode !== 201) {
    throw new Error(`Test 5 setup failed: Could not create first intern`);
  }
  tempInternIds.push(res1.data.id);

  const { req: req2, res: res2 } = makeMocks();
  req2.body = {
    fullName: 'Second Intern',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Address 1',
    mobileNumber: '9876543210',
    email,
    educationalQualification: 'B.Tech',
    instituteName: 'IIT',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31')
  };

  await createIntern(req2, res2);

  if (res2.statusCode === 201 && res2.data && res2.data.id) {
    tempInternIds.push(res2.data.id);
  }

  if (res2.statusCode !== 409) {
    throw new Error(
      `Test 5 FAILED: Expected 409 for duplicate email, got ${res2.statusCode}. Response: ${JSON.stringify(res2.data)}`
    );
  }

  console.log('✓ Test 5 PASSED: Duplicate email returns 409');
}

async function testGetAllInterns() {
  const { req, res } = makeMocks();
  req.query = { page: 1, limit: 10 };

  await getAllInterns(req, res);

  if (res.statusCode !== 200) {
    throw new Error(
      `Test 6 FAILED: Expected 200, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`
    );
  }

  if (!res.data.data || !Array.isArray(res.data.data)) {
    throw new Error(`Test 6 FAILED: Expected data array in response`);
  }

  if (!res.data.pagination) {
    throw new Error(`Test 6 FAILED: Expected pagination in response`);
  }

  const allowedFields = [
    'id',
    'internId',
    'fullName',
    'email',
    'mobileNumber',
    'instituteName',
    'branch',
    'trainingType',
    'startDate',
    'endDate',
    'status',
    'createdAt'
  ];

  const forbiddenFields = [
    'aadhaarNumber',
    'presentAddress',
    'permanentAddress',
    'familyMembersInForeignOrganizations',
    'previousOrganizationExperience',
    'previousDRDOExperience',
    'identificationMark',
    'passNumber',
    'isActive'
  ];

  res.data.data.forEach((item, idx) => {
    forbiddenFields.forEach(field => {
      if (field in item) {
        throw new Error(`Test 6 FAILED: List item ${idx} contains forbidden field: ${field}`);
      }
    });

    allowedFields.forEach(field => {
      if (!(field in item)) {
        throw new Error(`Test 6 FAILED: List item ${idx} missing required field: ${field}`);
      }
    });
  });

  console.log('✓ Test 6 PASSED: GET all interns returns 200, pagination, correct fields');
}

async function testGetInternById() {
  const testInternData = {
    fullName: 'Detail Test Intern',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Test Address',
    mobileNumber: '9876543210',
    email: `intern-detail-${Date.now()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'Test Institute',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31'),
    aadhaarNumber: '123456789012'
  };

  const intern = await internService.createIntern(testInternData);
  tempInternIds.push(intern._id.toString());

  const { req, res } = makeMocks();
  req.params.id = intern._id.toString();

  await getInternById(req, res);

  if (res.statusCode !== 200) {
    throw new Error(
      `Test 7 FAILED: Expected 200, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`
    );
  }

  if (!res.data.internId) {
    throw new Error(`Test 7 FAILED: Response missing internId`);
  }

  if (res.data.presentAddress !== testInternData.presentAddress) {
    throw new Error(`Test 7 FAILED: Detail response missing full fields`);
  }

  if (res.data.aadhaarNumber === testInternData.aadhaarNumber) {
    throw new Error('Test 7 FAILED: Full Aadhaar exposed in response');
  }

  if (res.data.aadhaarNumber !== 'XXXXXXXX9012') {
    throw new Error(
      `Test 7 FAILED: Aadhaar not masked correctly. Got: ${res.data.aadhaarNumber}`
    );
  }

  if (JSON.stringify(res.data).includes(testInternData.aadhaarNumber)) {
    throw new Error('Test 7 FAILED: Serialized response contains full Aadhaar');
  }

  console.log('✓ Test 7 PASSED: GET by ID returns 200, full details, Aadhaar masked');
}

async function testGetInvalidIntern() {
  const { req: req1, res: res1 } = makeMocks();
  req1.params.id = 'invalid-id';

  await getInternById(req1, res1);

  if (res1.statusCode !== 404) {
    throw new Error(`Test 8a FAILED: Invalid ID should return 404, got ${res1.statusCode}`);
  }

  const nonexistentId = new mongoose.Types.ObjectId().toString();
  const { req: req2, res: res2 } = makeMocks();
  req2.params.id = nonexistentId;

  await getInternById(req2, res2);

  if (res2.statusCode !== 404) {
    throw new Error(`Test 8b FAILED: Nonexistent ID should return 404, got ${res2.statusCode}`);
  }

  const softDeletedData = {
    fullName: 'Soft Delete Test',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Test',
    mobileNumber: '9876543210',
    email: `intern-softdel-${Date.now()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'Test',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31')
  };

  const softDeletedIntern = await internService.createIntern(softDeletedData);
  tempInternIds.push(softDeletedIntern._id.toString());
  await internService.deleteInternSoft(softDeletedIntern._id.toString());

  const { req: req3, res: res3 } = makeMocks();
  req3.params.id = softDeletedIntern._id.toString();

  await getInternById(req3, res3);

  if (res3.statusCode !== 404) {
    throw new Error(`Test 8c FAILED: Soft-deleted intern should return 404, got ${res3.statusCode}`);
  }

  console.log('✓ Test 8 PASSED: Invalid/nonexistent/soft-deleted return 404 (never 500)');
}

async function testUpdateAllowedFields() {
  const testData = {
    fullName: 'Original Name',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Original Address',
    mobileNumber: '9876543210',
    email: `intern-update-${Date.now()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'Original Institute',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31')
  };

  const intern = await internService.createIntern(testData);
  tempInternIds.push(intern._id.toString());

  const { req, res } = makeMocks();
  req.params.id = intern._id.toString();
  req.body = {
    fullName: 'Updated Name',
    instituteName: 'Updated Institute'
  };

  await updateIntern(req, res);

  if (res.statusCode !== 200) {
    throw new Error(
      `Test 9 FAILED: Expected 200, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`
    );
  }

  if (res.data.fullName !== 'Updated Name') {
    throw new Error(`Test 9 FAILED: fullName not updated`);
  }

  if (res.data.instituteName !== 'Updated Institute') {
    throw new Error(`Test 9 FAILED: instituteName not updated`);
  }

  console.log('✓ Test 9 PASSED: UPDATE allowed fields returns 200 and changes apply');
}

async function testUpdateProtectedFields() {
  const testData = {
    fullName: 'Protected Test',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Address',
    mobileNumber: '9876543210',
    email: `intern-protected-${Date.now()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'Institute',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31')
  };

  const intern = await internService.createIntern(testData);
  tempInternIds.push(intern._id.toString());

  const originalInternId = intern.internId;
  const originalStatus = intern.status;
  const originalIsActive = intern.isActive;
  const originalCreatedAt = intern.createdAt;
  const originalUpdatedAt = intern.updatedAt;

  const { req, res } = makeMocks();
  req.params.id = intern._id.toString();
  req.body = {
    fullName: 'Name Changed',
    internId: 'FAKE-ID-999',
    status: 'ONGOING',
    isActive: false,
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01')
  };

  await updateIntern(req, res);

  if (res.statusCode !== 200) {
    throw new Error(`Test 10 FAILED: Expected 200, got ${res.statusCode}`);
  }

  const updated = await internService.getInternById(intern._id.toString());

  if (updated.internId !== originalInternId) {
    throw new Error(`Test 10 FAILED: internId was changed (protected)`);
  }

  if (updated.status !== originalStatus) {
    throw new Error(`Test 10 FAILED: status was changed (protected)`);
  }

  if (updated.isActive !== originalIsActive) {
    throw new Error(`Test 10 FAILED: isActive was changed (protected)`);
  }

  console.log('✓ Test 10 PASSED: UPDATE protected fields remain unchanged');
}

async function testUpdateDateValidation() {
  const testData = {
    fullName: 'Date Validation Test',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Address',
    mobileNumber: '9876543210',
    email: `intern-datevalid-${Date.now()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'Institute',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31')
  };

  const intern = await internService.createIntern(testData);
  tempInternIds.push(intern._id.toString());

  const { req, res } = makeMocks();
  req.params.id = intern._id.toString();
  req.body = {
    startDate: new Date('2024-09-15')
  };

  await updateIntern(req, res);

  if (res.statusCode !== 400) {
    throw new Error(
      `Test 11 FAILED: Expected 400 for invalid date range, got ${res.statusCode}. Response: ${JSON.stringify(res.data)}`
    );
  }

  console.log('✓ Test 11 PASSED: UPDATE date validation works (partial update)');
}

async function testSoftDelete() {
  const testData = {
    fullName: 'Delete Test',
    dateOfBirth: new Date('2002-05-15'),
    presentAddress: 'Address',
    mobileNumber: '9876543210',
    email: `intern-delete-${Date.now()}@test.com`,
    educationalQualification: 'B.Tech',
    instituteName: 'Institute',
    branch: 'CS',
    trainingType: 'INTERNSHIP',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-08-31')
  };

  const intern = await internService.createIntern(testData);
  tempInternIds.push(intern._id.toString());
  const internId = intern._id.toString();

  const { req: req1, res: res1 } = makeMocks();
  req1.params.id = internId;

  await deleteIntern(req1, res1);

  if (res1.statusCode !== 200) {
    throw new Error(`Test 12a FAILED: DELETE expected 200, got ${res1.statusCode}`);
  }

  const dbIntern = await Intern.findById(internId);
  if (!dbIntern) {
    throw new Error(`Test 12b FAILED: MongoDB document was permanently deleted (should be soft delete)`);
  }

  if (dbIntern.isActive !== false) {
    throw new Error(`Test 12b FAILED: isActive not set to false`);
  }

  const { req: req2, res: res2 } = makeMocks();
  req2.params.id = internId;

  await getInternById(req2, res2);

  if (res2.statusCode !== 404) {
    throw new Error(`Test 12c FAILED: Soft-deleted intern GET should return 404, got ${res2.statusCode}`);
  }

  const { req: req3, res: res3 } = makeMocks();
  req3.query = {};

  await getAllInterns(req3, res3);

  const foundDeleted = res3.data.data.some(item => item.id === internId);
  if (foundDeleted) {
    throw new Error(`Test 12d FAILED: Soft-deleted intern appears in GET all`);
  }

  console.log('✓ Test 12 PASSED: DELETE soft-deletes (isActive=false), document persists, excluded from lists');
}

async function runTests() {
  try {
    await setup();

    await testCreateValidIntern();
    await testMissingRequiredField();
    await testInvalidEmail();
    await testDateValidation();
    await testDuplicateEmail();
    await testGetAllInterns();
    await testGetInternById();
    await testGetInvalidIntern();
    await testUpdateAllowedFields();
    await testUpdateProtectedFields();
    await testUpdateDateValidation();
    await testSoftDelete();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL 12 TESTS PASSED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('\n❌ TEST FAILED:');
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    try {
      console.log('\nCleaning up...');

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
