const TOKEN_KEY = "eduAssessAccessToken";
const DEFAULT_LOCAL_API_BASE = "http://localhost:8000";
const API_BASE = resolveApiBase();
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  currentUser: null,
  authTab: "signin",
  draftAssessment: null,
  teacherSummary: null,
  teacherAssessments: [],
  studentAssessments: []
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  renderApp();
  restoreSession();
});

function bindEvents() {
  byId("signInTab").addEventListener("click", () => switchAuthTab("signin"));
  byId("signUpTab").addEventListener("click", () => switchAuthTab("signup"));

  byId("signInForm").addEventListener("submit", handleSignIn);
  byId("signUpForm").addEventListener("submit", handleSignUp);

  byId("logoutBtn").addEventListener("click", handleLogout);
  byId("saveProfileBtn").addEventListener("click", handleSaveProfile);

  byId("saveDriveBtn").addEventListener("click", handleDriveConnect);
  byId("openDriveBtn").addEventListener("click", handleDriveOpen);

  byId("generateBtn").addEventListener("click", handleGeneratePaper);
  byId("publishBtn").addEventListener("click", handlePublishPaper);
  byId("printBtn").addEventListener("click", handlePrintPaper);
  byId("exportBtn").addEventListener("click", handleExportPaper);

  byId("teacherAssessments").addEventListener("click", handleTeacherListClick);
}

async function restoreSession() {
  if (!state.token) {
    return;
  }

  try {
    const response = await apiRequest("/api/auth/me");
    state.currentUser = response.user;
    await hydrateRoleData();
  } catch (error) {
    clearSession();
  }

  renderApp();
}

function switchAuthTab(tab) {
  state.authTab = tab;
  byId("signInTab").classList.toggle("active", tab === "signin");
  byId("signUpTab").classList.toggle("active", tab === "signup");
  byId("signInForm").classList.toggle("hidden", tab !== "signin");
  byId("signUpForm").classList.toggle("hidden", tab !== "signup");
  setMessage("authMessage", "", "");
}

async function handleSignIn(event) {
  event.preventDefault();

  const email = byId("signinEmail").value.trim().toLowerCase();
  const password = byId("signinPassword").value;

  try {
    const response = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email,
        password
      }
    });

    setSession(response.token, response.user);
    await hydrateRoleData();
    setMessage("authMessage", "Logged in successfully.", "success");
    byId("signInForm").reset();
    renderApp();
  } catch (error) {
    setMessage("authMessage", error.message, "error");
  }
}

async function handleSignUp(event) {
  event.preventDefault();

  const payload = {
    name: byId("signupName").value.trim(),
    email: byId("signupEmail").value.trim().toLowerCase(),
    password: byId("signupPassword").value,
    role: byId("signupRole").value,
    institution: byId("signupInstitution").value.trim(),
    track: byId("signupTrack").value.trim()
  };

  try {
    const response = await apiRequest("/api/auth/register", {
      method: "POST",
      body: payload
    });

    setSession(response.token, response.user);
    await hydrateRoleData();
    setMessage("authMessage", "Account created and logged in.", "success");
    byId("signUpForm").reset();
    renderApp();
  } catch (error) {
    setMessage("authMessage", error.message, "error");
  }
}

async function handleLogout() {
  try {
    if (state.token) {
      await apiRequest("/api/auth/logout", { method: "POST" });
    }
  } catch (error) {
    // Ignore logout API failure and clear local session anyway.
  }

  clearSession();
  state.draftAssessment = null;
  state.teacherSummary = null;
  state.teacherAssessments = [];
  state.studentAssessments = [];
  renderApp();
}

async function handleSaveProfile() {
  if (!state.currentUser) {
    return;
  }

  const institution = byId("profileInstitutionInput").value.trim();
  const track = byId("profileTrackInput").value.trim();

  try {
    const response = await apiRequest("/api/profile", {
      method: "PUT",
      body: {
        institution,
        track
      }
    });

    state.currentUser = response.user;
    renderProfile(state.currentUser);
  } catch (error) {
    setMessage("generatorStatus", error.message, "error");
  }
}

