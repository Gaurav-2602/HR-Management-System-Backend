# HR Training & Internship Management System — AI Agent Instructions

## 1. Project Purpose

This backend is for an HR Training & Internship Management System.

The system manages the complete lifecycle of an intern from registration until certificate issuance.

Only two types of users can log in:

- HR Admin
- Mentor

Interns do NOT have login accounts. An intern is a record managed by HR Admins and Mentors.

The core lifecycle is:

HR creates intern
→ HR assigns mentor
→ Mentor accepts or rejects
→ If rejected, HR reassigns another mentor
→ If accepted, mentor assigns a project
→ Internship becomes ongoing
→ Mentor manages attendance, project/report status, and remarks
→ Mentor marks internship completed
→ HR reviews completed internship
→ HR issues certificate

---

## 2. Technology Stack

Use the existing stack only:

- Node.js
- Express.js
- MongoDB Atlas
- Mongoose
- CommonJS syntax using `require()` and `module.exports`

Current project structure:

backend/
├── src/
│   ├── config/
│   ├── models/
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   └── utils/
├── tests/
├── .env
├── .gitignore
├── package.json
└── server.js

Do not change the technology stack unless explicitly requested.

---

## 3. User Roles

### HR_ADMIN

HR Admin can:

- Log in
- Create interns
- View all interns
- View intern details
- Edit intern information
- Assign mentors
- View mentor rejection details
- Reassign rejected interns
- View ongoing internships
- View completed internships
- Manage mentors
- Review completed internships
- Add final HR remarks
- Issue certificates

### MENTOR

Mentor can:

- Log in
- View newly assigned interns
- View intern details
- Accept an assigned intern
- Assign a project while accepting
- Reject an assigned intern
- Add mandatory rejection remarks
- Optionally suggest another mentor
- View ongoing interns assigned to them
- Manage attendance
- Manage project/report status
- Add remarks
- Mark an internship completed
- View their completed internships

### INTERN

There is no INTERN login role.

Never create:

- Intern authentication
- Intern passwords
- Intern JWT login
- Intern dashboard
- Intern-protected routes

---

## 4. Core Internship Lifecycle

Use these lifecycle statuses:

- NEW
- PENDING_MENTOR_APPROVAL
- REJECTED_BY_MENTOR
- ONGOING
- COMPLETED
- CERTIFICATE_ISSUED

Expected transitions:

NEW
→ PENDING_MENTOR_APPROVAL
→ ONGOING
→ COMPLETED
→ CERTIFICATE_ISSUED

Rejection flow:

PENDING_MENTOR_APPROVAL
→ REJECTED_BY_MENTOR
→ HR reassigns mentor
→ PENDING_MENTOR_APPROVAL

Do not allow arbitrary status changes.

All important status changes must eventually be recorded in status history.

---

## 5. Main Backend Modules

Build modules one at a time.

Planned modules:

1. Authentication
2. Mentor Management
3. Intern Management
4. Mentor Assignment and Reassignment
5. Mentor Accept/Reject Workflow
6. Project Management
7. Attendance Management
8. Report Status Management
9. Remarks
10. Internship Completion
11. Certificate Issuance
12. Status History

Do not build multiple modules unless explicitly requested.

---

## 6. Intern Data

The Intern model will eventually include information such as:

### Personal Information

- Auto-generated intern ID
- Full name
- Date of birth
- Age if needed
- Present address
- Permanent address
- Mobile number
- Email
- Photo reference

### Education Information

- Institute or college name
- Course or qualification
- Branch
- Current semester
- Semester-wise marks or grades

### Additional Information

- Family member details when required
- Previous organisation experience
- Previous laboratory or DRDO lab experience
- Aadhaar or identity information when required
- Identification mark
- Training duration
- Training start date
- Training end date
- Division or department
- Document references

Do not create the complete Intern model until explicitly asked.

---

## 7. Coding Architecture

Follow this responsibility split:

### Models

Only:

- Mongoose schemas
- Field validation
- Indexes
- Model methods when appropriate

### Controllers

Handle:

- HTTP request
- HTTP response
- Calling service/business logic

Keep controllers thin.

### Services

Handle:

- Business logic
- Workflow rules
- Multi-step operations
- Reusable domain logic

### Routes

Handle:

- API endpoint definitions
- Middleware attachment
- Controller mapping

### Middleware

Handle:

- Authentication
- Role authorization
- Validation errors
- 404 handling
- Global error handling

### Utils

Handle small reusable helper functions only.

Do not put the entire application logic inside routes or `server.js`.

---

## 8. API Rules

Use REST-style APIs.

Base path:

`/api`

Use clear resource-based routes.

Examples:

- `/api/auth`
- `/api/mentors`
- `/api/interns`

Return JSON responses.

Use suitable HTTP status codes.

Keep response structures consistent.

Do not create unnecessary endpoints.

---

## 9. Security Rules

Never:

- Read, print, expose, or display `.env` values
- Show `MONGO_URI`
- Hardcode passwords
- Hardcode JWT secrets
- Commit secrets
- Store plain-text passwords
- Return passwords in API responses
- Log passwords or authentication tokens

Before implementing authentication:

- Use password hashing
- Use role-based authorization
- Validate incoming data
- Protect private routes

Do not modify `.env` unless explicitly requested.

---

## 10. AI Agent Working Rules

Before making changes:

1. Inspect relevant existing files.
2. Explain the proposed changes.
3. List files that will be created or modified.
4. Wait for explicit approval before editing files.

When implementing:

- Make the smallest necessary change.
- Preserve existing working code.
- Do not rewrite unrelated files.
- Do not create unnecessary abstractions.
- Do not install packages without permission.
- Do not delete files without permission.
- Do not rename folders without permission.
- Do not modify `.env`.
- Do not expose secrets.
- Do not build future modules early.

After implementing:

1. Summarize exactly what changed.
2. Explain each created or modified file.
3. Provide the exact command to test the change.
4. Provide expected output.
5. Mention any assumptions.

---

## 11. Current Project State

The following setup already works:

- Express server
- MongoDB Atlas connection through Mongoose
- dotenv configuration
- CORS
- JSON request parsing
- Nodemon development server

Current working output:

- Server runs on port 5000
- MongoDB connects successfully
- Root API route works

Do not rebuild or replace this setup unnecessarily.

---

## 12. Development Strategy

The developer is learning backend development and is using an AI coding agent.

Therefore:

- Work incrementally.
- Explain important backend concepts simply.
- Avoid large uncontrolled code generation.
- Build one module at a time.
- Test every module before starting the next one.
- Prefer understandable code over clever code.
- Do not assume frontend code exists.
- Backend APIs will initially be tested using Postman.

For every new module, follow:

Plan
→ Get approval
→ Implement
→ Run server
→ Test with Postman
→ Fix errors
→ Commit working code
→ Start next module