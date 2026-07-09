const mongoose = require('mongoose');

const internSchema = new mongoose.Schema(
  {
    internId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    dateOfBirth: {
      type: Date,
      required: true
    },
    presentAddress: {
      type: String,
      required: true,
      trim: true
    },
    permanentAddress: {
      type: String,
      trim: true
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    photoUrl: {
      type: String,
      trim: true
    },
    educationalQualification: {
      type: String,
      required: true,
      trim: true
    },
    instituteName: {
      type: String,
      required: true,
      trim: true
    },
    branch: {
      type: String,
      required: true,
      trim: true
    },
    semesterMarks: {
      type: String,
      trim: true
    },
    familyMembersInForeignOrganizations: {
      type: String,
      trim: true
    },
    previousOrganizationExperience: {
      type: String,
      trim: true
    },
    previousDRDOExperience: {
      type: String,
      trim: true
    },
    aadhaarNumber: {
      type: String,
      trim: true
    },
    trainingType: {
      type: String,
      enum: ['TRAINING', 'INTERNSHIP'],
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    division: {
      type: String,
      trim: true
    },
    identificationMark: {
      type: String,
      trim: true
    },
    passNumber: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['NEW', 'ASSIGNED', 'REJECTED_BY_MENTOR', 'ONGOING', 'COMPLETED', 'ISSUED'],
      default: 'NEW',
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

internSchema.pre('save', function () {
  if (this.startDate >= this.endDate) {
    const err = new Error('startDate must be before endDate');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
});

module.exports = mongoose.model('Intern', internSchema);
