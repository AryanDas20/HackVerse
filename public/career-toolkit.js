/* Career Match toolkit: private, browser-local placement helpers. */
export function createCareerToolkit(getUser = () => null) {
  let latest = null;
  let activeQuestion = null;
  let timerHandle = null;
  let secondsRemaining = 120;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value = "") => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const userKey = () => String(getUser()?.id || getUser()?.uid || "guest").replace(/[^a-z0-9_-]/gi, "_");
  const storageKey = (key) => `hackverse-career:${userKey()}:${key}`;
  const readStore = (key, fallback) => {
    try { const raw = localStorage.getItem(storageKey(key)); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  };
  const writeStore = (key, value) => {
    try { localStorage.setItem(storageKey(key), JSON.stringify(value)); return true; }
    catch { return false; }
  };
  const hash = (value) => {
    let h = 2166136261;
    for (const char of String(value || "")) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  };
  const downloadText = (filename, text) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copyText = async (text, statusElement) => {
    if (!text.trim()) { if (statusElement) statusElement.textContent = "Nothing to copy yet."; return; }
    try {
      await navigator.clipboard.writeText(text);
      if (statusElement) statusElement.textContent = "Copied to clipboard ✓";
    } catch {
      if (statusElement) statusElement.textContent = "Clipboard access was blocked. Select and copy the text manually.";
    }
  };
  const setTab = (tab) => {
    $$("[data-career-tab]").forEach(button => {
      const selected = button.dataset.careerTab === tab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $$("[data-career-panel]").forEach(panel => {
      const selected = panel.dataset.careerPanel === tab;
      panel.classList.toggle("is-active", selected);
      panel.hidden = !selected;
    });
  };

  function renderAtsAudit(resumeText, result) {
    const text = String(resumeText || "");
    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const checks = [
      { label: "Contact details", pass: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) && /(?:\+?\d[\d\s().-]{7,}\d)/.test(text), tip: "Add a professional email address and a reachable phone number." },
      { label: "Skills section", pass: /\b(skills|technical skills|core competencies|toolkit)\b/i.test(text), tip: "Add a clearly labelled skills section with tools you can demonstrate." },
      { label: "Education details", pass: /\b(education|university|college|bachelor|b\.tech|b\.sc|master|degree|cgpa|gpa)\b/i.test(text), tip: "Make your degree, institution and expected graduation date easy to find." },
      { label: "Experience or internship", pass: /\b(experience|internship|intern|employment|work history)\b/i.test(text), tip: "Show internships, part-time roles, research or relevant team experience." },
      { label: "Projects with context", pass: /\b(projects?|portfolio|github|repository|deployed|demo)\b/i.test(text), tip: "Describe 2–3 relevant projects, your contribution and the result." },
      { label: "Action-oriented language", pass: /\b(built|developed|designed|implemented|led|created|automated|analysed|analyzed|improved|launched|optimised|optimized|integrated)\b/i.test(text), tip: "Start bullets with precise action verbs that describe what you personally did." },
      { label: "Evidence or measurable outcomes", pass: /\b\d+(?:\.\d+)?\s?(?:%|x|users|students|customers|requests|seconds|minutes|hours|days|weeks|months|years)\b/i.test(text), tip: "Where truthful, quantify scale, performance, users, time saved or quality improvement." },
      { label: "Readable resume length", pass: wordCount >= 120 && wordCount <= 1100, tip: "Aim for concise, relevant content. Remove repeated or unrelated details." },
      { label: "Section structure", pass: /\b(summary|profile|objective|certifications?|achievements?|awards?|volunteer|leadership)\b/i.test(text), tip: "Use conventional headings and a consistent order so readers can scan quickly." },
      { label: "Role keyword coverage", pass: (result?.matchedCount || 0) > 0, tip: "Use exact role terminology naturally when it accurately describes your skills." }
    ];
    const score = Math.round(checks.filter(item => item.pass).length / checks.length * 100);
    const scoreNode = $("#careerAtsScore");
    if (scoreNode) { scoreNode.textContent = `${score}%`; scoreNode.dataset.score = String(score); }
    const list = $("#careerAtsChecks");
    if (list) list.innerHTML = checks.map(item => `<div class="career-check-row ${item.pass ? "is-pass" : "is-gap"}"><span class="career-check-mark">${item.pass ? "✓" : "＋"}</span><div><b>${esc(item.label)}</b><small>${item.pass ? "Detected in extracted text" : esc(item.tip)}</small></div><span class="career-check-state">${item.pass ? "Present" : "Review"}</span></div>`).join("");
  }

  function renderJdSignals(jobDescription) {
    const text = String(jobDescription || "");
    const tests = [
      ["Role title", /\b(intern|developer|engineer|analyst|designer|manager|consultant|associate|scientist|specialist|trainee)\b/i],
      ["Responsibilities", /\b(responsibilit|you will|what you.ll do|role overview|your role)\b/i],
      ["Required criteria", /\b(required|must have|minimum qualification|mandatory|essential)\b/i],
      ["Preferred criteria", /\b(preferred|nice to have|bonus|desirable|plus)\b/i],
      ["Education or eligibility", /\b(eligib|degree|bachelor|master|graduate|pursuing|enrolled)\b/i],
      ["Work location or mode", /\b(remote|hybrid|on.site|location|office|work from home|onsite)\b/i],
      ["Duration or employment type", /\b(internship|full.time|part.time|contract|months?|permanent)\b/i],
      ["Compensation information", /\b(stipend|salary|compensation|pay range|per annum|lpa|\$\s?\d)\b/i]
    ];
    const node = $("#careerJdSignals");
    if (!node) return;
    node.innerHTML = tests.map(([label, regex]) => {
      const found = regex.test(text);
      return `<div class="career-signal-row"><span class="career-signal-dot ${found ? "is-found" : ""}"></span><b>${esc(label)}</b><small>${found ? "Mentioned" : "Not clearly found"}</small></div>`;
    }).join("") + `<p class="career-micro-note">This checks only whether these details appear in the text. It does not verify the employer or the legitimacy of the vacancy.</p>`;
  }

  function renderSkillMap(result) {
    const jobs = Array.isArray(result?.jobSkills) ? result.jobSkills : [];
    const matched = new Set((result?.matchedSkills || []).map(skill => skill.key));
    const groups = new Map();
    jobs.forEach(skill => {
      const category = skill.category || "Other";
      if (!groups.has(category)) groups.set(category, { category, total: 0, matched: 0 });
      const group = groups.get(category); group.total += 1; if (matched.has(skill.key)) group.matched += 1;
    });
    const node = $("#careerSkillMap");
    if (!node) return;
    if (!groups.size) { node.innerHTML = '<div class="career-empty-state">No supported skills were recognised for this job description. Review the full job post manually.</div>'; return; }
    node.innerHTML = [...groups.values()].sort((a,b) => b.total - a.total).map(group => {
      const pct = Math.round(group.matched / group.total * 100);
      return `<div class="career-skill-map-row"><div class="career-skill-map-label"><b>${esc(group.category)}</b><span>${group.matched} / ${group.total}</span></div><div class="career-skill-map-track"><i style="--skill-progress:${pct}%"></i></div></div>`;
    }).join("");
  }

  function learningStorageKey() { return `learning:${hash(latest?.jobDescription || "no-role")}`; }
  function renderLearning() {
    const tasks = Array.isArray(latest?.result?.learningPlan) ? latest.result.learningPlan : [];
    const node = $("#careerLearningTasks");
    if (!node) return;
    if (!tasks.length) { node.innerHTML = '<div class="career-empty-state">Analyse a resume and job description to create a role-specific learning sprint.</div>'; updateLearningProgress([]); return; }
    const done = new Set(readStore(learningStorageKey(), []));
    node.innerHTML = tasks.map(day => {
      const checked = done.has(Number(day.day));
      return `<label class="career-learning-task ${checked ? "is-done" : ""}"><input type="checkbox" data-learning-day="${Number(day.day)}" ${checked ? "checked" : ""}><span class="career-learning-day">${String(Number(day.day)).padStart(2,"0")}</span><span class="career-learning-task-copy"><b>${esc(day.focus || "Learning task")}</b><small>${esc(day.task || "")}</small>${day.resource ? `<a href="${esc(day.resource)}" target="_blank" rel="noopener noreferrer">Study resource ↗</a>` : ""}</span><span class="career-learning-check">✓</span></label>`;
    }).join("");
    updateLearningProgress(tasks);
  }
  function updateLearningProgress(tasks = []) {
    const done = new Set(readStore(learningStorageKey(), []));
    const count = tasks.length ? done.size : 0;
    const pct = tasks.length ? Math.round(count / tasks.length * 100) : 0;
    if ($("#careerLearningProgressText")) $("#careerLearningProgressText").textContent = `${count} / ${tasks.length || 14} days complete`;
    if ($("#careerLearningProgressBar")) $("#careerLearningProgressBar").style.width = `${pct}%`;
  }

  function buildQuestionDeck(result) {
    const missing = (result?.missingSkills || []).slice(0, 5);
    const matched = (result?.matchedSkills || []).slice(0, 4);
    const questions = [];
    missing.forEach(skill => {
      questions.push({ id: `gap-${skill.key}`, type: "TECHNICAL GAP", question: `You listed ${skill.name} as a requirement to develop. Explain what it is, where you would use it, and how you would learn it for this role.`, hint: "Be honest about your current level. Explain the concept, give a learning example and describe how you would validate your understanding." });
      questions.push({ id: `scenario-${skill.key}`, type: "APPLIED SCENARIO", question: `Imagine you need to use ${skill.name} in your first month. How would you approach the task, identify risks and ask for feedback?`, hint: "Structure your response as: clarify the task → plan → build or investigate → test → communicate." });
    });
    matched.slice(0, 3).forEach(skill => questions.push({ id: `proof-${skill.key}`, type: "PROOF OF EXPERIENCE", question: `Walk me through a project where you used ${skill.name}. What did you personally build, what challenge came up, and what was the outcome?`, hint: "Give context, your own contribution, one technical decision and an outcome you can substantiate." }));
    questions.push({ id: "project-deep-dive", type: "PROJECT DEEP DIVE", question: "Choose your strongest project. Explain the problem, the architecture, your contribution, the hardest trade-off and what you would improve next.", hint: "Use a clear beginning, technical detail, evidence of ownership and one lesson learned." });
    questions.push({ id: "debugging", type: "PROBLEM SOLVING", question: "A feature works locally but fails in production. How would you investigate the issue?", hint: "Mention reproducing the issue, logs, environment differences, recent changes, isolation, tests and communication." });
    questions.push({ id: "teamwork", type: "BEHAVIOURAL · STAR", question: "Tell me about a time you disagreed with a teammate or had to adapt under a tight deadline.", hint: "Use Situation, Task, Action and Result. Be specific about your own actions and what changed." });
    questions.push({ id: "learning", type: "GROWTH MINDSET", question: "Describe a technical skill you learned independently. How did you plan your learning and verify that you could use it?", hint: "Name the resource, practice task, obstacle, feedback loop and a tangible proof of learning." });
    return questions;
  }

  function renderInterviewDeck() {
    const list = $("#careerInterviewQuestionList");
    if (!list) return;
    const questions = buildQuestionDeck(latest?.result);
    if (!latest) { list.innerHTML = '<div class="career-empty-state">Run an analysis to build your personalised question deck.</div>'; return; }
    list.innerHTML = questions.map((item, index) => `<button type="button" class="career-question-choice ${activeQuestion?.id === item.id ? "is-active" : ""}" data-career-question="${esc(item.id)}"><span>${String(index+1).padStart(2,"0")}</span><span><small>${esc(item.type)}</small><b>${esc(item.question)}</b></span><i>↗</i></button>`).join("");
    if (!activeQuestion || !questions.some(item => item.id === activeQuestion.id)) selectQuestion(questions[0]);
  }
  function selectQuestion(question) {
    if (!question) return;
    activeQuestion = question;
    if ($("#careerInterviewType")) $("#careerInterviewType").textContent = question.type;
    if ($("#careerInterviewQuestion")) $("#careerInterviewQuestion").textContent = question.question;
    if ($("#careerInterviewHint")) $("#careerInterviewHint").textContent = question.hint;
    if ($("#careerInterviewAnswer")) $("#careerInterviewAnswer").value = readStore(`answer:${hash(latest?.jobDescription || "general")}:${question.id}`, "");
    $$("[data-career-question]").forEach(button => button.classList.toggle("is-active", button.dataset.careerQuestion === question.id));
    if ($("#careerAnswerSaved")) $("#careerAnswerSaved").textContent = "Draft is not saved";
    if ($("#careerAnswerFeedback")) $("#careerAnswerFeedback").hidden = true;
  }


  function reviewInterviewAnswer() {
    const answer = $("#careerInterviewAnswer").value.trim();
    const words = answer.split(/\s+/).filter(Boolean);
    const lower = answer.toLowerCase();
    const markers = [
      ["Situation", /\b(situation|context|when i|during|at the time)\b/i],
      ["Task", /\b(task|goal|responsible|needed to|challenge)\b/i],
      ["Action", /\b(i built|i developed|i implemented|i led|i decided|i tested|i analysed|i analyzed|i created|i worked|my approach)\b/i],
      ["Result", /\b(result|impact|improved|reduced|increased|delivered|learned|outcome)\b/i]
    ];
    const found = markers.filter(([, regex]) => regex.test(lower)).map(([name]) => name);
    const checks = [
      { label: "Enough detail to assess", pass: words.length >= 70, tip: "Add a little more context. Aim for a focused answer rather than a one-line response." },
      { label: "Clear Situation or context", pass: found.includes("Situation"), tip: "Set the scene: what was happening and why did it matter?" },
      { label: "Defined Task or goal", pass: found.includes("Task"), tip: "Explain what you were responsible for and what success looked like." },
      { label: "Your personal actions", pass: found.includes("Action"), tip: "Use 'I' statements to separate your contribution from the team's work." },
      { label: "Result or learning", pass: found.includes("Result"), tip: "Finish with a result you can defend, or explain what you learned." }
    ];
    const score = checks.filter(item => item.pass).length;
    const node = $("#careerAnswerFeedback");
    node.hidden = false;
    node.innerHTML = `<div class="career-answer-feedback-top"><b>Practice review</b><span>${score}/5 structure checks</span></div><div class="career-answer-feedback-track"><i style="width:${score*20}%"></i></div><div class="career-answer-review-grid">${checks.map(item => `<div class="${item.pass ? "is-pass" : "is-gap"}"><b>${item.pass ? "✓" : "＋"} ${esc(item.label)}</b><small>${item.pass ? "Detected" : esc(item.tip)}</small></div>`).join("")}</div><p>Quick checklist only. It does not judge technical correctness, truthfulness or communication quality—review your answer aloud and ask a person for feedback.</p>`;
  }

  function renderPortfolio() {
    const data = readStore("portfolio", {});
    const boxes = $$('[data-portfolio-check]');
    boxes.forEach(input => { input.checked = Boolean(data[input.dataset.portfolioCheck]); input.closest("label")?.classList.toggle("is-done", input.checked); });
    const count = boxes.filter(input => input.checked).length;
    const pct = Math.round(count / Math.max(1, boxes.length) * 100);
    if ($("#careerPortfolioScore")) $("#careerPortfolioScore").textContent = `${pct}%`;
    if ($("#careerPortfolioBar")) $("#careerPortfolioBar").style.width = `${pct}%`;
  }

  function readApplications() { const data = readStore("applications", []); return Array.isArray(data) ? data : []; }
  function renderApplications() {
    const applications = readApplications().sort((a,b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));
    const active = applications.filter(item => !["Offer", "Rejected", "Withdrawn"].includes(item.stage)).length;
    const offers = applications.filter(item => item.stage === "Offer").length;
    if ($("#careerTrackerTotal")) $("#careerTrackerTotal").textContent = String(applications.length);
    if ($("#careerTrackerActive")) $("#careerTrackerActive").textContent = String(active);
    if ($("#careerTrackerOffers")) $("#careerTrackerOffers").textContent = String(offers);
    const node = $("#careerApplicationList");
    if (!node) return;
    if (!applications.length) { node.innerHTML = '<div class="career-empty-state">No applications tracked yet. Add your first one above.</div>'; return; }
    node.innerHTML = applications.map(item => {
      const dateValue = item.nextDate ? new Date(`${item.nextDate}T12:00:00`) : null;
      const dateLabel = dateValue ? dateValue.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "No next date";
      const daysUntil = dateValue ? Math.ceil((dateValue.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null;
      const urgency = daysUntil === null ? "" : daysUntil < 0 ? ` · Overdue by ${Math.abs(daysUntil)}d` : daysUntil === 0 ? " · Due today" : daysUntil <= 3 ? ` · Due in ${daysUntil}d` : "";
      const safeLink = (() => { try { const url = new URL(item.link); return ["http:","https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } })();
      return `<article class="career-application-card"><div class="career-application-monogram">${esc((item.company || "?").slice(0,1).toUpperCase())}</div><div class="career-application-main"><div><b>${esc(item.company)}</b><span>${esc(item.role)}</span></div><p>${item.note ? esc(item.note) : "No private note added"}</p><small>Next date · ${esc(dateLabel)}<b class="career-application-urgency ${daysUntil !== null && daysUntil <= 3 ? "is-soon" : ""}">${esc(urgency)}</b>${safeLink ? ` · <a href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">Open job ↗</a>` : ""}</small></div><div class="career-application-actions"><select aria-label="Update application stage" data-app-stage="${esc(item.id)}">${["Saved","Applied","Assessment","Interview","Offer","Rejected","Withdrawn"].map(stage => `<option ${item.stage === stage ? "selected" : ""}>${stage}</option>`).join("")}</select><button type="button" class="career-remove-app" data-app-delete="${esc(item.id)}" aria-label="Delete ${esc(item.company)} application">×</button></div></article>`;
    }).join("");
  }

  function generateCoverLetter(event) {
    event.preventDefault();
    const name = $("#careerCoverName").value.trim() || "[Your name]";
    const role = $("#careerCoverRole").value.trim();
    const company = $("#careerCoverCompany").value.trim();
    const proof = $("#careerCoverProof").value.trim();
    const motivation = $("#careerCoverMotivation").value.trim();
    const matched = (latest?.result?.matchedSkills || []).slice(0,5).map(item => item.name);
    const skillSentence = matched.length ? `My current experience includes ${matched.join(", ")}. I would be glad to discuss how I have applied these skills in practice.` : "I am keen to bring my relevant coursework, projects and willingness to learn to the team. I will tailor this paragraph with specific skills that I can demonstrate.";
    const proofSentence = proof || "[Add one specific project or experience. Explain your contribution, tools used and an outcome you can verify.]";
    const motivationSentence = motivation || `I am interested in the ${role} opportunity because [add a genuine reason connected to the role or company].`;
    const draft = `Dear Hiring Team,\n\nI am writing to apply for the ${role} position at ${company}. ${motivationSentence}\n\n${skillSentence}\n\n${proofSentence}\n\nI value clear communication, thoughtful problem-solving and continuous learning. I would welcome the opportunity to explain my work and learn more about the needs of your team.\n\nThank you for your time and consideration.\n\nSincerely,\n${name}`;
    $("#careerCoverOutput").value = draft;
  }

  function improveBullet() {
    const original = $("#careerBulletOriginal").value.trim().replace(/^[•*\-\s]+/, "");
    if (!original) { $("#careerBulletOutput").value = "Add a real resume bullet first."; return; }
    const action = $("#careerBulletAction").value;
    const outcome = $("#careerBulletOutcome").value.trim();
    const detail = original.replace(/^(built|developed|designed|automated|improved|analysed|analyzed|led|implemented|created|delivered|managed|integrated)\s+/i, "");
    $("#careerBulletOutput").value = `${action} ${detail.charAt(0).toLowerCase()}${detail.slice(1)}${/[.!?]$/.test(detail) ? "" : "."}${outcome ? ` ${outcome.startsWith("—") ? "" : "— "}${outcome}` : " Add a verified outcome (scale, quality, speed, users or result) if you have evidence."}`;
  }

  function downloadReport() {
    if (!latest?.result) return;
    const result = latest.result;
    const lines = ["HACKVERSE CAREER MATCH — PRIVATE ANALYSIS REPORT", `Generated: ${new Date().toLocaleString()}`, `Resume: ${latest.fileName || "Uploaded PDF"}`, `Skill alignment: ${result.alignmentPercent}%`, `Matched: ${result.matchedCount}`, `Missing: ${result.missingCount}`, "", "MATCHED SKILLS", ...(result.matchedSkills || []).map(x => `- ${x.name}`), "", "MISSING SKILLS + JOB DESCRIPTION EVIDENCE", ...(result.missingSkills || []).flatMap(x => [`- ${x.name}`, ...(x.sourceLines || []).map(line => `  JD line ${line.lineNumber}: ${line.text}`)]), "", "14-DAY LEARNING PLAN", ...(result.learningPlan || []).map(day => `Day ${day.day} — ${day.focus}: ${day.task}`), "", "Note: This is a skills-screening aid, not a hiring decision or an ATS prediction."];
    downloadText("hackverse-career-match-report.txt", lines.join("\n"));
  }

  function bind() {
    $$('[data-career-tab]').forEach(button => button.addEventListener("click", () => setTab(button.dataset.careerTab)));
    const mobileNavToggle = $("#careerMobileNavToggle");
    const toolNavigation = $("#careerToolNavigation");
    mobileNavToggle?.addEventListener("click", () => {
      const open = mobileNavToggle.getAttribute("aria-expanded") !== "true";
      mobileNavToggle.setAttribute("aria-expanded", String(open));
      toolNavigation?.classList.toggle("is-mobile-open", open);
    });
    toolNavigation?.addEventListener("keydown", event => {
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      const tabs = $$('[data-career-tab]');
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next]?.focus();
    });
    $("#careerLearningTasks")?.addEventListener("change", event => {
      const checkbox = event.target.closest("[data-learning-day]"); if (!checkbox) return;
      const completed = new Set(readStore(learningStorageKey(), []));
      const day = Number(checkbox.dataset.learningDay);
      checkbox.checked ? completed.add(day) : completed.delete(day);
      writeStore(learningStorageKey(), [...completed]);
      checkbox.closest(".career-learning-task")?.classList.toggle("is-done", checkbox.checked);
      updateLearningProgress(latest?.result?.learningPlan || []);
    });
    $("#careerInterviewQuestionList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-career-question]"); if (!button) return;
      const question = buildQuestionDeck(latest?.result).find(item => item.id === button.dataset.careerQuestion);
      selectQuestion(question);
    });
    $("#careerShuffleQuestion")?.addEventListener("click", () => {
      const questions = buildQuestionDeck(latest?.result); if (!questions.length) return;
      const candidates = questions.filter(item => item.id !== activeQuestion?.id);
      selectQuestion(candidates[Math.floor(Math.random() * candidates.length)] || questions[0]);
    });
    $("#careerReviewAnswer")?.addEventListener("click", reviewInterviewAnswer);
    $("#careerSaveAnswer")?.addEventListener("click", () => {
      if (!activeQuestion) return;
      const saved = writeStore(`answer:${hash(latest?.jobDescription || "general")}:${activeQuestion.id}`, $("#careerInterviewAnswer").value);
      $("#careerAnswerSaved").textContent = saved ? "Saved on this device ✓" : "Could not save in this browser";
    });
    $("#careerTimerStart")?.addEventListener("click", () => {
      if (timerHandle) return;
      if (secondsRemaining <= 0) secondsRemaining = 120;
      timerHandle = window.setInterval(() => {
        secondsRemaining = Math.max(0, secondsRemaining - 1);
        $("#careerInterviewTimer").textContent = `${String(Math.floor(secondsRemaining / 60)).padStart(2,"0")}:${String(secondsRemaining % 60).padStart(2,"0")}`;
        if (secondsRemaining === 0) { window.clearInterval(timerHandle); timerHandle = null; $("#careerTimerStart").textContent = "Start again"; }
      }, 1000);
      $("#careerTimerStart").textContent = "Running…";
    });
    $("#careerTimerReset")?.addEventListener("click", () => {
      if (timerHandle) window.clearInterval(timerHandle); timerHandle = null; secondsRemaining = 120;
      $("#careerInterviewTimer").textContent = "02:00"; $("#careerTimerStart").textContent = "Start timer";
    });
    $("#careerCoverLetterForm")?.addEventListener("submit", generateCoverLetter);
    $("#careerCopyCover")?.addEventListener("click", () => copyText($("#careerCoverOutput").value, $("#careerCoverCopyStatus")));
    $("#careerDownloadCover")?.addEventListener("click", () => downloadText("cover-letter-draft.txt", $("#careerCoverOutput").value));
    $("#careerImproveBullet")?.addEventListener("click", improveBullet);
    $("#careerCopyBullet")?.addEventListener("click", () => copyText($("#careerBulletOutput").value, $("#careerBulletCopyStatus")));
    $("#careerPortfolioChecklist")?.addEventListener("change", event => {
      const input = event.target.closest("[data-portfolio-check]"); if (!input) return;
      const data = readStore("portfolio", {}); data[input.dataset.portfolioCheck] = input.checked;
      writeStore("portfolio", data); input.closest("label")?.classList.toggle("is-done", input.checked); renderPortfolio();
    });
    $("#careerApplicationForm")?.addEventListener("submit", event => {
      event.preventDefault();
      const company = $("#careerAppCompany").value.trim(), role = $("#careerAppRole").value.trim();
      if (!company || !role) return;
      const apps = readApplications();
      apps.push({ id: (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`), company, role, stage: $("#careerAppStage").value, nextDate: $("#careerAppDate").value, link: $("#careerAppLink").value.trim(), note: $("#careerAppNote").value.trim(), createdAt: new Date().toISOString() });
      if (!writeStore("applications", apps)) { alert("This browser could not save your application. Check available local storage."); return; }
      event.target.reset(); renderApplications();
    });
    $("#careerApplicationList")?.addEventListener("change", event => {
      const select = event.target.closest("[data-app-stage]"); if (!select) return;
      const apps = readApplications(); const item = apps.find(entry => entry.id === select.dataset.appStage);
      if (item) { item.stage = select.value; writeStore("applications", apps); renderApplications(); }
    });
    $("#careerApplicationList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-app-delete]"); if (!button) return;
      writeStore("applications", readApplications().filter(item => item.id !== button.dataset.appDelete)); renderApplications();
    });
    $("#careerExportReportBtn")?.addEventListener("click", downloadReport);
    $("#careerPrintReportBtn")?.addEventListener("click", () => {
      if (!latest?.result) return;
      const text = ["HACKVERSE CAREER MATCH REPORT", `Skill alignment: ${latest.result.alignmentPercent}%`, "", "Matched skills", ...(latest.result.matchedSkills || []).map(x => `• ${x.name}`), "", "Missing skills", ...(latest.result.missingSkills || []).flatMap(x => [`• ${x.name}`, ...(x.sourceLines || []).map(l => `  JD line ${l.lineNumber}: ${l.text}`)]), "", "14-day learning plan", ...(latest.result.learningPlan || []).map(d => `Day ${d.day}: ${d.focus} — ${d.task}`)].join("\n");
      const printWindow = window.open("", "_blank");
      if (printWindow) printWindow.opener = null;
      if (!printWindow) { downloadText("hackverse-career-match-report.txt", text); return; }
      printWindow.document.write(`<title>Career Match Report</title><style>body{font:14px/1.6 Arial,sans-serif;margin:40px;color:#172554}pre{white-space:pre-wrap;font:inherit}</style><h1>HackVerse Career Match</h1><pre>${esc(text)}</pre>`);
      printWindow.document.close(); printWindow.focus(); printWindow.print();
    });
    renderPortfolio(); renderApplications();
  }

  function updateAnalysis(payload) {
    latest = payload || null;
    if (!latest) return;
    renderAtsAudit(latest.resumeText, latest.result);
    renderJdSignals(latest.jobDescription);
    renderSkillMap(latest.result);
    renderLearning();
    activeQuestion = null; renderInterviewDeck();
  }

  function setProcessingStage(stage, detail = "") {
    const root = $("#careerProcess"); if (!root) return;
    const stages = ["extract", "layout", "match", "plan"];
    const index = Math.max(0, stages.indexOf(stage));
    const titles = { extract: "Reading your resume", layout: "Reconstructing the document", match: "Matching role requirements", plan: "Building your action plan" };
    root.hidden = false;
    $("#careerProcessTitle").textContent = titles[stage] || "Working on your analysis";
    $("#careerProcessDetail").textContent = detail || "Please keep this tab open while the analysis runs.";
    $("#careerProcessPct").textContent = `Step ${index + 1} of 4`;
    $("#careerProcessBar").style.width = `${(index + 1) * 25}%`;
    $$("[data-process-step]").forEach((node, i) => {
      node.classList.toggle("is-active", i === index);
      node.classList.toggle("is-complete", i < index);
    });
  }
  function finishProcessing(success) {
    const root = $("#careerProcess"); if (!root) return;
    if (success) {
      root.classList.add("is-complete");
      $("#careerProcessTitle").textContent = "Your career report is ready";
      $("#careerProcessDetail").textContent = "Resume text, role requirements and learning priorities have been processed.";
      $("#careerProcessPct").textContent = "Complete";
      $("#careerProcessBar").style.width = "100%";
      $$("[data-process-step]").forEach(node => node.classList.add("is-complete"));
      window.setTimeout(() => { root.hidden = true; root.classList.remove("is-complete"); }, 1600);
    } else {
      root.hidden = true; root.classList.remove("is-complete");
    }
  }

  return { bind, updateAnalysis, setTab, setProcessingStage, finishProcessing };
}
