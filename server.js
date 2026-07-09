const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./src/config/db");
const authRoutes = require('./src/routes/authRoutes');
const mentorRoutes = require('./src/routes/mentorRoutes');
const internRoutes = require('./src/routes/internRoutes');

dotenv.config();

connectDB();

const app = express();

app.use(express.json());
app.use(cors());

// Mount auth routes
app.use('/api/auth', authRoutes);

// Mount mentor routes
app.use('/api/mentors', mentorRoutes);

// Mount intern routes
app.use('/api/interns', internRoutes);

app.get("/", (req, res) => {
  res.send("HR Management System API is running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});