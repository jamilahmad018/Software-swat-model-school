(function () {
  // Supabase project configuration. Publishable keys are intended for browser use; RLS is mandatory.
  var SUPABASE_URL = "https://qaucxyefjtsqunihcdzo.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WMRaKvZ9u4a0pocFLVCA7Q_H6-HSj18";
  var supabaseClient = null;
  var authenticatedRole = null;
  var authenticatedUser = null;
  var appInitialized = false;
  // Phase 25: student module automatic cloud save (single-writer pilot).
  var studentCloudReady = false;
  var studentCloudSaveTimer = null;
  var studentCloudChannel = null;
  var STORAGE_KEY = "sms_student_records_phase1";
  var SETTINGS_KEY = "sms_school_settings_phase18";
  var schoolSettings = {};
  var ACCESS_USERS_KEY = "sms_access_users_phase20";
  var accessUsers = [];
  var ROLE_PERMISSION_MATRIX = [
    ["Dashboard", "View", "Full"], ["Students & Admissions", "Manage", "Full"], ["ID Cards", "Manage", "Full"], ["Attendance & Gate", "Manage", "Full"], ["Fees & Recovery", "Manage", "Full"], ["Exams & DMC", "Manage", "Full"], ["Staff & Payroll", "Manage", "Full"], ["Expenses & Inventory", "Manage", "Full"], ["Timetable & Notices", "Manage", "Full"], ["Analytics & Reports", "View / Export", "Full"], ["System Settings", "No access", "Full"], ["User Permissions", "No access", "Full"]
  ];
  var settingsLogoData = "";
  var ATTENDANCE_KEY = "sms_attendance_records_phase1";
  var GATE_LOG_KEY = "sms_student_gate_logs_phase16";
  var gateLogs = [];
  var STAFF_GATE_LOG_KEY = "sms_staff_gate_logs_phase16";
  var staffGateLogs = [];
  var FEES_KEY = "sms_fee_records_phase1";
  var RESULTS_KEY = "sms_exam_results_phase1";
  var STAFF_KEY = "sms_staff_records_phase1";
  var STAFF_ATTENDANCE_KEY = "sms_staff_attendance_phase1";
  var PAYROLL_KEY = "sms_payroll_records_phase1";
  var EXPENSES_KEY = "sms_expense_records_phase1";
  var INVENTORY_KEY = "sms_inventory_records_phase1";
  var MOVEMENTS_KEY = "sms_inventory_movements_phase1";
  var TIMETABLE_KEY = "sms_timetable_records_phase1";
  var attendanceRecords = [];
  var feeRecords = [];
  var examRecords = [];
  var staffRecords = [];
  var staffAttendanceRecords = [];
  var payrollRecords = [];
  var expenseRecords = [];
  var inventoryRecords = [];
  var stockMovements = [];
  var timetableRecords = [];
  var parentNotices = [];
  var PARENT_NOTICES_KEY = "sms_parent_notices_phase13";
  var TEACHER_REVIEWS_KEY = "sms_teacher_reviews_phase14";
  var teacherReviews = [];
  var boardNotices = [];
  var BOARD_NOTICES_KEY = "sms_digital_notice_board_phase15";
  var editingStaffId = null;
  var qrScanner = null;
  var scannerRunning = false;
  var students = [];
  var currentCampus = "all";
  var editingStudentId = null;
  var pendingPhotoData = "";
  var pageNames = {
    dashboard: "Dashboard Overview", students: "Student Management", idcards: "Student ID Cards", attendance: "Attendance",
    fees: "Fee Management", results: "Results & DMC", staff: "Staff Management", teacherPerformance: "Teacher Performance & Monitoring", expenses: "Expenses & Financial Management", inventory: "Inventory & School Assets", timetable: "Class Timetable", analytics: "Student Performance Analytics", feeRecovery: "Smart Fee Recovery", parentPortal: "Parent Communication Center", noticeBoard: "Digital Notice Board",
    reports: "Reports & Analytics", settings: "System Settings"
  };
  var pageDescriptions = {
    attendance: "Daily attendance and class-wise registers are available in this phase.",
    fees: "Fee challans, payments, pending dues and receipts will be added in a later phase.",
    results: "Exam setup, marks entry, grading and printable DMCs will be added in a later phase.",
    staff: "Teacher and employee records, attendance and payroll will be added in a later phase.",
    reports: "Campus-wise summaries and printable reports will be added in a later phase.",
    settings: "School profile, academic sessions, user roles and backups will be configured here."
  };
  function byId(id) { return document.getElementById(id); }
  function makeQrToken() {
    if (window.crypto && window.crypto.randomUUID) return "SMS-" + window.crypto.randomUUID();
    return "SMS-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  function generateStudentId() {
    var max = 0;
    students.forEach(function (student) {
      var match = String(student && student.id || "").match(/^SMS-(\d+)$/i);
      if (match) max = Math.max(max, Number(match[1]));
    });
    var candidate;
    do {
      max += 1;
      candidate = "SMS-" + String(max).padStart(4, "0");
    } while (students.some(function (student) {
      return String(student && student.id || "").toLowerCase() === candidate.toLowerCase();
    }));
    return candidate;
  }
  function loadStudents() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      students = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(students)) students = [];
      var changed = false, usedIds = {};
      students.forEach(function(student){
        if (!student || typeof student !== "object") return;
        var sourceId = student.id || student.studentId || student.studentCode || student.student_code || student.student_code_id || "";
        var idText = String(sourceId).trim();
        var invalid = !idText || idText.toLowerCase()==="undefined" || idText.toLowerCase()==="null";
        var duplicate = idText && usedIds[idText.toLowerCase()];
        if (invalid || duplicate) {
          student.id = generateStudentId();
          changed = true;
        } else if (student.id !== idText) {
          student.id = idText;
          changed = true;
        }
        usedIds[String(student.id).toLowerCase()] = true;
        if (!student.name && (student.fullName || student.full_name)) {
          student.name = student.fullName || student.full_name;
          changed = true;
        }
        if (!student.qrToken) { student.qrToken = makeQrToken(); changed = true; }
      });
      if (changed) saveStudents();
    } catch (e) { students = []; }
  }
  function setStudentCloudIndicator(message, isError) {
    var el = byId("studentCloudIndicator");
    if (el) { el.textContent = message; el.style.color = isError ? "#b42318" : ""; }
  }
  function scheduleStudentCloudSave() {
    if (!studentCloudReady || !supabaseClient || !authenticatedUser || !authenticatedRole) return;
    if (studentCloudSaveTimer) window.clearTimeout(studentCloudSaveTimer);
    setStudentCloudIndicator("Cloud sync: saving student changes…", false);
    studentCloudSaveTimer = window.setTimeout(async function () {
      try {
        var result = await supabaseClient.from("school_students").upsert({
          record_key: "primary", campus: null,
          record_data: { records: students },
          created_by: authenticatedUser.id, updated_by: authenticatedUser.id,
          updated_at: new Date().toISOString()
        }, { onConflict: "record_key" });
        if (result.error) throw result.error;
        setStudentCloudIndicator("Cloud sync: student data saved · " + new Date().toLocaleTimeString(), false);
      } catch (err) {
        setStudentCloudIndicator("Cloud sync failed: " + (err.message || "Please check internet/RLS"), true);
      }
    }, 900);
  }
  async function initializeStudentCloudSync() {
    studentCloudReady = false;
    if (!supabaseClient || !authenticatedUser || !authenticatedRole) return;
    setStudentCloudIndicator("Cloud sync: checking saved student records…", false);
    try {
      var result = await supabaseClient.from("school_students").select("record_data,updated_at").eq("record_key", "primary").maybeSingle();
      if (result.error) throw result.error;
      if (result.data && result.data.record_data && Array.isArray(result.data.record_data.records)) {
        // Merge cloud and this browser's local records instead of discarding local-only admissions.
        // Cloud values win for matching IDs; local-only IDs are retained and then uploaded.
        var cloudRecords = result.data.record_data.records;
        var merged = cloudRecords.slice();
        var seen = {};
        merged.forEach(function (student) {
          var key = String(student && student.id || "").trim().toLowerCase();
          if (key) seen[key] = true;
        });
        var localOnlyFound = false;
        students.forEach(function (student) {
          var key = String(student && student.id || "").trim().toLowerCase();
          if (key && !seen[key]) {
            merged.push(student);
            seen[key] = true;
            localOnlyFound = true;
          }
        });
        students = merged;
        ensureValidStudentIds();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
        renderStudents();
        studentCloudReady = true;
        if (localOnlyFound) {
          setStudentCloudIndicator("Cloud sync: found local-only students; uploading merged records…", false);
          scheduleStudentCloudSave();
        } else {
          setStudentCloudIndicator("Cloud sync: latest student records loaded · " + new Date().toLocaleTimeString(), false);
        }
      } else {
        // First-time setup: publish the current local student list if the cloud row does not exist.
        studentCloudReady = true;
        scheduleStudentCloudSave();
      }
      studentCloudReady = true;
    } catch (err) {
      studentCloudReady = false;
      setStudentCloudIndicator("Cloud sync unavailable: " + (err.message || "Check connection and permissions"), true);
    }
  }
  function saveStudents() {
    try {
      ensureValidStudentIds();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
      scheduleStudentCloudSave();
      return true;
    } catch (e) { showToast("Could not save. Browser storage may be disabled."); return false; }
  }
  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function campusName(value) { return value === "girls" ? "Girls Campus" : value === "boys" ? "Boys Campus" : "All Campuses"; }
  function filteredStudents() {
    var q = (byId("studentSearch").value || "").toLowerCase();
    return students.filter(function (s) {
      var campusMatch = currentCampus === "all" || s.campus === currentCampus;
      var searchText = [s.name, s.id, s.studentClass, s.guardian, s.phone, campusName(s.campus)].join(" ").toLowerCase();
      return campusMatch && searchText.indexOf(q) !== -1;
    });
  }
  function renderStudents() {
    var list = filteredStudents(), html = "", i, s;
    for (i = 0; i < list.length; i++) {
      s = list[i];
      html += "<tr><td>" + escapeHtml(s.id) + "</td><td><strong>" + escapeHtml(s.name) + "</strong></td><td>" + escapeHtml(s.studentClass) + "</td><td><span class='campus-tag " + (s.campus === "boys" ? "boys" : "") + "'>" + escapeHtml(campusName(s.campus)) + "</span></td><td>" + escapeHtml(s.guardian || "—") + "</td><td>" + escapeHtml(s.phone || "—") + "</td><td><button class='edit-button' data-edit-id='" + escapeHtml(s.id) + "'>Edit</button> <button class='delete-button' data-delete-id='" + escapeHtml(s.id) + "'>Delete</button></td></tr>";
    }
    byId("studentTableBody").innerHTML = html;
    byId("emptyState").style.display = list.length ? "none" : "block";
    byId("studentTableBody").parentNode.style.display = list.length ? "table" : "none";
    var campusTotal = students.filter(function (student) { return currentCampus === "all" || student.campus === currentCampus; }).length;
    if (byId("totalStudents")) byId("totalStudents").innerHTML = String(campusTotal);
    byId("studentNavCount").innerHTML = String(students.length);
    byId("studentCountMini").innerHTML = String(list.length);
    byId("campusSummary").innerHTML = escapeHtml(campusName(currentCampus));
    if (byId("idCardGrid")) renderIdCards();
  }
  function showToast(message) {
    var t = byId("toast"); t.innerHTML = message; t.style.display = "block";
    window.setTimeout(function () { t.style.display = "none"; }, 2800);
  }
  // Phase 19: role-aware interface preview. This is NOT authentication; backend enforcement is Phase 21.
  var WORKSPACE_ROLE_KEY = "sms_workspace_role_phase19";
  var workspaceRole = "admin";
  function applyWorkspaceRole(role) {
    workspaceRole = role === "director" ? "director" : "admin";
    try { localStorage.setItem(WORKSPACE_ROLE_KEY, workspaceRole); } catch (e) {}
    var isDirector = workspaceRole === "director";
    var name = byId("workspaceName"), sub = byId("workspaceSubtitle"), avatar = byId("workspaceAvatar"), picker = byId("workspaceRole");
    if (name) name.textContent = isDirector ? "Director" : "Administrator";
    if (sub) sub.textContent = isDirector ? "Management · Local preview" : "School Office · Local preview";
    if (avatar) avatar.textContent = isDirector ? "D" : "A";
    if (picker) picker.value = workspaceRole;
    // Admin handles daily operations; only Director sees System Settings in this local preview.
    var settingsNav = document.querySelector('.nav-item[data-page="settings"]');
    if (settingsNav) settingsNav.classList.toggle("role-restricted", !isDirector);
    if (!isDirector && byId("settingsPage") && !byId("settingsPage").classList.contains("hidden")) showPage("dashboard");
    var banner = document.querySelector(".welcome-tag");
    if (banner) banner.textContent = isDirector ? "DIRECTOR'S COMMAND CENTER" : "ADMINISTRATOR WORKSPACE";
    var heading = document.querySelector("#dashboardPage .welcome-copy h2");
    if (heading) heading.innerHTML = isDirector ? 'School at a glance, <em>every day.</em>' : 'Daily school operations, <em>in one place.</em>';
  }
  function showPage(page) {
    var all = ["noticeBoardPage", "dashboardPage", "studentsPage", "idcardsPage", "attendancePage", "feesPage", "resultsPage", "staffPage", "expensesPage", "inventoryPage", "timetablePage", "analyticsPage", "feeRecoveryPage", "parentPortalPage", "teacherPerformancePage", "reportsPage", "settingsPage", "placeholderPage"], i;
    for (i = 0; i < all.length; i++) byId(all[i]).className = "page-content hidden";
    if (page === "dashboard") { byId("dashboardPage").className = "page-content"; renderDirectorDashboard(); }
    else if (page === "students") byId("studentsPage").className = "page-content";
    else if (page === "idcards") byId("idcardsPage").className = "page-content";
    else if (page === "attendance") { byId("attendancePage").className = "page-content"; renderAttendance(); }
    else if (page === "fees") { byId("feesPage").className = "page-content"; renderFees(); }
    else if (page === "results") { byId("resultsPage").className = "page-content"; renderResults(); populateExamSelectors(); }
    else if (page === "staff") { byId("staffPage").className = "page-content"; renderStaffModule(); }
    else if (page === "teacherPerformance") { byId("teacherPerformancePage").className = "page-content"; renderTeacherPerformance(); }
    else if (page === "expenses") { byId("expensesPage").className = "page-content"; renderFinanceModule(); }
    else if (page === "inventory") { byId("inventoryPage").className = "page-content"; renderInventoryModule(); }
    else if (page === "timetable") { byId("timetablePage").className = "page-content"; renderTimetableModule(); }
    else if (page === "analytics") { byId("analyticsPage").className = "page-content"; renderStudentAnalytics(); }
    else if (page === "feeRecovery") { byId("feeRecoveryPage").className = "page-content"; renderFeeRecovery(); }
    else if (page === "parentPortal") { byId("parentPortalPage").className = "page-content"; renderParentPortal(); }
    else if (page === "noticeBoard") { byId("noticeBoardPage").className = "page-content"; renderNoticeBoard(); }
    else if (page === "reports") { byId("reportsPage").className = "page-content"; renderMonthlyReportPreview(); }
    else if (page === "settings") { byId("settingsPage").className = "page-content"; renderSettings(); }
    else {
      byId("placeholderPage").className = "page-content";
      byId("placeholderTitle").innerHTML = escapeHtml(pageNames[page] || "Module");
      byId("placeholderDescription").innerHTML = escapeHtml(pageDescriptions[page] || "This module is planned for a later phase.");
    }
    byId("pageTitle").innerHTML = escapeHtml(pageNames[page] || "Dashboard Overview");
    var nav = document.querySelectorAll(".nav-item"), j;
    for (j = 0; j < nav.length; j++) nav[j].className = nav[j].getAttribute("data-page") === page ? "nav-item active" : "nav-item";
    byId("sidebar").className = "sidebar";
  }
  function resetPhotoPreview() {
    var img = byId("studentPhotoPreview");
    if (pendingPhotoData) { img.src = pendingPhotoData; img.style.display = "block"; byId("photoPreviewText").style.display = "none"; }
    else { img.removeAttribute("src"); img.style.display = "none"; byId("photoPreviewText").style.display = "block"; }
  }
  function openModal(student) {
    byId("studentForm").reset();
    editingStudentId = student ? student.id : null;
    pendingPhotoData = student && student.photoData ? student.photoData : "";
    byId("modalTitle").innerHTML = student ? "Edit student" : "Add student";
    byId("studentId").readOnly = !!student;
    byId("studentId").value = student ? student.id : generateStudentId();
    byId("studentName").value = student ? student.name : "";
    byId("studentClass").value = student ? student.studentClass : "";
    byId("studentCampus").value = student ? student.campus : (currentCampus !== "all" ? currentCampus : "boys");
    byId("guardianName").value = student ? (student.guardian || "") : "";
    byId("guardianPhone").value = student ? (student.phone || "") : "";
    byId("studentGender").value = student ? (student.gender || "") : "";
    byId("studentDob").value = student ? (student.dob || "") : "";
    byId("admissionDate").value = student ? (student.admissionDate || "") : new Date().toISOString().slice(0,10);
    byId("studentAddress").value = student ? (student.address || "") : "";
    resetPhotoPreview();
    byId("studentModal").className = "modal-backdrop";
    byId("studentName").focus();
  }
  function closeModal() {
    byId("studentModal").className = "modal-backdrop hidden";
    byId("studentForm").reset();
    byId("studentId").readOnly = false;
    editingStudentId = null; pendingPhotoData = "";
  }
  function ensureValidStudentIds() {
    var used = {};
    students.forEach(function (student) {
      if (!student || typeof student !== "object") return;
      var id = String(student.id == null ? "" : student.id).trim();
      if (!id || id.toLowerCase() === "undefined" || id.toLowerCase() === "null" || used[id.toLowerCase()]) {
        student.id = generateStudentId();
        id = String(student.id);
      } else {
        student.id = id;
      }
      used[id.toLowerCase()] = true;
    });
  }
  function addStudent(event) {
    if (event && event.preventDefault) event.preventDefault();
    var record = {
      id: byId("studentId").value.replace(/^\s+|\s+$/g, ""),
      name: byId("studentName").value.replace(/^\s+|\s+$/g, ""),
      studentClass: byId("studentClass").value,
      campus: byId("studentCampus").value,
      guardian: byId("guardianName").value.replace(/^\s+|\s+$/g, ""),
      phone: byId("guardianPhone").value.replace(/^\s+|\s+$/g, ""),
      gender: byId("studentGender").value,
      dob: byId("studentDob").value,
      admissionDate: byId("admissionDate").value,
      address: byId("studentAddress").value.replace(/^\s+|\s+$/g, ""),
      photoData: pendingPhotoData,
      qrToken: ""
    };
    var i, oldRecord = null;
    if (!record.id || record.id.toLowerCase() === "undefined" || record.id.toLowerCase() === "null") record.id = generateStudentId();
    if (!record.name || !record.studentClass || !record.guardian) { showToast("Please fill in all required fields."); return; }
    for (i = 0; i < students.length; i++) {
      if (students[i].id.toLowerCase() === record.id.toLowerCase()) {
        if (editingStudentId !== record.id) { showToast("This Student ID already exists."); return; }
        oldRecord = students[i]; record.qrToken = oldRecord.qrToken || makeQrToken(); students[i] = record; break;
      }
    }
    if (!oldRecord) { record.qrToken = makeQrToken(); students.push(record); }
    if (!saveStudents()) {
      if (oldRecord) students[i] = oldRecord; else students.pop();
      return;
    }
    closeModal(); renderStudents(); showPage("students"); showToast(oldRecord ? "Student record updated." : "Student record saved.");
  }
  function editStudent(id) {
    for (var i=0; i<students.length; i++) if (students[i].id === id) { openModal(students[i]); return; }
  }
  function deleteStudent(id) {
    var next = [], i, found = false;
    for (i = 0; i < students.length; i++) {
      if (students[i].id === id) found = true; else next.push(students[i]);
    }
    if (!found) return;
    if (window.confirm("Delete student " + id + "? This cannot be undone in this prototype.")) {
      students = next; saveStudents(); renderStudents(); showToast("Student removed.");
    }
  }

  function cardMatches(s, query) {
    var text = [s.name, s.id, s.studentClass, campusName(s.campus), s.guardian].join(" ").toLowerCase();
    var campusMatch = currentCampus === "all" || s.campus === currentCampus;
    return campusMatch && text.indexOf(query) !== -1;
  }
  function renderIdCards() {
    if (!byId("idCardGrid")) return;
    var query = (byId("idCardSearch").value || "").toLowerCase();
    var list = students.filter(function (s) { return cardMatches(s, query); });
    var html = "", i, s;
    for (i = 0; i < list.length; i++) {
      s = list[i];
      html += "<article class='idcard-item' data-card-id='" + escapeHtml(s.id) + "'>" +
        "<div class='idcard-item-top'><label class='idcard-select'><input type='checkbox' class='card-check' checked> Include card</label><span class='idcard-item-number'>CARD " + (i + 1) + "</span></div>" +
        "<div class='student-id-card'>" +
          "<div class='id-card-header'><div class='id-card-logo'>SMS</div><div class='id-card-school'><strong>SWAT MODEL SCHOOL</strong><small class='id-card-campus'>" + escapeHtml(campusName(s.campus).toUpperCase()) + "</small><small class='id-card-location'>DARMAI, SWAT</small></div></div>" +
          "<div class='id-card-body'><div class='id-card-photo'>" + (s.photoData ? "<img src='" + s.photoData + "' alt='Student photo'>" : "♙") + "</div><div class='id-card-details'><div class='id-card-name'>" + escapeHtml(s.name) + "</div>" +
          "<div class='id-card-field'><b>ID:</b><span>" + escapeHtml(s.id) + "</span></div>" +
          "<div class='id-card-field'><b>Class:</b><span>" + escapeHtml(s.studentClass) + "</span></div>" +
          "<div class='id-card-field'><b>Campus:</b><span>" + escapeHtml(campusName(s.campus)) + "</span></div>" +
          (s.guardian ? "<div class='id-card-field'><b>Father:</b><span>" + escapeHtml(s.guardian) + "</span></div>" : "") +
          (s.dob ? "<div class='id-card-field'><b>DOB:</b><span>" + escapeHtml(s.dob.split('-').reverse().join('-')) + "</span></div>" : "") +
          "</div><div class='id-card-qr-wrap'><img class='id-card-qr' loading='eager' alt='Unique student QR code' src='https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=2&data=" + encodeURIComponent("SWAT-MODEL-SCHOOL|" + s.qrToken) + "'><small>SCAN FOR STUDENT ID</small></div></div><div class='id-card-footer'><span>STUDENT IDENTITY CARD</span><span>LEARN • GROW • LEAD</span></div></div></article>";
    }
    byId("idCardGrid").innerHTML = html;
    byId("idCardEmpty").className = list.length ? "empty-state hidden" : "empty-state";
    byId("selectAllCards").checked = list.length > 0;
    updateSelectedCount();
  }
  function updateSelectedCount() {
    var checks = document.querySelectorAll("#idCardGrid .card-check"), count = 0, i;
    for (i = 0; i < checks.length; i++) if (checks[i].checked) count++;
    if (byId("selectedCardsCount")) byId("selectedCardsCount").innerHTML = count + (count === 1 ? " card selected" : " cards selected");
    if (byId("selectAllCards")) byId("selectAllCards").checked = checks.length > 0 && count === checks.length;
  }
  function printSelectedCards() {
    var items = document.querySelectorAll("#idCardGrid .idcard-item"), selected = 0, i;
    for (i = 0; i < items.length; i++) {
      var check = items[i].querySelector(".card-check");
      if (check && check.checked) { items[i].className = "idcard-item print-selected"; selected++; }
      else items[i].className = "idcard-item";
    }
    if (!selected) { showToast("Please select at least one card to print."); return; }
    window.print();
  }


  function loadAccessUsers(){try{var raw=localStorage.getItem(ACCESS_USERS_KEY);accessUsers=raw?JSON.parse(raw):[];if(!Array.isArray(accessUsers))accessUsers=[];}catch(e){accessUsers=[];}}
  function saveAccessUsers(){try{localStorage.setItem(ACCESS_USERS_KEY,JSON.stringify(accessUsers));return true;}catch(e){showToast("User directory save nahi hui.");return false;}}
  function renderAccessUsers(){var body=byId("accessUserRows"),count=byId("accessUserCount"),matrix=byId("permissionMatrixRows");if(!body)return;if(count)count.textContent=accessUsers.length+" ACCOUNTS";body.innerHTML=accessUsers.length?accessUsers.map(function(u){return "<tr><td>"+escapeHtml(u.name)+"</td><td>"+escapeHtml(u.username)+"</td><td>"+escapeHtml(u.role==="director"?"Director":"Administrator")+"</td><td>"+escapeHtml(u.status)+"</td><td><button type=\"button\" class=\"edit-button\" data-access-toggle=\""+u.id+"\">Toggle status</button> <button type=\"button\" class=\"edit-button\" data-access-delete=\""+u.id+"\">Delete</button></td></tr>";}).join(""):"<tr><td colspan=\"5\" class=\"muted\">No accounts added yet.</td></tr>";if(matrix)matrix.innerHTML=ROLE_PERMISSION_MATRIX.map(function(r){return "<tr><td>"+escapeHtml(r[0])+"</td><td>"+escapeHtml(r[1])+"</td><td>"+escapeHtml(r[2])+"</td></tr>";}).join("");}
  function addAccessUser(e){e.preventDefault();var name=byId("accessFullName").value.trim(),username=byId("accessUsername").value.trim().toLowerCase();if(!name||!username)return;if(accessUsers.some(function(u){return u.username.toLowerCase()===username;})){showToast("Ye username/email pehle se directory mein hai.");return;}accessUsers.unshift({id:"ACC-"+Date.now().toString(36),name:name,username:username,role:byId("accessRole").value,status:byId("accessStatus").value,notes:byId("accessNotes").value.trim(),createdAt:new Date().toISOString()});if(saveAccessUsers()){byId("accessUserForm").reset();renderAccessUsers();showToast("Account directory mein add ho gaya. Login abhi active nahi hai.");}}
  function handleAccessUserAction(e){var el=e.target;while(el&&el!==this){var del=el.getAttribute&&el.getAttribute("data-access-delete"),tog=el.getAttribute&&el.getAttribute("data-access-toggle");if(del){if(confirm("Is directory entry ko delete karein?")){accessUsers=accessUsers.filter(function(u){return u.id!==del;});saveAccessUsers();renderAccessUsers();}return;}if(tog){accessUsers=accessUsers.map(function(u){if(u.id===tog)u.status=u.status==="inactive"?"planned":"inactive";return u;});saveAccessUsers();renderAccessUsers();return;}el=el.parentNode;}}
  function downloadBackup() {
    var payload = { app: "Swat Model School Management System", version: 6, accessUsers: accessUsers, gateLogs: gateLogs, staffGateLogs: staffGateLogs, exportedAt: new Date().toISOString(), students: students, attendance: attendanceRecords, fees: feeRecords, exams: examRecords, staff: staffRecords, staffAttendance: staffAttendanceRecords, payroll: payrollRecords, expenses: expenseRecords, inventory: inventoryRecords, stockMovements: stockMovements, timetable: timetableRecords, parentNotices: parentNotices, teacherReviews: teacherReviews, boardNotices: boardNotices, schoolSettings: schoolSettings };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "Swat_Model_School_Backup_" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast("Backup downloaded. Keep it somewhere safe.");
  }
  function restoreBackup(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var list = Array.isArray(data) ? data : data.students;
        if (!Array.isArray(list)) throw new Error("Invalid backup");
        for (var i=0; i<list.length; i++) {
          var s=list[i];
          if (!s || typeof s.id !== "string" || typeof s.name !== "string" || typeof s.studentClass !== "string" || (s.campus !== "girls" && s.campus !== "boys")) throw new Error("Invalid student record");
        }
        if (!window.confirm("Restore " + list.length + " student record(s)? This will replace the records currently stored in this browser.")) return;
        var old = students, oldAttendance = attendanceRecords; students = list;
        attendanceRecords = Array.isArray(data.attendance) ? data.attendance : [];
        var oldGateLogs=gateLogs, oldStaffGateLogs=staffGateLogs; gateLogs=Array.isArray(data.gateLogs)?data.gateLogs:[]; staffGateLogs=Array.isArray(data.staffGateLogs)?data.staffGateLogs:[];
        var oldFees = feeRecords; feeRecords = Array.isArray(data.fees) ? data.fees : [];
        var oldExams = examRecords; examRecords = Array.isArray(data.exams) ? data.exams : [];
        var oldStaff = staffRecords, oldStaffAttendance = staffAttendanceRecords, oldPayroll = payrollRecords, oldExpenses = expenseRecords, oldInventory = inventoryRecords, oldMovements = stockMovements, oldTimetable = timetableRecords, oldParentNotices = parentNotices, oldTeacherReviews = teacherReviews, oldBoardNotices = boardNotices;
        staffRecords = Array.isArray(data.staff) ? data.staff : []; staffAttendanceRecords = Array.isArray(data.staffAttendance) ? data.staffAttendance : []; payrollRecords = Array.isArray(data.payroll) ? data.payroll : []; expenseRecords = Array.isArray(data.expenses) ? data.expenses : []; inventoryRecords = Array.isArray(data.inventory) ? data.inventory : []; stockMovements = Array.isArray(data.stockMovements) ? data.stockMovements : []; timetableRecords = Array.isArray(data.timetable) ? data.timetable : []; parentNotices = Array.isArray(data.parentNotices) ? data.parentNotices : []; teacherReviews = Array.isArray(data.teacherReviews) ? data.teacherReviews : []; boardNotices = Array.isArray(data.boardNotices) ? data.boardNotices : []; schoolSettings = data.schoolSettings && typeof data.schoolSettings === "object" ? data.schoolSettings : {}; accessUsers = Array.isArray(data.accessUsers) ? data.accessUsers : []; saveAccessUsers();
        if (!saveStudents()) { students = old; attendanceRecords = oldAttendance; feeRecords = oldFees; examRecords = oldExams; staffRecords = oldStaff; staffAttendanceRecords = oldStaffAttendance; payrollRecords = oldPayroll; expenseRecords = oldExpenses; inventoryRecords = oldInventory; stockMovements = oldMovements; timetableRecords = oldTimetable; return; }
        saveAttendance(); saveGateLogs(); saveStaffGateLogs(); saveFees(); saveExams(); saveStaff(); saveStaffAttendance(); savePayroll(); saveExpenses(); saveInventory(); saveMovements(); saveTimetable(); saveParentNotices(); saveTeacherReviews(); saveBoardNotices(); saveSchoolSettings(); renderStudents(); renderAttendance(); renderGateLogs(); renderFees(); renderResults(); renderStaffModule(); renderTimetableModule(); showToast("Backup restored successfully.");
      } catch (e) { showToast("Backup file is not valid for this software."); }
    };
    reader.readAsText(file);
  }

  function buildCloudSnapshotPayload() {
    return { app:"Swat Model School Management System", schemaVersion:1, snapshotType:"local-browser-full-backup", exportedAt:new Date().toISOString(), sourceUserId:authenticatedUser?authenticatedUser.id:null, students:students, attendance:attendanceRecords, gateLogs:gateLogs, staffGateLogs:staffGateLogs, fees:feeRecords, exams:examRecords, staff:staffRecords, staffAttendance:staffAttendanceRecords, payroll:payrollRecords, expenses:expenseRecords, inventory:inventoryRecords, stockMovements:stockMovements, timetable:timetableRecords, parentNotices:parentNotices, teacherReviews:teacherReviews, boardNotices:boardNotices, accessUsers:accessUsers, schoolSettings:schoolSettings };
  }
  // Phase 24: deliberate, user-triggered module sync. One primary row per module
  // avoids changing the existing app record formats while moving data to Supabase.
  var CLOUD_MODULES = [
    {table:"school_students", key:STORAGE_KEY, label:"Students", kind:"array"},
    {table:"school_student_attendance", key:ATTENDANCE_KEY, label:"Student attendance", kind:"array"},
    {table:"school_student_gate_logs", key:GATE_LOG_KEY, label:"Student gate logs", kind:"array"},
    {table:"school_staff_gate_logs", key:STAFF_GATE_LOG_KEY, label:"Staff gate logs", kind:"array"},
    {table:"school_fee_records", key:FEES_KEY, label:"Fees", kind:"array"},
    {table:"school_exam_records", key:RESULTS_KEY, label:"Exams and results", kind:"array"},
    {table:"school_staff", key:STAFF_KEY, label:"Staff", kind:"array"},
    {table:"school_staff_attendance", key:STAFF_ATTENDANCE_KEY, label:"Staff attendance", kind:"array"},
    {table:"school_payroll_records", key:PAYROLL_KEY, label:"Payroll", kind:"array"},
    {table:"school_expense_records", key:EXPENSES_KEY, label:"Expenses", kind:"array"},
    {table:"school_inventory_records", key:INVENTORY_KEY, label:"Inventory", kind:"array"},
    {table:"school_stock_movements", key:MOVEMENTS_KEY, label:"Stock movements", kind:"array"},
    {table:"school_timetable_records", key:TIMETABLE_KEY, label:"Timetable", kind:"array"},
    {table:"school_parent_notices", key:PARENT_NOTICES_KEY, label:"Parent notices", kind:"array"},
    {table:"school_teacher_reviews", key:TEACHER_REVIEWS_KEY, label:"Teacher reviews", kind:"array"},
    {table:"school_board_notices", key:BOARD_NOTICES_KEY, label:"Digital notices", kind:"array"},
    {table:"school_settings_records", key:SETTINGS_KEY, label:"School settings", kind:"object", directorOnly:true}
  ];
  // Phase 26: automatic cloud saves for every module after successful sign-in.
  var automaticCloudTimers = {};
  var automaticCloudChannel = null;
  var automaticCloudReady = false;
  var originalStorageSetItem = null;
  function queueAutomaticModuleSave(module) {
    if (!automaticCloudReady || !supabaseClient || !authenticatedUser || !authenticatedRole || module.directorOnly && authenticatedRole !== "director") return;
    if (automaticCloudTimers[module.key]) window.clearTimeout(automaticCloudTimers[module.key]);
    automaticCloudTimers[module.key] = window.setTimeout(async function () {
      try {
        var localData = readLocalCloudModule(module);
        var payload = module.kind === "object" ? { value: localData } : { records: localData };
        var result = await supabaseClient.from(module.table).upsert({
          record_key: "primary", campus: null, record_data: payload,
          created_by: authenticatedUser.id, updated_by: authenticatedUser.id,
          updated_at: new Date().toISOString()
        }, { onConflict: "record_key" });
        if (result.error) throw result.error;
        setCloudSyncStatus("Automatic sync: " + module.label + " saved · " + new Date().toLocaleTimeString(), false);
      } catch (err) {
        setCloudSyncStatus("Automatic sync failed (" + module.label + "): " + (err.message || "Check internet/RLS"), true);
      }
    }, 1000);
  }
  function enableAutomaticCloudSaves() {
    if (automaticCloudReady || !supabaseClient || !authenticatedUser || !authenticatedRole) return;
    if (!originalStorageSetItem) originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      var result = originalStorageSetItem.call(this, key, value);
      if (this === window.localStorage) {
        var module = CLOUD_MODULES.find(function (m) { return m.key === key && m.table !== "school_students"; });
        if (module) queueAutomaticModuleSave(module);
      }
      return result;
    };
    automaticCloudReady = true;
    setCloudSyncStatus("Automatic cloud sync is active for module changes.", false);
  }
  function enableRealtimeModuleNotifications() {
    if (!supabaseClient || !authenticatedUser || !authenticatedRole || automaticCloudChannel) return;
    automaticCloudChannel = supabaseClient.channel("sms-live-module-updates-" + authenticatedUser.id);
    CLOUD_MODULES.forEach(function (module) {
      if (module.directorOnly && authenticatedRole !== "director") return;
      automaticCloudChannel.on("postgres_changes", { event: "UPDATE", schema: "public", table: module.table, filter: "record_key=eq.primary" }, function (payload) {
        if (payload && payload.new && payload.new.updated_by && payload.new.updated_by !== authenticatedUser.id) {
          // Refresh the current browser copy when another account changes a module.
          // Reload ensures all existing module renderers re-read their local storage safely.
          setCloudSyncStatus("Another school user updated " + module.label + ". Updating this screen…", false);
          window.setTimeout(function () { window.location.reload(); }, 1200);
        }
      });
    });
    automaticCloudChannel.subscribe(function (status) {
      if (status === "SUBSCRIBED") setCloudSyncStatus("Automatic sync active · live updates connected.", false);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setCloudSyncStatus("Automatic saves are enabled; live updates are reconnecting.", true);
    });
  }

  function readLocalCloudModule(module) {
    var raw=localStorage.getItem(module.key);
    if(module.kind==="object") { var obj=raw?JSON.parse(raw):{}; return obj&&typeof obj==="object"&&!Array.isArray(obj)?obj:{}; }
    var arr=raw?JSON.parse(raw):[];
    if(!Array.isArray(arr)) throw new Error(module.label+" ka local data valid list nahi hai.");
    return arr;
  }
  function setCloudSyncStatus(message, isError) {
    var el=byId("cloudSyncStatus"); if(el){el.textContent=message;el.style.color=isError?"#b42318":"";}
  }
  async function pushLocalModulesToCloud() {
    var btn=byId("cloudPushBtn");
    if(!supabaseClient||!authenticatedUser||!authenticatedRole){setCloudSyncStatus("Pehle active Admin/Director account se login karein.",true);return;}
    if(!window.confirm("Is device ka current data Supabase mein upload hoga. Cloud par har module ka purana record replace hoga. Pehle Settings se Full Backup (JSON) download karein. Kya aap continue karna chahte hain?"))return;
    if(btn){btn.disabled=true;btn.textContent="Uploading...";}
    setCloudSyncStatus("Cloud par modules upload ho rahe hain. Page band na karein...");
    try {
      var count=0, skipped=[];
      for(var i=0;i<CLOUD_MODULES.length;i++){
        var m=CLOUD_MODULES[i];
        if(m.directorOnly && authenticatedRole!=="director"){skipped.push(m.label);continue;}
        var localData=readLocalCloudModule(m);
        var payload=m.kind==="object"?{value:localData}:{records:localData};
        var result=await supabaseClient.from(m.table).upsert({record_key:"primary",campus:null,record_data:payload,created_by:authenticatedUser.id,updated_by:authenticatedUser.id,updated_at:new Date().toISOString()},{onConflict:"record_key"});
        if(result.error)throw new Error(m.label+": "+result.error.message);
        count++;
      }
      setCloudSyncStatus(count+" module(s) cloud par upload ho gaye."+(skipped.length?" Settings Director account se sync hongi.":"")+" Time: "+new Date().toLocaleString()+". Ye manual sync hai, automatic nahi.");
      showToast("Cloud upload complete.");
    } catch(err) {setCloudSyncStatus("Upload ruk gaya: "+(err.message||"Unknown error")+". Partial upload ho sakta hai; error fix karke dobara sync karein.",true);showToast("Cloud upload complete nahi hua.");}
    finally {if(btn){btn.disabled=false;btn.textContent="Upload This Device Data to Cloud";}}
  }
  async function pullCloudModulesToDevice() {
    var btn=byId("cloudPullBtn");
    if(!supabaseClient||!authenticatedUser||!authenticatedRole){setCloudSyncStatus("Pehle active Admin/Director account se login karein.",true);return;}
    if(!window.confirm("Cloud ka data is browser ke local records ko replace karega. Agar cloud table empty hui to us module ka local data waise hi rahega. Pehle Full Backup (JSON) download karein. Kya aap continue karna chahte hain?"))return;
    if(btn){btn.disabled=true;btn.textContent="Downloading...";}
    setCloudSyncStatus("Supabase se module data download ho raha hai...");
    try {
      var updates=[], found=0;
      for(var i=0;i<CLOUD_MODULES.length;i++){
        var m=CLOUD_MODULES[i];
        if(m.directorOnly && authenticatedRole!=="director")continue;
        var result=await supabaseClient.from(m.table).select("record_data").eq("record_key","primary").maybeSingle();
        if(result.error)throw new Error(m.label+": "+result.error.message);
        if(!result.data)continue;
        var data=result.data.record_data;
        if(m.kind==="object"){
          if(!data||!data.value||typeof data.value!=="object"||Array.isArray(data.value))throw new Error(m.label+" cloud format valid nahi.");
          updates.push({key:m.key,value:JSON.stringify(data.value)});
        } else {
          if(!data||!Array.isArray(data.records))throw new Error(m.label+" cloud format valid nahi.");
          updates.push({key:m.key,value:JSON.stringify(data.records)});
        }
        found++;
      }
      updates.forEach(function(item){localStorage.setItem(item.key,item.value);});
      if(found){setCloudSyncStatus(found+" module(s) cloud se is device par load ho gaye. App ab refresh ho rahi hai...");showToast("Cloud data downloaded.");setTimeout(function(){window.location.reload();},700);}
      else {setCloudSyncStatus("Cloud mein abhi koi module data upload nahi. Local data change nahi kiya.");showToast("Cloud tables mein abhi data nahi mila.");}
    } catch(err) {setCloudSyncStatus("Download ruk gaya: "+(err.message||"Unknown error")+". Local data tabdeel nahi kiya gaya.",true);showToast("Cloud download nahi ho saka.");}
    finally {if(btn){btn.disabled=false;btn.textContent="Download Cloud Data to This Device";}}
  }

  function previewCloudMigration() {
    var data=buildCloudSnapshotPayload(), box=byId("cloudMigrationCounts"); if(!box)return;
    var fields=[["Students",data.students],["Student attendance",data.attendance],["Student gate logs",data.gateLogs],["Staff gate logs",data.staffGateLogs],["Fee accounts",data.fees],["Exams",data.exams],["Staff",data.staff],["Staff attendance",data.staffAttendance],["Payroll",data.payroll],["Expenses",data.expenses],["Inventory items",data.inventory],["Stock movements",data.stockMovements],["Timetable entries",data.timetable],["Parent notices",data.parentNotices],["Teacher reviews",data.teacherReviews],["Digital notices",data.boardNotices]];
    box.textContent=fields.map(function(x){return x[0]+": "+(Array.isArray(x[1])?x[1].length:0);}).join(" · ");
    if(byId("cloudMigrationStatus"))byId("cloudMigrationStatus").textContent="Local data preview ready. Download a JSON backup before uploading.";
  }
  async function uploadLocalSnapshotToCloud() {
    var status=byId("cloudMigrationStatus"),btn=byId("uploadCloudSnapshotBtn");
    if(!supabaseClient||!authenticatedUser||!authenticatedRole){if(status)status.textContent="Please sign in with an active school account first.";return;}
    if(!window.confirm("Cloud par aik protected school snapshot upload hoga. Agar pehle snapshot maujood hai to woh replace ho jayega. Kya aapne JSON backup download kar liya hai?"))return;
    if(btn){btn.disabled=true;btn.textContent="Uploading...";} if(status)status.textContent="Supabase par data upload ho raha hai...";
    try {
      var result=await supabaseClient.from("school_data_snapshots").upsert({school_key:"swat-model-school",payload:buildCloudSnapshotPayload(),updated_by:authenticatedUser.id,updated_at:new Date().toISOString()},{onConflict:"school_key"});
      if(result.error)throw result.error;
      if(status)status.textContent="Cloud snapshot successfully uploaded at "+new Date().toLocaleString()+". Ye backup/migration staging hai, live sync nahi.";
      showToast("Cloud snapshot successfully upload ho gaya.");
    } catch(err) {if(status)status.textContent="Upload failed: "+(err&&err.message?err.message:"Unknown error")+". Phase 22 SQL aur RLS policies check karein.";showToast("Cloud upload nahi ho saka. Error Settings mein dekhein.");}
    finally {if(btn){btn.disabled=false;btn.textContent="Upload Current Data to Cloud";}}
  }

  function localDateString() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
  function loadGateLogs() { try { var raw = localStorage.getItem(GATE_LOG_KEY); gateLogs = raw ? JSON.parse(raw) : []; if (!Array.isArray(gateLogs)) gateLogs = []; } catch(e) { gateLogs = []; } try { var sr=localStorage.getItem(STAFF_GATE_LOG_KEY); staffGateLogs=sr?JSON.parse(sr):[]; if(!Array.isArray(staffGateLogs))staffGateLogs=[]; } catch(e){staffGateLogs=[];} }
  function saveStaffGateLogs(){try{localStorage.setItem(STAFF_GATE_LOG_KEY,JSON.stringify(staffGateLogs));return true;}catch(e){showToast("Teacher gate log save nahi hua.");return false;}}
  function saveGateLogs() { try { localStorage.setItem(GATE_LOG_KEY, JSON.stringify(gateLogs)); return true; } catch(e) { showToast("Gate log save nahi hua. Storage check karein."); return false; } }
  function loadAttendance() {
    try { var raw = localStorage.getItem(ATTENDANCE_KEY); attendanceRecords = raw ? JSON.parse(raw) : []; if (!Array.isArray(attendanceRecords)) attendanceRecords = []; }
    catch (e) { attendanceRecords = []; }
  }
  function saveAttendance() {
    try { localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendanceRecords)); return true; }
    catch (e) { showToast("Attendance save nahi hui. Browser storage check karein."); return false; }
  }
  function selectedAttendanceDate() { return byId("attendanceDate").value || localDateString(); }
  function campusVisible(s) { return currentCampus === "all" || s.campus === currentCampus; }
  function findStudentByCode(value) {
    var clean = String(value || "").trim(), token = clean;
    if (clean.indexOf("SWAT-MODEL-SCHOOL|") === 0) token = clean.split("|").slice(1).join("|");
    for (var i=0; i<students.length; i++) if (students[i].id.toLowerCase() === clean.toLowerCase() || students[i].qrToken === token) return students[i];
    return null;
  }
  function recordAttendance(student, status) {
    if (!student) { attendanceMessage("Student nahi mila. Student ID ya sahi QR code check karein.", "error"); return false; }
    var date = selectedAttendanceDate(), now = new Date(), time = now.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    var existing = null;
    for (var i=0; i<attendanceRecords.length; i++) if (attendanceRecords[i].studentId === student.id && attendanceRecords[i].date === date) { existing = attendanceRecords[i]; break; }
    var item = { studentId: student.id, date: date, status: status, time: time, studentName: student.name, studentClass: student.studentClass, campus: student.campus };
    if (existing) { existing.status = status; existing.time = time; existing.studentName = student.name; existing.studentClass = student.studentClass; existing.campus = student.campus; }
    else attendanceRecords.push(item);
    if (!saveAttendance()) return false;
    attendanceMessage(student.name + " — " + status.toUpperCase() + " mark ho gaya.", "success");
    renderAttendance(); return true;
  }
  function attendanceMessage(message, type) {
    var el = byId("attendanceScanMessage"); if (!el) return;
    el.textContent = message; el.className = "attendance-message " + (type || "");
  }
  function renderAttendance() {
    if (!byId("attendancePage")) return;
    var date = selectedAttendanceDate(), cls = byId("attendanceClassFilter").value || "all";
    var visible = students.filter(function(s){ return campusVisible(s) && (cls === "all" || s.studentClass === cls); });
    var daily = attendanceRecords.filter(function(r){ return r.date === date && visible.some(function(s){return s.id === r.studentId;}); });
    var counts = {present:0, absent:0, leave:0};
    daily.forEach(function(r){ if (counts[r.status] !== undefined) counts[r.status]++; });
    byId("attPresentCount").textContent = counts.present; byId("attAbsentCount").textContent = counts.absent;
    byId("attLeaveCount").textContent = counts.leave; byId("attTotalCount").textContent = visible.length;
    var options = '<option value="">Select student</option>';
    visible.forEach(function(s){ options += '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name + " — " + s.id + " — " + s.studentClass) + '</option>'; });
    byId("attendanceStudentSelect").innerHTML = options;
    var html = "";
    daily.sort(function(a,b){return a.studentName.localeCompare(b.studentName);}).forEach(function(r){
      var status = r.status || "present";
      html += "<tr><td>"+escapeHtml(r.studentId)+"</td><td><strong>"+escapeHtml(r.studentName)+"</strong></td><td>"+escapeHtml(r.studentClass)+"</td><td>"+escapeHtml(campusName(r.campus))+"</td><td><span class='attendance-status "+escapeHtml(status)+"'>"+escapeHtml(status.toUpperCase())+"</span></td><td>"+escapeHtml(r.time || "—")+"</td><td><button class='edit-button' data-att-edit='"+escapeHtml(r.studentId)+"'>Change</button></td></tr>";
    });
    byId("attendanceTableBody").innerHTML = html;
    byId("attendanceEmpty").style.display = daily.length ? "none" : "block";
    byId("attendanceTableBody").parentNode.style.display = daily.length ? "table" : "none";
  }
  function markFromManual() {
    var code = byId("attendanceStudentSelect").value;
    var student = students.find(function(s){return s.id === code;});
    if (!student) { attendanceMessage("Pehle student select karein.", "error"); return; }
    recordAttendance(student, byId("attendanceStatusSelect").value);
  }
  function recordGateEvent(student, action) {
    var date=localDateString(), now=new Date(), stamp=now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
    var today=gateLogs.filter(function(x){return x.studentId===student.id && x.date===date;});
    var hasIn=today.some(function(x){return x.action==="IN";}), hasOut=today.some(function(x){return x.action==="OUT";});
    if(action==="IN" && hasIn && !hasOut){attendanceMessage(student.name+" ki entry pehle hi record hai.","error");return false;}
    if(action==="OUT" && (!hasIn || hasOut)){attendanceMessage(!hasIn?"Pehle gate entry (IN) record karein.":"Aaj ka gate exit pehle hi record ho chuka hai.","error");return false;}
    gateLogs.push({id:"GATE-"+Date.now()+"-"+Math.floor(Math.random()*1000),studentId:student.id,studentName:student.name,studentClass:student.studentClass,campus:student.campus,date:date,time:stamp,action:action});
    if(!saveGateLogs()) return false;
    if(action==="IN") recordAttendance(student,"present");
    attendanceMessage(student.name+" — Gate "+(action==="IN"?"ENTRY":"EXIT")+" recorded at "+stamp,"success");
    renderGateLogs(); return true;
  }
  function renderGateLogs(){
    if(!byId("gateLogBody")) return;
    var date=selectedAttendanceDate(), rows=gateLogs.filter(function(x){return x.date===date && (currentCampus==="all"||x.campus===currentCampus);}).sort(function(a,b){return b.time.localeCompare(a.time);});
    var ins=rows.filter(function(x){return x.action==="IN";}).length, outs=rows.filter(function(x){return x.action==="OUT";}).length;
    var inside=students.filter(function(st){var ev=gateLogs.filter(function(x){return x.studentId===st.id&&x.date===date;}).sort(function(a,b){return a.time.localeCompare(b.time);});return ev.length&&ev[ev.length-1].action==="IN";}).length;
    byId("gateEntryCount").textContent=ins;byId("gateExitCount").textContent=outs;byId("gateInsideCount").textContent=inside;byId("gateNoExitCount").textContent=Math.max(0,ins-outs);
    byId("gateLogBody").innerHTML=rows.map(function(x){return "<tr><td>"+escapeHtml(x.time)+"</td><td><strong>"+escapeHtml(x.studentName)+"</strong><small>"+escapeHtml(x.studentId)+"</small></td><td>"+escapeHtml(x.studentClass)+"</td><td>"+escapeHtml(campusName(x.campus))+"</td><td><span class='attendance-status "+(x.action==="IN"?"present":"leave")+"'>"+x.action+"</span></td></tr>";}).join("");
    byId("gateLogEmpty").style.display=rows.length?"none":"block";
  }
  function recordStaffGateEvent(staff, action) {
    var date=localDateString(), now=new Date(), stamp=now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
    var today=staffGateLogs.filter(function(x){return x.staffId===staff.id&&x.date===date;});
    var hasIn=today.some(function(x){return x.action==="IN";}), hasOut=today.some(function(x){return x.action==="OUT";});
    if(action==="IN"&&hasIn&&!hasOut){attendanceMessage(staff.name+" ki entry pehle hi record hai.","error");return false;}
    if(action==="OUT"&&(!hasIn||hasOut)){attendanceMessage(!hasIn?"Pehle teacher ki gate entry (IN) record karein.":"Aaj ka teacher gate exit pehle hi record ho chuka hai.","error");return false;}
    staffGateLogs.push({id:"STAFF-GATE-"+Date.now(),staffId:staff.id,staffName:staff.name,designation:staff.designation,campus:staff.campus,date:date,time:stamp,action:action});
    if(!saveStaffGateLogs())return false;
    var rec=staffAttendanceRecords.find(function(r){return r.staffId===staff.id&&r.date===date;});
    if(!rec){rec={staffId:staff.id,staffName:staff.name,date:date,status:"Present",note:"QR gate entry at "+stamp};staffAttendanceRecords.push(rec);} else {rec.status="Present";rec.note=(rec.note?rec.note+" | ":"")+"QR gate "+action+" at "+stamp;}
    saveStaffAttendance(); renderStaffAttendance(); renderStaffGateLogs();
    attendanceMessage(staff.name+" — Teacher gate "+(action==="IN"?"ENTRY":"EXIT")+" recorded at "+stamp,"success");return true;
  }
  function renderStaffGateLogs(){
    var body=byId("staffGateLogBody");if(!body)return;
    var date=selectedAttendanceDate(),rows=staffGateLogs.filter(function(x){return x.date===date&&(currentCampus==="all"||x.campus===currentCampus||x.campus==="both");}).sort(function(a,b){return b.time.localeCompare(a.time);});
    body.innerHTML=rows.map(function(x){return "<tr><td>"+escapeHtml(x.time)+"</td><td><b>"+escapeHtml(x.staffName)+"</b><small>"+escapeHtml(x.staffId)+"</small></td><td>"+escapeHtml(x.designation||"Staff")+"</td><td>"+escapeHtml(x.campus==="both"?"Both Campuses":campusName(x.campus))+"</td><td>"+escapeHtml(x.action)+"</td></tr>";}).join("");
    byId("staffGateLogEmpty").style.display=rows.length?"none":"block";byId("staffGateLogCount").textContent=rows.length;
  }
  function markFromQr(value) {
    var raw=String(value||"").trim(), mode=byId("qrActionMode")?byId("qrActionMode").value:"attendance";
    var staffCode=raw.indexOf("SWAT-MODEL-SCHOOL-STAFF|")===0?raw.split("|").pop():raw;
    if(mode==="staffEntry"||mode==="staffExit"){
      var staff=staffRecords.find(function(x){return x.id===staffCode&&x.status==="Active";});
      if(!staff){attendanceMessage("Teacher/Staff QR ya Staff ID registered active staff ka nahi hai.","error");return;}
      if(currentCampus!=="all"&&staff.campus!==currentCampus&&staff.campus!=="both"){attendanceMessage("Ye staff selected campus ka nahi. Campus filter All karein.","error");return;}
      recordStaffGateEvent(staff,mode==="staffEntry"?"IN":"OUT");byId("manualAttendanceInput").value="";return;
    }
    var student = findStudentByCode(raw);
    if (!student) { attendanceMessage("QR code kisi registered student ka nahi hai.", "error"); return; }
    if (!campusVisible(student)) { attendanceMessage("Ye student selected campus mein nahi hai. Campus filter All karein.", "error"); return; }
    if(mode==="entry") recordGateEvent(student,"IN"); else if(mode==="exit") recordGateEvent(student,"OUT"); else recordAttendance(student,"present");
    byId("manualAttendanceInput").value = "";
  }
  function startQrScanner() {
    if (scannerRunning) return;
    if (typeof Html5Qrcode === "undefined") { attendanceMessage("QR scanner library load nahi hui. Internet check karein ya manual option use karein.", "error"); return; }
    qrScanner = new Html5Qrcode("qrReader");
    qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: {width:220,height:220} }, function(decodedText){ markFromQr(decodedText); }, function() {})
      .then(function(){ scannerRunning = true; byId("startScannerBtn").disabled = true; byId("stopScannerBtn").disabled = false; attendanceMessage("Camera scanner active hai. Student QR card scan karein.", "success"); })
      .catch(function(err){ attendanceMessage("Camera start nahi hua. Browser permission aur localhost/HTTPS check karein. Manual option bhi available hai.", "error"); });
  }
  function stopQrScanner() {
    if (!qrScanner || !scannerRunning) return;
    qrScanner.stop().then(function(){ qrScanner.clear(); scannerRunning = false; byId("startScannerBtn").disabled = false; byId("stopScannerBtn").disabled = true; attendanceMessage("Camera scanner band kar diya gaya.", ""); }).catch(function(){ scannerRunning = false; byId("startScannerBtn").disabled = false; byId("stopScannerBtn").disabled = true; });
  }
  function exportAttendanceCsv() {
    var date = selectedAttendanceDate();
    var rows = [["Date","Student ID","Student Name","Class","Campus","Status","Time"]];
    attendanceRecords.filter(function(r){return r.date === date;}).forEach(function(r){ rows.push([r.date,r.studentId,r.studentName,r.studentClass,campusName(r.campus),r.status,r.time]); });
    var csv = rows.map(function(row){return row.map(function(v){return '"'+String(v == null ? "" : v).replace(/"/g,'""')+'"';}).join(",");}).join("\r\n");
    var blob = new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=url; a.download="SMS_Attendance_"+date+".csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function loadFees() {
    try { var raw = localStorage.getItem(FEES_KEY); feeRecords = raw ? JSON.parse(raw) : []; if (!Array.isArray(feeRecords)) feeRecords = []; feeRecords.forEach(function(r){ if(r.transport==null)r.transport=0; if(r.examination==null)r.examination=0; if(r.promotion==null)r.promotion=0; }); }
    catch (e) { feeRecords = []; }
  }
  function saveFees() {
    try { localStorage.setItem(FEES_KEY, JSON.stringify(feeRecords)); return true; }
    catch (e) { showToast("Fee record save nahi hua. Browser storage check karein."); return false; }
  }
  function money(value) { return "Rs. " + Number(value || 0).toLocaleString("en-PK", {maximumFractionDigits:0}); }
  function feeStatus(record) { return record.paid >= record.net ? "paid" : record.paid > 0 ? "partial" : "unpaid"; }
  function feeMonthLabel(value) {
    if (!value) return "—";
    var parts = value.split("-");
    return new Date(Number(parts[0]), Number(parts[1])-1, 1).toLocaleDateString("en-PK", {month:"short", year:"numeric"});
  }
  function renderFees() {
    if (!byId("feesPage")) return;
    var select = '<option value="">Select student</option>';
    students.filter(campusVisible).sort(function(a,b){return a.name.localeCompare(b.name);}).forEach(function(s){
      select += '<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name+' — '+s.id+' — '+s.studentClass+' — '+campusName(s.campus))+'</option>';
    });
    var oldSelected = byId("feeStudent").value;
    byId("feeStudent").innerHTML = select;
    if (students.some(function(s){return s.id===oldSelected && campusVisible(s);})) byId("feeStudent").value = oldSelected;
    var q=(byId("feeSearch").value||"").toLowerCase(), month=byId("feeMonthFilter").value||"all", status=byId("feeStatusFilter").value||"all";
    var visible=feeRecords.filter(function(r){
      var student=students.find(function(s){return s.id===r.studentId;});
      var campusMatch=currentCampus==="all" || (student ? student.campus===currentCampus : r.campus===currentCampus);
      var text=[r.studentName,r.studentId,r.studentClass,campusName(r.campus)].join(" ").toLowerCase();
      return campusMatch && (month==="all" || r.month===month) && (status==="all" || feeStatus(r)===status) && text.indexOf(q)!==-1;
    }).sort(function(a,b){return b.month.localeCompare(a.month)||a.studentName.localeCompare(b.studentName);});
    var totalCharged=0,totalPaid=0,totalDue=0,totalPayments=0;
    feeRecords.forEach(function(r){
      var student=students.find(function(s){return s.id===r.studentId;});
      if(currentCampus!=="all" && (student ? student.campus!==currentCampus : r.campus!==currentCampus)) return;
      totalCharged+=Number(r.net)||0; totalPaid+=Number(r.paid)||0; totalDue+=Math.max(0,(Number(r.net)||0)-(Number(r.paid)||0));
      totalPayments+=(r.payments||[]).length;
    });
    byId("feeChargedTotal").textContent=money(totalCharged); byId("feeCollectedTotal").textContent=money(totalPaid);
    byId("feeOutstandingTotal").textContent=money(totalDue); byId("feePaymentCount").textContent=String(totalPayments);
    var html="";
    visible.forEach(function(r){
      var st=feeStatus(r), balance=Math.max(0,r.net-r.paid);
      html+='<tr><td>'+escapeHtml(feeMonthLabel(r.month))+'</td><td><strong>'+escapeHtml(r.studentName)+'</strong><br><small>'+escapeHtml(r.studentId)+'</small></td><td>'+escapeHtml(r.studentClass)+'<br><small>'+escapeHtml(campusName(r.campus))+'</small></td><td>'+money(r.net)+'</td><td>'+money(r.paid)+'</td><td>'+money(balance)+'</td><td><span class="fee-status '+st+'">'+st.toUpperCase()+'</span></td><td><button class="edit-button" data-fee-receipt="'+escapeHtml(r.key)+'">Receipt</button></td></tr>';
    });
    byId("feeTableBody").innerHTML=html; byId("feeEmpty").style.display=visible.length?"none":"block";
    byId("feeTableBody").parentNode.style.display=visible.length?"table":"none";
  }
  function recoveryRows() {
    var month = byId("recoveryMonth").value || localDateString().slice(0,7);
    var cls = byId("recoveryClass").value || "all";
    var campus = byId("recoveryCampus").value || "all";
    var q = (byId("recoverySearch").value || "").toLowerCase();
    return feeRecords.filter(function(r) {
      var st = students.find(function(x){ return x.id === r.studentId; });
      var rowCampus = st ? st.campus : r.campus;
      var rowClass = st ? st.studentClass : r.studentClass;
      var balance = Math.max(0, (Number(r.net)||0) - (Number(r.paid)||0));
      var search = [r.studentName,r.studentId,rowClass,st && st.guardian,st && st.phone].join(" ").toLowerCase();
      return r.month === month && balance > 0 && (currentCampus === "all" || rowCampus === currentCampus) && (campus === "all" || rowCampus === campus) && (cls === "all" || rowClass === cls) && search.indexOf(q) !== -1;
    }).map(function(r){
      var st = students.find(function(x){ return x.id === r.studentId; });
      return {record:r,student:st,balance:Math.max(0,(Number(r.net)||0)-(Number(r.paid)||0)),campus:st?st.campus:r.campus,studentClass:st?st.studentClass:r.studentClass};
    }).sort(function(a,b){return b.balance-a.balance;});
  }
  function renderFeeRecovery() {
    if (!byId("feeRecoveryPage")) return;
    var month = byId("recoveryMonth").value || localDateString().slice(0,7);
    var cls = byId("recoveryClass").value || "all", campus = byId("recoveryCampus").value || "all";
    var q = (byId("recoverySearch").value || "").toLowerCase();
    var accounts = feeRecords.filter(function(r){
      var st=students.find(function(x){return x.id===r.studentId;}), cp=st?st.campus:r.campus, cl=st?st.studentClass:r.studentClass;
      return r.month===month && (currentCampus==="all" || cp===currentCampus) && (campus==="all" || cp===campus) && (cls==="all" || cl===cls);
    });
    var demand=0, received=0;
    accounts.forEach(function(r){demand+=Number(r.net)||0;received+=Number(r.paid)||0;});
    var outstanding=Math.max(0,demand-received), rate=demand>0?Math.min(100,received/demand*100):0;
    byId("recoveryDemand").textContent=money(demand); byId("recoveryReceived").textContent=money(received); byId("recoveryOutstanding").textContent=money(outstanding); byId("recoveryRate").textContent=rate.toFixed(1)+"%";
    byId("recoveryProgressBar").style.width=rate+"%"; byId("recoveryProgressLabel").textContent=rate.toFixed(1)+"% recovered";
    byId("recoveryProgressNote").textContent=accounts.length+" fee accounts generated for "+feeMonthLabel(month)+". Outstanding accounts: "+accounts.filter(function(r){return Number(r.net)>Number(r.paid);}).length+".";
    var rows=recoveryRows(), html="";
    rows.forEach(function(x){
      var r=x.record, st=x.student, phone=st&&st.phone?String(st.phone).replace(/[^0-9]/g,""):"", guardian=st&&st.guardian?st.guardian:"—";
      var msg="Assalam-o-Alaikum. SWAT MODEL SCHOOL, DARMAI, SWAT ki taraf se yaad-dihani hai ke "+r.studentName+" ("+r.studentClass+") ki "+feeMonthLabel(r.month)+" ki fee mein Rs. "+x.balance.toLocaleString("en-PK")+" baqi hain. Meherbani farma kar school office se rabta karein. Shukriya.";
      var wa=phone?"https://wa.me/"+(phone.indexOf("0")===0?"92"+phone.slice(1):phone)+"?text="+encodeURIComponent(msg):"";
      html+="<tr><td><strong>"+escapeHtml(r.studentName)+"</strong><br><small>"+escapeHtml(r.studentId)+"</small></td><td>"+escapeHtml(x.studentClass||"—")+"<br><small>"+escapeHtml(campusName(x.campus))+"</small></td><td>"+escapeHtml(guardian)+"<br><small>"+escapeHtml(st&&st.phone||"Phone not saved")+"</small></td><td>"+money(r.net)+"</td><td>"+money(r.paid)+"</td><td><strong>"+money(x.balance)+"</strong></td><td><span class='fee-status "+feeStatus(r)+"'>"+feeStatus(r).toUpperCase()+"</span></td><td>"+(wa?"<a class='edit-button' target='_blank' rel='noopener' href='"+wa+"'>WhatsApp</a>":"<small>Phone missing</small>")+"</td></tr>";
    });
    byId("recoveryTableBody").innerHTML=html; byId("recoveryEmpty").style.display=rows.length?"none":"block"; byId("recoveryTableBody").parentNode.style.display=rows.length?"table":"none";
  }
  function exportFeeRecoveryCsv(){
    var rows=recoveryRows(), data=[["Student","Student ID","Class","Campus","Guardian","Phone","Month","Fee","Paid","Balance"]];
    rows.forEach(function(x){data.push([x.record.studentName,x.record.studentId,x.studentClass,campusName(x.campus),x.student&&x.student.guardian||"",x.student&&x.student.phone||"",x.record.month,x.record.net,x.record.paid,x.balance]);});
    var csv=data.map(function(row){return row.map(function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';}).join(",");}).join("\r\n");
    var blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="SMS_Fee_Recovery_"+(byId("recoveryMonth").value||localDateString().slice(0,7))+".csv";a.click();URL.revokeObjectURL(url);
  }
  function printFeeRecoveryReport(){
    var rows=recoveryRows(), month=byId("recoveryMonth").value||localDateString().slice(0,7),w=window.open("","_blank","width=1000,height=750");
    if(!w){showToast("Print report ke liye browser pop-up allow karein.");return;}
    var html="<h1>SWAT MODEL SCHOOL, DARMAI, SWAT</h1><h2>Fee Recovery Report — "+escapeHtml(feeMonthLabel(month))+"</h2><p>Campus: "+escapeHtml(byId("recoveryCampus").value)+" | Class: "+escapeHtml(byId("recoveryClass").value)+"</p><table border='1' cellspacing='0' cellpadding='7' width='100%'><tr><th>Student</th><th>ID</th><th>Class</th><th>Fee</th><th>Paid</th><th>Balance</th></tr>";
    rows.forEach(function(x){html+="<tr><td>"+escapeHtml(x.record.studentName)+"</td><td>"+escapeHtml(x.record.studentId)+"</td><td>"+escapeHtml(x.studentClass)+"</td><td>"+money(x.record.net)+"</td><td>"+money(x.record.paid)+"</td><td>"+money(x.balance)+"</td></tr>";});
    html+="</table><p>Total defaulters: "+rows.length+"</p><script>window.onload=function(){window.print();};<\/script>";
    w.document.write("<!doctype html><html><head><title>Fee Recovery Report</title><style>body{font:14px Arial;padding:24px;color:#17233b}h1,h2{text-align:center}table{border-collapse:collapse;margin-top:20px}th{background:#edf0f8}</style></head><body>"+html+"</body></html>");w.document.close();
  }
  function loadExistingFeeAccount() {
    var sid=byId("feeStudent").value, month=byId("feeMonth").value;
    var rec=feeRecords.find(function(r){return r.studentId===sid && r.month===month;});
    if(rec){
      byId("feeBase").value=rec.base;
      byId("feeTransport").value=Number(rec.transport)||0;
      byId("feeExamination").value=Number(rec.examination)||0;
      byId("feePromotion").value=Number(rec.promotion)||0;
      byId("feeDiscount").value=rec.discount;
      byId("feeFine").value=rec.fine;
      showToast("Is month ka fee account mojood hai. Sirf payment amount enter karein.");
    } else {
      byId("feeBase").value="";
      byId("feeTransport").value="0";
      byId("feeExamination").value="0";
      byId("feePromotion").value="0";
      byId("feeDiscount").value="0";
      byId("feeFine").value="0";
    }
    byId("tpMonth").value=localDateString().slice(0,7);byId("tpReviewMonth").value=localDateString().slice(0,7);
    byId("tpMonth").onchange=renderTeacherPerformance;byId("tpCampus").onchange=renderTeacherPerformance;
    byId("saveTeacherReview").onclick=saveTeacherReview;byId("exportTeacherPerformance").onclick=exportTeacherPerformance;
    byId("tpReviewsBody").addEventListener("click",function(e){var id=e.target&&e.target.getAttribute("data-tpreview-delete");if(id&&confirm("Ye review note delete karna hai?")){teacherReviews=teacherReviews.filter(function(r){return r.id!==id;});if(saveTeacherReviews())renderTeacherReviews();}});
    updateFeePreview();
  }
  function updateFeePreview() {
    var base=Number(byId("feeBase").value)||0, transport=Number(byId("feeTransport").value)||0, examination=Number(byId("feeExamination").value)||0, promotion=Number(byId("feePromotion").value)||0, discount=Number(byId("feeDiscount").value)||0, fine=Number(byId("feeFine").value)||0;
    byId("feeNetPreview").textContent=money(Math.max(0,base+transport+examination+promotion-discount+fine));
  }
  function saveFeeEntry(event) {
    event.preventDefault();
    var student=students.find(function(s){return s.id===byId("feeStudent").value;});
    var month=byId("feeMonth").value, base=Number(byId("feeBase").value), transport=Number(byId("feeTransport").value)||0, examination=Number(byId("feeExamination").value)||0, promotion=Number(byId("feePromotion").value)||0, discount=Number(byId("feeDiscount").value)||0, fine=Number(byId("feeFine").value)||0, payment=Number(byId("feePayment").value), date=byId("feePaymentDate").value;
    if(!student || !month || !date || !Number.isFinite(base) || base<0 || transport<0 || examination<0 || promotion<0 || discount<0 || fine<0 || !Number.isFinite(payment) || payment<0){showToast("Please tamam required details sahi enter karein.");return;}
    if(discount>base+transport+examination+promotion){showToast("Discount total fees se zyada nahi ho sakta.");return;}
    var key=student.id+"|"+month, existing=feeRecords.find(function(r){return r.key===key;}), net=base+transport+examination+promotion-discount+fine;
    var feeSnapshot=JSON.stringify(feeRecords);
    if(existing){
      if(base!==Number(existing.base) || transport!==Number(existing.transport||0) || examination!==Number(existing.examination||0) || promotion!==Number(existing.promotion||0) || discount!==Number(existing.discount) || fine!==Number(existing.fine)) {showToast("Is month ka fee account pehle se bana hua hai. Existing fee amount change nahi kiya ja sakta; sirf payment add karein.");return;}
      if(payment<=0){showToast("Is month ki fee pehle se mojood hai. Nayi payment amount enter karein.");return;}
      if(existing.paid+payment>existing.net){showToast("Payment balance se zyada hai. Balance: "+money(existing.net-existing.paid));return;}
      existing.paid+=payment; existing.payments.push({amount:payment,date:date,method:byId("feeMethod").value,receiptNo:"SMS-R"+Date.now().toString().slice(-8)});
    } else {
      if(payment>net){showToast("Payment net fee se zyada nahi ho sakti.");return;}
      var rec={key:key,studentId:student.id,studentName:student.name,studentClass:student.studentClass,campus:student.campus,month:month,base:base,transport:transport,examination:examination,promotion:promotion,discount:discount,fine:fine,net:net,paid:payment,payments:[]};
      if(payment>0) rec.payments.push({amount:payment,date:date,method:byId("feeMethod").value,receiptNo:"SMS-R"+Date.now().toString().slice(-8)});
      feeRecords.push(rec); existing=rec;
    }
    if(!saveFees()){feeRecords=JSON.parse(feeSnapshot);return;}
    var latest=existing.payments.length?existing.payments[existing.payments.length-1]:null;
    byId("feeForm").reset(); byId("feePayment").value="0"; byId("feeMonth").value=localDateString().slice(0,7); byId("feePaymentDate").value=localDateString(); updateFeePreview();
    renderFees(); showToast("Fee account save ho gaya."+(latest?" Receipt: "+latest.receiptNo:""));
    if(latest) printFeeReceipt(existing,latest);
  }
  function printFeeReceipt(record,payment) {
    var w=window.open("","_blank","width=520,height=760");
    if(!w){showToast("Receipt print ke liye browser popup allow karein.");return;}
    var balance=Math.max(0,Number(record.net||0)-Number(record.paid||0));
    var student=students.find(function(s){return s.id===record.studentId;});
    var rows=[];
    function addFee(label,value){value=Number(value)||0;if(value>0)rows.push('<tr><td>'+escapeHtml(label)+'</td><td class="amount">'+money(value)+'</td></tr>');}
    addFee("Monthly Tuition Fee",record.base);
    addFee("Transport Fee",record.transport);
    addFee("Examination Fee",record.examination);
    addFee("Promotion Fee",record.promotion);
    addFee("Fine / Other Charges",record.fine);
    if(Number(record.discount)>0)rows.push('<tr class="discount"><td>Discount</td><td class="amount">− '+money(record.discount)+'</td></tr>');
    if(!rows.length)rows.push('<tr><td colspan="2" class="empty">No payable fee items recorded</td></tr>');
    var status=balance<=0?"PAID":Number(record.paid)>0?"PARTIAL":"UNPAID";
    var father=student?(student.fatherName||student.guardianName||""):"";
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Fee Receipt - '+escapeHtml(payment.receiptNo)+'</title><style>'+
      '@page{size:4in 6in;margin:0}*{box-sizing:border-box}html,body{width:4in;min-height:6in;margin:0;padding:0;background:#fff;color:#17243b;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.receipt{width:4in;min-height:6in;padding:.17in;border:1.5px solid #18365d;position:relative}.top{background:#18365d;color:#fff;text-align:center;padding:10px 7px 8px;border-bottom:4px solid #c49a43}.school{font-size:17px;font-weight:800;letter-spacing:.5px}.place{font-size:10px;font-weight:700;margin-top:2px;letter-spacing:1px}.tag{font-size:9px;margin-top:5px;color:#f4d995;letter-spacing:1.4px}.title{display:inline-block;background:#f3f6fa;color:#18365d;border:1px solid #c49a43;border-radius:3px;padding:4px 16px;margin-top:8px;font-size:12px;font-weight:800;letter-spacing:1px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;padding:8px 2px 6px;font-size:9px}.meta div{border-bottom:1px dotted #aab5c3;padding:3px 0}.meta b{color:#53647b}.student{background:#f1f5fa;border:1px solid #cbd5e1;border-left:4px solid #c49a43;border-radius:3px;padding:7px 8px;margin:2px 0 8px}.student small{display:block;font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px}.student strong{display:block;font-size:14px;color:#102d52;margin:2px 0 3px;overflow-wrap:anywhere}.student .sub{font-size:9px;color:#334155}.fees{width:100%;border-collapse:collapse;font-size:9px;margin-top:3px}.fees th{background:#18365d;color:#fff;padding:6px 5px;text-align:left}.fees th:last-child,.fees td.amount{text-align:right}.fees td{padding:5px;border:1px solid #cbd5e1}.fees tr:nth-child(even) td{background:#f7f9fc}.fees .discount td{color:#9a5a16;font-weight:700}.empty{text-align:center;color:#64748b}.totals{margin-top:7px;border:1px solid #cbd5e1;border-radius:3px;overflow:hidden;font-size:9px}.totalrow{display:flex;justify-content:space-between;padding:5px 7px;border-bottom:1px solid #dbe2ea}.totalrow:last-child{border:0}.totalrow.grand{background:#eaf0f8;color:#102d52;font-size:11px;font-weight:800}.totalrow.received{color:#166534;font-weight:700}.totalrow.balance{background:#fff7e6;font-weight:800}.status{text-align:center;margin:7px auto 2px;font-size:10px;font-weight:800;letter-spacing:1px;color:'+(status==='PAID'?'#166534':status==='PARTIAL'?'#9a5a16':'#b42318')+'}.payment{text-align:center;font-size:8px;color:#526176;margin:3px 0 7px}.signs{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;text-align:center;font-size:8px;color:#334155}.signs div{border-top:1px solid #526176;padding-top:4px}.note{text-align:center;border-top:1px dashed #aab5c3;padding-top:6px;margin-top:9px;font-size:7px;color:#64748b}.no-print{display:block}@media print{.no-print{display:none}html,body{width:4in;height:6in}.receipt{height:6in;min-height:6in;overflow:hidden}}@media screen{body{background:#e8edf3;padding:12px}.receipt{margin:auto;box-shadow:0 3px 14px #0002}}' +
      '</style></head><body><div class="receipt"><div class="top"><div class="school">SWAT MODEL SCHOOL</div><div class="place">DARMAI, SWAT</div><div class="tag">QUALITY EDUCATION • BRIGHTER FUTURE</div><div class="title">FEE PAYMENT RECEIPT</div></div>'+
      '<div class="meta"><div><b>Receipt No:</b> '+escapeHtml(payment.receiptNo)+'</div><div><b>Date:</b> '+escapeHtml(payment.date)+'</div><div><b>Fee Month:</b> '+escapeHtml(feeMonthLabel(record.month))+'</div><div><b>Method:</b> '+escapeHtml(payment.method)+'</div></div>'+
      '<div class="student"><small>Student Name</small><strong>'+escapeHtml(record.studentName)+'</strong><div class="sub">'+(father?'Father: '+escapeHtml(father)+' &nbsp; | &nbsp; ':'')+'ID: '+escapeHtml(record.studentId)+'</div><div class="sub">Class: '+escapeHtml(record.studentClass)+' &nbsp; | &nbsp; '+escapeHtml(campusName(record.campus))+'</div></div>'+
      '<table class="fees"><thead><tr><th>Fee Description</th><th>Amount (PKR)</th></tr></thead><tbody>'+rows.join('')+'</tbody></table>'+
      '<div class="totals"><div class="totalrow grand"><span>Total Payable</span><span>'+money(record.net)+'</span></div><div class="totalrow received"><span>Received Now</span><span>'+money(payment.amount)+'</span></div><div class="totalrow"><span>Total Paid</span><span>'+money(record.paid)+'</span></div><div class="totalrow balance"><span>Remaining Balance</span><span>'+money(balance)+'</span></div></div>'+
      '<div class="status">'+status+'</div><div class="payment">Please keep this receipt for your record.</div><div class="signs"><div>Received By / Accounts</div><div>Guardian Signature</div></div><div class="note">SWAT MODEL SCHOOL • DARMAI, SWAT</div></div><div class="no-print" style="text-align:center;margin:12px"><button onclick="window.print()">Print Receipt</button></div><script>window.onload=function(){window.print();};<\/script></body></html>');
    w.document.close();
  }
  function exportFeesCsv() {
    var rows=[["Month","Student ID","Student Name","Class","Campus","Monthly Tuition Fee","Transport Fee","Examination Fee","Promotion Fee","Discount","Fine / Other Charges","Net Fee","Total Paid","Balance","Status","Payment History"]];
    feeRecords.filter(function(r){return currentCampus==="all"||r.campus===currentCampus;}).forEach(function(r){
      var history=(r.payments||[]).map(function(p){return p.date+" "+p.amount+" "+p.method+" "+p.receiptNo;}).join(" | ");
      rows.push([r.month,r.studentId,r.studentName,r.studentClass,campusName(r.campus),r.base,r.transport||0,r.examination||0,r.promotion||0,r.discount,r.fine,r.net,r.paid,Math.max(0,r.net-r.paid),feeStatus(r),history]);
    });
    var csv=rows.map(function(row){return row.map(function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';}).join(",");}).join("\r\n");
    var blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="SMS_Fee_Report_"+localDateString()+".csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  function loadExams() {
    try {
      var raw=localStorage.getItem(RESULTS_KEY);
      examRecords=raw?JSON.parse(raw):[];
      if(!Array.isArray(examRecords)) examRecords=[];
      var changed=false;
      examRecords.forEach(function(ex){
        (ex.results||[]).forEach(function(result){
          var invalid=!result.studentId || String(result.studentId).toLowerCase()==="undefined" || String(result.studentId).toLowerCase()==="null";
          if(invalid){
            var matched=students.find(function(student){
              return String(student.name||"").trim().toLowerCase()===String(result.studentName||"").trim().toLowerCase()
                && String(student.studentClass||"").trim().toLowerCase()===String(result.studentClass||"").trim().toLowerCase()
                && String(student.campus||"").trim().toLowerCase()===String(result.campus||"").trim().toLowerCase();
            });
            if(matched){result.studentId=matched.id;changed=true;}
          }
        });
      });
      if(changed) saveExams();
    } catch(e){ examRecords=[]; }
  }
  function saveExams(){ try{localStorage.setItem(RESULTS_KEY,JSON.stringify(examRecords));return true;}catch(e){showToast("Results save nahi huay. Browser storage check karein.");return false;} }
  function populateExamSelectors(){
    var sel=byId("marksExam"), old=sel.value; sel.innerHTML='<option value="">Select examination</option>';
    examRecords.forEach(function(ex){var o=document.createElement("option");o.value=ex.id;o.textContent=ex.name+" — "+ex.studentClass+" / "+campusName(ex.campus)+" ("+ex.session+")";sel.appendChild(o);});
    if(examRecords.some(function(ex){return ex.id===old;})) sel.value=old;
    populateMarksStudents();
  }
  function selectedExam(){return examRecords.find(function(ex){return ex.id===byId("marksExam").value;})||null;}
  function populateMarksStudents(){
    var ex=selectedExam(),sel=byId("marksStudent"),old=sel.value;sel.innerHTML='<option value="">Select student</option>';
    if(ex) students.filter(function(s){return s.studentClass===ex.studentClass&&s.campus===ex.campus;}).sort(function(a,b){return a.name.localeCompare(b.name);}).forEach(function(s){var o=document.createElement("option");o.value=s.id;o.textContent=s.name+" — "+s.id;sel.appendChild(o);});
    if(ex&&students.some(function(s){return s.id===old&&s.studentClass===ex.studentClass&&s.campus===ex.campus;}))sel.value=old;
    renderMarksInputs();
  }
  function renderMarksInputs(){
    var ex=selectedExam(),studentId=byId("marksStudent").value,container=byId("marksInputs");
    if(!ex){container.innerHTML='<p class="attendance-help">Pehle examination create karein.</p>';return;}
    var existing=ex.results.find(function(r){return r.studentId===studentId;});
    var out='<div class="table-wrap"><table class="marks-table"><thead><tr><th>SUBJECT</th><th>MAX MARKS</th><th>OBTAINED MARKS</th></tr></thead><tbody>';
    ex.subjects.forEach(function(sub,i){var val=existing&&existing.marks[i]?existing.marks[i].obtained:"";out+='<tr><td>'+escapeHtml(sub.name)+'</td><td>'+sub.max+'</td><td><input class="subject-mark-input" data-mark-index="'+i+'" type="number" min="0" max="'+sub.max+'" step="0.5" value="'+escapeHtml(val)+'" placeholder="Marks"></td></tr>';});
    container.innerHTML=out+'</tbody></table></div>';
  }
  function createExam(e){
    e.preventDefault();var name=byId("examName").value.trim(),session=byId("examSession").value.trim(),cls=byId("examClass").value,campus=byId("examCampus").value,max=Number(byId("examMaxMarks").value),passing=Number(byId("examPassingPercent").value),subjects=byId("examSubjects").value.split(",").map(function(s){return s.trim();}).filter(Boolean);
    if(!name||!session||!cls||!subjects.length||!Number.isFinite(max)||max<=0||!Number.isFinite(passing)||passing<1||passing>100){showToast("Exam details aur passing percentage 1 se 100 ke darmiyan enter karein.");return;}
    var duplicate=examRecords.some(function(x){return x.name.toLowerCase()===name.toLowerCase()&&x.session===session&&x.studentClass===cls&&x.campus===campus;});if(duplicate){showToast("Is class aur campus ka ye exam pehle se bana hua hai.");return;}
    examRecords.push({id:"EX-"+Date.now(),name:name,session:session,studentClass:cls,campus:campus,date:byId("examDate").value||localDateString(),passingPercentage:passing,subjects:subjects.map(function(s){return {name:s,max:max};}),results:[]});
    if(!saveExams())return;byId("examForm").reset();byId("examMaxMarks").value="100";byId("examPassingPercent").value="33";populateExamSelectors();renderResults();showToast("Examination create ho gaya.");
  }
  function saveStudentMarks(){
    var ex=selectedExam(),sid=byId("marksStudent").value;if(!ex||!sid){showToast("Examination aur student select karein.");return;}
    var inputs=document.querySelectorAll(".subject-mark-input"),marks=[],valid=true,total=0,maxTotal=0;
    ex.subjects.forEach(function(sub,i){var inp=inputs[i],v=inp&&inp.value!==""?Number(inp.value):NaN;if(!Number.isFinite(v)||v<0||v>sub.max){valid=false;}marks.push({name:sub.name,max:sub.max,obtained:v});if(Number.isFinite(v))total+=v;maxTotal+=sub.max;});
    if(!valid){showToast("Har subject ke valid marks enter karein. Blank marks allowed nahi.");return;}
    var student=students.find(function(s){return s.id===sid;});if(!student)return;
    var record={studentId:sid,studentName:student.name,fatherName:student.guardian||"",studentClass:student.studentClass,campus:student.campus,marks:marks,total:total,maxTotal:maxTotal,percentage:maxTotal?total/maxTotal*100:0,savedAt:new Date().toISOString()};
    var idx=ex.results.findIndex(function(r){return r.studentId===sid;});if(idx>=0)ex.results[idx]=record;else ex.results.push(record);
    if(saveExams()){renderResults();showToast("Student marks save ho gaye.");}
  }
  function gradeFor(p){return p>=80?"A1":p>=70?"A":p>=60?"B":p>=50?"C":p>=40?"D":"F";}
  function resultStatus(r,ex){var required=ex&&Number.isFinite(Number(ex.passingPercentage))?Number(ex.passingPercentage):33;return Number(r.percentage||0)>=required?"PASS":"FAIL";}
  function rankedResults(ex){return ex.results.slice().sort(function(a,b){return b.percentage-a.percentage||b.total-a.total||a.studentName.localeCompare(b.studentName);});}
  function rankOf(ex,record){var sorted=rankedResults(ex),pos=1;for(var i=0;i<sorted.length;i++){if(sorted[i].studentId===record.studentId)return pos;if(i>0&&sorted[i].percentage<sorted[i-1].percentage)pos=i+1;}return "—";}
  function renderResults(){
    if(!byId("resultsTableBody"))return;var q=(byId("resultSearch").value||"").toLowerCase(),rows="",all=[];
    examRecords.forEach(function(ex){rankedResults(ex).forEach(function(r){r._exam=ex;all.push(r);});});
    all=all.filter(function(r){return (currentCampus==="all"||r.campus===currentCampus)&&[r.studentName,r.studentId,r._exam.name,r.studentClass].join(" ").toLowerCase().indexOf(q)>=0;});
    all.forEach(function(r){var ex=r._exam;rows+='<tr><td>'+escapeHtml(ex.name)+'</td><td><b>'+escapeHtml(r.studentName)+'</b><br>'+escapeHtml(r.studentId)+'</td><td>'+escapeHtml(r.studentClass+' / '+campusName(r.campus))+'</td><td>'+r.total+' / '+r.maxTotal+'</td><td>'+r.percentage.toFixed(2)+'%</td><td>'+gradeFor(r.percentage)+'</td><td><b>'+resultStatus(r,ex)+'</b></td><td>'+rankOf(ex,r)+'</td><td><button class="edit-button" data-dmc-exam="'+ex.id+'" data-dmc-student="'+r.studentId+'">Print DMC</button></td></tr>';});
    byId("resultsTableBody").innerHTML=rows;byId("resultsEmpty").style.display=all.length?"none":"block";
    var visibleExams=examRecords.filter(function(ex){return currentCampus==="all"||ex.campus===currentCampus;});byId("examCount").textContent=visibleExams.length;byId("resultCount").textContent=all.length;
    var top=all.slice().sort(function(a,b){return b.percentage-a.percentage;})[0];byId("topperName").textContent=top?top.studentName:"—";byId("topperPercent").textContent=top?top.percentage.toFixed(1)+"%":"—";
  }
  function printDmc(ex,record){
    var validResultId=record.studentId && String(record.studentId).toLowerCase()!=="undefined" && String(record.studentId).toLowerCase()!=="null";
    var dmcStudent=validResultId?students.find(function(student){return String(student.id)===String(record.studentId);}):null;
    if(!dmcStudent){
      var matches=students.filter(function(student){
        return String(student.name||student.fullName||student.full_name||"").trim().toLowerCase()===String(record.studentName||"").trim().toLowerCase()
          && String(student.studentClass||student.student_class||"").trim().toLowerCase()===String(record.studentClass||"").trim().toLowerCase();
      });
      if(matches.length===1) dmcStudent=matches[0];
    }
    if(dmcStudent && (!dmcStudent.id || String(dmcStudent.id).toLowerCase()==="undefined" || String(dmcStudent.id).toLowerCase()==="null")){
      dmcStudent.id=generateStudentId(); saveStudents();
    }
    var dmcStudentId=dmcStudent?dmcStudent.id:(validResultId?record.studentId:"ID unavailable");
    var rank=rankOf(ex,record),passingPercentage=Number.isFinite(Number(ex.passingPercentage))?Number(ex.passingPercentage):33,status=resultStatus(record,ex),grade=gradeFor(record.percentage);
    var positionText=rank===1?"1ST POSITION":rank===2?"2ND POSITION":rank===3?"3RD POSITION":"";
    var rows=record.marks.map(function(m,i){
      var obtained=Number(m.obtained)||0,max=Number(m.max)||0,percentage=max?obtained/max*100:0;
      return '<tr><td class="num">'+(i+1)+'</td><td class="subject">'+escapeHtml(m.name)+'</td><td>'+max+'</td><td class="obtained">'+obtained+'</td><td>'+Math.max(0,max-obtained).toFixed(1)+'</td><td>'+gradeFor(percentage)+'</td></tr>';
    }).join("");
    var w=window.open("","_blank","width=950,height=1000");
    if(!w){showToast("DMC print ke liye browser popup allow karein.");return;}
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Swat Model School - DMC</title><style>'+
      '@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#18243a;font-family:"Segoe UI",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{width:100%;min-height:280mm;border:5px double #17345e;padding:7mm;position:relative;background:#fff}.sheet:before{content:"";position:absolute;inset:3mm;border:1px solid #c6a45b;pointer-events:none}.inner{position:relative;z-index:1}.school{text-align:center;border-bottom:3px solid #17345e;padding:4mm 2mm 3mm;position:relative}.school .motto{font-size:9px;font-weight:800;letter-spacing:3px;color:#a27b2f;text-transform:uppercase}.school h1{font-family:Georgia,serif;font-size:29px;line-height:1.1;margin:5px 0 2px;color:#17345e;font-weight:900;letter-spacing:1.4px}.school h2{font-size:15px;letter-spacing:4px;margin:0;color:#344c70;font-weight:800}.school .sub{font-size:10px;letter-spacing:2px;margin:6px 0 0;color:#65738a;font-weight:700}.title{display:flex;justify-content:center;margin:4mm 0 3mm}.title span{background:#17345e;color:#fff;border:2px solid #c6a45b;padding:8px 28px;font-family:Georgia,serif;font-size:17px;font-weight:900;letter-spacing:2px}.position{width:max-content;max-width:100%;margin:0 auto 3mm;padding:7px 24px;border:2px solid #c69b38;background:linear-gradient(90deg,#fff8e5,#f7e7b7,#fff8e5);color:#80580c;font-weight:900;letter-spacing:1.5px;text-align:center;font-size:13px}.student-highlight{border:1.5px solid #b9c7da;background:#f3f6fb;padding:3mm 4mm;margin:3mm 0;display:flex;align-items:center;justify-content:space-between;gap:10px}.student-highlight small{display:block;color:#68758b;font-size:9px;font-weight:900;letter-spacing:1.5px;margin-bottom:3px}.student-highlight strong{font-family:Georgia,serif;color:#17345e;font-size:20px;font-weight:900;text-transform:uppercase}.student-highlight .student-code{text-align:right;font-size:10px;line-height:1.7;color:#42516a}.details{display:grid;grid-template-columns:1fr 1fr;border:1px solid #bdc8d8;margin:3mm 0 4mm}.details div{display:grid;grid-template-columns:105px 1fr;gap:5px;padding:7px 9px;border-bottom:1px solid #d9e0e9;font-size:10.5px;min-height:29px}.details div:nth-child(odd){border-right:1px solid #d9e0e9}.details div:nth-last-child(-n+2){border-bottom:0}.details b{color:#53627b;font-size:9px;text-transform:uppercase;letter-spacing:.4px}.details span{font-weight:750;color:#1e2d45}.marks-title{font-size:11px;font-weight:900;letter-spacing:1.2px;color:#17345e;margin:3mm 0 2mm}.marks{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px}.marks th{background:#17345e;color:#fff;border:1px solid #17345e;padding:9px 6px;font-size:9px;letter-spacing:.6px;text-align:center}.marks td{border:1px solid #aebbd0;padding:8px 7px;text-align:center;height:30px}.marks tbody tr:nth-child(even){background:#f1f4f8}.marks .num{width:8%}.marks .subject{text-align:left;font-weight:800;width:34%;padding-left:10px}.marks .obtained{font-weight:900;color:#17345e}.totals{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #9eacc1;margin-top:4mm}.totals div{text-align:center;padding:9px 5px;border-right:1px solid #cbd4e0}.totals div:last-child{border-right:0}.totals small{display:block;color:#68758b;font-size:8px;font-weight:900;letter-spacing:.6px;margin-bottom:4px}.totals b{font-family:Georgia,serif;font-size:16px;color:#17345e}.resultbar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:3mm;padding:10px 12px;border:1.5px solid #17345e;background:#f2f5fa;font-size:11px;font-weight:900}.resultbar .pass{color:#187448}.resultbar .fail{color:#b13b3b}.remarks{border:1px solid #c6cfdb;margin-top:4mm;padding:9px 11px;min-height:34px;font-size:10px}.remarks b{color:#17345e}.signs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:22mm;text-align:center}.signs div{border-top:1.5px solid #273b5b;padding-top:7px;font-size:10px;font-weight:800;color:#263954}.signs small{display:block;color:#6c788b;font-size:8px;font-weight:600;margin-top:3px}.foot{text-align:center;border-top:1px solid #d4dbe5;margin-top:8mm;padding-top:5px;color:#7b8492;font-size:8px;letter-spacing:.3px}@media print{body{background:#fff}.sheet{min-height:280mm;break-inside:avoid}}'+
      '</style></head><body><main class="sheet"><div class="inner"><header class="school"><div class="motto">Learning • Character • Excellence</div><h1>SWAT MODEL SCHOOL</h1><h2>DARMAI, SWAT</h2><div class="sub">STUDENT ACADEMIC RECORD</div></header><div class="title"><span>DETAILED MARKS CERTIFICATE</span></div>'+
      (positionText?'<div class="position">★ '+positionText+' HOLDER ★</div>':'')+
      '<section class="student-highlight"><div><small>STUDENT NAME</small><strong>'+escapeHtml(record.studentName)+'</strong></div><div class="student-code"><b>STUDENT ID</b><br>'+escapeHtml(dmcStudentId)+'</div></section>'+
      '<section class="details"><div><b>Father Name</b><span>'+escapeHtml(record.fatherName||"—")+'</span></div><div><b>Class</b><span>'+escapeHtml(record.studentClass)+'</span></div><div><b>Campus</b><span>'+escapeHtml(campusName(record.campus))+'</span></div><div><b>Session</b><span>'+escapeHtml(ex.session)+'</span></div><div><b>Examination</b><span>'+escapeHtml(ex.name)+'</span></div><div><b>Exam Date</b><span>'+escapeHtml(ex.date||"—")+'</span></div><div><b>Passing %</b><span>'+passingPercentage+'% minimum</span></div></section>'+
      '<div class="marks-title">SUBJECT-WISE ACADEMIC PERFORMANCE</div><table class="marks"><thead><tr><th class="num">S.NO</th><th class="subject">SUBJECT</th><th>MAX MARKS</th><th>OBTAINED</th><th>MARKS LOST</th><th>GRADE</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<section class="totals"><div><small>TOTAL MARKS</small><b>'+record.maxTotal+'</b></div><div><small>MARKS OBTAINED</small><b>'+record.total+'</b></div><div><small>PERCENTAGE</small><b>'+record.percentage.toFixed(2)+'%</b></div><div><small>OVERALL GRADE</small><b>'+grade+'</b></div></section>'+
      '<div class="resultbar"><span>FINAL RESULT: <b class="'+(status==="PASS"?"pass":"fail")+'">'+status+'</b></span><span>CLASS POSITION: <b>'+rank+'</b></span></div>'+
      '<div class="remarks"><b>TEACHER REMARKS:</b> '+(status==="PASS"?(rank<=3?"Outstanding performance. Keep it up!":"Good effort. Continue working hard."):"Needs improvement. Further guidance is recommended.")+'</div>'+
      '<section class="signs"><div>________________________<br>Guardian Signature<small>Parent / Guardian</small></div><div>________________________<br>Class Incharge<small>Signature</small></div><div>________________________<br>Principal<small>Signature & School Stamp</small></div></section>'+
      '<div class="foot">SWAT MODEL SCHOOL • DARMAI, SWAT &nbsp; | &nbsp; COMPUTER-GENERATED DMC</div></div></main><script>window.onload=function(){window.print();};<\/script></body></html>');
    w.document.close();
  }
    function printMeritList(){
    var out='';examRecords.filter(function(ex){return currentCampus==="all"||ex.campus===currentCampus;}).forEach(function(ex){var ranked=rankedResults(ex);if(!ranked.length)return;out+='<h2>'+escapeHtml(ex.name)+' — '+escapeHtml(ex.studentClass)+' / '+escapeHtml(campusName(ex.campus))+'</h2><table><tr><th>Position</th><th>Student ID</th><th>Student Name</th><th>Father Name</th><th>Obtained</th><th>Percentage</th><th>Grade</th></tr>';ranked.forEach(function(r,i){out+='<tr class="'+(i<3?'medal':'')+'"><td>'+(i+1)+'</td><td>'+escapeHtml(r.studentId)+'</td><td>'+escapeHtml(r.studentName)+'</td><td>'+escapeHtml(r.fatherName||'—')+'</td><td>'+r.total+'/'+r.maxTotal+'</td><td>'+r.percentage.toFixed(2)+'%</td><td>'+gradeFor(r.percentage)+'</td></tr>';});out+='</table>';});
    if(!out){showToast("Merit list ke liye pehle marks enter karein.");return;}var w=window.open("","_blank","width=900,height=900");if(!w){showToast("Print ke liye browser popup allow karein.");return;}w.document.write('<!doctype html><html><head><title>Position Holders</title><style>@page{size:A4 portrait;margin:14mm}body{font-family:Arial;color:#17233f}header{text-align:center;border-bottom:3px double #263b64;padding-bottom:12px}h1{margin:5px;font-size:25px}h2{font-size:15px;margin:24px 0 8px;background:#263b64;color:white;padding:9px}table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px}th{background:#e9edf7}td,th{border:1px solid #aeb9cb;padding:9px;text-align:left}.medal:nth-child(2){background:#fff3cd;font-weight:bold}.medal:nth-child(3){background:#edf0f5;font-weight:bold}.medal:nth-child(4){background:#f8e4d8;font-weight:bold}</style></head><body><header><h1>SWAT MODEL SCHOOL</h1><b>DARMAI, SWAT</b><p>EXAMINATION MERIT LIST / POSITION HOLDERS</p></header>'+out+'<script>window.onload=function(){window.print();};<\/script></body></html>');w.document.close();
  }


  function loadStaff(){
    try{staffRecords=JSON.parse(localStorage.getItem(STAFF_KEY)||"[]");if(!Array.isArray(staffRecords))staffRecords=[];}catch(e){staffRecords=[];}
    try{staffAttendanceRecords=JSON.parse(localStorage.getItem(STAFF_ATTENDANCE_KEY)||"[]");if(!Array.isArray(staffAttendanceRecords))staffAttendanceRecords=[];}catch(e){staffAttendanceRecords=[];}
    try{payrollRecords=JSON.parse(localStorage.getItem(PAYROLL_KEY)||"[]");if(!Array.isArray(payrollRecords))payrollRecords=[];}catch(e){payrollRecords=[];}
  }
  function saveStaff(){try{localStorage.setItem(STAFF_KEY,JSON.stringify(staffRecords));return true;}catch(e){showToast("Staff data save nahi ho saka. Backup/storage check karein.");return false;}}
  function saveStaffAttendance(){try{localStorage.setItem(STAFF_ATTENDANCE_KEY,JSON.stringify(staffAttendanceRecords));return true;}catch(e){showToast("Attendance save nahi ho saki.");return false;}}
  function savePayroll(){try{localStorage.setItem(PAYROLL_KEY,JSON.stringify(payrollRecords));return true;}catch(e){showToast("Payroll save nahi ho saka.");return false;}}
  function nextStaffId(){var max=0;staffRecords.forEach(function(s){var m=String(s.id||"").match(/^SMS-STAFF-(\d+)$/i);if(m)max=Math.max(max,Number(m[1]));});return "SMS-STAFF-"+String(max+1).padStart(4,"0");}
  function resetStaffForm(){
    byId("staffForm").reset();editingStaffId=null;byId("staffId").value=nextStaffId();byId("staffJoining").value=localDateString();byId("staffBasic").value="0";
  }
  function editStaff(id){
    var s=staffRecords.find(function(x){return x.id===id;});if(!s)return;
    editingStaffId=id;byId("staffId").value=s.id;byId("staffName").value=s.name||"";byId("staffFather").value=s.father||"";byId("staffCnic").value=s.cnic||"";
    byId("staffPhone").value=s.phone||"";byId("staffDesignation").value=s.designation||"";byId("staffType").value=s.type||"Teaching";byId("staffCampus").value=s.campus||"boys";
    byId("staffQualification").value=s.qualification||"";byId("staffJoining").value=s.joining||"";byId("staffBasic").value=s.basic||0;byId("staffStatus").value=s.status||"Active";byId("staffAddress").value=s.address||"";
    byId("staffName").focus();window.scrollTo(0,0);
  }
  function renderStaffModule(){
    if(!byId("staffPage"))return;
    var active=staffRecords.filter(function(s){return s.status==="Active";}).length;
    var month=byId("payrollMonthFilter").value||localDateString().slice(0,7);
    var monthly=payrollRecords.filter(function(p){return p.month===month;});
    byId("staffCount").textContent=staffRecords.length;byId("activeStaffCount").textContent=active;
    byId("monthlyPayrollTotal").textContent=money(monthly.reduce(function(t,p){return t+Number(p.net||0);},0));
    byId("salaryPaidTotal").textContent=money(monthly.reduce(function(t,p){return t+Number(p.paid||0);},0));
    renderStaffTable();populateStaffSelectors();renderStaffAttendance();renderPayrollTable();
  }
  function renderStaffTable(){
    var q=(byId("staffSearch").value||"").toLowerCase(),rows="";
    staffRecords.filter(function(s){return [s.id,s.name,s.father,s.designation,s.phone,s.cnic].join(" ").toLowerCase().indexOf(q)>=0;}).forEach(function(s){
      rows+='<tr><td><b>'+escapeHtml(s.id)+'</b></td><td><b>'+escapeHtml(s.name)+'</b><br><small>'+escapeHtml(s.father||"")+'</small></td><td>'+escapeHtml(s.designation)+'</td><td>'+escapeHtml(s.campus==="both"?"Both Campuses":campusName(s.campus))+'</td><td>'+escapeHtml(s.phone)+'</td><td>'+money(s.basic)+'</td><td>'+escapeHtml(s.status)+'</td><td><button class="edit-button" data-staff-edit="'+escapeHtml(s.id)+'">Edit</button> <button class="edit-button" data-staff-delete="'+escapeHtml(s.id)+'">Delete</button> <button class="edit-button" data-staff-qr="'+escapeHtml(s.id)+'">Print QR</button></td></tr>';
    });
    byId("staffTableBody").innerHTML=rows;byId("staffEmpty").style.display=rows?"none":"block";
  }
  function populateStaffSelectors(){
    var attendance=byId("staffAttendancePerson"),pay=byId("payrollStaff"),oldA=attendance.value,oldP=pay.value;
    attendance.innerHTML='<option value="">Select staff</option>';pay.innerHTML='<option value="">Select staff</option>';
    staffRecords.filter(function(s){return s.status!=="Resigned";}).sort(function(a,b){return a.name.localeCompare(b.name);}).forEach(function(s){
      [attendance,pay].forEach(function(sel){var o=document.createElement("option");o.value=s.id;o.textContent=s.name+" — "+s.id;sel.appendChild(o);});
    });
    attendance.value=oldA;pay.value=oldP;
  }
  function renderStaffAttendance(){
    var date=byId("staffAttendanceDate").value||localDateString(),rows="",list=staffAttendanceRecords.filter(function(r){return r.date===date;});
    list.forEach(function(r){var s=staffRecords.find(function(x){return x.id===r.staffId;});rows+='<tr><td><b>'+escapeHtml(s?s.name:r.staffName)+'</b><br>'+escapeHtml(r.staffId)+'</td><td>'+escapeHtml(s?s.designation:"")+'</td><td>'+escapeHtml(r.status)+'</td><td>'+escapeHtml(r.note||"")+'</td></tr>';});
    byId("staffAttendanceBody").innerHTML=rows;byId("staffAttendanceSummary").textContent=list.length+" records";
  }
  function saveStaffRecord(e){
    e.preventDefault();
    var rec={id:editingStaffId||nextStaffId(),name:byId("staffName").value.trim(),father:byId("staffFather").value.trim(),cnic:byId("staffCnic").value.trim(),phone:byId("staffPhone").value.trim(),designation:byId("staffDesignation").value.trim(),type:byId("staffType").value,campus:byId("staffCampus").value,qualification:byId("staffQualification").value.trim(),joining:byId("staffJoining").value,basic:Number(byId("staffBasic").value),status:byId("staffStatus").value,address:byId("staffAddress").value.trim()};
    if(!rec.name||!rec.father||!rec.phone||!rec.designation||!Number.isFinite(rec.basic)||rec.basic<0){showToast("Required staff details aur valid salary enter karein.");return;}
    var idx=staffRecords.findIndex(function(s){return s.id===rec.id;});if(idx>=0)staffRecords[idx]=rec;else staffRecords.push(rec);
    if(saveStaff()){resetStaffForm();renderStaffModule();showToast("Staff record save ho gaya.");}
  }
  function printStaffQr(id){
    var s=staffRecords.find(function(x){return x.id===id;});if(!s)return;
    var payload="SWAT-MODEL-SCHOOL-STAFF|"+s.id,qr="https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data="+encodeURIComponent(payload);
    var w=window.open("","_blank","width=520,height=650");if(!w){showToast("QR print ke liye popup allow karein.");return;}
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Staff QR Card</title><style>body{font-family:Arial;text-align:center;padding:35px;color:#17345e}.card{border:3px double #17345e;border-radius:18px;padding:25px;max-width:360px;margin:auto}img{width:240px;height:240px}h1{font-size:22px;margin:8px}p{margin:6px}</style></head><body><div class="card"><h1>SWAT MODEL SCHOOL</h1><b>DARMAI, SWAT</b><p>TEACHER / STAFF ID CARD</p><h2>'+escapeHtml(s.name)+'</h2><p>'+escapeHtml(s.designation)+' | '+escapeHtml(s.id)+'</p><img src="'+qr+'"><p>Scan for gate attendance</p></div><script>window.onload=function(){window.print();};<\/script></body></html>');w.document.close();
  }
  function deleteStaff(id){
    var s=staffRecords.find(function(x){return x.id===id;});if(!s)return;
    if(!confirm(s.name+" ka staff record delete karna hai? Purani payroll history rahegi."))return;
    staffRecords=staffRecords.filter(function(x){return x.id!==id;});if(saveStaff())renderStaffModule();
  }
  function saveStaffAttendanceEntry(){
    var id=byId("staffAttendancePerson").value,date=byId("staffAttendanceDate").value,status=byId("staffAttendanceStatus").value;
    var s=staffRecords.find(function(x){return x.id===id;});if(!s||!date){showToast("Staff aur attendance date select karein.");return;}
    var old=staffAttendanceRecords.find(function(r){return r.staffId===id&&r.date===date;});
    if(old){old.status=status;old.note=byId("staffAttendanceNote").value.trim();}else staffAttendanceRecords.push({staffId:id,staffName:s.name,date:date,status:status,note:byId("staffAttendanceNote").value.trim()});
    if(saveStaffAttendance()){byId("staffAttendanceNote").value="";renderStaffAttendance();showToast("Staff attendance save ho gayi.");}
  }
  function updatePayrollPreview(){
    var basic=Number(byId("payrollBasic").value)||0,allow=Number(byId("payrollAllowance").value)||0,ded=Number(byId("payrollDeduction").value)||0,net=Math.max(0,basic+allow-ded);
    byId("payrollPreview").textContent="Net Salary: "+money(net)+" | Remaining: "+money(Math.max(0,net-(Number(byId("payrollPaid").value)||0)));
  }
  function loadStaffSalary(){
    var s=staffRecords.find(function(x){return x.id===byId("payrollStaff").value;});if(!s)return;
    byId("payrollBasic").value=s.basic||0;updatePayrollPreview();
  }
  function savePayrollEntry(e){
    e.preventDefault();
    var id=byId("payrollStaff").value,month=byId("payrollMonth").value,s=staffRecords.find(function(x){return x.id===id;});
    if(!s||!month){showToast("Staff aur salary month select karein.");return;}
    var basic=Number(byId("payrollBasic").value)||0,allow=Number(byId("payrollAllowance").value)||0,ded=Number(byId("payrollDeduction").value)||0,net=basic+allow-ded,paid=Number(byId("payrollPaid").value)||0;
    if(net<0||paid<0||paid>net){showToast("Salary amounts check karein. Paid amount net salary se zyada nahi ho sakta.");return;}
    var status=paid===0?"Unpaid":paid>=net?"Paid":"Partial";
    var rec={key:id+"|"+month,staffId:id,staffName:s.name,designation:s.designation,campus:s.campus,month:month,basic:basic,allowance:allow,deduction:ded,net:net,paid:paid,status:status,paymentDate:byId("payrollDate").value,remarks:byId("payrollRemarks").value.trim(),updatedAt:new Date().toISOString()};
    var idx=payrollRecords.findIndex(function(p){return p.key===rec.key;});if(idx>=0)payrollRecords[idx]=rec;else payrollRecords.push(rec);
    if(savePayroll()){renderStaffModule();showToast("Monthly payroll save ho gaya.");}
  }
  function renderPayrollTable(){
    var month=byId("payrollMonthFilter").value||localDateString().slice(0,7),rows="";
    payrollRecords.filter(function(p){return p.month===month;}).forEach(function(p){
      var bal=Math.max(0,Number(p.net||0)-Number(p.paid||0));
      rows+='<tr><td>'+escapeHtml(p.month)+'</td><td><b>'+escapeHtml(p.staffName)+'</b><br>'+escapeHtml(p.staffId)+'</td><td>'+money(p.basic)+'</td><td>'+money(p.allowance)+'</td><td>'+money(p.deduction)+'</td><td><b>'+money(p.net)+'</b></td><td>'+money(p.paid)+'</td><td>'+money(bal)+'</td><td>'+escapeHtml(p.status)+'</td><td><button class="edit-button" data-salary-slip="'+escapeHtml(p.key)+'">Print Slip</button></td></tr>';
    });
    byId("payrollTableBody").innerHTML=rows;byId("payrollEmpty").style.display=rows?"none":"block";
  }
  function printSalarySlip(key){
    var p=payrollRecords.find(function(x){return x.key===key;});if(!p)return;
    var balance=Math.max(0,p.net-p.paid),w=window.open("","_blank","width=700,height=800");if(!w){showToast("Salary slip popup allow karein.");return;}
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Salary Slip</title><style>@page{size:A4 portrait;margin:15mm}body{font-family:Arial,sans-serif;color:#1d2d49}.slip{border:4px double #17345e;padding:25px;max-width:650px;margin:auto}.head{text-align:center;border-bottom:3px solid #17345e;padding-bottom:15px}.head h1{font-family:Georgia,serif;font-size:27px;margin:0;color:#17345e}.head b{letter-spacing:3px}.title{text-align:center;background:#17345e;color:white;padding:12px;margin:20px 0;font-weight:bold;letter-spacing:2px}.who{background:#f2f5fa;border:1px solid #bdc8d8;padding:15px;margin-bottom:18px}.who strong{font-size:21px}.data{width:100%;border-collapse:collapse}.data th,.data td{border:1px solid #bdc8d8;padding:11px;text-align:left}.data th{background:#f1f4f8}.total{margin-top:15px;background:#f1f4f8;border:2px solid #17345e;padding:15px;text-align:right;font-size:18px;font-weight:bold}.sign{display:flex;justify-content:space-between;margin-top:80px;text-align:center}.sign div{border-top:1px solid #333;padding-top:8px;width:40%}.foot{text-align:center;margin-top:30px;color:#777;font-size:10px}</style></head><body><main class="slip"><header class="head"><h1>SWAT MODEL SCHOOL</h1><b>DARMAI, SWAT</b><p>STAFF PAYROLL RECORD</p></header><div class="title">MONTHLY SALARY SLIP</div><div class="who"><small>STAFF NAME</small><br><strong>'+escapeHtml(p.staffName)+'</strong><p>Staff ID: '+escapeHtml(p.staffId)+' | Designation: '+escapeHtml(p.designation)+'</p><p>Salary Month: '+escapeHtml(p.month)+' | Campus: '+escapeHtml(p.campus==="both"?"Both Campuses":campusName(p.campus))+'</p></div><table class="data"><tr><th>Salary Description</th><th>Amount (PKR)</th></tr><tr><td>Basic Salary</td><td>'+money(p.basic)+'</td></tr><tr><td>Allowances</td><td>'+money(p.allowance)+'</td></tr><tr><td>Deductions</td><td>- '+money(p.deduction)+'</td></tr><tr><th>Net Salary</th><th>'+money(p.net)+'</th></tr><tr><td>Amount Paid</td><td>'+money(p.paid)+'</td></tr><tr><td>Remaining Balance</td><td>'+money(balance)+'</td></tr><tr><td>Payment Status</td><td><b>'+escapeHtml(p.status)+'</b></td></tr><tr><td>Payment Date</td><td>'+escapeHtml(p.paymentDate||"—")+'</td></tr></table><div class="sign"><div>Accounts / Incharge</div><div>Principal</div></div><div class="foot">Generated by Swat Model School Management System</div></main><script>window.onload=function(){window.print();};<\/script></body></html>');w.document.close();
  }


  function loadExpenses(){try{expenseRecords=JSON.parse(localStorage.getItem(EXPENSES_KEY)||"[]");if(!Array.isArray(expenseRecords))expenseRecords=[];}catch(e){expenseRecords=[];}}
  function saveExpenses(){try{localStorage.setItem(EXPENSES_KEY,JSON.stringify(expenseRecords));return true;}catch(e){showToast("Expense data save nahi ho saka. Storage/backup check karein.");return false;}}
  function resetExpenseForm(){byId("expenseForm").reset();byId("expenseDate").value=localDateString();byId("expenseCampus").value="boys";byId("expenseStatus").value="Paid";}
  function expenseCampusMatches(record,filter){return filter==="all"||record.campus===filter||(filter==="both"&&record.campus==="both");}
  function financeMonthData(){
    var month=byId("financeMonth").value||localDateString().slice(0,7),campus=byId("financeCampus").value||"all";
    var income=0,expensesPaid=0,expensesPending=0,salaryPaid=0,salaryNet=0;
    feeRecords.forEach(function(f){if(!expenseCampusMatches(f,campus))return;(f.payments||[]).forEach(function(p){if(String(p.date||"").slice(0,7)===month)income+=Number(p.amount)||0;});});
    expenseRecords.forEach(function(e){if(String(e.date||"").slice(0,7)!==month||!expenseCampusMatches(e,campus))return;if(e.status==="Paid")expensesPaid+=Number(e.amount)||0;else expensesPending+=Number(e.amount)||0;});
    payrollRecords.forEach(function(p){if(p.month!==month)return;if(campus!=="all"&&p.campus!==campus&&p.campus!=="both")return;salaryNet+=Number(p.net)||0;salaryPaid+=Number(p.paid)||0;});
    return {month:month,campus:campus,income:income,expensesPaid:expensesPaid,expensesPending:expensesPending,salaryPaid:salaryPaid,salaryNet:salaryNet,net:income-expensesPaid-salaryPaid};
  }
  function renderFinanceModule(){
    if(!byId("expensesPage"))return;
    var f=financeMonthData();
    byId("financeIncome").textContent=money(f.income);byId("financeExpenses").textContent=money(f.expensesPaid);byId("financeSalary").textContent=money(f.salaryPaid);byId("financeNet").textContent=money(f.net);
    renderExpenseTable();renderFinanceSummary(f);
  }
  function renderExpenseTable(){
    var month=byId("financeMonth").value||localDateString().slice(0,7),campus=byId("financeCampus").value||"all",q=(byId("expenseSearch").value||"").toLowerCase(),rows="";
    expenseRecords.filter(function(e){return String(e.date||"").slice(0,7)===month&&expenseCampusMatches(e,campus)&&[e.category,e.description,e.payee,e.reference].join(" ").toLowerCase().indexOf(q)>=0;}).sort(function(a,b){return b.date.localeCompare(a.date);}).forEach(function(e){
      rows+='<tr><td>'+escapeHtml(e.date)+'</td><td><b>'+escapeHtml(e.category)+'</b><br><small>'+escapeHtml(e.description)+'</small></td><td>'+escapeHtml(e.campus==="both"?"Shared":campusName(e.campus))+'</td><td>'+escapeHtml(e.payee||"—")+'</td><td><b>'+money(e.amount)+'</b></td><td>'+escapeHtml(e.method)+'</td><td>'+escapeHtml(e.status)+'</td><td><button class="edit-button" data-expense-delete="'+escapeHtml(e.id)+'">Delete</button></td></tr>';
    });
    byId("expenseTableBody").innerHTML=rows;byId("expenseEmpty").style.display=rows?"none":"block";
  }
  function renderFinanceSummary(f){
    var data=[["Fee payments received",f.income,"Payments recorded in selected month"],["Other school expenses paid",f.expensesPaid,"Paid expense entries"],["Staff salary paid",f.salaryPaid,"Actual payroll amount marked paid"],["Net cash flow",f.net,"Fee payments less paid expenses and salary"],["Pending school expenses",f.expensesPending,"Unpaid expense entries (not subtracted from cash flow)"],["Payroll net salary",f.salaryNet,"Net salary recorded for selected month"]];
    byId("financeSummaryBody").innerHTML=data.map(function(r){return "<tr><td><b>"+escapeHtml(r[0])+"</b></td><td>"+money(r[1])+"</td><td>"+escapeHtml(r[2])+"</td></tr>";}).join("");
  }
  function saveExpenseEntry(e){
    e.preventDefault();
    var amount=Number(byId("expenseAmount").value),date=byId("expenseDate").value,description=byId("expenseDescription").value.trim();
    if(!date||!byId("expenseCategory").value||!description||!Number.isFinite(amount)||amount<=0){showToast("Expense ki required details aur amount sahi enter karein.");return;}
    var rec={id:"EXP-"+Date.now()+"-"+Math.random().toString(36).slice(2,6).toUpperCase(),date:date,category:byId("expenseCategory").value,campus:byId("expenseCampus").value,amount:amount,payee:byId("expensePayee").value.trim(),method:byId("expenseMethod").value,status:byId("expenseStatus").value,reference:byId("expenseReference").value.trim(),description:description,createdAt:new Date().toISOString()};
    expenseRecords.push(rec);if(saveExpenses()){resetExpenseForm();renderFinanceModule();showToast("School expense record save ho gaya.");}
  }
  function deleteExpense(id){
    var e=expenseRecords.find(function(x){return x.id===id;});if(!e)return;
    if(!confirm("Is expense record ko delete karna hai?"))return;
    expenseRecords=expenseRecords.filter(function(x){return x.id!==id;});if(saveExpenses())renderFinanceModule();
  }
  function exportFinanceCsv(){
    var f=financeMonthData(),rows=[["Type","Date / Month","Category / Description","Campus","Amount PKR","Status"]];
    expenseRecords.filter(function(e){return String(e.date||"").slice(0,7)===f.month;}).forEach(function(e){rows.push(["Expense",e.date,e.category+" - "+e.description,e.campus,e.amount,e.status]);});
    feeRecords.forEach(function(r){(r.payments||[]).forEach(function(p){if(String(p.date||"").slice(0,7)===f.month)rows.push(["Fee Collection",p.date,r.studentName+" / "+r.month,r.campus,p.amount,"Received"]);});});
    payrollRecords.filter(function(p){return p.month===f.month;}).forEach(function(p){rows.push(["Salary",p.month,p.staffName,p.campus,p.paid,"Paid amount"]);});
    var csv=rows.map(function(r){return r.map(function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';}).join(",");}).join("\r\n");
    var blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Swat_Model_School_Finance_"+f.month+".csv";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);showToast("Finance CSV export ho gayi.");
  }


  function loadInventory(){try{inventoryRecords=JSON.parse(localStorage.getItem(INVENTORY_KEY)||"[]");if(!Array.isArray(inventoryRecords))inventoryRecords=[];}catch(e){inventoryRecords=[];}try{stockMovements=JSON.parse(localStorage.getItem(MOVEMENTS_KEY)||"[]");if(!Array.isArray(stockMovements))stockMovements=[];}catch(e){stockMovements=[];}}
  function saveInventory(){try{localStorage.setItem(INVENTORY_KEY,JSON.stringify(inventoryRecords));return true;}catch(e){showToast("Inventory save nahi ho saka. Storage/backup check karein.");return false;}}
  function saveMovements(){try{localStorage.setItem(MOVEMENTS_KEY,JSON.stringify(stockMovements));return true;}catch(e){showToast("Stock movement save nahi ho saka.");return false;}}
  function nextInventoryCode(){var max=0;inventoryRecords.forEach(function(x){var m=String(x.code||"").match(/^SMS-ITEM-(\d+)$/i);if(m)max=Math.max(max,Number(m[1]));});return "SMS-ITEM-"+String(max+1).padStart(4,"0");}
  function resetInventoryForm(){byId("inventoryForm").reset();byId("inventoryCode").value=nextInventoryCode();byId("inventoryOpening").value="0";byId("inventoryMinimum").value="0";byId("inventoryCost").value="0";byId("inventoryDate").value=localDateString();byId("inventoryCampus").value="boys";byId("inventoryType").value="Stock";}
  function getStock(itemId){var item=inventoryRecords.find(function(x){return x.id===itemId;});return item?Number(item.opening||0)+stockMovements.filter(function(m){return m.itemId===itemId;}).reduce(function(t,m){return t+(m.type==="IN"?Number(m.quantity):-Number(m.quantity));},0):0;}
  function renderInventoryModule(){if(!byId("inventoryPage"))return;var units=inventoryRecords.reduce(function(t,x){return t+Math.max(0,getStock(x.id));},0),low=inventoryRecords.filter(function(x){return x.type==="Stock"&&getStock(x.id)<=Number(x.minimum||0);}).length;
    byId("inventoryItemCount").textContent=inventoryRecords.length;byId("inventoryUnitCount").textContent=units.toFixed(2).replace(/\.00$/,"");byId("inventoryLowCount").textContent=low;byId("assetCount").textContent=inventoryRecords.filter(function(x){return x.type==="Asset";}).length;
    renderInventoryTable();populateMovementItems();renderMovementTable();}
  function renderInventoryTable(){var q=(byId("inventorySearch").value||"").toLowerCase(),rows="";
    inventoryRecords.filter(function(x){return [x.code,x.name,x.category,x.location].join(" ").toLowerCase().indexOf(q)>=0;}).forEach(function(x){var qty=getStock(x.id),value=qty*Number(x.cost||0),status=x.type==="Asset"?(x.condition||"Recorded"):(qty<=Number(x.minimum||0)?"LOW STOCK":"In Stock");
      rows+='<tr><td><b>'+escapeHtml(x.code)+'</b></td><td><b>'+escapeHtml(x.name)+'</b><br><small>'+escapeHtml(x.unit)+'</small></td><td>'+escapeHtml(x.category)+'<br><small>'+escapeHtml(x.type)+'</small></td><td>'+escapeHtml(x.campus==="both"?"Shared":campusName(x.campus))+'</td><td><b>'+qty.toFixed(2).replace(/\.00$/,"")+'</b></td><td>'+Number(x.minimum||0)+'</td><td>'+money(value)+'</td><td>'+escapeHtml(status)+'</td><td><button class="edit-button" data-inventory-delete="'+escapeHtml(x.id)+'">Delete</button></td></tr>';});
    byId("inventoryTableBody").innerHTML=rows;byId("inventoryEmpty").style.display=rows?"none":"block";}
  function populateMovementItems(){var sel=byId("movementItem"),old=sel.value;sel.innerHTML='<option value="">Select item</option>';inventoryRecords.forEach(function(x){var o=document.createElement("option");o.value=x.id;o.textContent=x.code+" — "+x.name;sel.appendChild(o);});sel.value=old;}
  function renderMovementTable(){var rows=stockMovements.slice().sort(function(a,b){return b.date.localeCompare(a.date);}).map(function(m){var item=inventoryRecords.find(function(x){return x.id===m.itemId;});return '<tr><td>'+escapeHtml(m.date)+'</td><td><b>'+escapeHtml(item?item.name:m.itemName)+'</b></td><td>'+escapeHtml(m.type==="IN"?"Stock In":"Stock Out")+'</td><td>'+Number(m.quantity)+'</td><td>'+escapeHtml(m.reference||"—")+'</td><td>'+escapeHtml([m.party,m.note].filter(Boolean).join(" / ")||"—")+'</td></tr>';}).join("");
    byId("movementTableBody").innerHTML=rows;byId("movementCount").textContent=stockMovements.length+" movements";}
  function saveInventoryItem(e){e.preventDefault();var name=byId("inventoryName").value.trim(),unit=byId("inventoryUnit").value.trim(),opening=Number(byId("inventoryOpening").value),minimum=Number(byId("inventoryMinimum").value)||0,cost=Number(byId("inventoryCost").value)||0;
    if(!name||!unit||!Number.isFinite(opening)||opening<0||minimum<0||cost<0){showToast("Inventory details aur quantities check karein.");return;}
    var item={id:"ITEM-"+Date.now()+"-"+Math.random().toString(36).slice(2,5),code:nextInventoryCode(),name:name,category:byId("inventoryCategory").value,type:byId("inventoryType").value,campus:byId("inventoryCampus").value,unit:unit,opening:opening,minimum:minimum,cost:cost,date:byId("inventoryDate").value,location:byId("inventoryLocation").value.trim(),notes:byId("inventoryNotes").value.trim(),condition:"Recorded"};
    if(!item.category){showToast("Category select karein.");return;}inventoryRecords.push(item);if(saveInventory()){resetInventoryForm();renderInventoryModule();showToast("Inventory item save ho gaya.");}}
  function saveStockMovement(e){e.preventDefault();var itemId=byId("movementItem").value,item=inventoryRecords.find(function(x){return x.id===itemId;}),type=byId("movementType").value,qty=Number(byId("movementQuantity").value),date=byId("movementDate").value;
    if(!item||!date||!Number.isFinite(qty)||qty<=0){showToast("Item, date aur valid quantity enter karein.");return;}
    var current=getStock(itemId);if(type==="OUT"&&qty>current){showToast("Stock available quantity se zyada issue nahi kar sakte. Available: "+current);return;}
    if(type==="OUT"&&item.type==="Asset"){showToast("Fixed asset ko Stock Out nahi kar sakte. Asset record ko delete karne ke bajaye notes update karein.");return;}
    var movement={id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,5),itemId:itemId,itemName:item.name,type:type,quantity:qty,date:date,reference:byId("movementReference").value.trim(),party:byId("movementParty").value.trim(),note:byId("movementNote").value.trim()};
    stockMovements.push(movement);if(saveMovements()){byId("stockMovementForm").reset();byId("movementDate").value=localDateString();renderInventoryModule();showToast("Stock movement save ho gayi.");}}
  function deleteInventoryItem(id){var item=inventoryRecords.find(function(x){return x.id===id;});if(!item)return;if(stockMovements.some(function(m){return m.itemId===id;})){showToast("Is item ki movement history mojood hai. Delete allowed nahi, taake record safe rahe.");return;}if(!confirm(item.name+" delete karna hai?"))return;inventoryRecords=inventoryRecords.filter(function(x){return x.id!==id;});if(saveInventory())renderInventoryModule();}
  function exportInventoryCsv(){var rows=[["Item Code","Item Name","Category","Type","Campus","Unit","Current Quantity","Minimum","Unit Cost","Stock Value","Location"]];inventoryRecords.forEach(function(x){var q=getStock(x.id);rows.push([x.code,x.name,x.category,x.type,x.campus,x.unit,q,x.minimum,x.cost,q*x.cost,x.location]);});stockMovements.forEach(function(m){rows.push(["Movement",m.itemName,m.type,"", "", "",m.quantity,"","","",m.date+" "+m.reference]);});var csv=rows.map(function(r){return r.map(function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';}).join(",");}).join("\r\n");var blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Swat_Model_School_Inventory.csv";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);showToast("Inventory CSV export ho gayi.");}

  function loadTimetable(){try{timetableRecords=JSON.parse(localStorage.getItem(TIMETABLE_KEY)||"[]");if(!Array.isArray(timetableRecords))timetableRecords=[];}catch(e){timetableRecords=[];}}
  function saveTimetable(){try{localStorage.setItem(TIMETABLE_KEY,JSON.stringify(timetableRecords));return true;}catch(e){showToast("Timetable save nahi ho saka. Browser storage check karein.");return false;}}
  function renderTimetableModule(){
    if(!byId("timetablePage"))return;
    var teachers=staffRecords.filter(function(s){return s.status==="Active"&&/teacher|principal|head|instructor/i.test(s.designation||"");});
    byId("ttTeacher").innerHTML='<option value="">Select active teacher</option>'+teachers.map(function(t){return '<option value="'+escapeHtml(t.id)+'">'+escapeHtml(t.name)+' — '+escapeHtml(t.designation)+'</option>';}).join("");
    byId("timetableTeacherCount").textContent=teachers.length;
    var campus=byId("ttFilterCampus").value,cls=byId("ttFilterClass").value;
    var rows=timetableRecords.filter(function(r){return (campus==="all"||r.campus===campus)&&(cls==="all"||r.studentClass===cls);}).sort(function(a,b){return ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].indexOf(a.day)-["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].indexOf(b.day)||a.period-b.period;});
    byId("timetableCount").textContent=timetableRecords.length;byId("timetableClassCount").textContent=[...new Set(timetableRecords.map(function(r){return r.campus+"|"+r.studentClass;}))].length;byId("timetableCampusLabel").textContent=campusName(currentCampus);
    byId("timetableTableBody").innerHTML=rows.map(function(r){return '<tr><td><b>'+escapeHtml(r.day)+'</b></td><td>'+r.period+'</td><td>'+escapeHtml(r.start+' – '+r.end)+'</td><td>'+escapeHtml(r.studentClass+' / '+campusName(r.campus))+'</td><td>'+escapeHtml(r.subject)+'</td><td>'+escapeHtml(r.teacherName)+'</td><td>'+escapeHtml(r.room||"—")+'</td><td><button class="table-action danger" data-tt-delete="'+escapeHtml(r.id)+'">Delete</button></td></tr>';}).join("");
    byId("timetableEmpty").style.display=rows.length?"none":"block";
  }
  function saveTimetablePeriod(e){e.preventDefault();var campus=byId("ttCampus").value,cls=byId("ttClass").value,day=byId("ttDay").value,period=Number(byId("ttPeriod").value),start=byId("ttStart").value,end=byId("ttEnd").value,subject=byId("ttSubject").value.trim(),teacherId=byId("ttTeacher").value,teacher=staffRecords.find(function(s){return s.id===teacherId;});
    if(!teacher){showToast("Pehle Staff module mein active teacher add karein.");return;}if(end<=start){showToast("End time, start time ke baad honi chahiye.");return;}
    var conflict=timetableRecords.find(function(r){return r.campus===campus&&r.day===day&&r.period===period&&(r.studentClass===cls||r.teacherId===teacherId);});
    if(conflict){showToast(conflict.studentClass===cls?"Is class ka ye period pehle se booked hai.":"Ye teacher isi waqt doosri class mein assigned hai.");return;}
    var rec={id:"TT-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),campus:campus,studentClass:cls,day:day,period:period,start:start,end:end,subject:subject,teacherId:teacherId,teacherName:teacher.name,room:byId("ttRoom").value.trim(),note:byId("ttNote").value.trim()};timetableRecords.push(rec);if(saveTimetable()){byId("timetableForm").reset();renderTimetableModule();showToast("Timetable period save ho gaya.");}}
  function deleteTimetablePeriod(id){var rec=timetableRecords.find(function(r){return r.id===id;});if(!rec||!confirm("Is timetable period ko delete karna hai?"))return;timetableRecords=timetableRecords.filter(function(r){return r.id!==id;});if(saveTimetable())renderTimetableModule();}
  function exportTimetableCsv(){var rows=[["Campus","Class","Day","Period","Start","End","Subject","Teacher","Room"]];timetableRecords.forEach(function(r){rows.push([campusName(r.campus),r.studentClass,r.day,r.period,r.start,r.end,r.subject,r.teacherName,r.room]);});var csv=rows.map(function(r){return r.map(function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';}).join(",");}).join("\r\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Swat_Model_School_Timetable.csv";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);}
  function printTimetable(){var rows=byId("timetableTableBody").innerHTML;if(!timetableRecords.length){showToast("Print se pehle timetable periods add karein.");return;}var w=window.open("","_blank");if(!w){showToast("Print window browser ne block kar di. Pop-ups allow karein.");return;}w.document.write('<html><head><title>Swat Model School Timetable</title><style>body{font-family:Arial;padding:24px;color:#17213b}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #555;padding:8px;text-align:left;font-size:12px}th{background:#e9edf5}</style></head><body><h1>SWAT MODEL SCHOOL, DARMAI, SWAT</h1><h2>Weekly Class Timetable</h2><table><thead><tr><th>DAY</th><th>PERIOD</th><th>TIME</th><th>CLASS / CAMPUS</th><th>SUBJECT</th><th>TEACHER</th><th>ROOM</th></tr></thead><tbody>'+rows.replace(/<td><button[^<]*<\/button><\/td>/g,'')+'</tbody></table></body></html>');w.document.close();w.focus();w.print();}

  function analyticsFilteredRecords(){
    var cls=byId("analyticsClassFilter")?byId("analyticsClassFilter").value:"all",out=[];
    examRecords.forEach(function(ex){
      if(currentCampus!=="all"&&ex.campus!==currentCampus)return;
      if(cls!=="all"&&ex.studentClass!==cls)return;
      (ex.results||[]).forEach(function(r){out.push({exam:ex,result:r});});
    });
    return out;
  }
  function renderStudentAnalytics(){
    if(!byId("analyticsPage"))return;
    var records=analyticsFilteredRecords(),exams=examRecords.filter(function(ex){return (currentCampus==="all"||ex.campus===currentCampus)&&(byId("analyticsClassFilter").value==="all"||ex.studentClass===byId("analyticsClassFilter").value);});
    var pass=records.filter(function(x){return resultStatus(x.result,x.exam)==="PASS";}).length,fail=records.length-pass,avg=records.length?records.reduce(function(t,x){return t+Number(x.result.percentage||0);},0)/records.length:0;
    byId("analyticsCampusLabel").textContent=campusName(currentCampus);byId("analyticsExamLabel").textContent=exams.length+" examination(s) included";
    byId("anExamCount").textContent=exams.length;byId("anResultCount").textContent=records.length;byId("anAverage").textContent=avg.toFixed(1)+"%";byId("anPassRate").textContent=(records.length?pass/records.length*100:0).toFixed(1)+"%";byId("anPassFail").textContent=pass+" pass · "+fail+" fail";
    var subjects={};records.forEach(function(x){(x.result.marks||[]).forEach(function(m){var k=m.name||"Other";if(!subjects[k])subjects[k]={got:0,max:0,count:0};subjects[k].got+=Number(m.obtained)||0;subjects[k].max+=Number(m.max)||0;subjects[k].count++;});});
    var subjectRows=Object.keys(subjects).map(function(k){return {name:k,pct:subjects[k].max?subjects[k].got/subjects[k].max*100:0};}).sort(function(a,b){return b.pct-a.pct;});
    byId("analyticsSubjects").innerHTML=subjectRows.length?subjectRows.map(function(x){return '<div class="analytics-bar-row"><div class="analytics-bar-label"><b>'+escapeHtml(x.name)+'</b><strong>'+x.pct.toFixed(1)+'%</strong></div><div class="analytics-bar-track"><span style="width:'+Math.max(0,Math.min(100,x.pct))+'%"></span></div></div>';}).join(""):'<div class="empty-state"><p>Subject marks abhi available nahi.</p></div>';
    var classMap={};records.forEach(function(x){var k=x.exam.studentClass||x.result.studentClass||"Unassigned";if(!classMap[k])classMap[k]={sum:0,count:0,pass:0};classMap[k].sum+=Number(x.result.percentage)||0;classMap[k].count++;if(resultStatus(x.result,x.exam)==="PASS")classMap[k].pass++;});
    byId("analyticsClassBody").innerHTML=Object.keys(classMap).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});}).map(function(k){var x=classMap[k];return '<tr><td><b>'+escapeHtml(k)+'</b></td><td>'+x.count+'</td><td>'+ (x.sum/x.count).toFixed(1)+'%</td><td>'+ (x.pass/x.count*100).toFixed(1)+'%</td></tr>';}).join("");
    var ranked=records.slice().sort(function(a,b){return (Number(b.result.percentage)||0)-(Number(a.result.percentage)||0);});
    byId("analyticsTopBody").innerHTML=ranked.slice(0,10).map(function(x,i){return '<tr><td><b>#'+(i+1)+'</b></td><td>'+escapeHtml(x.result.studentName)+'</td><td>'+escapeHtml(x.exam.studentClass)+'</td><td>'+Number(x.result.percentage||0).toFixed(1)+'%</td></tr>';}).join("");byId("analyticsTopEmpty").style.display=ranked.length?"none":"block";
    var weak=ranked.filter(function(x){return resultStatus(x.result,x.exam)==="FAIL"||Number(x.result.percentage)<40;}).sort(function(a,b){return Number(a.result.percentage)-Number(b.result.percentage);});
    byId("analyticsWeakBody").innerHTML=weak.slice(0,10).map(function(x){return '<tr><td>'+escapeHtml(x.result.studentName)+'</td><td>'+escapeHtml(x.exam.studentClass)+'</td><td>'+Number(x.result.percentage||0).toFixed(1)+'%</td><td><span class="analytics-status">'+resultStatus(x.result,x.exam)+'</span></td></tr>';}).join("");byId("analyticsWeakEmpty").style.display=weak.length?"none":"block";
    var unique={};records.forEach(function(x){unique[x.result.studentId]=x.result.studentName;});var select=byId("analyticsStudentSelect"),old=select.value;select.innerHTML='<option value="">Select student</option>'+Object.keys(unique).sort(function(a,b){return String(unique[a]).localeCompare(String(unique[b]));}).map(function(id){return '<option value="'+escapeHtml(id)+'">'+escapeHtml(unique[id]+" — "+id)+'</option>';}).join("");if(unique[old])select.value=old;renderStudentProgress();
    var studentStats={};records.forEach(function(x){var id=x.result.studentId;if(!studentStats[id])studentStats[id]={name:x.result.studentName,cls:x.exam.studentClass,marks:[],att:[]};studentStats[id].marks.push(Number(x.result.percentage)||0);});
    attendanceRecords.forEach(function(a){if(studentStats[a.studentId])studentStats[a.studentId].att.push(a.status);});
    var attRows=Object.keys(studentStats).map(function(id){var x=studentStats[id],present=x.att.filter(function(s){return s==="present";}).length,att=x.att.length?present/x.att.length*100:null;return {name:x.name,cls:x.cls,att:att,avg:x.marks.reduce(function(t,v){return t+v;},0)/x.marks.length};}).sort(function(a,b){return (a.att==null?101:a.att)-(b.att==null?101:b.att);});
    byId("analyticsAttendanceBody").innerHTML=attRows.slice(0,20).map(function(x){return '<tr><td>'+escapeHtml(x.name)+'</td><td>'+escapeHtml(x.cls)+'</td><td>'+(x.att==null?'No attendance data':x.att.toFixed(1)+'%')+'</td><td>'+x.avg.toFixed(1)+'%</td></tr>';}).join("");
  }
  function renderStudentProgress(){
    var id=byId("analyticsStudentSelect")&&byId("analyticsStudentSelect").value,box=byId("analyticsProgress");if(!box)return;
    if(!id){box.innerHTML='<div class="empty-state"><p>Student select karein taake uski exam-wise progress dekhein.</p></div>';return;}
    var items=[];examRecords.forEach(function(ex){if(currentCampus!=="all"&&ex.campus!==currentCampus)return;if(byId("analyticsClassFilter").value!=="all"&&ex.studentClass!==byId("analyticsClassFilter").value)return;(ex.results||[]).forEach(function(r){if(r.studentId===id)items.push({exam:ex,result:r});});});
    items.sort(function(a,b){return String(a.exam.date||"").localeCompare(String(b.exam.date||""));});
    box.innerHTML=items.length?items.map(function(x){var pct=Number(x.result.percentage)||0;return '<div class="analytics-progress-row"><div><b>'+escapeHtml(x.exam.name)+'</b><small>'+escapeHtml(x.exam.date||x.exam.session||"")+'</small></div><div class="analytics-bar-track"><span style="width:'+Math.max(0,Math.min(100,pct))+'%"></span></div><strong>'+pct.toFixed(1)+'%</strong></div>';}).join(""):'<div class="empty-state"><p>Is student ka result record nahi mila.</p></div>';
  }
  function exportAnalyticsCsv(){var records=analyticsFilteredRecords(),rows=[["Exam","Date","Campus","Class","Student ID","Student Name","Obtained","Maximum","Percentage","Grade","Status"]];records.forEach(function(x){rows.push([x.exam.name,x.exam.date,campusName(x.exam.campus),x.exam.studentClass,x.result.studentId,x.result.studentName,x.result.total,x.result.maxTotal,x.result.percentage,gradeFor(x.result.percentage),resultStatus(x.result,x.exam)]);});downloadCsvRows(rows,"Swat_Model_School_Performance_Analytics.csv");}
  function printAnalyticsReport(){var body=byId("analyticsPage").innerHTML,w=window.open("","_blank");if(!w){showToast("Print window browser ne block kar di. Pop-ups allow karein.");return;}w.document.write('<html><head><title>Student Performance Analytics</title><style>body{font-family:Arial;padding:24px;color:#202943}h2,h3{margin:12px 0}table{width:100%;border-collapse:collapse;margin:12px 0 24px}th,td{border:1px solid #ccd2df;padding:7px;text-align:left;font-size:11px}.analytics-bar-track{height:9px;background:#eee;border-radius:8px}.analytics-bar-track span{display:block;height:100%;background:#7564df;border-radius:8px}.page-intro button,.idcard-toolbar,.prototype-note{display:none!important}</style></head><body><h1>SWAT MODEL SCHOOL, DARMAI, SWAT</h1><h2>Student Performance Analytics</h2>'+body+'</body></html>');w.document.close();w.focus();w.print();}
  function downloadCsvRows(rows,filename){var csv=rows.map(function(r){return r.map(function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';}).join(",");}).join("\r\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);}

  function renderDirectorDashboard(){
    if(!byId("directorCampusLabel"))return;
    var today=localDateString(),month=today.slice(0,7),campus=currentCampus;
    var visibleStudents=students.filter(function(s){return campus==="all"||s.campus===campus;});
    var boys=students.filter(function(s){return s.campus==="boys";}).length,girls=students.filter(function(s){return s.campus==="girls";}).length;
    var todays=attendanceRecords.filter(function(r){return r.date===today&&visibleStudents.some(function(st){return st.id===r.studentId;});});
    var present=todays.filter(function(r){return r.status==="present";}).length,absent=todays.filter(function(r){return r.status==="absent";}).length,leave=todays.filter(function(r){return r.status==="leave";}).length;
    var collection=0,paymentCount=0,due=0,dueAccounts=0;
    feeRecords.forEach(function(r){var st=students.find(function(x){return x.id===r.studentId;});var c=st?st.campus:r.campus;if(campus!=="all"&&c!==campus)return;due+=Math.max(0,Number(r.net||0)-Number(r.paid||0));if(Number(r.net||0)-Number(r.paid||0)>0)dueAccounts++;(r.payments||[]).forEach(function(pay){if(String(pay.date||"").slice(0,7)===month){collection+=Number(pay.amount)||0;paymentCount++;}});});
    var activeStaff=staffRecords.filter(function(x){return x.status==="Active"&&(campus==="all"||x.campus===campus||x.campus==="both");});
    var income=0,paidExpenses=0,salaryPaid=0,pendingExpenses=0;
    feeRecords.forEach(function(r){var st=students.find(function(x){return x.id===r.studentId;});var c=st?st.campus:r.campus;if(campus!=="all"&&c!==campus)return;(r.payments||[]).forEach(function(pay){if(String(pay.date||"").slice(0,7)===month)income+=Number(pay.amount)||0;});});
    expenseRecords.forEach(function(e){if(String(e.date||"").slice(0,7)!==month||(campus!=="all"&&e.campus!==campus&&e.campus!=="both"))return;if(e.status==="Paid")paidExpenses+=Number(e.amount)||0;else pendingExpenses+=Number(e.amount)||0;});
    payrollRecords.forEach(function(r){if(r.month===month&&(campus==="all"||r.campus===campus||r.campus==="both"))salaryPaid+=Number(r.paid)||0;});
    var net=income-paidExpenses-salaryPaid;
    byId("directorCampusLabel").textContent=campus==="all"?"All Campuses Overview":campusName(campus)+" Overview";
    byId("directorUpdatedAt").textContent="Updated "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    byId("directorMonthLabel").textContent=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1).toLocaleDateString("en-PK",{month:"long",year:"numeric"});
    byId("dirTotalStudents").textContent=visibleStudents.length.toLocaleString();byId("dirStudentSplit").textContent=campus==="all"?"Boys "+boys+" · Girls "+girls:campusName(campus);
    byId("dirPresentToday").textContent=present.toLocaleString();byId("dirAttendanceRate").textContent=(visibleStudents.length?Math.round(present/visibleStudents.length*100):0)+"% of enrolled students marked present";
    byId("dirFeeCollection").textContent=money(collection);byId("dirFeePaymentCount").textContent=paymentCount+" payments recorded this month";
    byId("dirActiveStaff").textContent=activeStaff.length;byId("dirStaffSplit").textContent=activeStaff.filter(function(x){return /teach/i.test(x.type||"");}).length+" teaching · "+activeStaff.filter(function(x){return !/teach/i.test(x.type||"");}).length+" other";
    byId("dirFeeDue").textContent=money(due);byId("dirFeeDueCount").textContent=dueAccounts+" fee accounts with balance";
    byId("dirNetCash").textContent=money(net);byId("dirCashNote").textContent="Received "+money(income)+" · paid out "+money(paidExpenses+salaryPaid);
    var comparison="";["boys","girls"].forEach(function(c){var list=students.filter(function(st){return st.campus===c;}),daily=attendanceRecords.filter(function(r){return r.date===today&&r.campus===c&&r.status==="present";}).length,rate=list.length?Math.round(daily/list.length*100):0;comparison+='<div class="campus-compare-card"><h4>'+campusName(c)+'</h4><div class="campus-total">'+list.length+'</div><small>Registered students</small><div class="compare-line"><span style="width:'+Math.min(100,rate)+'%"></span></div><div class="campus-compare-meta"><span>Present today</span><b>'+daily+' / '+list.length+'</b></div></div>';});byId("directorCampusComparison").innerHTML=comparison;
    var alerts=[];if(visibleStudents.length===0)alerts.push(["No student records found","Add student records to populate school indicators","warn"]);else if(todays.length===0)alerts.push(["Today's attendance not entered","No attendance records are saved for today yet","warn"]);else if(present+absent+leave<visibleStudents.length)alerts.push(["Attendance is incomplete",(visibleStudents.length-todays.length)+" student(s) have no attendance mark for today","warn"]);else alerts.push(["Attendance records updated","Today's attendance has records for all enrolled students","good"]);
    if(due>0)alerts.push(["Fee balance pending",money(due)+" outstanding across "+dueAccounts+" fee accounts","warn"]);if(pendingExpenses>0)alerts.push(["Expenses awaiting payment",money(pendingExpenses)+" in pending expense entries this month","warn"]);
    var lowStock=inventoryRecords.filter(function(x){return x.type==="Stock"&&getStock(x.id)<=Number(x.minimum||0);});if(lowStock.length)alerts.push(["Low stock items",lowStock.length+" inventory item(s) are at or below minimum level","warn"]);
    if(!timetableRecords.length)alerts.push(["Timetable not configured","Add weekly periods in the Timetable module","warn"]);
    byId("directorAlerts").innerHTML=alerts.slice(0,6).map(function(a){return '<div class="director-alert '+(a[2]==="good"?"alert-good":"")+'"><span class="alert-dot"></span><div><b>'+escapeHtml(a[0])+'</b><small>'+escapeHtml(a[1])+'</small></div></div>';}).join("");
    var classMap={};visibleStudents.forEach(function(st){var cls=st.studentClass||"Unassigned";classMap[cls]=(classMap[cls]||0)+1;});var classRows=Object.keys(classMap).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});var maxClass=classRows.reduce(function(m,k){return Math.max(m,classMap[k]);},1);byId("directorClassStrength").innerHTML=classRows.length?classRows.map(function(k){return '<div class="class-strength-row"><label>'+escapeHtml(k)+'</label><div class="strength-track"><span style="width:'+Math.round(classMap[k]/maxClass*100)+'%"></span></div><strong>'+classMap[k]+'</strong></div>';}).join(""):'<div class="empty-state"><p>No student class data available yet.</p></div>';
  }


  function loadParentNotices(){try{parentNotices=JSON.parse(localStorage.getItem(PARENT_NOTICES_KEY)||"[]");if(!Array.isArray(parentNotices))parentNotices=[];}catch(e){parentNotices=[];}}
  function saveParentNotices(){try{localStorage.setItem(PARENT_NOTICES_KEY,JSON.stringify(parentNotices));return true;}catch(e){showToast("Notice save nahi ho saka. Backup/storage check karein.");return false;}}
  function parentAudienceLabel(n){return n.audience==="boys"?"Boys Campus":n.audience==="girls"?"Girls Campus":n.audience==="class"?n.studentClass+" parents":"All parents";}
  function parentStudentFeeDue(st){var due=0;feeRecords.forEach(function(r){if(r.studentId===st.id)due+=Math.max(0,Number(r.net||0)-Number(r.paid||0));});return due;}
  function parentStudentAttendance(st){var rows=attendanceRecords.filter(function(r){return r.studentId===st.id;});var present=rows.filter(function(r){return r.status==="present";}).length;return {present:present,total:rows.length,rate:rows.length?Math.round(present/rows.length*100):0};}
  function parentStudentLatestResult(st){var rows=examRecords.filter(function(r){return r.studentId===st.id;}).sort(function(a,b){return String(b.savedAt||"").localeCompare(String(a.savedAt||""));});return rows.length?rows[0]:null;}
  function renderParentPortal(){
    if(!byId("parentPortalPage"))return;
    var campus=currentCampus, visible=students.filter(function(s){return campus==="all"||s.campus===campus;});
    byId("parentNoticeCount").textContent=parentNotices.length;
    byId("parentPhoneCount").textContent=visible.filter(function(s){return !!String(s.phone||"").trim();}).length;
    byId("parentCampusCount").textContent=campus==="all"?"All":campusName(campus).replace(" Campus","");
    var sel=byId("parentStudentSelect"), old=sel.value, opts='<option value="">Select a student</option>';
    visible.slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name));}).forEach(function(s){opts+='<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+' · '+escapeHtml(s.id)+' · '+escapeHtml(s.studentClass)+'</option>';});
    sel.innerHTML=opts;if(visible.some(function(s){return s.id===old;}))sel.value=old;
    renderParentStudentPreview();renderParentNoticeList();
  }
  function renderParentStudentPreview(){var id=byId("parentStudentSelect").value,st=students.find(function(s){return s.id===id;}),box=byId("parentStudentPreview");
    if(!st){box.innerHTML='<div class="empty-state"><p>Student select karein to guardian contact, fee balance, attendance aur latest result summary yahan nazar aayegi.</p></div>';return;}
    var att=parentStudentAttendance(st),due=parentStudentFeeDue(st),res=parentStudentLatestResult(st),phone=String(st.phone||"").replace(/[^0-9]/g,"");
    box.innerHTML='<div class="parent-preview-head"><div class="parent-avatar">'+escapeHtml(String(st.name||"S").charAt(0).toUpperCase())+'</div><div><b>'+escapeHtml(st.name)+'</b><small>'+escapeHtml(st.id)+' · '+escapeHtml(st.studentClass)+' · '+escapeHtml(campusName(st.campus))+'</small></div></div><div class="parent-preview-grid"><div><small>Guardian</small><b>'+escapeHtml(st.guardian||"Not recorded")+'</b></div><div><small>Phone</small><b>'+escapeHtml(st.phone||"Not recorded")+'</b></div><div><small>Attendance records</small><b>'+att.present+' / '+att.total+' present ('+att.rate+'%)</b></div><div><small>Fee balance</small><b>'+money(due)+'</b></div><div><small>Latest result</small><b>'+(res?Number(res.percentage||0).toFixed(1)+"%":"No result recorded")+'</b></div></div>'+(phone?'<a class="primary-button parent-wa" target="_blank" rel="noopener" href="https://wa.me/'+phone+'?text='+encodeURIComponent('Assalam-o-Alaikum '+(st.guardian||'Parent')+', Swat Model School ki taraf se '+st.name+' ('+st.studentClass+') ke hawale se rabta kar rahe hain.')+'">Open WhatsApp</a>':'<small>Guardian phone number student record mein available nahi.</small>');
  }
  function renderParentNoticeList(){var q=(byId("parentNoticeSearch").value||"").toLowerCase(),list=parentNotices.filter(function(n){return [n.title,n.message,n.audience,n.studentClass].join(" ").toLowerCase().indexOf(q)>=0;}).sort(function(a,b){return String(b.date||"").localeCompare(String(a.date||""));});
    byId("parentNoticeList").innerHTML=list.length?list.map(function(n){var audience=n.audience==="boys"?students.filter(function(s){return s.campus==="boys";}):n.audience==="girls"?students.filter(function(s){return s.campus==="girls";}):n.audience==="class"?students.filter(function(s){return s.studentClass===n.studentClass;}):students;var contacts=audience.filter(function(s){return !!String(s.phone||"").trim();});return '<article class="parent-notice-card"><div class="parent-notice-top"><div><span class="readiness-badge">'+escapeHtml(parentAudienceLabel(n))+'</span><h3>'+escapeHtml(n.title)+'</h3><small>'+escapeHtml(n.date||"")+'</small></div><button class="delete-button" data-parent-notice-delete="'+escapeHtml(n.id)+'">Delete</button></div><p>'+escapeHtml(n.message)+'</p><div class="parent-notice-bottom"><small>'+contacts.length+' guardian contact(s) available</small><button class="secondary-button" data-parent-notice-share="'+escapeHtml(n.id)+'">Prepare WhatsApp message</button></div></article>';}).join(""):'<div class="empty-state"><p>Abhi koi notice publish nahi hua.</p></div>';
  }
  function publishParentNotice(){var n={id:"notice-"+Date.now(),title:byId("parentNoticeTitle").value.trim(),audience:byId("parentNoticeAudience").value,studentClass:byId("parentNoticeAudience").value==="class"?byId("parentNoticeClass").value:"",date:byId("parentNoticeDate").value,message:byId("parentNoticeMessage").value.trim()};if(!n.title||!n.date||!n.message){showToast("Notice title, date aur message fill karein.");return;}parentNotices.push(n);if(!saveParentNotices()){parentNotices.pop();return;}byId("parentNoticeForm").reset();byId("parentNoticeDate").value=localDateString();byId("parentNoticeClassWrap").classList.add("hidden");renderParentPortal();showToast("Notice publish ho gaya.");}
  function shareParentNotice(id){var n=parentNotices.find(function(x){return x.id===id;});if(!n)return;var recipients=students.filter(function(s){return (n.audience==="all"||(n.audience==="boys"&&s.campus==="boys")||(n.audience==="girls"&&s.campus==="girls")||(n.audience==="class"&&s.studentClass===n.studentClass))&&String(s.phone||"").trim();});if(!recipients.length){showToast("Is audience ke liye guardian phone numbers available nahi.");return;}var first=recipients[0],phone=String(first.phone).replace(/[^0-9]/g,"");var msg="Swat Model School Notice: "+n.title+"\n"+n.message+"\nDate: "+n.date;window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(msg),"_blank");showToast("WhatsApp message pehle guardian ke number ke liye prepare hua. Baqi parents ko manually share karein.");}

  function loadTeacherReviews(){try{teacherReviews=JSON.parse(localStorage.getItem(TEACHER_REVIEWS_KEY)||"[]");if(!Array.isArray(teacherReviews))teacherReviews=[];}catch(e){teacherReviews=[];}}
  function saveTeacherReviews(){try{localStorage.setItem(TEACHER_REVIEWS_KEY,JSON.stringify(teacherReviews));return true;}catch(e){showToast("Teacher review save nahi ho saka.");return false;}}
  function teacherMonth(){return byId("tpMonth").value||localDateString().slice(0,7);}
  function teacherCampusMatch(s,c){return c==="all"||s.campus===c||s.campus==="both";}
  function loadBoardNotices(){try{boardNotices=JSON.parse(localStorage.getItem(BOARD_NOTICES_KEY)||"[]");if(!Array.isArray(boardNotices))boardNotices=[];}catch(e){boardNotices=[];}}
  function saveBoardNotices(){try{localStorage.setItem(BOARD_NOTICES_KEY,JSON.stringify(boardNotices));return true;}catch(e){showToast("Notice save nahi ho saka. Browser storage check karein.");return false;}}
  function noticeIsExpired(n){return !!(n.expiry && n.expiry < localDateString());}
  function renderNoticeBoard(){
    var today=localDateString(), published=boardNotices.filter(function(n){return n.status==="published";});
    byId("boardTotal").textContent=boardNotices.length;byId("boardPublished").textContent=published.length;byId("boardPinned").textContent=boardNotices.filter(function(n){return !!n.pinned;}).length;byId("boardExpired").textContent=published.filter(noticeIsExpired).length;
    var q=(byId("boardSearch").value||"").toLowerCase(),filter=byId("boardFilter").value;
    var list=boardNotices.filter(function(n){var match=[n.title,n.message,n.audience,n.campus,n.priority].join(" ").toLowerCase().indexOf(q)>=0;if(!match)return false;if(filter==="published")return n.status==="published";if(filter==="draft")return n.status==="draft";if(filter==="expired")return n.status==="published"&&noticeIsExpired(n);if(filter==="active")return n.status==="published"&&!noticeIsExpired(n);return true;}).sort(function(a,b){return (Number(!!b.pinned)-Number(!!a.pinned))||String(b.date||"").localeCompare(String(a.date||""));});
    byId("boardNoticeList").innerHTML=list.length?list.map(function(n){var expired=noticeIsExpired(n),priority=n.priority||"normal",aud=n.audience==="everyone"?"Everyone":n.audience.charAt(0).toUpperCase()+n.audience.slice(1),camp=n.campus==="all"?"Both campuses":n.campus+" campus";return '<article class="parent-notice-card"><div class="parent-notice-top"><div><span class="readiness-badge">'+escapeHtml(aud)+' · '+escapeHtml(camp)+'</span> <span class="readiness-badge">'+escapeHtml(priority.toUpperCase())+'</span><h3>'+escapeHtml(n.title)+'</h3><small>'+escapeHtml(n.date||"")+(n.expiry?" · Expires "+escapeHtml(n.expiry):"")+'</small></div><span class="readiness-badge">'+(n.status==="draft"?"DRAFT":expired?"EXPIRED":"PUBLISHED")+'</span></div><p>'+escapeHtml(n.message)+'</p><div class="parent-notice-bottom"><small>'+(n.pinned?"Pinned · ":"")+"Notice ID: "+escapeHtml(n.id)+'</small><div class="attendance-filters"><button class="secondary-button" data-board-pin="'+escapeHtml(n.id)+'">'+(n.pinned?"Unpin":"Pin")+'</button><button class="secondary-button" data-board-publish="'+escapeHtml(n.id)+'">'+(n.status==="draft"?"Publish":"Unpublish")+'</button><button class="delete-button" data-board-delete="'+escapeHtml(n.id)+'">Delete</button></div></div></article>';}).join(""):'<div class="empty-state"><h3>No notices found</h3><p>Notice create karein ya search/filter change karein.</p></div>';
  }
  function createBoardNotice(){var n={id:"board-"+Date.now(),title:byId("boardTitle").value.trim(),audience:byId("boardAudience").value,campus:byId("boardCampus").value,priority:byId("boardPriority").value,date:byId("boardDate").value,expiry:byId("boardExpiry").value,status:byId("boardStatus").value,message:byId("boardMessage").value.trim(),pinned:false};if(!n.title||!n.date||!n.message){showToast("Title, publish date aur announcement fill karein.");return;}if(n.expiry&&n.expiry<n.date){showToast("Expiry date publish date se pehle nahi ho sakti.");return;}boardNotices.push(n);if(!saveBoardNotices()){boardNotices.pop();return;}byId("boardNoticeForm").reset();byId("boardDate").value=localDateString();renderNoticeBoard();showToast(n.status==="draft"?"Draft save ho gaya.":"Notice publish ho gaya.");}
  function handleBoardNoticeClick(e){var el=e.target;while(el&&el!==this){var id=el.getAttribute("data-board-pin")||el.getAttribute("data-board-publish")||el.getAttribute("data-board-delete");if(id){var n=boardNotices.find(function(x){return x.id===id;});if(!n)return;if(el.hasAttribute("data-board-pin"))n.pinned=!n.pinned;else if(el.hasAttribute("data-board-publish"))n.status=n.status==="draft"?"published":"draft";else if(el.hasAttribute("data-board-delete")){if(!confirm("Delete this notice?"))return;boardNotices=boardNotices.filter(function(x){return x.id!==id;});}if(saveBoardNotices())renderNoticeBoard();return;}el=el.parentNode;}}

  function renderTeacherPerformance(){
    if(!byId("teacherPerformancePage"))return;
    var month=teacherMonth(),campus=byId("tpCampus").value||"all",teachers=staffRecords.filter(function(s){return s.type==="Teaching"&&s.status==="Active"&&teacherCampusMatch(s,campus);}),marked=0,present=0,paid=0,rows="";
    var monthRows=staffAttendanceRecords.filter(function(r){return String(r.date||"").slice(0,7)===month;});
    teachers.forEach(function(t){var rec=monthRows.filter(function(r){return r.staffId===t.id;}),p=rec.filter(function(r){return String(r.status).toLowerCase()==="present";}).length,a=rec.filter(function(r){return String(r.status).toLowerCase()==="absent";}).length,l=rec.filter(function(r){return String(r.status).toLowerCase()==="leave";}).length,total=rec.length,rate=total?Math.round(p/total*100):0;marked+=total;present+=p;
      var pr=payrollRecords.find(function(x){return x.staffId===t.id&&x.month===month;}),payStatus=pr?pr.status+" ("+money(pr.paid)+")":"Not entered";if(pr)paid+=Number(pr.paid)||0;
      rows+="<tr><td><b>"+escapeHtml(t.name)+"</b><br><small>"+escapeHtml(t.id)+"</small></td><td>"+escapeHtml(t.designation)+"</td><td>"+escapeHtml(t.campus==="both"?"Both Campuses":campusName(t.campus))+"</td><td>"+p+"</td><td>"+a+"</td><td>"+l+"</td><td>"+total+"</td><td><b>"+(total?rate+"%":"—")+"</b></td><td>"+escapeHtml(payStatus)+"</td></tr>";
    });
    byId("tpActive").textContent=teachers.length;byId("tpMarked").textContent=marked;byId("tpPresent").textContent=present;byId("tpPayroll").textContent=money(paid);byId("tpTableBody").innerHTML=rows;byId("tpEmpty").style.display=rows?"none":"block";
    var sel=byId("tpReviewTeacher"),old=sel.value;sel.innerHTML='<option value="">Select teacher</option>';staffRecords.filter(function(s){return s.type==="Teaching"&&s.status!=="Resigned";}).forEach(function(t){sel.innerHTML+='<option value="'+escapeHtml(t.id)+'">'+escapeHtml(t.name)+' ('+escapeHtml(t.id)+')</option>';});sel.value=old;
    renderTeacherReviews();
  }
  function renderTeacherReviews(){var rows="";teacherReviews.slice().sort(function(a,b){return String(b.month).localeCompare(String(a.month));}).forEach(function(r){rows+='<tr><td>'+escapeHtml(r.month)+'</td><td>'+escapeHtml(r.teacherName)+'</td><td>'+escapeHtml(r.status)+'</td><td>'+escapeHtml(r.note)+'</td><td><button class="delete-button" data-tpreview-delete="'+escapeHtml(r.id)+'">Delete</button></td></tr>';});byId("tpReviewsBody").innerHTML=rows;}
  function saveTeacherReview(){var id=byId("tpReviewTeacher").value,t=staffRecords.find(function(x){return x.id===id;}),month=byId("tpReviewMonth").value,note=byId("tpReviewNote").value.trim();if(!t||!month||!note){showToast("Teacher, month aur review notes enter karein.");return;}teacherReviews.push({id:"TPR-"+Date.now(),staffId:id,teacherName:t.name,month:month,status:byId("tpReviewStatus").value,note:note,createdAt:new Date().toISOString()});if(saveTeacherReviews()){byId("tpReviewNote").value="";renderTeacherReviews();showToast("Teacher review note save ho gaya.");}}
  function exportTeacherPerformance(){var month=teacherMonth(),campus=byId("tpCampus").value||"all",lines=[["Staff ID","Teacher","Designation","Campus","Present","Absent","Leave","Marked Days","Present %","Payroll Status"]];staffRecords.filter(function(s){return s.type==="Teaching"&&s.status==="Active"&&teacherCampusMatch(s,campus);}).forEach(function(t){var rec=staffAttendanceRecords.filter(function(r){return r.staffId===t.id&&String(r.date||"").slice(0,7)===month;}),p=rec.filter(function(r){return String(r.status).toLowerCase()==="present";}).length,a=rec.filter(function(r){return String(r.status).toLowerCase()==="absent";}).length,l=rec.filter(function(r){return String(r.status).toLowerCase()==="leave";}).length,pr=payrollRecords.find(function(x){return x.staffId===t.id&&x.month===month;});lines.push([t.id,t.name,t.designation,t.campus,p,a,l,rec.length,rec.length?Math.round(p/rec.length*100)+"%":"",pr?pr.status:"Not entered"]);});var csv=lines.map(function(row){return row.map(function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';}).join(",");}).join("\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Teacher_Performance_"+month+".csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}


  function reportMoney(n){return "PKR " + Number(n||0).toLocaleString("en-PK",{maximumFractionDigits:0});}
  function reportCampusMatch(rec,campus){return campus==="all" || String(rec&&rec.campus||"").toLowerCase()===campus;}
  function monthlyReportData(){
    var month=byId("monthlyReportMonth").value||localDateString().slice(0,7), campus=byId("monthlyReportCampus").value||"all";
    var kids=students.filter(function(s){return reportCampusMatch(s,campus);});
    var attendance=attendanceRecords.filter(function(r){return String(r.date||"").slice(0,7)===month && reportCampusMatch(r,campus);});
    var staff=staffRecords.filter(function(r){return reportCampusMatch(r,campus);});
    var staffAtt=staffAttendanceRecords.filter(function(r){return String(r.date||"").slice(0,7)===month && reportCampusMatch(r,campus);});
    var fees=feeRecords.filter(function(r){return reportCampusMatch(r,campus);});
    var demand=fees.filter(function(r){return String(r.month||"").slice(0,7)===month;}).reduce(function(t,r){return t+Number(r.net||0);},0);
    var collected=fees.reduce(function(t,r){return t+(r.payments||[]).filter(function(x){return String(x.date||"").slice(0,7)===month;}).reduce(function(a,x){return a+Number(x.amount||0);},0);},0);
    var outstanding=fees.reduce(function(t,r){return t+Math.max(0,Number(r.net||0)-Number(r.paid||0));},0);
    var expenses=expenseRecords.filter(function(r){return String(r.date||"").slice(0,7)===month && reportCampusMatch(r,campus) && r.status==="paid";}).reduce(function(t,r){return t+Number(r.amount||0);},0);
    var payroll=payrollRecords.filter(function(r){return String(r.month||r.payrollMonth||"").slice(0,7)===month && reportCampusMatch(r,campus);}).reduce(function(t,r){return t+Number(r.paid||r.paidAmount||0);},0);
    var exams=examRecords.filter(function(ex){return String(ex.date||ex.examDate||ex.createdAt||"").slice(0,7)===month && (campus==="all" || (ex.results||[]).some(function(r){return reportCampusMatch(r,campus); }));});
    var resultRows=[];exams.forEach(function(ex){(ex.results||[]).filter(function(r){return reportCampusMatch(r,campus);}).forEach(function(r){resultRows.push(r);});});
    var gate=gateLogs.filter(function(r){return String(r.date||r.timestamp||"").slice(0,7)===month && reportCampusMatch(r,campus);});
    return {month:month,campus:campus,kids:kids,attendance:attendance,staff:staff,staffAtt:staffAtt,demand:demand,collected:collected,outstanding:outstanding,expenses:expenses,payroll:payroll,exams:exams,results:resultRows,gate:gate};
  }
  function renderMonthlyReportPreview(){
    if(!byId("monthlyReportKpis"))return;var d=monthlyReportData();
    var present=d.attendance.filter(function(r){return String(r.status||"").toLowerCase()==="present";}).length;
    var k=[ ["TOTAL STUDENTS",d.kids.length,"Registered students"],["STUDENT PRESENT MARKS",present,"Recorded present entries"],["FEE COLLECTED",reportMoney(d.collected),"Payments received in selected month"],["OUTSTANDING FEES",reportMoney(d.outstanding),"Current balance across fee accounts"],["ACTIVE STAFF",d.staff.filter(function(x){return String(x.status||"active").toLowerCase()==="active";}).length,"Staff records"],["PAID EXPENSES",reportMoney(d.expenses),"Selected month"],["SALARY PAID",reportMoney(d.payroll),"Payroll entries for selected month"],["EXAM RESULT RECORDS",d.results.length,"Matching result rows"] ];
    byId("monthlyReportKpis").innerHTML=k.map(function(x){return '<article class="director-kpi"><div class="kpi-label">'+escapeHtml(x[0])+'</div><strong>'+escapeHtml(String(x[1]))+'</strong><small>'+escapeHtml(x[2])+'</small></article>';}).join("");
  }
  function generateMonthlyReport(){
    var d=monthlyReportData(),monthName=d.month,campusName=d.campus==="all"?"All Campuses":(d.campus==="boys"?"Boys Campus":"Girls Campus");
    var present=d.attendance.filter(function(r){return String(r.status||"").toLowerCase()==="present";}).length;
    var absent=d.attendance.filter(function(r){return String(r.status||"").toLowerCase()==="absent";}).length;
    var pass=d.results.filter(function(r){return Number(r.percentage||0)>=33;}).length;
    var rows=[ ["Student strength",d.kids.length], ["Student attendance entries",d.attendance.length], ["Present marks",present], ["Absent marks",absent], ["Staff strength",d.staff.length], ["Staff attendance entries",d.staffAtt.length], ["Fee demand for selected month",reportMoney(d.demand)], ["Fee collection received in selected month",reportMoney(d.collected)], ["Current outstanding fee balance",reportMoney(d.outstanding)], ["Paid school expenses",reportMoney(d.expenses)], ["Payroll paid",reportMoney(d.payroll)], ["Exam result records",d.results.length], ["Pass records (33% reference)",pass], ["Gate activity records",d.gate.length] ];
    var html='<!doctype html><html><head><meta charset="utf-8"><title>Swat Model School Monthly Report</title><style>body{font-family:Arial,sans-serif;color:#17233b;margin:32px}header{border-bottom:3px solid #c69b42;padding-bottom:16px;margin-bottom:20px}h1{margin:0;color:#172b4d}small{color:#596579}.meta{margin-top:8px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:11px;border:1px solid #d7dce5;text-align:left}th{background:#edf1f7}.foot{margin-top:28px;border-top:1px solid #ccd3df;padding-top:12px;font-size:12px;color:#667085}.sign{display:flex;justify-content:space-between;margin-top:70px}.sign span{width:28%;border-top:1px solid #555;text-align:center;padding-top:8px}@media print{body{margin:16mm}}</style></head><body><header><h1>SWAT MODEL SCHOOL</h1><b>Monthly Management Report</b><div class="meta">Month: '+escapeHtml(monthName)+' &nbsp; | &nbsp; Campus: '+escapeHtml(campusName)+'</div><small>Generated: '+escapeHtml(new Date().toLocaleString())+'</small></header><h2>School Summary</h2><table><thead><tr><th>Indicator</th><th>Value</th></tr></thead><tbody>'+rows.map(function(r){return '<tr><td>'+escapeHtml(String(r[0]))+'</td><td>'+escapeHtml(String(r[1]))+'</td></tr>';}).join("")+'</tbody></table><p class="foot">This report is generated from records saved in this computer browser. Verify figures against original registers before official submission. Exam pass count uses 33% as a reference and may differ from exam-specific passing criteria.</p><div class="sign"><span>Prepared By</span><span>Principal</span><span>Director</span></div><script>window.onload=function(){window.print();};</script></body></html>';
    var w=window.open("","_blank");if(!w){showToast("Print window blocked. Browser pop-ups allow karein.");return;}w.document.open();w.document.write(html);w.document.close();
  }

  function loadSchoolSettings(){try{schoolSettings=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}");if(!schoolSettings||typeof schoolSettings!=="object")schoolSettings={};}catch(e){schoolSettings={};}}
  function saveSchoolSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(schoolSettings));return true;}catch(e){showToast("Settings save nahi huin. Logo size kam karein ya backup karein.");return false;}}
  function renderSettings(){
    var fields={setSchoolName:"schoolName",setShortName:"shortName",setAddress:"address",setPhone:"phone",setEmail:"email",setHeadName:"headName",setBoysName:"boysName",setBoysPhone:"boysPhone",setGirlsName:"girlsName",setGirlsPhone:"girlsPhone",setAcademicSession:"academicSession",setPassPercent:"passPercent",setWorkingDays:"workingDays",setCurrency:"currency"};
    Object.keys(fields).forEach(function(id){var el=byId(id),key=fields[id];if(el)el.value=schoolSettings[key]!==undefined?schoolSettings[key]:(id==="setSchoolName"?"Swat Model School":id==="setShortName"?"SMS":id==="setBoysName"?"Boys Campus":id==="setGirlsName"?"Girls Campus":id==="setPassPercent"?33:id==="setWorkingDays"?"Monday-Saturday":id==="setCurrency"?"PKR":"");});
    settingsLogoData=schoolSettings.logoData||"";var img=byId("settingsLogoPreview"),txt=byId("settingsLogoText");if(img&&settingsLogoData){img.src=settingsLogoData;img.style.display="block";txt.style.display="none";}else if(img){img.removeAttribute("src");img.style.display="none";txt.style.display="inline";}
    var audit=byId("settingsAuditList"),items=Array.isArray(schoolSettings.audit)?schoolSettings.audit:[];if(audit)audit.innerHTML=items.length?items.slice(0,8).map(function(x){return "<div class='settings-audit-row'>"+escapeHtml(x.when)+" — "+escapeHtml(x.action)+"</div>";}).join(""):"No settings changes recorded yet.";
  }
  function saveSchoolSettingsForm(e){e.preventDefault();var ids={schoolName:"setSchoolName",shortName:"setShortName",address:"setAddress",phone:"setPhone",email:"setEmail",headName:"setHeadName",boysName:"setBoysName",boysPhone:"setBoysPhone",girlsName:"setGirlsName",girlsPhone:"setGirlsPhone",academicSession:"setAcademicSession",passPercent:"setPassPercent",workingDays:"setWorkingDays",currency:"setCurrency"};var next={};Object.keys(ids).forEach(function(k){next[k]=byId(ids[k]).value.trim();});var pass=Number(next.passPercent);if(!next.schoolName||!pass||pass<1||pass>100){showToast("School name aur passing percentage (1–100) check karein.");return;}next.passPercent=pass;next.logoData=settingsLogoData;next.audit=Array.isArray(schoolSettings.audit)?schoolSettings.audit.slice():[];next.audit.unshift({when:new Date().toLocaleString(),action:"School profile / academic settings updated"});next.audit=next.audit.slice(0,20);var old=schoolSettings;schoolSettings=next;if(saveSchoolSettings()){showToast("School settings successfully save ho gayi hain.");renderSettings();}else schoolSettings=old;}


  function setAuthMessage(message, isError) {
    var el = byId("authMessage"); if (el) { el.textContent = message; el.classList.toggle("error", !!isError); }
  }
  function showLoginScreen(message) {
    var screen = byId("authScreen"), shell = byId("schoolAppShell");
    if (screen) screen.style.display = "flex"; if (shell) shell.classList.add("auth-locked");
    if (message) setAuthMessage(message, true);
  }
  function showSchoolApp() {
    var screen = byId("authScreen"), shell = byId("schoolAppShell");
    if (screen) screen.style.display = "none"; if (shell) shell.classList.remove("auth-locked");
  }
  async function loadAuthenticatedProfile(user) {
    var result = await supabaseClient.from("school_user_profiles").select("full_name, role, is_active").eq("id", user.id).single();
    if (result.error || !result.data || !result.data.is_active || ["admin", "director"].indexOf(result.data.role) === -1) {
      await supabaseClient.auth.signOut();
      throw new Error("Is account ka active Admin/Director profile nahi mila. School administrator se profile verify karwayein.");
    }
    authenticatedUser = user; authenticatedRole = result.data.role; workspaceRole = authenticatedRole;
    try { localStorage.setItem(WORKSPACE_ROLE_KEY, workspaceRole); } catch (e) {}
    showSchoolApp();
    if (!appInitialized) { appInitialized = true; setup(); } else { applyWorkspaceRole(workspaceRole); }
    await initializeStudentCloudSync();
    enableAutomaticCloudSaves();
    enableRealtimeModuleNotifications();
    var roleLabel = byId("signedInRole"); if (roleLabel) roleLabel.textContent = (authenticatedRole === "director" ? "Director" : "Administrator") + " · " + (result.data.full_name || user.email || "Account");
  }
  async function startCloudAuthentication() {
    var form = byId("cloudLoginForm"), loginBtn = byId("cloudLoginBtn");
    if (!window.supabase || !window.supabase.createClient) { showLoginScreen("Supabase library load nahi hui. Internet connection check karke refresh karein."); return; }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    if (form) form.addEventListener("submit", async function (e) {
      e.preventDefault(); if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = "Signing in..."; }
      setAuthMessage("Account verify ho raha hai...");
      var email = byId("cloudLoginEmail").value.trim(), password = byId("cloudLoginPassword").value;
      var result = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (result.error) { setAuthMessage("Login failed: " + result.error.message, true); }
      else { try { await loadAuthenticatedProfile(result.data.user); } catch (err) { showLoginScreen(err.message); } }
      if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = "Sign In"; }
    });
    var logout = byId("cloudLogoutBtn"); if (logout) logout.addEventListener("click", async function () { await supabaseClient.auth.signOut(); window.location.reload(); });
    supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT") { authenticatedUser = null; authenticatedRole = null; showLoginScreen("You have been signed out."); }
    });
    var sessionResult = await supabaseClient.auth.getSession();
    if (sessionResult.error) { showLoginScreen(sessionResult.error.message); return; }
    if (sessionResult.data.session) {
      try { await loadAuthenticatedProfile(sessionResult.data.session.user); } catch (err) { showLoginScreen(err.message); }
    } else { showLoginScreen("Director ya Administrator account se sign in karein."); }
  }

  function setup() {
    try { workspaceRole = localStorage.getItem(WORKSPACE_ROLE_KEY) || "admin"; } catch (e) { workspaceRole = "admin"; }
    loadStudents();
    loadSchoolSettings();
    loadAccessUsers();
    loadAttendance();
    loadGateLogs();
    renderStaffGateLogs();
    loadFees();
    loadExams();
    loadStaff();
    loadExpenses();
    loadInventory();
    loadTimetable();
    loadParentNotices();
    loadBoardNotices();
    loadTeacherReviews();
    var now = new Date();
    var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    byId("todayLabel").innerHTML = now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear();
    applyWorkspaceRole(workspaceRole);
    // Workspace role comes only from the authenticated Supabase profile; no client-side role selector.
    var roleLabel = byId("signedInRole"); if (roleLabel) roleLabel.textContent = (workspaceRole === "director" ? "Director" : "Administrator") + (authenticatedUser && authenticatedUser.email ? " · " + authenticatedUser.email : "");
    if (byId("datePill")) byId("datePill").innerHTML = "Academic year " + now.getFullYear() + "–" + (now.getFullYear() + 1);
    renderStudents();
    resetStaffForm();
    byId("staffAttendanceDate").value=localDateString();
    byId("payrollMonth").value=localDateString().slice(0,7);byId("payrollMonthFilter").value=localDateString().slice(0,7);byId("payrollDate").value=localDateString();
    document.addEventListener("click", function (event) {
      var el = event.target, page;
      while (el && el !== document) {
        page = el.getAttribute && el.getAttribute("data-page");
        if (page) { showPage(page); return; }
        if (el.getAttribute && el.getAttribute("data-edit-id")) { editStudent(el.getAttribute("data-edit-id")); return; }
        if (el.getAttribute && el.getAttribute("data-delete-id")) { deleteStudent(el.getAttribute("data-delete-id")); return; }
        el = el.parentNode;
      }
    });
    byId("addStudentBtn").onclick = openModal;
    byId("exportBackupBtn").onclick = downloadBackup;
    byId("importBackupBtn").onclick = function () { byId("importBackupFile").click(); };
    byId("importBackupFile").onchange = function () { restoreBackup(this.files && this.files[0]); this.value = ""; };
    byId("emptyAddBtn").onclick = openModal;
    byId("closeModal").onclick = closeModal;
    byId("cancelModal").onclick = closeModal;
    byId("studentForm").onsubmit = addStudent;
    byId("studentPhoto").onchange = function () {
      var file = this.files && this.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { showToast("Please choose an image file."); this.value = ""; return; }
      if (file.size > 500000) { showToast("Photo must be 500 KB or smaller."); this.value = ""; return; }
      var reader = new FileReader();
      reader.onload = function () { pendingPhotoData = reader.result; resetPhotoPreview(); };
      reader.readAsDataURL(file);
    };
    byId("studentSearch").onkeyup = renderStudents;
    byId("campusSelect").onchange = function () { currentCampus = this.value; renderStudents(); renderAttendance(); renderGateLogs(); renderFees(); renderDirectorDashboard(); if(byId("analyticsPage"))renderStudentAnalytics(); if(byId("feeRecoveryPage"))renderFeeRecovery(); if(byId("parentPortalPage"))renderParentPortal(); };
    byId("refreshDirectorDashboard").onclick = function(){renderDirectorDashboard();showToast("Director dashboard refreshed.");};
    if(byId("analyticsClassFilter"))byId("analyticsClassFilter").onchange=renderStudentAnalytics;
    if(byId("analyticsStudentSelect"))byId("analyticsStudentSelect").onchange=renderStudentProgress;
    if(byId("exportAnalyticsBtn"))byId("exportAnalyticsBtn").onclick=exportAnalyticsCsv;
    if(byId("printAnalyticsBtn"))byId("printAnalyticsBtn").onclick=printAnalyticsReport;
    if(byId("parentNoticeDate")){byId("parentNoticeDate").value=localDateString();byId("parentNoticeForm").onsubmit=function(e){e.preventDefault();publishParentNotice();};byId("parentNoticeAudience").onchange=function(){byId("parentNoticeClassWrap").classList.toggle("hidden",this.value!=="class");};byId("parentStudentSelect").onchange=renderParentStudentPreview;byId("parentNoticeSearch").oninput=renderParentNoticeList;byId("printParentNoticesBtn").onclick=function(){window.print();};byId("parentNoticeList").addEventListener("click",function(e){var el=e.target;while(el&&el!==this){if(el.getAttribute("data-parent-notice-share")){shareParentNotice(el.getAttribute("data-parent-notice-share"));return;}if(el.getAttribute("data-parent-notice-delete")){var id=el.getAttribute("data-parent-notice-delete");if(confirm("Delete this notice?")){parentNotices=parentNotices.filter(function(n){return n.id!==id;});saveParentNotices();renderParentPortal();}return;}el=el.parentNode;}});}
    if(byId("boardDate")){byId("boardDate").value=localDateString();byId("boardNoticeForm").onsubmit=function(e){e.preventDefault();createBoardNotice();};byId("boardSearch").oninput=renderNoticeBoard;byId("boardFilter").onchange=renderNoticeBoard;byId("boardNoticeList").addEventListener("click",handleBoardNoticeClick);byId("printNoticeBoardBtn").onclick=function(){window.print();};}
    if(byId("recoveryMonth")){byId("recoveryMonth").value=localDateString().slice(0,7);byId("recoveryMonth").onchange=renderFeeRecovery;byId("recoveryClass").onchange=renderFeeRecovery;byId("recoveryCampus").onchange=renderFeeRecovery;byId("recoverySearch").oninput=renderFeeRecovery;byId("exportFeeRecoveryBtn").onclick=exportFeeRecoveryCsv;byId("printFeeRecoveryBtn").onclick=printFeeRecoveryReport;}

    if(byId("accessUserForm")){byId("accessUserForm").onsubmit=addAccessUser;byId("accessUserRows").addEventListener("click",handleAccessUserAction);renderAccessUsers();}
    if(byId("cloudMigrationPreviewBtn"))byId("cloudMigrationPreviewBtn").onclick=previewCloudMigration;
    if(byId("cloudPushBtn"))byId("cloudPushBtn").onclick=pushLocalModulesToCloud;
    if(byId("cloudPullBtn"))byId("cloudPullBtn").onclick=pullCloudModulesToDevice;
    if(byId("uploadCloudSnapshotBtn"))byId("uploadCloudSnapshotBtn").onclick=uploadLocalSnapshotToCloud;
    if(byId("settingsForm")){byId("settingsForm").onsubmit=saveSchoolSettingsForm;byId("settingsDownloadBackup").onclick=downloadBackup;byId("settingsRestoreBackup").onclick=function(){byId("settingsRestoreFile").click();};byId("settingsRestoreFile").onchange=function(){restoreBackup(this.files&&this.files[0]);this.value="";};byId("setLogo").onchange=function(){var f=this.files&&this.files[0];if(!f)return;if(!/^image\/(png|jpeg)$/.test(f.type)||f.size>300000){showToast("Logo PNG/JPG ho aur 300 KB se chhota ho.");this.value="";return;}var r=new FileReader();r.onload=function(){settingsLogoData=r.result;renderSettings();};r.readAsDataURL(f);};byId("removeSettingsLogo").onclick=function(){settingsLogoData="";renderSettings();};}
    byId("mobileMenu").onclick = function () { byId("sidebar").className = byId("sidebar").className.indexOf("open") === -1 ? "sidebar open" : "sidebar"; };
    byId("studentModal").onclick = function (event) { if (event.target === this) closeModal(); };
    byId("idCardSearch").onkeyup = renderIdCards;
    byId("refreshCardsBtn").onclick = function () { renderStudents(); renderIdCards(); showToast("ID card preview refreshed."); };
    byId("printCardsBtn").onclick = printSelectedCards;
    byId("selectAllCards").onchange = function () {
      var checks = document.querySelectorAll("#idCardGrid .card-check"), i;
      for (i = 0; i < checks.length; i++) checks[i].checked = this.checked;
      updateSelectedCount();
    };
    byId("idCardGrid").addEventListener("change", function (event) {
      if (event.target && event.target.className === "card-check") updateSelectedCount();
    });
    window.addEventListener("afterprint", function () {
      var items = document.querySelectorAll("#idCardGrid .idcard-item"), i;
      for (i = 0; i < items.length; i++) items[i].className = "idcard-item";
    });
    byId("attendanceDate").value = localDateString();
    byId("attendanceDate").onchange = function(){renderAttendance();renderGateLogs();renderStaffGateLogs();};
    byId("attendanceClassFilter").onchange = renderAttendance;
    byId("saveManualAttendanceBtn").onclick = markFromManual;
    byId("manualAttendanceBtn").onclick = function(){ markFromQr(byId("manualAttendanceInput").value); };
    byId("manualAttendanceInput").addEventListener("keydown", function(e){ if(e.key === "Enter") markFromQr(this.value); });
    byId("startScannerBtn").onclick = startQrScanner;
    byId("stopScannerBtn").onclick = stopQrScanner;
    byId("exportAttendanceBtn").onclick = exportAttendanceCsv;
    byId("feeMonth").value = localDateString().slice(0,7);
    byId("feeMonthFilter").value = localDateString().slice(0,7);
    byId("feePaymentDate").value = localDateString();
    byId("feeForm").addEventListener("submit", saveFeeEntry);
    byId("feeStudent").onchange = loadExistingFeeAccount; byId("feeMonth").onchange = loadExistingFeeAccount;
    ["feeBase","feeTransport","feeExamination","feePromotion","feeDiscount","feeFine"].forEach(function(id){byId(id).addEventListener("input",updateFeePreview);});
    byId("feeSearch").oninput = renderFees; byId("feeMonthFilter").onchange = renderFees; byId("feeStatusFilter").onchange = renderFees;
    byId("exportFeesBtn").onclick = exportFeesCsv;
    byId("examForm").addEventListener("submit",createExam);
    byId("marksExam").onchange=populateMarksStudents;
    byId("marksStudent").onchange=renderMarksInputs;
    byId("saveMarksBtn").onclick=saveStudentMarks;
    byId("resultSearch").oninput=renderResults;
    byId("printMeritBtn").onclick=printMeritList;
    byId("resultsTableBody").addEventListener("click",function(e){var exid=e.target&&e.target.getAttribute("data-dmc-exam"),sid=e.target&&e.target.getAttribute("data-dmc-student");if(!exid||!sid)return;var ex=examRecords.find(function(x){return x.id===exid;}),r=ex&&ex.results.find(function(x){return x.studentId===sid;});if(ex&&r)printDmc(ex,r);});
    byId("feeTableBody").addEventListener("click",function(e){var key=e.target&&e.target.getAttribute("data-fee-receipt");if(!key)return;var rec=feeRecords.find(function(r){return r.key===key;});if(rec&&rec.payments&&rec.payments.length)printFeeReceipt(rec,rec.payments[rec.payments.length-1]);else showToast("Is fee account ki payment receipt available nahi.");});
    byId("resetFeeForm").addEventListener("click",function(){window.setTimeout(function(){byId("feeMonth").value=localDateString().slice(0,7);byId("feePaymentDate").value=localDateString();updateFeePreview();},0);});
    resetInventoryForm();
    byId("movementDate").value=localDateString();
    byId("inventoryForm").addEventListener("submit",saveInventoryItem);
    byId("resetInventoryForm").onclick=resetInventoryForm;
    byId("stockMovementForm").addEventListener("submit",saveStockMovement);
    byId("inventorySearch").oninput=renderInventoryTable;
    byId("inventoryTableBody").addEventListener("click",function(e){var id=e.target&&e.target.getAttribute("data-inventory-delete");if(id)deleteInventoryItem(id);});
    byId("exportInventoryBtn").onclick=exportInventoryCsv;
    resetExpenseForm();
    byId("financeMonth").value=localDateString().slice(0,7);
    byId("expenseForm").addEventListener("submit",saveExpenseEntry);
    byId("resetExpenseForm").onclick=resetExpenseForm;
    byId("financeMonth").onchange=renderFinanceModule;
    byId("financeCampus").onchange=renderFinanceModule;
    byId("expenseSearch").oninput=renderExpenseTable;
    byId("expenseTableBody").addEventListener("click",function(e){var id=e.target&&e.target.getAttribute("data-expense-delete");if(id)deleteExpense(id);});
    byId("exportFinanceBtn").onclick=exportFinanceCsv;
    byId("staffForm").addEventListener("submit",saveStaffRecord);
    byId("resetStaffForm").onclick=resetStaffForm;
    byId("staffSearch").oninput=renderStaffTable;
    byId("staffTableBody").addEventListener("click",function(e){
      var edit=e.target&&e.target.getAttribute("data-staff-edit"),del=e.target&&e.target.getAttribute("data-staff-delete"),qr=e.target&&e.target.getAttribute("data-staff-qr");
      if(edit)editStaff(edit);if(del)deleteStaff(del);if(qr)printStaffQr(qr);
    });
    byId("staffAttendanceDate").onchange=renderStaffAttendance;
    byId("saveStaffAttendance").onclick=saveStaffAttendanceEntry;
    byId("payrollStaff").onchange=loadStaffSalary;
    ["payrollBasic","payrollAllowance","payrollDeduction","payrollPaid"].forEach(function(id){byId(id).addEventListener("input",updatePayrollPreview);});
    byId("payrollForm").addEventListener("submit",savePayrollEntry);
    byId("payrollMonthFilter").onchange=renderStaffModule;
    byId("payrollTableBody").addEventListener("click",function(e){var key=e.target&&e.target.getAttribute("data-salary-slip");if(key)printSalarySlip(key);});
    if(byId("monthlyReportMonth")){byId("monthlyReportMonth").value=localDateString().slice(0,7);byId("monthlyReportMonth").onchange=renderMonthlyReportPreview;byId("monthlyReportCampus").onchange=renderMonthlyReportPreview;byId("previewMonthlyReportBtn").onclick=renderMonthlyReportPreview;byId("generateMonthlyReportBtn").onclick=generateMonthlyReport;renderMonthlyReportPreview();}
    updateFeePreview();
    byId("attendanceTableBody").addEventListener("click", function(e){ var id=e.target && e.target.getAttribute("data-att-edit"); if(!id) return; var student=students.find(function(s){return s.id===id;}); if(student){byId("attendanceStudentSelect").value=id; byId("attendanceStatusSelect").value=(attendanceRecords.find(function(r){return r.studentId===id && r.date===selectedAttendanceDate();})||{}).status||"present"; byId("attendanceStatusSelect").focus();} });
    renderAttendance();
    renderGateLogs();
    renderFees();
    if(byId("boardDate")){byId("boardDate").value=localDateString();byId("boardNoticeForm").onsubmit=function(e){e.preventDefault();createBoardNotice();};byId("boardSearch").oninput=renderNoticeBoard;byId("boardFilter").onchange=renderNoticeBoard;byId("boardNoticeList").addEventListener("click",handleBoardNoticeClick);byId("printNoticeBoardBtn").onclick=function(){window.print();};}
    if(byId("recoveryMonth")) renderFeeRecovery();
    renderIdCards();
    renderResults();
    populateExamSelectors();
    renderFinanceModule();
    renderInventoryModule();
    renderTimetableModule();
    renderDirectorDashboard();
  }
  if (document.addEventListener) document.addEventListener("DOMContentLoaded", startCloudAuthentication);
  else window.onload = startCloudAuthentication;
}());
