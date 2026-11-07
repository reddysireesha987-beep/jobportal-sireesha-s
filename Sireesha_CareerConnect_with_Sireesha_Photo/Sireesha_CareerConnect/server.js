require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pool = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-development-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error("Only PDF, DOC and DOCX resumes are allowed."));
    cb(null, true);
  }
});

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireAuth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: "Please log in first." });
const allow = (...roles) => (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Please log in first." });
  if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: "You are not allowed to perform this action." });
  next();
};
const publicUser = u => ({ user_id: u.user_id, name: u.name, email: u.email, role: u.role, phone: u.phone });

app.get("/api/health", (_req, res) => res.json({ status: "ok", app: "SIREESHA'S CAREERCONNECT" }));
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));

app.post("/api/register", asyncRoute(async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name?.trim() || !email?.trim() || !password || password.length < 8)
    return res.status(400).json({ error: "Enter your name, email and a password of at least 8 characters." });
  if (!["student", "employer"].includes(role))
    return res.status(400).json({ error: "Choose student or employer registration." });
  const hash = await bcrypt.hash(password, 12);
  try {
    const [result] = await pool.execute(
      "INSERT INTO users (name,email,password,role,phone) VALUES (?,?,?,?,?)",
      [name.trim(), email.trim().toLowerCase(), hash, role, phone || null]
    );
    const user = { user_id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), role, phone: phone || null };
    req.session.user = user;
    res.status(201).json({ message: "Account created successfully.", user });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "An account with this email already exists." });
    throw e;
  }
}));

app.post("/api/login", asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.execute("SELECT * FROM users WHERE email=?", [(email || "").toLowerCase()]);
  if (!rows.length || !(await bcrypt.compare(password || "", rows[0].password)))
    return res.status(401).json({ error: "Invalid email or password." });
  req.session.user = publicUser(rows[0]);
  res.json({ message: "Welcome back!", user: req.session.user });
}));
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ message: "Logged out." })));

app.get("/api/jobs", asyncRoute(async (req, res) => {
  const q = `%${(req.query.q || "").trim()}%`;
  const location = `%${(req.query.location || "").trim()}%`;
  const [rows] = await pool.execute(
    `SELECT j.*, u.name AS employer_name FROM jobs j
     JOIN users u ON u.user_id=j.employer_id
     WHERE (j.title LIKE ? OR j.company LIKE ? OR j.skills LIKE ? OR j.description LIKE ?)
       AND j.location LIKE ? ORDER BY j.posted_date DESC`,
    [q,q,q,q,location]
  );
  res.json({ jobs: rows });
}));
app.get("/api/jobs/:id", asyncRoute(async (req, res) => {
  const [rows] = await pool.execute("SELECT j.*,u.name AS employer_name FROM jobs j JOIN users u ON u.user_id=j.employer_id WHERE j.job_id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Job not found." });
  res.json({ job: rows[0] });
}));
app.post("/api/jobs", allow("employer","admin"), asyncRoute(async (req, res) => {
  const { title, company, location, salary, job_type, skills, description } = req.body;
  if (!title || !company || !location || !description) return res.status(400).json({ error: "Title, company, location and description are required." });
  const [r] = await pool.execute(
    "INSERT INTO jobs (employer_id,title,company,location,salary,job_type,skills,description) VALUES (?,?,?,?,?,?,?,?)",
    [req.session.user.user_id,title,company,location,salary || null,job_type || "Full-time",skills || "",description]
  );
  res.status(201).json({ message: "Job published.", job_id: r.insertId });
}));
app.put("/api/jobs/:id", allow("employer","admin"), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute("SELECT employer_id FROM jobs WHERE job_id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Job not found." });
  if (req.session.user.role !== "admin" && rows[0].employer_id !== req.session.user.user_id) return res.status(403).json({ error: "You can only edit your own jobs." });
  const b = req.body;
  await pool.execute(
    "UPDATE jobs SET title=?,company=?,location=?,salary=?,job_type=?,skills=?,description=? WHERE job_id=?",
    [b.title,b.company,b.location,b.salary || null,b.job_type || "Full-time",b.skills || "",b.description,req.params.id]
  );
  res.json({ message: "Job updated." });
}));
app.delete("/api/jobs/:id", allow("employer","admin"), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute("SELECT employer_id FROM jobs WHERE job_id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Job not found." });
  if (req.session.user.role !== "admin" && rows[0].employer_id !== req.session.user.user_id) return res.status(403).json({ error: "You can only delete your own jobs." });
  await pool.execute("DELETE FROM jobs WHERE job_id=?", [req.params.id]);
  res.json({ message: "Job deleted." });
}));

