const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema(
  {
    internId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Intern',
      required: true
    },
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    progressPercentage: {
      type: Number,
      required: true
    },
    remarks: {
      type: String,
      required: true,
      trim: true
    },
    performanceRating: {
      type: Number
    },
    skillsCovered: [
      {
        type: String,
        trim: true
      }
    ],
    nextGoals: {
      type: String,
      trim: true
    },
    isFinal: {
      type: Boolean,
      default: false
    },
    recordedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Compound indexes
progressSchema.index({ assignmentId: 1, recordedAt: 1 });
progressSchema.index({ internId: 1, recordedAt: 1 });

// Unique partial index on assignmentId where isFinal is true
progressSchema.index(
  { assignmentId: 1 },
  {
    unique: true,
    partialFilterExpression: { isFinal: true }
  }
);

module.exports = mongoose.model('Progress', progressSchema);