async function handleDriveConnect() {
  if (!state.currentUser || state.currentUser.role !== "teacher") {
    return;
  }

  const driveUrl = byId("driveUrlInput").value.trim();
  try {
    const response = await apiRequest("/api/drive", {
      method: "POST",
      body: {
        driveUrl
      }
    });

    state.currentUser = response.user;
    setMessage("driveStatus", "Google Drive link connected successfully.", "success");
    renderProfile(state.currentUser);
  } catch (error) {
    setMessage("driveStatus", error.message, "error");
  }
}

function handleDriveOpen() {
  const driveUrl = state.currentUser?.profile?.driveUrl;
  if (!driveUrl) {
    setMessage("driveStatus", "Connect a drive link first.", "error");
    return;
  }

  window.open(driveUrl, "_blank", "noopener,noreferrer");
}

async function handleGeneratePaper() {
  if (!state.currentUser || state.currentUser.role !== "teacher") {
    return;
  }

  const pdf = byId("pdfInput").files[0];
  if (!pdf) {
    setMessage("generatorStatus", "Please upload a PDF chapter/book first.", "error");
    return;
  }

  const counts = {
    mcq: safeInt(byId("mcqCount").value),
    veryShort: safeInt(byId("veryShortCount").value),
    short: safeInt(byId("shortCount").value),
    long: safeInt(byId("longCount").value)
  };

  const total = counts.mcq + counts.veryShort + counts.short + counts.long;
  if (total <= 0) {
    setMessage("generatorStatus", "Set at least one question count to generate the paper.", "error");
    return;
  }

  const chapterTitle = byId("chapterName").value.trim() || cleanFileName(pdf.name);
  const title = byId("assessmentTitle").value.trim() || "Summative Assessment";
  const patternNotes = byId("patternNotes").value.trim();

  setMessage("generatorStatus", "Reading PDF and generating questions...", "");

  try {
    const extractedText = await extractPdfText(pdf, 8);
    const response = await apiRequest("/api/assessments/generate", {
      method: "POST",
      body: {
        title,
        chapterTitle,
        patternNotes,
        extractedText,
        counts
      }
    });

    state.draftAssessment = {
      ...response.paper,
      createdAt: response.paper.createdAt || new Date().toISOString(),
      teacherName: state.currentUser.name,
      published: false
    };

    renderPaper(state.draftAssessment);
    byId("publishBtn").disabled = false;
    byId("printBtn").disabled = false;
    byId("exportBtn").disabled = false;
    setMessage("generatorStatus", "Assessment generated. Review and publish for students.", "success");
  } catch (error) {
    setMessage("generatorStatus", error.message, "error");
  }
}

async function handlePublishPaper() {
  if (!state.currentUser || state.currentUser.role !== "teacher" || !state.draftAssessment) {
    return;
  }

  try {
    const response = await apiRequest("/api/assessments", {
      method: "POST",
      body: {
        title: state.draftAssessment.title,
        chapterTitle: state.draftAssessment.chapterTitle,
        patternNotes: state.draftAssessment.patternNotes,
        questions: state.draftAssessment.questions
      }
    });

    state.draftAssessment = {
      ...state.draftAssessment,
      id: response.assessment.id,
      published: true,
      publishedAt: response.assessment.publishedAt
    };

    byId("publishBtn").disabled = true;
    setMessage("generatorStatus", "Assessment published to student feed.", "success");
    await loadTeacherData();
  } catch (error) {
    setMessage("generatorStatus", error.message, "error");
  }
}

function handlePrintPaper() {
  window.print();
}

