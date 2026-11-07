# SIREESHA'S CAREERCONNECT

A local MySQL-backed job portal built with HTML, CSS, JavaScript, Node.js, Express and MySQL.

## 1. Requirements
- Node.js 18 or newer and npm
- MySQL Server 8.x
- MySQL Workbench (recommended)
- VS Code

## 2. Database setup (MySQL Workbench)
1. Start your local MySQL Server and open MySQL Workbench.
2. Open `schema.sql` from this project.
3. Execute the complete script. It creates `careerconnect_db`, `users`, `jobs`, `applications`, and `profiles`.
4. Keep the MySQL username and password ready.

## 3. Configure the project in VS Code
1. Extract the ZIP file.
2. Open the `Sireesha_CareerConnect` folder in VS Code.
3. Copy `.env.example` to a new file named `.env`.
4. Edit `.env` and set `DB_USER`, `DB_PASSWORD`, and (if needed) `DB_HOST`, `DB_PORT`.
5. Set a long random value for `SESSION_SECRET`. Do not share or commit `.env`.

## 4. Install and run
Open VS Code Terminal in the project folder:

```bash
npm install
npm start
```

Open **http://localhost:3000** in your browser. Keep the terminal running while you use the website.

For development auto-restart:
```bash
npm run dev
```

## 5. Create the first administrator
Public registration intentionally allows only Student and Employer roles. To create an administrator:
1. Register a normal account through the site, then find its `user_id` in Workbench:
   `SELECT user_id, name, email, role FROM users;`
2. In a separate terminal, generate a bcrypt hash for a strong password:
   ```bash
   node -e "require('bcrypt').hash('Choose-A-Strong-Password',12).then(console.log)"
   ```
3. In Workbench, promote your account and replace the placeholder hash with the generated value:
   ```sql
   USE careerconnect_db;
   UPDATE users
   SET role='admin', password='PASTE_BCRYPT_HASH_HERE'
   WHERE email='your-email@example.com';
   ```
4. Log out and log in again so the session reflects the admin role.

## 6. Features
- Student and employer registration/login; bcrypt password hashing.
- Student profile editing and account deletion.
- Job search by title/company/skills/description and location.
- Employer job create, edit and delete.
- Student applications and application history.
- Employer application review and status updates.
- Admin dashboard statistics and user/job/application management.
- MySQL is the single source of truth; every page/API read fetches database data.
- Parameterized SQL queries, role checks, resume upload type/size restrictions.

## 7. Two-way MySQL synchronization
Website changes use REST endpoints and are written to MySQL immediately. Manual SQL changes are visible after refreshing the page or reloading the relevant dashboard because data is fetched from the API each time. This starter uses refresh-on-load rather than continuous WebSocket push.

Try these queries in Workbench:
```sql
USE careerconnect_db;

-- INSERT: create a demo job (replace 1 with an existing employer user_id)
INSERT INTO jobs (employer_id,title,company,location,salary,job_type,skills,description)
VALUES (1,'Junior Web Developer','GreenTech Labs','Hyderabad','₹3-5 LPA','Full-time',
        'HTML, CSS, JavaScript','Build accessible web experiences.');

-- SELECT
SELECT * FROM jobs ORDER BY posted_date DESC;
SELECT * FROM users;
SELECT * FROM applications;

-- UPDATE
UPDATE jobs SET salary='₹4-6 LPA' WHERE title='Junior Web Developer';
UPDATE applications SET status='Shortlisted' WHERE application_id=1;

-- DELETE
DELETE FROM applications WHERE application_id=1;
DELETE FROM jobs WHERE title='Junior Web Developer';
```

## 8. Postman API examples
Base URL: `http://localhost:3000`. Use the same Postman cookie jar to preserve the session cookie after login.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/register` | Register student/employer JSON |
| POST | `/api/login` | Login JSON |
| POST | `/api/logout` | Logout |
| GET | `/api/me` | Current session |
| GET | `/api/jobs?q=developer&location=Hyderabad` | Search jobs |
| GET | `/api/jobs/1` | Job details |
| POST | `/api/jobs` | Employer/admin creates job |
| PUT | `/api/jobs/1` | Owner/admin edits job |
| DELETE | `/api/jobs/1` | Owner/admin deletes job |
| POST | `/api/applications` | Student applies using multipart form (`job_id`, optional `resume`) |
| GET | `/api/applications` | Applications visible to the logged-in role |
| PUT | `/api/applications/1` | Employer/admin updates status JSON |
| DELETE | `/api/applications/1` | Authorized delete |
| GET | `/api/users` | Admin user list |
| PUT | `/api/users/1` | Admin updates user JSON |
| DELETE | `/api/users/1` | Admin deletes user |
| GET | `/api/dashboard/stats` | Admin statistics |

Example JSON registration:
```json
{"name":"Demo Student","email":"student@example.com","password":"StrongPass123","role":"student","phone":"9876543210"}
```
Example JSON login:
```json
{"email":"student@example.com","password":"StrongPass123"}
```
Example job creation:
```json
{"title":"Frontend Developer","company":"Green Labs","location":"Hyderabad","salary":"₹4-6 LPA","job_type":"Full-time","skills":"HTML, CSS, JavaScript","description":"Build responsive web applications."}
```
Example status update:
```json
{"status":"Shortlisted"}
```

## 9. Important notes
- Never put database credentials in frontend files. `.env` is server-only.
- Resume files are stored in `uploads/`; keep this directory private in production and serve downloads through an authenticated download endpoint before deploying publicly. For this local college demonstration, file upload is restricted by extension and size.
- This is a college-project starter, not a production deployment. Before public hosting, add CSRF protection, rate limiting, HTTPS secure cookies, stronger upload content inspection, and a private authenticated resume-download route.
- If the database is not reachable, check that MySQL is running and `.env` credentials match Workbench.