app.post("/api/applications", requireAuth, upload.single("resume"), asyncRoute(async (req, res) => {
  if (req.session.user.role !== "student") return res.status(403).json({ error: "Only students can apply for jobs." });
  const jobId = Number(req.body.job_id);
  const [job] = await pool.execute("SELECT job_id FROM jobs WHERE job_id=?", [jobId]);
  if (!job.length) return res.status(404).json({ error: "Job not found." });
  try {
    const [r] = await pool.execute("INSERT INTO applications (job_id,user_id,resume) VALUES (?,?,?)",
      [jobId,req.session.user.user_id,req.file ? req.file.filename : null]);
    res.status(201).json({ message: "Application submitted.", application_id: r.insertId });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "You have already applied for this job." });
    throw e;
  }
}));
app.get("/api/applications", requireAuth, asyncRoute(async (req, res) => {
  const u = req.session.user;
  let sql = `SELECT a.*,j.title,j.company,j.location,j.employer_id,s.name AS student_name,s.email AS student_email
             FROM applications a JOIN jobs j ON j.job_id=a.job_id JOIN users s ON s.user_id=a.user_id`;
  const args = [];
  if (u.role === "student") { sql += " WHERE a.user_id=?"; args.push(u.user_id); }
  else if (u.role === "employer") { sql += " WHERE j.employer_id=?"; args.push(u.user_id); }
  sql += " ORDER BY a.applied_date DESC";
  const [rows] = await pool.execute(sql,args);
  res.json({ applications: rows });
}));
app.put("/api/applications/:id", allow("employer","admin"), asyncRoute(async (req, res) => {
  const status = req.body.status;
  if (!["Pending","Reviewed","Shortlisted","Rejected","Selected"].includes(status)) return res.status(400).json({ error: "Invalid application status." });
  const [rows] = await pool.execute("SELECT j.employer_id FROM applications a JOIN jobs j ON j.job_id=a.job_id WHERE a.application_id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Application not found." });
  if (req.session.user.role !== "admin" && rows[0].employer_id !== req.session.user.user_id) return res.status(403).json({ error: "Not your application." });
  await pool.execute("UPDATE applications SET status=? WHERE application_id=?", [status,req.params.id]);
  res.json({ message: "Application status updated." });
}));
app.delete("/api/applications/:id", allow("student","employer","admin"), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT a.user_id,j.employer_id FROM applications a JOIN jobs j ON j.job_id=a.job_id WHERE a.application_id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Application not found." });
  const u = req.session.user;
  if (u.role === "student" && rows[0].user_id !== u.user_id) return res.status(403).json({ error: "Not your application." });
  if (u.role === "employer" && rows[0].employer_id !== u.user_id) return res.status(403).json({ error: "Not your application." });
  await pool.execute("DELETE FROM applications WHERE application_id=?", [req.params.id]);
  res.json({ message: "Application deleted." });
}));

app.get("/api/profile", requireAuth, asyncRoute(async (req,res) => {
  const [rows] = await pool.execute(
    `SELECT u.user_id,u.name,u.email,u.phone,p.qualification,p.skills,p.experience,p.profile_image
     FROM users u LEFT JOIN profiles p ON p.user_id=u.user_id WHERE u.user_id=?`, [req.session.user.user_id]);
  res.json({ profile: rows[0] });
}));
app.put("/api/profile", requireAuth, asyncRoute(async (req,res) => {
  const { name, phone, qualification, skills, experience } = req.body;
  await pool.execute("UPDATE users SET name=?,phone=? WHERE user_id=?", [name,phone || null,req.session.user.user_id]);
  await pool.execute(
    `INSERT INTO profiles (user_id,qualification,skills,experience) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE qualification=VALUES(qualification),skills=VALUES(skills),experience=VALUES(experience)`,
    [req.session.user.user_id,qualification || null,skills || null,experience || null]);
  req.session.user.name = name;
  res.json({ message: "Profile saved." });
}));

app.get("/api/users", allow("admin"), asyncRoute(async (_req,res) => {
  const [rows] = await pool.execute("SELECT user_id,name,email,role,phone,created_at FROM users ORDER BY created_at DESC");
  res.json({ users: rows });
}));
app.get("/api/users/:id", allow("admin"), asyncRoute(async (req,res) => {
  const [rows] = await pool.execute("SELECT user_id,name,email,role,phone,created_at FROM users WHERE user_id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "User not found." });
  res.json({ user: rows[0] });
}));
app.put("/api/users/:id", allow("admin"), asyncRoute(async (req,res) => {
  const { name, phone, role } = req.body;
  if (!["student","employer","admin"].includes(role)) return res.status(400).json({ error: "Invalid role." });
  await pool.execute("UPDATE users SET name=?,phone=?,role=? WHERE user_id=?", [name,phone || null,role,req.params.id]);
  res.json({ message: "User updated." });
}));
app.delete("/api/users/:id", allow("admin"), asyncRoute(async (req,res) => {
  if (Number(req.params.id) === req.session.user.user_id) return res.status(400).json({ error: "You cannot delete your own active admin account." });
  await pool.execute("DELETE FROM users WHERE user_id=?", [req.params.id]);
  res.json({ message: "User deleted." });
}));
app.delete("/api/account", requireAuth, asyncRoute(async (req,res) => {
  const id = req.session.user.user_id;
  await pool.execute("DELETE FROM users WHERE user_id=?", [id]);
  req.session.destroy(() => res.json({ message: "Account deleted." }));
}));

app.get("/api/dashboard/stats", allow("admin"), asyncRoute(async (_req,res) => {
  const [[users]] = await pool.query("SELECT COUNT(*) AS total_users, SUM(role='employer') AS employers, SUM(role='student') AS students FROM users");
  const [[jobs]] = await pool.query("SELECT COUNT(*) AS total_jobs FROM jobs");
  const [[apps]] = await pool.query("SELECT COUNT(*) AS total_applications FROM applications");
  res.json({ ...users, ...jobs, ...apps });
}));

app.get("/api/my-jobs", allow("employer","admin"), asyncRoute(async (req,res) => {
  const isAdmin = req.session.user.role === "admin";
  const [rows] = await pool.execute(
    `SELECT j.*, (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.job_id) AS applicant_count
     FROM jobs j ${isAdmin ? "" : "WHERE j.employer_id=?"} ORDER BY j.posted_date DESC`,
    isAdmin ? [] : [req.session.user.user_id]);
  res.json({ jobs: rows });
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: err.message || "Server error." });
});

app.listen(PORT, () => console.log(`SIREESHA'S CAREERCONNECT running at http://localhost:${PORT}`));