function handleExportPaper() {
  const paper = state.draftAssessment;
  if (!paper) {
    setMessage("generatorStatus", "Generate a paper before exporting.", "error");
    return;
  }

  const content = buildPaperText(paper);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${paper.title.replace(/\s+/g, "-").toLowerCase() || "assessment"}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function handleTeacherListClick(event) {
  const button = event.target.closest("button[data-action='delete-assessment']");
  if (!button) {
    return;
  }

  const assessmentId = button.dataset.assessmentId;
  if (!assessmentId) {
    return;
  }

  const confirmed = window.confirm("Delete this published assessment? This cannot be undone.");
  if (!confirmed) {
    return;
  }

  button.disabled = true;
  try {
    await apiRequest(`/api/assessments/${assessmentId}`, { method: "DELETE" });
    await loadTeacherData();
    setMessage("generatorStatus", "Assessment deleted successfully.", "success");
  } catch (error) {
    setMessage("generatorStatus", error.message, "error");
    button.disabled = false;
  }
}

function renderApp() {
  const user = state.currentUser;
  byId("authSection").classList.toggle("hidden", !!user);
  byId("dashboardSection").classList.toggle("hidden", !user);

  if (!user) {
    switchAuthTab(state.authTab);
    return;
  }

  renderProfile(user);

  const teacherPanel = byId("teacherWorkspace");
  const studentPanel = byId("studentWorkspace");

  teacherPanel.classList.toggle("hidden", user.role !== "teacher");
  studentPanel.classList.toggle("hidden", user.role !== "student");

  if (user.role === "teacher") {
    hydrateTeacherWorkspace(user);
  } else {
    renderStudentFeed();
  }
}

function renderProfile(user) {
  byId("profileAvatar").textContent = initials(user.name);
  byId("profileName").textContent = user.name;
  byId("profileRoleBadge").textContent = user.role === "teacher" ? "Teacher Profile" : "Student Profile";
  byId("profileEmail").textContent = user.email;
  byId("profileInstitution").textContent = user.profile?.institution || "Not set";
  byId("profileTrack").textContent = user.profile?.track || "Not set";

  byId("profileInstitutionInput").value = user.profile?.institution || "";
  byId("profileTrackInput").value = user.profile?.track || "";
}

function hydrateTeacherWorkspace(user) {
  byId("driveUrlInput").value = user.profile?.driveUrl || "";

  if (user.profile?.driveUrl) {
    const connectedOn = user.profile.driveConnectedAt
      ? new Date(user.profile.driveConnectedAt).toLocaleString()
      : "recently";
    setMessage("driveStatus", `Connected to Google Drive (${connectedOn}).`, "success");
  } else {
    setMessage("driveStatus", "No Google Drive link connected yet.", "");
  }

  renderTeacherSummary();
  renderTeacherAssessments();

  if (state.draftAssessment) {
    renderPaper(state.draftAssessment);
    byId("publishBtn").disabled = state.draftAssessment.published;
    byId("printBtn").disabled = false;
    byId("exportBtn").disabled = false;
  } else {
    byId("paperOutput").textContent = "Generate an assessment to preview it here.";
    byId("paperOutput").classList.add("empty");
    byId("publishBtn").disabled = true;
    byId("printBtn").disabled = true;
    byId("exportBtn").disabled = true;
  }
}

async function hydrateRoleData() {
  if (!state.currentUser) {
    return;
  }

  if (state.currentUser.role === "teacher") {
    await loadTeacherData();
  } else {
    await loadStudentData();
  }
}

async function loadTeacherData() {
  try {
    const [summaryResponse, assessmentsResponse] = await Promise.all([
      apiRequest("/api/teacher/summary"),
      apiRequest("/api/assessments?mine=1")
    ]);

    state.teacherSummary = summaryResponse.summary || null;
    state.teacherAssessments = assessmentsResponse.assessments || [];

    renderTeacherSummary();
    renderTeacherAssessments();
  } catch (error) {
    setMessage("generatorStatus", error.message, "error");
  }
}

async function loadStudentData() {
  try {
    const response = await apiRequest("/api/assessments");
    state.studentAssessments = response.assessments || [];
    renderStudentFeed();
  } catch (error) {
    const feedEl = byId("studentFeed");
    feedEl.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

function renderTeacherSummary() {
  const summary = state.teacherSummary;
  byId("summaryPublished").textContent = String(summary?.publishedAssessments || 0);
  byId("summaryQuestions").textContent = String(summary?.totalQuestions || 0);
  byId("summaryMcq").textContent = String(summary?.mcqQuestions || 0);
  byId("summaryLong").textContent = String(summary?.longQuestions || 0);

  if (summary?.latestPublishedAt) {
    byId("summaryUpdatedAt").textContent = `Last published: ${formatDateTime(summary.latestPublishedAt)}`;
  } else {
    byId("summaryUpdatedAt").textContent = "Summary updates after every publish.";
  }
}

function renderTeacherAssessments() {
  const listEl = byId("teacherAssessments");
  const assessments = state.teacherAssessments || [];

  if (!assessments.length) {
    listEl.innerHTML = `<p class="subtle">No published assessments yet. Publish your first paper to build history.</p>`;
    return;
  }

  listEl.innerHTML = assessments
    .map((assessment) => {
      const when = formatDateTime(assessment.publishedAt || assessment.createdAt);
      return `
        <article class="feed-item">
          <h4>${escapeHtml(assessment.title)}</h4>
          <p class="feed-meta">Chapter: ${escapeHtml(assessment.chapterTitle)} • ${escapeHtml(when)}</p>
          <details>
            <summary>Review paper</summary>
            ${renderPaperMarkup(assessment, true)}
          </details>
          <div class="inline-actions">
            <button class="btn btn-ghost btn-small" type="button" data-action="delete-assessment" data-assessment-id="${escapeHtml(
              assessment.id
            )}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderStudentFeed() {
  const feedEl = byId("studentFeed");
  const assessments = state.studentAssessments || [];

  if (!assessments.length) {
    feedEl.innerHTML = `<p class="subtle">No assessments published yet.</p>`;
    return;
  }

  feedEl.innerHTML = assessments
    .map((assessment) => {
      const when = formatDateTime(assessment.publishedAt || assessment.createdAt);
      return `
        <article class="feed-item">
          <h4>${escapeHtml(assessment.title)}</h4>
          <p class="feed-meta">By ${escapeHtml(assessment.teacherName)} • ${escapeHtml(when)}</p>
          <p class="feed-meta">Chapter: ${escapeHtml(assessment.chapterTitle)}</p>
          <details>
            <summary>Open paper</summary>
            ${renderPaperMarkup(assessment, false)}
          </details>
        </article>
      `;
    })
    .join("");
}

function renderPaper(paper) {
  const output = byId("paperOutput");
  output.classList.remove("empty");
  output.innerHTML = renderPaperMarkup(paper, true);
}

function renderPaperMarkup(paper, showAnswers) {
  return `
    <section class="paper-header">
      <h4>${escapeHtml(paper.title)}</h4>
      <p>
        Teacher: ${escapeHtml(paper.teacherName || state.currentUser?.name || "Teacher")}<br />
        Chapter: ${escapeHtml(paper.chapterTitle)}<br />
        Generated: ${formatDateTime(paper.createdAt || Date.now())}${
    paper.patternNotes ? `<br />Pattern notes: ${escapeHtml(paper.patternNotes)}` : ""
  }
      </p>
    </section>

    ${renderQuestionSection("Section A: MCQs", paper.questions.mcq, "mcq", showAnswers)}
    ${renderQuestionSection("Section B: Very Short Answer", paper.questions.veryShort, "direct", showAnswers)}
    ${renderQuestionSection("Section C: Short Answer", paper.questions.short, "direct", showAnswers)}
    ${renderQuestionSection("Section D: Long Answer", paper.questions.long, "direct", showAnswers)}
  `;
}

function renderQuestionSection(title, questions, mode, showAnswers) {
  if (!questions || !questions.length) {
    return "";
  }

  const rendered = questions
    .map((question) => {
      if (mode === "mcq") {
        return `<li>
          ${escapeHtml(question.prompt)}
          <div class="options">
            ${(question.options || [])
              .map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${escapeHtml(option)}`)
              .join("&nbsp;&nbsp; ")}
            ${showAnswers && question.answer ? `<br /><em>Answer: ${escapeHtml(question.answer)}</em>` : ""}
          </div>
        </li>`;
      }

      return `<li>${escapeHtml(question.prompt)}</li>`;
    })
    .join("");

  return `
    <section class="paper-section">
      <h5>${escapeHtml(title)}</h5>
      <ol>${rendered}</ol>
    </section>
  `;
}

function buildPaperText(paper) {
  const lines = [];
  lines.push(paper.title || "Summative Assessment");
  lines.push(`Teacher: ${paper.teacherName || state.currentUser?.name || "Teacher"}`);
  lines.push(`Chapter: ${paper.chapterTitle || "Chapter"}`);
  lines.push(`Generated: ${formatDateTime(paper.createdAt || Date.now())}`);
  if (paper.patternNotes) {
    lines.push(`Pattern Notes: ${paper.patternNotes}`);
  }
  lines.push("");

  appendTextSection(lines, "Section A: MCQs", paper.questions?.mcq || [], true);
  appendTextSection(lines, "Section B: Very Short Answer", paper.questions?.veryShort || [], false);
  appendTextSection(lines, "Section C: Short Answer", paper.questions?.short || [], false);
  appendTextSection(lines, "Section D: Long Answer", paper.questions?.long || [], false);

  return lines.join("\n");
}

function appendTextSection(lines, title, questions, includeOptions) {
  if (!questions.length) {
    return;
  }

  lines.push(title);
  questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.prompt}`);
    if (includeOptions) {
      (question.options || []).forEach((option, optionIndex) => {
        lines.push(`   ${String.fromCharCode(65 + optionIndex)}. ${option}`);
      });
      if (question.answer) {
        lines.push(`   Answer: ${question.answer}`);
      }
    }
  });
  lines.push("");
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    throw new Error(
      "Cannot connect to backend API. Run `python3 backend/server.py` and open `http://localhost:8000` (not file://)."
    );
  }

  const isJson = response.headers.get("Content-Type")?.includes("application/json");
  const payload = isJson ? await response.json() : {};

  if (!response.ok) {
    if (response.status === 401 && state.token) {
      clearSession();
      renderApp();
    }
    const message = payload.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

function setSession(token, user) {
  state.token = token;
  state.currentUser = user;
  localStorage.setItem(TOKEN_KEY, token);
}

function clearSession() {
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
}

async function extractPdfText(file, maxPages) {
  if (!window.pdfjsLib) {
    return "";
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const buffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  const limit = Math.min(pdf.numPages, maxPages);
  const chunks = [];

  for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(" ");
    chunks.push(text);
  }

  return chunks.join(" ");
}

function byId(id) {
  return document.getElementById(id);
}

function setMessage(id, text, status) {
  const node = byId(id);
  node.textContent = text;
  node.classList.remove("error", "success");
  if (status) {
    node.classList.add(status);
  }
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || "")
    .join("");
}

function safeInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function cleanFileName(fileName) {
  return fileName.replace(/\.pdf$/i, "");
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveApiBase() {
  const configured = (window.__API_BASE__ || "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

  if (protocol === "file:") {
    return DEFAULT_LOCAL_API_BASE;
  }

  if (isLocal && port !== "8000") {
    return DEFAULT_LOCAL_API_BASE;
  }

  return "";
}
