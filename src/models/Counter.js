const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    count: {
      type: Number,
      default: 0
    }
  },
  { timestamps: false }
);

module.exports = mongoose.model('Counter', counterSchema);
