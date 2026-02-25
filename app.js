const TOKEN_KEY = "eduAssessAccessToken";
const DEFAULT_LOCAL_API_BASE = "http://localhost:8000";
const API_BASE =
  window.__API_BASE__ || (window.location.protocol === "file:" ? DEFAULT_LOCAL_API_BASE : "");
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  currentUser: null,
  authTab: "signin",
  draftAssessment: null
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
}

async function restoreSession() {
  if (!state.token) {
    return;
  }

  try {
    const response = await apiRequest("/api/auth/me");
    state.currentUser = response.user;
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
  } catch (error) {
    setMessage("generatorStatus", error.message, "error");
  }
}

function handlePrintPaper() {
  window.print();
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

  if (state.draftAssessment) {
    renderPaper(state.draftAssessment);
    byId("publishBtn").disabled = state.draftAssessment.published;
    byId("printBtn").disabled = false;
  } else {
    byId("paperOutput").textContent = "Generate an assessment to preview it here.";
    byId("paperOutput").classList.add("empty");
    byId("publishBtn").disabled = true;
    byId("printBtn").disabled = true;
  }
}

async function renderStudentFeed() {
  const feedEl = byId("studentFeed");
  feedEl.innerHTML = `<p class="subtle">Loading assessments...</p>`;

  try {
    const response = await apiRequest("/api/assessments");
    const assessments = response.assessments || [];

    if (!assessments.length) {
      feedEl.innerHTML = `<p class="subtle">No assessments published yet.</p>`;
      return;
    }

    feedEl.innerHTML = assessments
      .map((assessment) => {
        const when = new Date(assessment.publishedAt || assessment.createdAt).toLocaleString();
        return `
          <article class="feed-item">
            <h4>${escapeHtml(assessment.title)}</h4>
            <p class="feed-meta">By ${escapeHtml(assessment.teacherName)} • ${when}</p>
            <p class="feed-meta">Chapter: ${escapeHtml(assessment.chapterTitle)}</p>
            <details>
              <summary>Open paper</summary>
              ${renderPaperMarkup(assessment, false)}
            </details>
          </article>
        `;
      })
      .join("");
  } catch (error) {
    feedEl.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
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
        Generated: ${new Date(paper.createdAt || Date.now()).toLocaleString()}${
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
