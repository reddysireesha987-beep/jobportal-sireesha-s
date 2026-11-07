const $ = s => document.querySelector(s);
const toast = (message, error=false) => {
  const el=$("#toast"); el.textContent=message; el.style.background=error?"#8f302d":"#142b3b";
  el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3200);
};
async function api(url, options={}) {
  const response=await fetch(url,{credentials:"same-origin",...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let currentUser=null, currentJobs=[];

async function loadJobs(q="",location=""){
  const data=await api(`/api/jobs?q=${encodeURIComponent(q)}&location=${encodeURIComponent(location)}`);
  currentJobs=data.jobs; $("#statJobs").textContent=data.jobs.length;
  const box=$("#jobList");
  if(!data.jobs.length){box.innerHTML='<div class="empty-state"><i class="bi bi-search"></i><br>No matching jobs yet. Try another search or check back soon.</div>';return;}
  box.innerHTML=data.jobs.map(j=>`<article class="job-card">
    <div class="job-top"><div class="company-icon"><i class="bi bi-buildings"></i></div><span class="job-type">${esc(j.job_type)}</span></div>
    <h3>${esc(j.title)}</h3><div class="job-company">${esc(j.company)} · ${esc(j.employer_name)}</div>
    <div class="job-meta"><span><i class="bi bi-geo-alt"></i>${esc(j.location)}</span><span><i class="bi bi-calendar3"></i>${new Date(j.posted_date).toLocaleDateString()}</span></div>
    <div class="job-skills">${esc(j.skills || "Skills discussed during interview")}</div>
    <div class="job-actions"><strong>${esc(j.salary || "Salary not specified")}</strong><button class="btn btn-primary" onclick="applyJob(${j.job_id})">View / Apply</button></div>
  </article>`).join("");
}
async function applyJob(id){
  if(!currentUser){location.hash="#login";toast("Please log in as a student to apply.",true);return;}
  if(currentUser.role!=="student"){toast("Only student accounts can apply.",true);return;}
  const job=currentJobs.find(j=>j.job_id===id);
  const resume=prompt(`Applying for ${job?.title || "this job"}. Optional: enter a resume file name only if you have already uploaded it in the application form. The dashboard application form supports secure file upload.`);
  if(resume===null)return;
  const fd=new FormData();fd.append("job_id",id);
  // The resume is optional; use the dedicated apply dialog form for uploads.
  try{await api("/api/applications",{method:"POST",body:fd});toast("Application submitted!");}
  catch(e){toast(e.message,true);}
}
window.applyJob=applyJob;

$("#heroSearch").addEventListener("submit",e=>{e.preventDefault();const f=new FormData(e.target);$("#jobSearch").value=f.get("q");$("#locationSearch").value=f.get("location");loadJobs(f.get("q"),f.get("location"));location.hash="#jobs";});
$("#filterBtn").addEventListener("click",()=>loadJobs($("#jobSearch").value,$("#locationSearch").value).catch(e=>toast(e.message,true)));
$("#menuToggle").addEventListener("click",()=>$("#nav").classList.toggle("open"));
$("#nav").addEventListener("click",e=>{if(e.target.closest("a"))$("#nav").classList.remove("open");});
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target));try{const d=await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});currentUser=d.user;toast(d.message);showDashboard();}catch(err){toast(err.message,true);}});
$("#registerForm").addEventListener("submit",async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.target));try{const d=await api("/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});currentUser=d.user;toast(d.message);showDashboard();}catch(err){toast(err.message,true);}});
$("#logoutBtn").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST"});currentUser=null;$("#dashboard").classList.add("hidden");$("#login").scrollIntoView();toast("You have logged out.");}catch(e){toast(e.message,true);}});
async function refreshSession(){try{const d=await api("/api/me");currentUser=d.user;if(currentUser)showDashboard();}catch(e){}}
function showDashboard(){
  $("#dashboard").classList.remove("hidden");$("#dashTitle").textContent=`Hello, ${currentUser.name}`;
  $("#dashSubtitle").textContent=`${currentUser.role.toUpperCase()} WORKSPACE · Your CareerConnect activity`;
  $("#dashboardContent").innerHTML='<div class="empty-state">Loading your workspace…</div>';
  $("#dashboard").scrollIntoView({behavior:"smooth"});renderDashboard().catch(e=>toast(e.message,true));
}
async function renderDashboard(){
  const area=$("#dashboardContent");
  if(currentUser.role==="student"){
    const [apps,profile]=await Promise.all([api("/api/applications"),api("/api/profile")]);
    area.innerHTML=`<div class="dash-stats"><div class="dash-stat"><strong>${apps.applications.length}</strong><span>Applications submitted</span></div><div class="dash-stat"><strong>${apps.applications.filter(a=>a.status==="Shortlisted").length}</strong><span>Shortlisted</span></div></div>
    <div class="dashboard-panel"><h3><i class="bi bi-person-lines-fill"></i> My profile</h3><form id="profileForm" class="inline-form">
      <input name="name" required placeholder="Full name" value="${esc(profile.profile.name)}"><input name="phone" placeholder="Phone" value="${esc(profile.profile.phone)}">
      <input name="qualification" placeholder="Qualification" value="${esc(profile.profile.qualification)}"><input name="experience" placeholder="Experience" value="${esc(profile.profile.experience)}">
      <input name="skills" placeholder="Skills (comma separated)" value="${esc(profile.profile.skills)}"><button class="btn btn-primary">Save profile</button>
    </form></div>
    <div class="dashboard-panel"><h3><i class="bi bi-send-check"></i> My applications</h3>${applicationTable(apps.applications,true)}</div>
    <div class="dashboard-panel"><h3><i class="bi bi-trash3"></i> Account settings</h3><button class="btn btn-outline" id="deleteAccount">Delete my account</button></div>`;
    $("#profileForm").onsubmit=async e=>{e.preventDefault();try{const b=Object.fromEntries(new FormData(e.target));await api("/api/profile",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});currentUser.name=b.name;toast("Profile updated.");}catch(x){toast(x.message,true);}};
    $("#deleteAccount").onclick=async()=>{if(confirm("Permanently delete your account and related records?")){try{await api("/api/account",{method:"DELETE"});currentUser=null;$("#dashboard").classList.add("hidden");toast("Account deleted.");}catch(x){toast(x.message,true);}}};
  } else if(currentUser.role==="employer"){
    const [jobs,apps]=await Promise.all([api("/api/my-jobs"),api("/api/applications")]);
    area.innerHTML=`<div class="dashboard-panel"><h3><i class="bi bi-plus-circle"></i> Publish a job vacancy</h3>${jobForm()}</div>
    <div class="dashboard-panel"><h3><i class="bi bi-briefcase"></i> Your job vacancies</h3>${jobsTable(jobs.jobs)}</div>
    <div class="dashboard-panel"><h3><i class="bi bi-people"></i> Applications received</h3>${applicationTable(apps.applications,false)}</div>`;
    bindJobForm();bindJobActions();bindApplicationActions();
  } else {
    const [stats,users,jobs,apps]=await Promise.all([api("/api/dashboard/stats"),api("/api/users"),api("/api/my-jobs"),api("/api/applications")]);
    area.innerHTML=`<div class="dash-stats">${[['Users',stats.total_users],['Employers',stats.employers],['Students',stats.students],['Jobs',stats.total_jobs],['Applications',stats.total_applications]].map(x=>`<div class="dash-stat"><strong>${x[1]||0}</strong><span>${x[0]}</span></div>`).join("")}</div>
    <div class="dashboard-panel"><h3><i class="bi bi-person-gear"></i> Manage users</h3>${usersTable(users.users)}</div>
    <div class="dashboard-panel"><h3><i class="bi bi-briefcase"></i> All jobs</h3>${jobsTable(jobs.jobs)}</div>
    <div class="dashboard-panel"><h3><i class="bi bi-card-checklist"></i> All applications</h3>${applicationTable(apps.applications,false)}</div>`;
    bindUserActions();bindJobActions();bindApplicationActions();
  }
}
function jobForm(){return `<form id="jobForm" class="inline-form"><input name="title" required placeholder="Job title"><input name="company" required placeholder="Company"><input name="location" required placeholder="Location"><input name="salary" placeholder="Salary / range"><select name="job_type"><option>Full-time</option><option>Part-time</option><option>Internship</option><option>Contract</option><option>Remote</option></select><input name="skills" placeholder="Skills"><textarea name="description" required placeholder="Job description"></textarea><button class="btn btn-primary">Publish vacancy <i class="bi bi-plus-lg"></i></button></form>`;}
function bindJobForm(){const f=$("#jobForm");f.onsubmit=async e=>{e.preventDefault();try{await api("/api/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(f)))});toast("Job published.");await renderDashboard();await loadJobs();}catch(x){toast(x.message,true);}};}
function jobsTable(rows){if(!rows.length)return'<p class="muted">No job vacancies found.</p>';return `<table><thead><tr><th>Role</th><th>Company</th><th>Location</th><th>Applicants</th><th>Actions</th></tr></thead><tbody>${rows.map(j=>`<tr><td>${esc(j.title)}</td><td>${esc(j.company)}</td><td>${esc(j.location)}</td><td>${j.applicant_count??"—"}</td><td><button class="table-action" data-edit-job="${j.job_id}">Edit</button><button class="table-action" data-delete-job="${j.job_id}">Delete</button></td></tr>`).join("")}</tbody></table>`;}
function bindJobActions(){document.querySelectorAll("[data-delete-job]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this job and its applications?"))try{await api(`/api/jobs/${b.dataset.deleteJob}`,{method:"DELETE"});toast("Job deleted.");await renderDashboard();await loadJobs();}catch(e){toast(e.message,true);}});
document.querySelectorAll("[data-edit-job]").forEach(b=>b.onclick=async()=>{const j=(await api(`/api/jobs/${b.dataset.editJob}`)).job;const title=prompt("Job title",j.title);if(title===null)return;const company=prompt("Company",j.company);if(company===null)return;const location=prompt("Location",j.location);if(location===null)return;const salary=prompt("Salary",j.salary||"");const skills=prompt("Skills",j.skills||"");const description=prompt("Description",j.description);if(description===null)return;try{await api(`/api/jobs/${j.job_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...j,title,company,location,salary,skills,description})});toast("Job updated.");await renderDashboard();await loadJobs();}catch(e){toast(e.message,true);}});}
function applicationTable(rows,student){if(!rows.length)return'<p class="muted">No applications yet.</p>';return `<table><thead><tr><th>Job</th><th>${student?"Company":"Applicant"}</th><th>Applied</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.title)}</td><td>${esc(student?a.company:a.student_name)}</td><td>${new Date(a.applied_date).toLocaleDateString()}</td><td>${esc(a.status)}</td><td>${student?`<button class="table-action" data-delete-app="${a.application_id}">Withdraw</button>`:`<select data-status-app="${a.application_id}">${["Pending","Reviewed","Shortlisted","Rejected","Selected"].map(s=>`<option ${s===a.status?"selected":""}>${s}</option>`).join("")}</select><button class="table-action" data-save-app="${a.application_id}">Save</button>`}</td></tr>`).join("")}</tbody></table>`;}
function bindApplicationActions(){document.querySelectorAll("[data-save-app]").forEach(b=>b.onclick=async()=>{const id=b.dataset.saveApp,status=document.querySelector(`[data-status-app="${id}"]`).value;try{await api(`/api/applications/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});toast("Application status updated.");}catch(e){toast(e.message,true);}});
document.querySelectorAll("[data-delete-app]").forEach(b=>b.onclick=async()=>{if(confirm("Withdraw/delete this application?"))try{await api(`/api/applications/${b.dataset.deleteApp}`,{method:"DELETE"});toast("Application deleted.");await renderDashboard();}catch(e){toast(e.message,true);}});}
function usersTable(rows){return `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Actions</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${esc(u.phone)}</td><td><button class="table-action" data-edit-user="${u.user_id}">Edit</button><button class="table-action" data-delete-user="${u.user_id}">Delete</button></td></tr>`).join("")}</tbody></table>`;}
function bindUserActions(){document.querySelectorAll("[data-delete-user]").forEach(b=>b.onclick=async()=>{if(confirm("Permanently delete this user and related records?"))try{await api(`/api/users/${b.dataset.deleteUser}`,{method:"DELETE"});toast("User deleted.");await renderDashboard();}catch(e){toast(e.message,true);}});
document.querySelectorAll("[data-edit-user]").forEach(b=>b.onclick=async()=>{const u=(await api(`/api/users/${b.dataset.editUser}`)).user;const name=prompt("Name",u.name);if(name===null)return;const phone=prompt("Phone",u.phone||"");const role=prompt("Role: student, employer or admin",u.role);if(role===null)return;try{await api(`/api/users/${u.user_id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,phone,role})});toast("User updated.");await renderDashboard();}catch(e){toast(e.message,true);}});}
$("#year").textContent=new Date().getFullYear();
loadJobs().catch(()=>{$("#jobList").innerHTML='<div class="empty-state">Database is not connected yet. Follow README setup steps to start the portal.</div>';});
refreshSession();
