const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./src/config/db");
const authRoutes = require('./src/routes/authRoutes');
const mentorRoutes = require('./src/routes/mentorRoutes');
const internRoutes = require('./src/routes/internRoutes');
const assignmentRoutes = require('./src/routes/assignmentRoutes');
const progressRoutes = require('./src/routes/progressRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');

dotenv.config();

const app = express();

app.use(express.json());

// Dynamic CORS configuration based on environment
const allowedOrigins = ['http://localhost:5173'];
if (process.env.FRONTEND_URL) {
  const prodOrigin = process.env.FRONTEND_URL.replace(/\/$/, "");
  if (prodOrigin) {
    allowedOrigins.push(prodOrigin);
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, "");
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
}));

// Mount auth routes
app.use('/api/auth', authRoutes);

// Mount mentor routes
app.use('/api/mentors', mentorRoutes);

// Mount intern routes
app.use('/api/interns', internRoutes);

// Mount assignment routes
app.use('/api/assignments', assignmentRoutes);

// Mount progress routes
app.use('/api/progress', progressRoutes);

// Mount dashboard routes
app.use('/api/dashboard', dashboardRoutes);

app.get("/", (req, res) => {
  res.send("HR Management System API is running");
});

const PORT = process.env.PORT || 5000;

// Defer server startup until database connection is successful
async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();