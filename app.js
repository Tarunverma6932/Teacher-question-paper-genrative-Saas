const STORAGE_KEY = "eduAssessProV1";
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const state = {
  data: {
    users: [],
    currentUserId: null,
    assessments: []
  },
  authTab: "signin",
  draftAssessment: null
};

const stopWords = new Set([
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "also",
  "among",
  "and",
  "any",
  "are",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "can",
  "could",
  "did",
  "does",
  "each",
  "few",
  "for",
  "from",
  "had",
  "has",
  "have",
  "here",
  "into",
  "its",
  "more",
  "most",
  "other",
  "our",
  "out",
  "over",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your"
]);

document.addEventListener("DOMContentLoaded", () => {
  seedDefaultUsers();
  loadState();
  bindEvents();
  renderApp();
});

function seedDefaultUsers() {
  if (localStorage.getItem(STORAGE_KEY)) {
    return;
  }

  const seeded = {
    users: [
      {
        id: crypto.randomUUID(),
        name: "Riya Sharma",
        email: "teacher@demo.com",
        password: "teacher123",
        role: "teacher",
        profile: {
          institution: "Blue Valley School",
          track: "Science"
        }
      },
      {
        id: crypto.randomUUID(),
        name: "Aman Gupta",
        email: "student@demo.com",
        password: "student123",
        role: "student",
        profile: {
          institution: "Blue Valley School",
          track: "Grade 8"
        }
      }
    ],
    currentUserId: null,
    assessments: []
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.users || !Array.isArray(parsed.users)) {
      return;
    }
    state.data = parsed;
  } catch (error) {
    console.error("Failed to load state", error);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function bindEvents() {
  const signInTab = byId("signInTab");
  const signUpTab = byId("signUpTab");
  const signInForm = byId("signInForm");
  const signUpForm = byId("signUpForm");

  signInTab.addEventListener("click", () => switchAuthTab("signin"));
  signUpTab.addEventListener("click", () => switchAuthTab("signup"));

  signInForm.addEventListener("submit", handleSignIn);
  signUpForm.addEventListener("submit", handleSignUp);

  byId("logoutBtn").addEventListener("click", handleLogout);
  byId("saveProfileBtn").addEventListener("click", handleSaveProfile);

  byId("saveDriveBtn").addEventListener("click", handleDriveConnect);
  byId("openDriveBtn").addEventListener("click", handleDriveOpen);

  byId("generateBtn").addEventListener("click", handleGeneratePaper);
  byId("publishBtn").addEventListener("click", handlePublishPaper);
  byId("printBtn").addEventListener("click", handlePrintPaper);
}

function switchAuthTab(tab) {
  state.authTab = tab;
  byId("signInTab").classList.toggle("active", tab === "signin");
  byId("signUpTab").classList.toggle("active", tab === "signup");
  byId("signInForm").classList.toggle("hidden", tab !== "signin");
  byId("signUpForm").classList.toggle("hidden", tab !== "signup");
  setMessage("authMessage", "", "");
}

function handleSignIn(event) {
  event.preventDefault();
  const email = byId("signinEmail").value.trim().toLowerCase();
  const password = byId("signinPassword").value;

  const user = state.data.users.find((candidate) => candidate.email === email);
  if (!user || user.password !== password) {
    setMessage("authMessage", "Invalid credentials. Please check email and password.", "error");
    return;
  }

  state.data.currentUserId = user.id;
  saveState();
  setMessage("authMessage", "Logged in successfully.", "success");
  byId("signInForm").reset();
  renderApp();
}

function handleSignUp(event) {
  event.preventDefault();

  const name = byId("signupName").value.trim();
  const email = byId("signupEmail").value.trim().toLowerCase();
  const password = byId("signupPassword").value;
  const role = byId("signupRole").value;
  const institution = byId("signupInstitution").value.trim();
  const track = byId("signupTrack").value.trim();

  if (state.data.users.some((candidate) => candidate.email === email)) {
    setMessage("authMessage", "An account already exists with this email.", "error");
    return;
  }

  const newUser = {
    id: crypto.randomUUID(),
    name,
    email,
    password,
    role,
    profile: {
      institution,
      track,
      driveUrl: ""
    }
  };

  state.data.users.push(newUser);
  state.data.currentUserId = newUser.id;
  saveState();

  setMessage("authMessage", "Account created and logged in.", "success");
  byId("signUpForm").reset();
  renderApp();
}

function handleLogout() {
  state.data.currentUserId = null;
  state.draftAssessment = null;
  saveState();
  renderApp();
}

function handleSaveProfile() {
  const user = getCurrentUser();
  if (!user) {
    return;
  }

  const institution = byId("profileInstitutionInput").value.trim();
  const track = byId("profileTrackInput").value.trim();

  user.profile = {
    ...user.profile,
    institution,
    track
  };

  saveState();
  renderProfile(user);
}

function handleDriveConnect() {
  const user = getCurrentUser();
  if (!user || user.role !== "teacher") {
    return;
  }

  const driveUrl = byId("driveUrlInput").value.trim();
  if (!driveUrl.startsWith("https://drive.google.com")) {
    setMessage("driveStatus", "Please enter a valid Google Drive URL.", "error");
    return;
  }

  user.profile = {
    ...user.profile,
    driveUrl,
    driveConnectedAt: new Date().toISOString()
  };
  saveState();

  setMessage("driveStatus", "Google Drive link connected successfully.", "success");
}

function handleDriveOpen() {
  const user = getCurrentUser();
  if (!user || user.role !== "teacher") {
    return;
  }

  const driveUrl = user.profile?.driveUrl;
  if (!driveUrl) {
    setMessage("driveStatus", "Connect a drive link first.", "error");
    return;
  }

  window.open(driveUrl, "_blank", "noopener,noreferrer");
}

async function handleGeneratePaper() {
  const user = getCurrentUser();
  if (!user || user.role !== "teacher") {
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

  const manualChapter = byId("chapterName").value.trim();
  const title = byId("assessmentTitle").value.trim() || "Summative Assessment";
  const patternNotes = byId("patternNotes").value.trim();

  setMessage("generatorStatus", "Reading PDF and generating questions...", "");

  try {
    const extractedText = await extractPdfText(pdf, 8);
    const chapterTitle = manualChapter || cleanFileName(pdf.name);
    const paper = buildPaper({
      chapterTitle,
      title,
      extractedText,
      patternNotes,
      counts,
      teacherName: user.name
    });

    state.draftAssessment = {
      id: crypto.randomUUID(),
      ...paper,
      teacherId: user.id,
      teacherName: user.name,
      createdAt: new Date().toISOString(),
      published: false
    };

    renderPaper(state.draftAssessment);
    byId("publishBtn").disabled = false;
    byId("printBtn").disabled = false;

    setMessage("generatorStatus", "Assessment generated. Review and publish for students.", "success");
  } catch (error) {
    console.error(error);
    setMessage("generatorStatus", "Could not read this PDF. Try another file.", "error");
  }
}

function handlePublishPaper() {
  const draft = state.draftAssessment;
  const user = getCurrentUser();

  if (!draft || !user || user.role !== "teacher") {
    return;
  }

  const publishRecord = {
    ...draft,
    published: true,
    publishedAt: new Date().toISOString()
  };

  state.data.assessments.unshift(publishRecord);
  saveState();

  byId("publishBtn").disabled = true;
  setMessage("generatorStatus", "Assessment published to student feed.", "success");
}

function handlePrintPaper() {
  window.print();
}

function renderApp() {
  const user = getCurrentUser();

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
    byId("publishBtn").disabled = false;
    byId("printBtn").disabled = false;
  } else {
    byId("paperOutput").textContent = "Generate an assessment to preview it here.";
    byId("paperOutput").classList.add("empty");
    byId("publishBtn").disabled = true;
    byId("printBtn").disabled = true;
  }
}

function renderStudentFeed() {
  const feedEl = byId("studentFeed");
  const published = state.data.assessments.filter((assessment) => assessment.published);

  if (!published.length) {
    feedEl.innerHTML = `<p class="subtle">No assessments published yet.</p>`;
    return;
  }

  feedEl.innerHTML = published
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
        Teacher: ${escapeHtml(paper.teacherName)}<br />
        Chapter: ${escapeHtml(paper.chapterTitle)}<br />
        Generated: ${new Date(paper.createdAt).toLocaleString()}${
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
  if (!questions.length) {
    return "";
  }

  const rendered = questions
    .map((question) => {
      if (mode === "mcq") {
        return `<li>
          ${escapeHtml(question.prompt)}
          <div class="options">
            ${question.options
              .map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${escapeHtml(option)}`)
              .join("&nbsp;&nbsp; ")}
            ${showAnswers ? `<br /><em>Answer: ${escapeHtml(question.answer)}</em>` : ""}
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

function buildPaper({ chapterTitle, title, extractedText, patternNotes, counts, teacherName }) {
  const keywords = extractKeywords(extractedText, chapterTitle);

  return {
    chapterTitle,
    title,
    patternNotes,
    teacherName,
    questions: {
      mcq: generateMcqs(keywords, counts.mcq),
      veryShort: generateDirectQuestions(keywords, counts.veryShort, "veryShort"),
      short: generateDirectQuestions(keywords, counts.short, "short"),
      long: generateDirectQuestions(keywords, counts.long, "long")
    }
  };
}

function generateMcqs(keywords, count) {
  const output = [];
  const stems = [
    "Which concept is most closely connected with",
    "Which option best explains",
    "Choose the most appropriate term for",
    "Which idea from the chapter is linked to"
  ];

  for (let i = 0; i < count; i += 1) {
    const correct = toTitleCase(keywords[i % keywords.length]);
    const distractors = shuffleArray(
      keywords
        .filter((word) => toTitleCase(word) !== correct)
        .map((word) => toTitleCase(word))
    ).slice(0, 3);

    while (distractors.length < 3) {
      distractors.push(`Concept ${i + distractors.length + 1}`);
    }

    const options = shuffleArray([correct, ...distractors]);
    output.push({
      prompt: `${stems[i % stems.length]} "${correct}"?`,
      options,
      answer: correct
    });
  }

  return output;
}

function generateDirectQuestions(keywords, count, type) {
  const output = [];

  const template = {
    veryShort: [
      "Define {topic} in one or two lines.",
      "State one key point about {topic}.",
      "Write a very short note on {topic}."
    ],
    short: [
      "Explain the significance of {topic} with suitable details.",
      "Describe {topic} with an example from the chapter.",
      "How does {topic} affect the overall concept of this chapter?"
    ],
    long: [
      "Critically examine {topic} and support your answer with examples.",
      "Discuss {topic} in detail. Include causes, process, and outcomes.",
      "Write a long answer on {topic} and connect it to real-world applications."
    ]
  };

  for (let i = 0; i < count; i += 1) {
    const topic = toTitleCase(keywords[i % keywords.length]);
    const line = template[type][i % template[type].length].replace("{topic}", topic);
    output.push({ prompt: line });
  }

  return output;
}

function extractKeywords(extractedText, chapterTitle) {
  const source = `${chapterTitle} ${extractedText}`.toLowerCase();
  const words = source.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  const counts = new Map();

  for (const word of words) {
    if (word.length < 4 || stopWords.has(word)) {
      continue;
    }
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);

  if (sorted.length >= 5) {
    return sorted.slice(0, 25);
  }

  return [
    ...chapterTitle.toLowerCase().split(/\s+/).filter((word) => word.length > 3),
    "definition",
    "application",
    "concept",
    "analysis",
    "process",
    "impact"
  ];
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

function getCurrentUser() {
  return state.data.users.find((user) => user.id === state.data.currentUserId) || null;
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

function toTitleCase(value) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
