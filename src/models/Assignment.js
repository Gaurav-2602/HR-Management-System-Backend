const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    internId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Intern',
      required: true
    },
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
      default: 'PENDING',
      index: true
    },
    rejectionRemarks: {
      type: String,
      trim: true
    },
    suggestedMentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    decidedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// Concurrency protection: Enforces that an intern can have at most ONE "PENDING" assignment at any time.
assignmentSchema.index(
  { internId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PENDING' }
  }
);

module.exports = mongoose.model('Assignment', assignmentSchema);
