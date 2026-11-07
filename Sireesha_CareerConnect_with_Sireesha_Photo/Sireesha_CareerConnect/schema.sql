CREATE DATABASE IF NOT EXISTS careerconnect_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE careerconnect_db;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('student','employer','admin') NOT NULL DEFAULT 'student',
  phone VARCHAR(25),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role(role)
);

CREATE TABLE IF NOT EXISTS jobs (
  job_id INT AUTO_INCREMENT PRIMARY KEY,
  employer_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  company VARCHAR(180) NOT NULL,
  location VARCHAR(180) NOT NULL,
  salary VARCHAR(100),
  job_type VARCHAR(60) DEFAULT 'Full-time',
  skills TEXT,
  description TEXT NOT NULL,
  posted_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_jobs_employer FOREIGN KEY (employer_id)
    REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_jobs_title(title),
  INDEX idx_jobs_location(location)
);

CREATE TABLE IF NOT EXISTS applications (
  application_id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  user_id INT NOT NULL,
  resume VARCHAR(255),
  applied_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('Pending','Reviewed','Shortlisted','Rejected','Selected')
    NOT NULL DEFAULT 'Pending',
  CONSTRAINT fk_app_job FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE,
  CONSTRAINT fk_app_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY uq_job_user(job_id,user_id),
  INDEX idx_app_status(status)
);

CREATE TABLE IF NOT EXISTS profiles (
  profile_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  qualification VARCHAR(180),
  skills TEXT,
  experience VARCHAR(100),
  profile_image VARCHAR(255),
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE
);

-- Optional demo employer and jobs are created through the website registration flow.
-- Create an administrator securely with the one-time command described in README.md.
