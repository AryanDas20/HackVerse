import { db, supabaseClient, doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp } from "./data-layer.js";

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const truncate = (value, max = 1200) => String(value || "").slice(0, max);
const STORAGE_KEY = uid => `hackverse-career-match:${uid}`;
const CAREER_LIMITS = { resume: 85000, job: 30000, upload: 15 * 1024 * 1024 };

const SKILLS = [
  ["JavaScript", ["javascript", "ecmascript"]], ["TypeScript", ["typescript"]], ["Python", ["python"]], ["Java", ["java"]], ["C++", ["c++", "cpp"]], ["C#", ["c#", "c sharp"]],
  ["HTML", ["html", "html5"]], ["CSS", ["css", "css3"]], ["React", ["react", "reactjs", "react.js"]], ["Next.js", ["next.js", "nextjs"]], ["React Native", ["react native", "react-native"]],
  ["Node.js", ["node.js", "nodejs"]], ["Express.js", ["express.js", "expressjs", "express"]], ["Vue", ["vue", "vue.js", "vuejs"]], ["Angular", ["angular"]], ["Tailwind CSS", ["tailwind", "tailwind css"]], ["Bootstrap", ["bootstrap"]],
  ["SQL", ["sql"]], ["PostgreSQL", ["postgresql", "postgres"]], ["MySQL", ["mysql"]], ["MongoDB", ["mongodb"]], ["Firebase", ["firebase", "firestore"]], ["Supabase", ["supabase"]], ["REST APIs", ["rest api", "restful api", "rest apis"]], ["GraphQL", ["graphql"]],
  ["Git", ["git"]], ["GitHub", ["github"]], ["Docker", ["docker"]], ["Kubernetes", ["kubernetes", "k8s"]], ["AWS", ["aws", "amazon web services"]], ["Azure", ["azure"]], ["Google Cloud", ["google cloud", "gcp"]], ["Linux", ["linux"]], ["CI/CD", ["ci/cd", "continuous integration", "continuous deployment"]],
  ["Machine Learning", ["machine learning", "ml"]], ["Deep Learning", ["deep learning"]], ["TensorFlow", ["tensorflow"]], ["PyTorch", ["pytorch"]], ["Pandas", ["pandas"]], ["NumPy", ["numpy"]], ["Data Analysis", ["data analysis", "data analytics"]], ["Power BI", ["power bi"]], ["Tableau", ["tableau"]], ["Excel", ["excel", "microsoft excel"]],
  ["Figma", ["figma"]], ["UI Design", ["ui design", "user interface design"]], ["UX Research", ["ux research", "user research"]], ["Wireframing", ["wireframing", "wireframes"]], ["Prototyping", ["prototyping", "prototype"]],
  ["Cybersecurity", ["cybersecurity", "information security"]], ["OWASP", ["owasp"]], ["Penetration Testing", ["penetration testing", "pentesting"]], ["Networking", ["networking", "computer networks"]],
  ["Jest", ["jest"]], ["Playwright", ["playwright"]], ["Cypress", ["cypress"]], ["Unit Testing", ["unit testing"]], ["Agile", ["agile"]], ["Scrum", ["scrum"]], ["Communication", ["communication skills", "communication"]], ["Problem Solving", ["problem solving", "problem-solving"]], ["Leadership", ["leadership"]]
];
const TRANSFERABLE = {
  "TypeScript": ["JavaScript"], "React": ["JavaScript", "HTML", "CSS"], "Next.js": ["React", "JavaScript"], "React Native": ["React", "JavaScript"],
  "Node.js": ["JavaScript"], "Express.js": ["Node.js", "JavaScript"], "PostgreSQL": ["SQL"], "MySQL": ["SQL"], "MongoDB": ["SQL"],
  "Tailwind CSS": ["CSS", "HTML"], "Bootstrap": ["CSS", "HTML"], "TensorFlow": ["Python", "Machine Learning"], "PyTorch": ["Python", "Machine Learning"],
  "Power BI": ["Excel", "Data Analysis"], "Tableau": ["Data Analysis", "Excel"], "Playwright": ["JavaScript", "Testing"], "Cypress": ["JavaScript", "Testing"]
};
const DIFFICULTY = {
  "JavaScript": ["Medium", 24], "TypeScript": ["Medium", 18], "Python": ["Easy", 16], "Java": ["Medium", 28], "C++": ["Hard", 40], "C#": ["Medium", 28],
  "React": ["Medium", 28], "Next.js": ["Medium", 24], "React Native": ["Hard", 36], "Node.js": ["Medium", 26], "Express.js": ["Easy", 14], "Vue": ["Medium", 24], "Angular": ["Hard", 36],
  "SQL": ["Easy", 12], "PostgreSQL": ["Medium", 20], "MySQL": ["Easy", 16], "MongoDB": ["Medium", 20], "Firebase": ["Medium", 18], "Supabase": ["Medium", 16],
  "Docker": ["Medium", 18], "Kubernetes": ["Hard", 42], "AWS": ["Hard", 40], "Azure": ["Hard", 40], "Google Cloud": ["Hard", 40], "Git": ["Easy", 8], "Linux": ["Medium", 20], "CI/CD": ["Medium", 22],
  "Machine Learning": ["Hard", 44], "Deep Learning": ["Hard", 56], "TensorFlow": ["Hard", 40], "PyTorch": ["Hard", 40], "Pandas": ["Easy", 12], "NumPy": ["Easy", 12], "Data Analysis": ["Medium", 24],
  "Figma": ["Easy", 12], "UI Design": ["Medium", 22], "UX Research": ["Medium", 24], "Cybersecurity": ["Hard", 44], "OWASP": ["Medium", 20], "Penetration Testing": ["Hard", 50], "Networking": ["Medium", 26]
};
const RESUME_HEADINGS = ["summary", "profile", "objective", "experience", "work experience", "professional experience", "employment", "projects", "personal projects", "education", "technical skills", "skills", "certifications", "certificates", "achievements", "awards", "publications", "volunteering"];
const WEAK_PHRASES = ["responsible for", "worked on", "helped with", "participated in", "involved in", "duties included", "tasked with"];
const ACTION_VERBS = ["Built", "Designed", "Implemented", "Automated", "Optimised", "Delivered", "Analysed", "Launched", "Collaborated", "Improved", "Integrated", "Developed"];

let user = null;
let mount = null;
let toastFn = message => console.info(message);
let state = null;
let activeTab = "overview";
let saveTimer = null;
let saveQueue = Promise.resolve();
let aiBusy = false;
let careerConvId = "";
let lastCopilotQuestion = "";
let initializedUid = "";
let initialized = false;

function defaultState() {
  return {
    resumeText: "", resumeFileName: "", jobText: "", jobFileName: "", analysis: null,
    roadmapDays: 14, roadmapDone: {}, sprintStatus: {}, sprintDone: [], mockMode: false, mockQuestionIndex: 0,
    applicationSort: "newest", applications: [], portfolio: { description: "", readme: "", demoUrl: "", githubUrl: "", screenshots: false, docs: false },
    studioKind: "cover-letter", studioInput: "", interviewAnswer: "", selectedQuestion: "",
    outputs: {}, aiHistory: [], aiConversationId: "", updatedAt: ""
  };
}
function prefs() { try { return JSON.parse(localStorage.getItem("hackverse-app-preferences") || "{}"); } catch { return {}; } }
function hasSkill(text, aliases) {
  const haystack = ` ${String(text || "").toLowerCase().replace(/\s+/g, " ")} `;
  return aliases.some(alias => {
    const escaped = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i");
    return pattern.test(haystack);
  });
}
function countSkill(text, aliases) {
  const haystack = String(text || "").toLowerCase();
  return aliases.reduce((sum, alias) => {
    const escaped = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "gi");
    return sum + [...haystack.matchAll(pattern)].length;
  }, 0);
}
function detectSkills(text) { return SKILLS.filter(([, aliases]) => hasSkill(text, aliases)).map(([name]) => name); }
function splitRequirementLines(text) {
  return String(text || "").split(/\r?\n|;|•/).map(value => value.replace(/^\s*[-*▪◦]+\s*/, "").trim()).filter(value => value.length > 12).flatMap(value => value.length > 330 ? value.split(/(?<=[!?])\s+/).filter(Boolean) : [value]);
}
function classifyRequirement(evidence) {
  if (/\b(required|must have|must-have|mandatory|minimum requirement|you will need|essential|need to have)\b/i.test(evidence)) return "Required";
  if (/\b(preferred|nice to have|bonus|desirable|a plus|good to have|ideally|optional)\b/i.test(evidence)) return "Preferred";
  return "Not specified";
}
function sectioniseResume(text) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const sections = {};
  let current = "header";
  sections[current] = [];
  for (const line of lines) {
    const heading = line.toLowerCase().replace(/[:\s]+$/, "");
    const match = RESUME_HEADINGS.find(item => heading === item || heading === `${item} section` || heading.startsWith(`${item}:`));
    if (match) { current = match; sections[current] ||= []; }
    else (sections[current] ||= []).push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([key, values]) => [key, values.join("\n").trim()]).filter(([, value]) => value));
}
function analyseResumeText(resumeText, jobText) {
  const resume = String(resumeText || "");
  const job = String(jobText || "");
  const resumeSkills = detectSkills(resume);
  const jobSkills = detectSkills(job);
  const lines = splitRequirementLines(job);
  const requirements = jobSkills.map(skill => {
    const catalog = SKILLS.find(item => item[0] === skill);
    const evidence = lines.filter(line => hasSkill(line, catalog?.[1] || [skill]));
    return { skill, frequency: countSkill(job, catalog?.[1] || [skill]), status: evidence.length ? classifyRequirement(evidence.join(" ")) : "Not specified", evidence: evidence[0] || `The skill “${skill}” appears in the job description, but no more specific requirement sentence was identified.` };
  }).sort((a, b) => (b.status === "Required") - (a.status === "Required") || b.frequency - a.frequency);
  const matched = [], partial = [], missing = [];
  for (const item of requirements) {
    if (resumeSkills.includes(item.skill)) matched.push(item);
    else {
      const related = (TRANSFERABLE[item.skill] || []).filter(skill => resumeSkills.includes(skill));
      if (related.length) partial.push({ ...item, related }); else missing.push(item);
    }
  }
  const weights = requirements.map(item => item.status === "Required" ? 1.5 : item.status === "Preferred" ? 0.8 : 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const earned = requirements.reduce((sum, item) => sum + (matched.some(row => row.skill === item.skill) ? (item.status === "Required" ? 1.5 : item.status === "Preferred" ? .8 : 1) : partial.some(row => row.skill === item.skill) ? (item.status === "Required" ? .75 : item.status === "Preferred" ? .4 : .5) : 0), 0);
  const score = requirements.length ? Math.round(earned / totalWeight * 100) : null;
  const sections = sectioniseResume(resume);
  const words = resume.split(/\s+/).filter(Boolean).length;
  const bullets = resume.split(/\r?\n/).filter(line => /^\s*(?:[-*•▪◦]|\d+[.)])\s+/.test(line));
  const weakBullets = bullets.filter(line => WEAK_PHRASES.some(phrase => line.toLowerCase().includes(phrase)));
  const metricBullets = bullets.filter(line => /\d|%|\$|₹|\b(increased|reduced|improved|grew|saved|cut|raised)\b/i.test(line));
  const emailPresent = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(resume);
  const phonePresent = /(?:\+?\d[\d\s().-]{7,}\d)/.test(resume);
  const atsChecks = [
    { label: "Contact email", ok: emailPresent, why: emailPresent ? "An email address was found." : "Add a professional email address near the top." },
    { label: "Phone number", ok: phonePresent, why: phonePresent ? "A phone-like number was found." : "Add a contact number if you want recruiters to reach you by phone." },
    { label: "Skills section", ok: Boolean(sections.skills || sections["technical skills"]), why: "Use a clear Skills or Technical Skills heading." },
    { label: "Experience or project evidence", ok: Boolean(sections.experience || sections["work experience"] || sections.projects), why: "Include specific experience or project sections, even if they are academic or personal." },
    { label: "Bullet points", ok: bullets.length >= 2, why: "Use concise bullet points so accomplishments are easy to scan." },
    { label: "Quantified impact", ok: metricBullets.length > 0, why: "Add real numbers where you can verify them: scale, time saved, users, accuracy or performance." },
    { label: "Professional summary", ok: Boolean(sections.summary || sections.profile || sections.objective), why: "A short targeted summary can help a reader understand your direction quickly." },
    { label: "Length", ok: words >= 180 && words <= 1100, why: words < 180 ? "The extracted resume looks unusually short; check whether content was missed." : "The extracted resume is long. Consider prioritising relevant evidence and keeping early-career resumes concise." }
  ];
  const repeatedWords = findRepeatedWords(resume);
  const suggestions = [];
  if (!emailPresent) suggestions.push({ title: "Add a professional email", issue: "No email address was found in the extracted text.", why: "Recruiters need a reliable way to contact you.", fix: "Place your preferred email in the header, then confirm it is correct." });
  if (!sections.summary && !sections.profile && !sections.objective) suggestions.push({ title: "Add a focused summary", issue: "A summary or profile section was not detected.", why: "A short introduction helps connect your strengths to the role.", fix: "Write 2–3 sentences based only on your real experience, skills and target direction." });
  if (!bullets.length) suggestions.push({ title: "Use achievement-led bullets", issue: "No bullet-point lines were detected.", why: "Bullets make responsibilities and results easier to scan.", fix: "Start each bullet with a specific action verb and describe the outcome." });
  if (weakBullets.length) suggestions.push({ title: "Strengthen vague bullet points", issue: `${weakBullets.length} bullet point(s) use phrases such as “worked on” or “responsible for”.`, why: "Vague wording hides the action you personally took.", fix: "Replace generic phrases with the action, tool and outcome. Do not add results you cannot verify." });
  if (!metricBullets.length) suggestions.push({ title: "Look for real metrics", issue: "No measurable result was detected in the bullets.", why: "Specific scale or outcomes can make a contribution easier to assess.", fix: "Check whether you can truthfully add user counts, data volume, time, performance, cost or project scope." });
  if (!sections.education) suggestions.push({ title: "Check education details", issue: "An Education heading was not detected.", why: "Education can be relevant for student and early-career applications.", fix: "Add your institution, qualification and expected or completed dates if relevant." });
  if (repeatedWords.length) suggestions.push({ title: "Review repeated wording", issue: `Repeated words: ${repeatedWords.map(row => `${row.word} (${row.count}×)`).join(", ")}.`, why: "Repeated verbs can make several achievements sound alike.", fix: "Vary sentence openings while keeping the meaning accurate." });
  const priorities = [...missing, ...partial].map(item => {
    const [difficulty, hours] = DIFFICULTY[item.skill] || ["Medium", 20];
    const weight = (item.status === "Required" ? 5 : item.status === "Preferred" ? 2 : 3) + Math.min(4, item.frequency) + (item.related?.length ? 1 : 0) + (difficulty === "Hard" ? 0 : 1);
    const why = `${item.status === "Required" ? "The job description marks it as required" : item.status === "Preferred" ? "The job description lists it as preferred" : "The job description mentions it without labelling priority"}; it appears ${item.frequency} time(s)${item.related?.length ? ` and you already list related skills (${item.related.join(", ")})` : ""}.`;
    return { ...item, difficulty, hours, priority: weight, why, state: partial.some(row => row.skill === item.skill) ? "Transferable" : "Missing" };
  }).sort((a, b) => b.priority - a.priority || b.frequency - a.frequency);
  return { score, resumeSkills, jobSkills, requirements, matched, partial, missing, priorities, sections, wordCount: words, bullets: bullets.length, weakBullets, metricBullets, atsChecks, atsScore: Math.round(atsChecks.filter(item => item.ok).length / atsChecks.length * 100), suggestions, analyzedAt: new Date().toISOString() };
}
function findRepeatedWords(text) {
  const stop = new Set("about after again also among around because before being built each from have into more most other over project projects their there these they this those through using what when where which while with your candidate experience skills worked work team role responsibilities developed development effectively successfully various including across within".split(" "));
  const words = (String(text || "").toLowerCase().match(/[a-z]{4,}/g) || []).filter(word => !stop.has(word));
  const counts = new Map(); words.forEach(word => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts].filter(([word, count]) => count >= 4 && !["javascript", "python", "react", "java", "html", "css"].includes(word)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([word, count]) => ({ word, count }));
}
function formatDate(value) { if (!value) return "Not set"; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function percent(done, total) { return total ? Math.round(done / total * 100) : 0; }
function readinessScore() {
  if (!state.analysis) return null;
  const skillProgress = state.analysis.priorities.length ? percent(state.analysis.priorities.filter(item => state.sprintStatus[item.skill] === "project-tested").length, Math.min(3, state.analysis.priorities.length)) : 100;
  const roadmapTotal = Object.keys(state.roadmapDone || {}).filter(key => key.startsWith(`${state.roadmapDays}-`)).length;
  const roadmapProgress = percent(roadmapTotal, Number(state.roadmapDays || 14));
  return Math.round(state.analysis.score * .65 + skillProgress * .2 + roadmapProgress * .15);
}
function listHtml(items, empty) { return items?.length ? `<ul class="career-check-list">${items.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : `<p class="career-muted">${esc(empty)}</p>`; }
function card(title, value, note, icon) { return `<article class="career-stat-card"><span class="career-stat-icon">${icon}</span><small>${esc(title)}</small><strong>${esc(value)}</strong><p>${esc(note)}</p></article>`; }
function gapsData() { return state.analysis?.priorities || []; }
function topGaps() { return gapsData().slice(0, 3); }
function matchBadge(status) { return `<span class="career-status career-status-${status.toLowerCase().replace(/\s+/g, "-")}">${esc(status)}</span>`; }
function renderOverview() {
  const analysis = state.analysis;
  const score = analysis?.score;
  const readiness = readinessScore();
  const doneApps = state.applications.length;
  const interviews = state.applications.filter(app => app.status === "Interview" || app.status === "Offer").length;
  const nextGap = topGaps()[0];
  return `<div class="career-overview-head"><div><div class="career-section-kicker">YOUR CAREER SNAPSHOT</div><h2>Progress that has a purpose.</h2><p>Start with a resume and a target role. Your dashboard will turn the comparison into clear next steps.</p></div><button type="button" class="career-primary-btn" data-career-tab-open="resume">${analysis ? "Update analysis" : "Start analysis"} ↗</button></div>
    <div class="career-stat-grid">${card("Resume · job match", score == null ? "Not analysed" : `${score}%`, score == null ? "Add a resume and job description" : "Evidence-based keyword and requirement overlap", "◎")}${card("Career readiness", readiness == null ? "—" : `${readiness}%`, "A progress estimate, not a hiring prediction", "✳")}${card("Priority skill gaps", analysis ? gapsData().length : "—", "Ranked by role relevance and evidence", "↗")}${card("Applications tracked", doneApps, `${interviews} interview or offer stage(s)`, "▤")}</div>
    <div class="career-overview-grid"><section class="career-surface career-next-action"><div class="career-surface-label">RECOMMENDED NEXT ACTION</div><div class="career-next-icon">✦</div><h3>${esc(nextGap ? `Build confidence in ${nextGap.skill}` : analysis ? "Strengthen your resume evidence" : "Upload your resume and choose a target role")}</h3><p>${esc(nextGap ? nextGap.why : analysis ? "Use the Resume Studio to improve the clarity of your actual projects and experience." : "A useful comparison needs both your resume text and a job description.")}</p><button class="career-text-btn" type="button" data-career-tab-open="${nextGap ? "roadmap" : analysis ? "studio" : "resume"}">Take the next step →</button></section>
    <section class="career-surface career-overview-progress"><div class="career-surface-label">YOUR MOMENTUM</div><div class="career-progress-row"><span>Learning roadmap</span><b>${percent(Object.keys(state.roadmapDone || {}).filter(key => key.startsWith(`${state.roadmapDays}-`)).length, Number(state.roadmapDays || 14))}%</b></div><div class="career-progress-track"><i style="width:${percent(Object.keys(state.roadmapDone || {}).filter(key => key.startsWith(`${state.roadmapDays}-`)).length, Number(state.roadmapDays || 14))}%"></i></div><div class="career-progress-row"><span>Interview preparation</span><b>${state.outputs.interviewReview ? "In progress" : "Not started"}</b></div><div class="career-progress-track"><i style="width:${state.outputs.interviewReview ? "45" : "0"}%"></i></div><div class="career-progress-row"><span>Portfolio audit</span><b>${state.outputs.portfolioScore == null ? "Not started" : `${state.outputs.portfolioScore}%`}</b></div><div class="career-progress-track"><i style="width:${state.outputs.portfolioScore || 0}%"></i></div><p class="career-muted career-small-note">Progress changes as you complete your roadmap, practise and review your work.</p></section></div>
    <div class="career-overview-bottom"><section class="career-surface"><div class="career-surface-heading"><div><div class="career-surface-label">TOP SKILL PRIORITIES</div><h3>Focus on what moves the needle.</h3></div><button class="career-text-btn" type="button" data-career-tab-open="roadmap">View roadmap →</button></div>${analysis ? (topGaps().length ? topGaps().map((gap,index)=>`<div class="career-gap-row"><span class="career-gap-number">0${index+1}</span><div><b>${esc(gap.skill)}</b><small>${esc(gap.why)}</small></div>${matchBadge(gap.state)}</div>`).join("") : `<p class="career-muted">No priority gaps were found in the current comparison. Review the evidence and consider a more specific target role.</p>`) : `<p class="career-muted">Your highest-impact skill gaps will appear after a resume and job description are analysed.</p>`}</section>
    <section class="career-surface"><div class="career-surface-label">APPLICATION PIPELINE</div><h3>Keep your search organised.</h3><div class="career-pipeline"><div><b>${state.applications.filter(a=>a.status==="Applied").length}</b><span>Applied</span></div><div><b>${interviews}</b><span>Interviews / offers</span></div><div><b>${state.applications.filter(a=>a.status==="Offer").length}</b><span>Offers</span></div></div><button class="career-secondary-btn" type="button" data-career-tab-open="applications">Open application tracker →</button></section></div>
    <div class="career-privacy-line"><span>⌑</span> Resume text and career records are stored in your private account document. Agent37 receives career context only when you send a Copilot request and have context sharing enabled in Settings.</div>`;
}
function renderResumeTab() {
  const analysis = state.analysis;
  return `<div class="career-tab-intro"><div><div class="career-section-kicker">01 / RESUME & ROLE MATCH</div><h2>Know what the role is really asking for.</h2><p>Upload a PDF or paste text, then add the job description. We compare named skills and show the job-description evidence behind each result.</p></div>${analysis?.score != null ? `<div class="career-match-score"><strong>${analysis.score}%</strong><span>current match</span></div>` : ""}</div>
  <div class="career-two-column"><section class="career-surface"><div class="career-surface-heading"><div><div class="career-surface-label">YOUR RESUME</div><h3>Start with your experience.</h3></div><span class="career-count-pill">Private to your account</span></div><label class="career-upload-zone"><input type="file" id="careerResumeFile" accept="application/pdf,.pdf,.txt,.md" hidden><span class="career-upload-icon">↑</span><b>Upload your resume</b><small>PDF, TXT or Markdown · up to 15 MB</small><span class="career-upload-cta">Choose a file</span></label>${state.resumeFileName ? `<p class="career-file-label">Attached: ${esc(state.resumeFileName)}</p>` : ""}<label class="career-field-label" for="careerResumeText">Or paste resume text</label><textarea id="careerResumeText" class="career-large-textarea" data-cm-field="resumeText" placeholder="Paste your resume text here…">${esc(state.resumeText)}</textarea><div class="career-field-hint">${state.resumeText.length.toLocaleString()} / ${CAREER_LIMITS.resume.toLocaleString()} characters. Do not include information you do not want stored in your private career workspace.</div></section>
  <section class="career-surface"><div class="career-surface-heading"><div><div class="career-surface-label">TARGET ROLE</div><h3>Bring a real opportunity.</h3></div></div><label class="career-upload-zone career-upload-zone-soft"><input type="file" id="careerJobFile" accept="application/pdf,.pdf,.txt,.md" hidden><span class="career-upload-icon">↧</span><b>Upload job description</b><small>PDF, TXT or Markdown · optional</small><span class="career-upload-cta">Choose a file</span></label>${state.jobFileName ? `<p class="career-file-label">Attached: ${esc(state.jobFileName)}</p>` : ""}<label class="career-field-label" for="careerJobText">Or paste the job description</label><textarea id="careerJobText" class="career-large-textarea" data-cm-field="jobText" placeholder="Paste the full job or internship description…">${esc(state.jobText)}</textarea><div class="career-field-hint">${state.jobText.length.toLocaleString()} / ${CAREER_LIMITS.job.toLocaleString()} characters.</div></section></div>
  <div class="career-action-row"><button type="button" class="career-primary-btn" data-career-action="analyse">Analyse resume and role <span>↗</span></button><span class="career-muted">A mention is not proof of proficiency. Review every match against your actual work.</span></div>
  ${analysis ? `<section class="career-surface career-results-panel"><div class="career-surface-heading"><div><div class="career-surface-label">ANALYSIS RESULTS</div><h3>Evidence, not guesswork.</h3></div><span class="career-count-pill">${new Date(analysis.analyzedAt).toLocaleString()}</span></div><div class="career-result-summary"><div class="career-score-circle" style="--career-progress:${analysis.score ?? 0}%"><b>${analysis.score == null ? "—" : `${analysis.score}%`}</b><small>match estimate</small></div><div><h4>${analysis.score == null ? "Resume profile extracted" : analysis.score >= 80 ? "Strong keyword alignment" : analysis.score >= 55 ? "A useful starting point" : "A focused improvement opportunity"}</h4><p>This estimate weights required skills more heavily, gives partial credit for related skills, and compares named skills found in the extracted resume text. It does not measure depth, quality, seniority or hiring probability.</p><div class="career-inline-stats"><span><b>${analysis.matched.length}</b> matched</span><span><b>${analysis.partial.length}</b> transferable</span><span><b>${analysis.missing.length}</b> missing</span></div></div></div>
  <div class="career-match-groups"><div><h4>Matched skills</h4>${analysis.matched.length ? `<div class="career-skill-chip-list">${analysis.matched.map(item=>`<span class="career-skill-chip is-match">✓ ${esc(item.skill)}</span>`).join("")}</div>` : `<p class="career-muted">No matching named skills were detected.</p>`}</div><div><h4>Partially matched · related skills</h4>${analysis.partial.length ? `<div class="career-skill-chip-list">${analysis.partial.map(item=>`<span class="career-skill-chip is-partial">◌ ${esc(item.skill)} <small>via ${esc(item.related.join(", "))}</small></span>`).join("")}</div>` : `<p class="career-muted">No transferable skill links were found in this comparison.</p>`}</div><div><h4>Missing skills</h4>${analysis.missing.length ? `<div class="career-skill-chip-list">${analysis.missing.map(item=>`<span class="career-skill-chip is-missing">+ ${esc(item.skill)}</span>`).join("")}</div>` : `<p class="career-muted">No missing named skills detected.</p>`}</div></div>
  <div class="career-evidence-table"><div class="career-evidence-head"><span>JOB REQUIREMENT</span><span>PRIORITY</span><span>RESUME SIGNAL</span><span>JOB DESCRIPTION EVIDENCE</span></div>${analysis.requirements.map(item=>{const found=analysis.matched.some(row=>row.skill===item.skill);const partial=analysis.partial.find(row=>row.skill===item.skill);return `<div class="career-evidence-row"><b>${esc(item.skill)}</b><span>${matchBadge(item.status)}</span><span>${found?matchBadge("Matched"):partial?matchBadge("Transferable"):matchBadge("Missing")}</span><p>“${esc(truncate(item.evidence,220))}”</p></div>`;}).join("") || `<p class="career-muted">No recognised skill requirements were found. Use a more detailed job description with responsibilities and technical requirements.</p>`}</div>
  <div class="career-result-footer"><span>Extracted ${analysis.wordCount} resume words · ${analysis.resumeSkills.length} named skills · ${analysis.bullets} bullet points</span><button class="career-text-btn" type="button" data-career-tab-open="studio">Improve my resume →</button></div></section>` : ""}`;
}
function renderStudioTab() {
  const analysis = state.analysis;
  const weak = analysis?.weakBullets || [];
  const suggestions = analysis?.suggestions || [];
  const output = state.outputs.studio || "";
  return `<div class="career-tab-intro"><div><div class="career-section-kicker">02 / RESUME ENHANCEMENT STUDIO</div><h2>Make your evidence easier to understand.</h2><p>Review weak wording, quantify only what you can verify, and create role-specific drafts without inventing achievements.</p></div></div>
  <div class="career-studio-grid"><section class="career-surface"><div class="career-surface-label">YOUR RESUME CHECK-UP</div><h3>What to improve first.</h3>${analysis ? (suggestions.length ? suggestions.map(item=>`<article class="career-suggestion"><span class="career-suggestion-mark">!</span><div><b>${esc(item.title)}</b><p><strong>What:</strong> ${esc(item.issue)}</p><p><strong>Why it matters:</strong> ${esc(item.why)}</p><p><strong>Try this:</strong> ${esc(item.fix)}</p></div></article>`).join("") : `<p class="career-muted">No high-priority heuristic suggestions were identified. Review the ATS checklist below and check the original PDF formatting.</p>`) : `<p class="career-muted">Run a resume analysis to see section-by-section feedback and formatting checks.</p>`}</section>
  <section class="career-surface"><div class="career-surface-label">ATS READABILITY CHECK</div><h3>${analysis ? `${analysis.atsScore}% checklist completion` : "A practical readability review"}</h3><p class="career-muted">This is a plain-text heuristic checklist, not a commercial ATS parser or a guarantee of passing an employer's screening system.</p>${analysis ? `<div class="career-ats-list">${analysis.atsChecks.map(item=>`<div class="career-ats-item"><span class="${item.ok?"ok":"not-ok"}">${item.ok?"✓":"!"}</span><div><b>${esc(item.label)}</b><small>${esc(item.why)}</small></div></div>`).join("")}</div>` : `<p class="career-muted">Upload a resume to check contact fields, structure, bullet points, quantification and length.</p>`}</section></div>
  <section class="career-surface"><div class="career-surface-label">RESUME SECTION AUDIT</div><h3>Review the structure we could identify.</h3>${analysis ? `<div class="career-section-audit">${Object.entries(analysis.sections).map(([name,value])=>`<article><b>${esc(name.replaceAll("-"," ").replace(/\b\w/g,letter=>letter.toUpperCase()))}</b><p>${esc(truncate(value,320))}${value.length>320?"…":""}</p><small>${value.split(/\s+/).filter(Boolean).length} words detected</small></article>`).join("") || `<p class="career-muted">No conventional section headings were identified. Check the extracted text or paste clearer headings.</p>`}</div>${weak.length?`<div class="career-weak-bullets"><h4>Bullets that may need stronger evidence</h4>${weak.slice(0,8).map(line=>`<p>${esc(line)}</p>`).join("")}</div>`:""}` : `<p class="career-muted">Section headings, bullet points and content excerpts will appear after a resume analysis.</p>`}</section>
  <section class="career-surface career-studio-tools"><div class="career-surface-heading"><div><div class="career-surface-label">AI-ASSISTED WRITING TOOLS</div><h3>Improve one piece at a time.</h3></div><span class="career-count-pill">Uses your actual context when enabled</span></div><div class="career-tool-grid"><button type="button" data-career-action="studio-ai" data-kind="summary"><b>Resume summary</b><small>Create a clear introduction based on the facts in your resume.</small><span>Draft summary ↗</span></button><button type="button" data-career-action="studio-ai" data-kind="experience"><b>Experience bullet improver</b><small>Improve clarity and action verbs without inventing metrics.</small><span>Improve bullets ↗</span></button><button type="button" data-career-action="studio-ai" data-kind="project"><b>Project description</b><small>Explain the problem, your contribution, tools and outcome.</small><span>Improve project ↗</span></button><button type="button" data-career-action="studio-ai" data-kind="tailor"><b>Tailor for this job</b><small>Identify which genuine evidence should be more visible.</small><span>Tailor resume ↗</span></button><button type="button" data-career-action="studio-ai" data-kind="skills"><b>Organise skills section</b><small>Group your listed skills into clear, relevant categories.</small><span>Organise skills ↗</span></button></div><label class="career-field-label" for="careerStudioInput">Paste the summary, bullet points or project details you want to improve</label><textarea id="careerStudioInput" class="career-medium-textarea" data-cm-field="studioInput" placeholder="Paste the exact text here. Include any facts or metrics you can verify…">${esc(state.studioInput)}</textarea><div class="career-action-row"><span class="career-muted">Suggested action verbs: ${ACTION_VERBS.slice(0,7).join(" · ")}</span><button type="button" class="career-secondary-btn" data-career-action="studio-ai" data-kind="experience">Improve this text with Copilot</button></div>${output ? `<div class="career-ai-output"><div class="career-surface-label">LATEST DRAFT</div><pre>${esc(output)}</pre><div class="career-action-row"><button type="button" class="career-text-btn" data-career-action="copy-output" data-output="studio">Copy draft</button><button type="button" class="career-text-btn" data-career-action="download-output" data-output="studio">Download .txt</button></div></div>` : ""}</section>
  <section class="career-surface"><div class="career-surface-label">BEFORE / AFTER REVIEW</div><h3>Keep the meaning. Improve the signal.</h3><div class="career-before-after"><div><small>BEFORE</small><p>${esc(weak[0] || state.studioInput || "Your original bullet point will appear here when you paste one above.")}</p></div><div class="career-before-after-arrow">→</div><div><small>AFTER · AI DRAFT</small><p>${esc(output || "Your improved draft will appear here. Check every detail before using it.")}</p></div></div></section>`;
}
function roadmapItems(days) {
  const gaps = topGaps();
  const skills = gaps.length ? gaps.map(row=>row.skill) : (state.analysis?.resumeSkills || ["your target skill"]).slice(0,3);
  const stageCount = Math.ceil(days / Math.max(1, skills.length));
  const activities = ["Learn the core concepts and vocabulary", "Follow an official tutorial and reproduce a small example", "Practise with a short, focused exercise", "Build a small feature that uses the skill", "Explain your decisions and review the result", "Improve the project and document what you learned"];
  return Array.from({ length: days }, (_, index) => {
    const skillIndex = Math.min(skills.length - 1, Math.floor(index / stageCount));
    const phase = Math.floor((index % stageCount) / Math.max(1, stageCount / activities.length));
    const skill = skills[skillIndex] || "your target skill";
    return { id: `${days}-${index+1}`, day: index + 1, skill, title: activities[Math.min(activities.length-1, phase)], task: index % 3 === 2 ? `Create a small ${skill} exercise or mini-project and write down what works and what you still need to learn.` : `Spend a focused session on ${skill}: ${activities[Math.min(activities.length-1, phase)].toLowerCase()}.`, time: "45–90 min" };
  });
}
function resourcesFor(skill) {
  const name = skill.toLowerCase();
  if (name.includes("javascript") || name.includes("react") || name.includes("html") || name.includes("css") || name.includes("typescript") || name.includes("node")) return [{ label: "MDN Web Docs", url: "https://developer.mozilla.org/" }, { label: "freeCodeCamp", url: "https://www.freecodecamp.org/learn/" }];
  if (name.includes("python") || name.includes("pandas") || name.includes("numpy")) return [{ label: "Python documentation", url: "https://docs.python.org/3/tutorial/" }, { label: "Kaggle Learn", url: "https://www.kaggle.com/learn" }];
  if (name.includes("sql") || name.includes("postgres") || name.includes("mysql")) return [{ label: "PostgreSQL tutorial", url: "https://www.postgresql.org/docs/current/tutorial.html" }, { label: "SQLBolt", url: "https://sqlbolt.com/" }];
  if (name.includes("figma") || name.includes("ux") || name.includes("ui")) return [{ label: "Figma Learn", url: "https://help.figma.com/hc/en-us/categories/360002051613-Learn-design" }, { label: "Nielsen Norman Group", url: "https://www.nngroup.com/articles/" }];
  if (name.includes("machine learning") || name.includes("tensor") || name.includes("pytorch")) return [{ label: "Google Machine Learning Crash Course", url: "https://developers.google.com/machine-learning/crash-course" }, { label: "PyTorch tutorials", url: "https://pytorch.org/tutorials/" }];
  return [{ label: "Coursera courses", url: "https://www.coursera.org/courses" }, { label: "GitHub Skills", url: "https://skills.github.com/" }];
}
function renderRoadmapTab() {
  const days = Number(state.roadmapDays || 14);
  const items = roadmapItems(days);
  const done = items.filter(item=>state.roadmapDone[item.id]).length;
  const gaps = topGaps();
  return `<div class="career-tab-intro"><div><div class="career-section-kicker">03 / PERSONALISED LEARNING ROADMAP</div><h2>Turn missing skills into a manageable plan.</h2><p>Start with the three highest-priority gaps. Time estimates are planning guidance, not a promise of mastery.</p></div></div>
  <div class="career-plan-selector"><div><b>Choose your time horizon</b><small>Plan length changes the daily pace and task detail.</small></div><div class="career-segmented">${[7,14,30].map(value=>`<button type="button" data-plan-days="${value}" class="${days===value?"active":""}">${value} days</button>`).join("")}</div></div>
  <section class="career-surface career-roadmap-progress"><div><div class="career-surface-label">PLAN PROGRESS</div><h3>${done} of ${days} learning days completed</h3><div class="career-progress-track"><i style="width:${percent(done,days)}%"></i></div></div><strong>${percent(done,days)}%</strong></section>
  <div class="career-roadmap-layout"><div class="career-roadmap-list">${items.map(item=>`<article class="career-roadmap-day ${state.roadmapDone[item.id]?"is-complete":""}"><label><input type="checkbox" data-roadmap-check="${item.id}" ${state.roadmapDone[item.id]?"checked":""}><span class="career-day-number">DAY ${String(item.day).padStart(2,"0")}</span><span class="career-day-copy"><b>${esc(item.skill)} · ${esc(item.title)}</b><small>${esc(item.task)}</small><em>${esc(item.time)} estimated</em></span></label></article>`).join("")}</div><aside class="career-surface career-roadmap-aside"><div class="career-surface-label">YOUR TOP THREE GAPS</div>${gaps.length ? gaps.map((gap,index)=>`<div class="career-roadmap-gap"><b>0${index+1} · ${esc(gap.skill)}</b><small>${esc(gap.difficulty)} · estimated ${gap.hours} hours</small><p>${esc(gap.why)}</p>${resourcesFor(gap.skill).map(resource=>`<a href="${resource.url}" target="_blank" rel="noopener noreferrer">${esc(resource.label)} ↗</a>`).join("")}</div>`).join("") : `<p class="career-muted">Run a job comparison to prioritise the skills that matter for your target role. You can still use a general learning plan.</p>`}<p class="career-roadmap-disclaimer">Resource links point to recognised documentation or learning catalogues. Check course access, price and level before enrolling.</p></aside></div>`;
}
function renderSprintTab() {
  const gaps = topGaps();
  const skills = gaps.length ? gaps.map(row=>row.skill) : (state.analysis?.resumeSkills || ["JavaScript", "Python", "SQL"]).slice(0,3);
  const today = new Date().toISOString().slice(0,10);
  const completedToday = state.sprintDone.includes(today);
  const completedDays = [...new Set(state.sprintDone)].sort();
  const streak = (() => { let count=0, cursor=new Date(`${today}T00:00:00`); const set=new Set(completedDays); while(set.has(cursor.toISOString().slice(0,10))){count++;cursor.setDate(cursor.getDate()-1);} return count; })();
  return `<div class="career-tab-intro"><div><div class="career-section-kicker">04 / SKILL SPRINT</div><h2>Learn by doing, not just collecting tabs.</h2><p>Pick one priority skill, complete a practical challenge, and record whether you are learning, practising or have tested it in a project.</p></div><div class="career-streak-card"><span>✦</span><b>${streak} day${streak===1?"":"s"}</b><small>current streak</small></div></div>
  <div class="career-sprint-grid">${skills.map((skill,index)=>{const status=state.sprintStatus[skill]||"learning";return `<article class="career-sprint-card ${index===0?"featured":""}"><div class="career-surface-label">${index===0?"TOP PRIORITY":"SKILL SPRINT"}</div><h3>${esc(skill)}</h3><p>${esc(gaps[index]?.why || "A focused practice skill from your resume profile.")}</p><div class="career-challenge-box"><b>Today's challenge</b><p>Build a small, working example that demonstrates one core ${esc(skill)} concept. Write down the problem, your approach, and what you would improve next.</p></div><label class="career-field-label">Your current confidence</label><select data-sprint-status="${esc(skill)}"><option value="learning" ${status==="learning"?"selected":""}>Learning</option><option value="practiced" ${status==="practiced"?"selected":""}>Practised</option><option value="project-tested" ${status==="project-tested"?"selected":""}>Project-tested</option></select><span class="career-sprint-status">${matchBadge(status==="project-tested"?"Project-tested":status==="practiced"?"Practised":"Learning")}</span>${status==="project-tested"?`<span class="career-skill-badge">✦ Project-tested badge</span>`:""}</article>`;}).join("")}</div>
  <section class="career-surface career-daily-challenge"><div><div class="career-surface-label">DAILY CHECK-IN</div><h3>${completedToday?"Today's challenge is complete.":"Make one small step today."}</h3><p>${completedToday?"Your learning record has been updated.":"Complete a real exercise, note what you learned and mark today's challenge done."}</p></div><button type="button" class="career-primary-btn" data-career-action="sprint-complete" ${completedToday?"disabled":""}>${completedToday?"Completed ✓":"Mark challenge complete"}</button></section><p class="career-muted career-small-note">A streak records check-ins, not mastery. Reanalyse your resume when you have new project evidence.</p>`;
}
function interviewQuestions() {
  const skills = state.analysis?.jobSkills?.slice(0,5) || state.analysis?.resumeSkills?.slice(0,5) || ["problem-solving"];
  const projects = state.analysis?.sections?.projects || "your most relevant project";
  return [
    ...skills.slice(0,3).map(skill=>({ type:"Technical", question:`Explain a core concept in ${skill} and describe when you would choose it over an alternative.`, guidance:"Explain the concept, trade-offs and a small real example." })),
    ...skills.slice(0,2).map(skill=>({ type:"Resume-based", question:`Your resume mentions ${skill}. Where did you use it, what was your contribution, and what did you learn?`, guidance:"Use a specific project, identify your own contribution and be clear about what you did not build." })),
    { type:"Project-based", question:`Walk me through ${truncate(projects,90)}. What problem did it solve, how was it designed, and what would you improve?`, guidance:"Cover problem, constraints, architecture, your role, decisions and lessons." },
    { type:"HR / Behavioural", question:"Tell me about a time you received difficult feedback. What did you do next?", guidance:"Use STAR: Situation, Task, Action, Result. Include what you learned." },
    { type:"Situational", question:"A deadline is approaching, but a key feature is still unreliable. How would you prioritise?", guidance:"Clarify impact, communicate early, reduce scope safely, test the critical path and document trade-offs." },
    { type:"HR", question:"Why are you interested in this role, and what evidence shows you are preparing for it?", guidance:"Connect your genuine interest, relevant work and realistic next learning steps." }
  ];
}
function renderInterviewTab() {
  const questions = interviewQuestions();
  const selected = state.mockMode ? questions[(Number(state.mockQuestionIndex)||0)%questions.length] : questions.find(item=>item.question===state.selectedQuestion) || questions[0];
  return `<div class="career-tab-intro"><div><div class="career-section-kicker">05 / INTERVIEW LAB</div><h2>Practise the questions behind the job.</h2><p>Question ideas are generated from the target-role skills and project sections detected in your resume. Review your actual experience before answering.</p></div><div class="career-interview-pill">${questions.length} practice prompts</div></div>
  <div class="career-interview-mode"><b>${state.mockMode?"Mock interview in progress":"Practice mode"}</b><span>${state.mockMode?`Question ${(Number(state.mockQuestionIndex)||0)+1} of ${questions.length}`:"Start a guided sequence and answer one question at a time."}</span><div>${state.mockMode?`<button type="button" class="career-secondary-btn" data-career-action="mock-next">Next question →</button><button type="button" class="career-text-btn" data-career-action="mock-stop">End mock interview</button>`:`<button type="button" class="career-primary-btn" data-career-action="mock-start">Start mock interview ↗</button>`}</div></div><div class="career-interview-layout"><section class="career-surface"><div class="career-surface-label">QUESTION BANK</div><div class="career-question-list">${questions.map((item,index)=>`<button type="button" class="career-question-button ${selected.question===item.question?"active":""}" data-question-index="${index}"><small>${esc(item.type.toUpperCase())}</small><b>${esc(item.question)}</b></button>`).join("")}</div></section><section class="career-surface career-interview-practice"><div class="career-surface-label">PRACTICE YOUR ANSWER</div>${matchBadge(selected.type)}<h3>${esc(selected.question)}</h3><div class="career-answer-guide"><b>What a strong answer should cover</b><p>${esc(selected.guidance)}</p><p><strong>STAR method:</strong> Situation (context), Task (your responsibility), Action (what you personally did), Result (the real outcome and learning).</p></div><label class="career-field-label" for="careerInterviewAnswer">Your answer</label><textarea id="careerInterviewAnswer" class="career-medium-textarea" data-cm-field="interviewAnswer" placeholder="Write or paste your answer here…">${esc(state.interviewAnswer)}</textarea><div class="career-action-row"><button type="button" class="career-primary-btn" data-career-action="review-interview">Review my answer with Copilot ↗</button><button type="button" class="career-secondary-btn" data-career-action="generate-followups">Generate follow-up questions</button></div>${state.outputs.interviewFollowups?`<div class="career-ai-output"><div class="career-surface-label">POSSIBLE FOLLOW-UP QUESTIONS</div><pre>${esc(state.outputs.interviewFollowups)}</pre><button type="button" class="career-text-btn" data-career-action="download-output" data-output="interviewFollowups">Download questions</button></div>`:""}${state.outputs.interviewReview?`<div class="career-ai-output"><div class="career-surface-label">FEEDBACK</div><pre>${esc(state.outputs.interviewReview)}</pre><button type="button" class="career-text-btn" data-career-action="download-output" data-output="interviewReview">Download feedback</button></div>`:""}</section></div>`;
}
function renderCareerStudioTab() {
  const kinds = [
    ["cover-letter","Cover letter"],["recruiter-message","Recruiter outreach message"],["professional-email","Professional email"],["linkedin-headline","LinkedIn headline"],["linkedin-about","LinkedIn About section"],["internship-message","Internship application message"],["project-description","Project description"]
  ];
  return `<div class="career-tab-intro"><div><div class="career-section-kicker">06 / CAREER STUDIO</div><h2>Write with your real experience.</h2><p>Create a first draft for professional communication and personal branding. Check all names, links and claims before sending or publishing.</p></div></div>
  <section class="career-surface"><div class="career-surface-heading"><div><div class="career-surface-label">PERSONAL BRANDING WORKSPACE</div><h3>Choose the message you need.</h3></div></div><label class="career-field-label" for="careerStudioKind">Draft type</label><select id="careerStudioKind" data-cm-field="studioKind">${kinds.map(([value,label])=>`<option value="${value}" ${state.studioKind===value?"selected":""}>${label}</option>`).join("")}</select><label class="career-field-label" for="careerStudioInput">Context and key facts</label><textarea id="careerStudioInput" class="career-large-textarea" data-cm-field="studioInput" placeholder="Add the company / role, the recipient if known, why you are reaching out, relevant project evidence, and any facts you want included…">${esc(state.studioInput)}</textarea><div class="career-action-row"><span class="career-muted">Use only achievements and experience you can personally verify.</span><button type="button" class="career-primary-btn" data-career-action="career-studio-ai">Generate draft with Copilot ↗</button></div>${state.outputs.careerStudio?`<div class="career-ai-output"><div class="career-surface-label">YOUR DRAFT</div><pre>${esc(state.outputs.careerStudio)}</pre><div class="career-action-row"><button type="button" class="career-text-btn" data-career-action="copy-output" data-output="careerStudio">Copy draft</button><button type="button" class="career-text-btn" data-career-action="download-output" data-output="careerStudio">Download .txt</button></div></div>`:""}</section>`;
}
function runPortfolioAudit() {
  const portfolio = state.portfolio;
  const skills = state.analysis?.jobSkills || [];
  const text = `${portfolio.description} ${portfolio.readme}`.toLowerCase();
  const checks = [
    { label:"Clear problem and purpose", ok: portfolio.description.trim().length >= 100, advice:"Describe the problem, intended user and what the project does in plain language." },
    { label:"Your individual contribution", ok:/\b(i|my|i built|i designed|i implemented|i developed|my role)\b/i.test(portfolio.description), advice:"State what you personally built or decided. Be specific about team contributions." },
    { label:"Relevant technical detail", ok: skills.some(skill=>hasSkill(text, [skill.toLowerCase()])), advice:"Name the technologies and explain why you used them. Connect them to the target role's requirements." },
    { label:"README documentation", ok: portfolio.readme.trim().length >= 150, advice:"Add setup instructions, feature overview, architecture notes, screenshots and known limitations." },
    { label:"Live demo", ok: /^https?:\/\//i.test(portfolio.demoUrl), advice:"Add a working public demo where it is safe and practical. Verify the link before sharing." },
    { label:"GitHub repository", ok: /^https?:\/\//i.test(portfolio.githubUrl), advice:"Link a repository with a meaningful README and a clear project structure." },
    { label:"Screenshots", ok: portfolio.screenshots === true, advice:"Add a small set of clear screenshots or a short walkthrough so a reviewer can understand the project quickly." },
    { label:"Documentation", ok: portfolio.docs === true, advice:"Document installation, configuration, important decisions, testing and limitations." }
  ];
  return { checks, score: percent(checks.filter(item=>item.ok).length, checks.length), skillsMentioned: skills.filter(skill=>hasSkill(text,[skill.toLowerCase()])) };
}
function renderPortfolioTab() {
  const audit = runPortfolioAudit();
  return `<div class="career-tab-intro"><div><div class="career-section-kicker">07 / PORTFOLIO AUDIT</div><h2>Show the work behind your skills.</h2><p>Review your project story, technical depth and presentation. This audit analyses the information you provide; it does not crawl a GitHub account or verify a live deployment.</p></div><div class="career-audit-score"><b>${audit.score}%</b><small>checklist score</small></div></div>
  <div class="career-portfolio-layout"><section class="career-surface"><div class="career-surface-label">PROJECT DETAILS</div><label class="career-field-label">Project description and your contribution</label><textarea class="career-medium-textarea" data-portfolio-field="description" placeholder="What problem does this solve? Who is it for? What did you personally build? What technical choices did you make?">${esc(state.portfolio.description)}</textarea><label class="career-field-label">README text (paste the main sections)</label><textarea class="career-medium-textarea" data-portfolio-field="readme" placeholder="Paste your README overview, setup instructions, features and architecture notes…">${esc(state.portfolio.readme)}</textarea><div class="career-form-two"><label class="career-field-label">Live demo URL<input type="url" data-portfolio-field="demoUrl" value="${esc(state.portfolio.demoUrl)}" placeholder="https://your-demo.example"></label><label class="career-field-label">GitHub repository URL<input type="url" data-portfolio-field="githubUrl" value="${esc(state.portfolio.githubUrl)}" placeholder="https://github.com/you/project"></label></div><label class="career-inline-check"><input type="checkbox" data-portfolio-field="screenshots" ${state.portfolio.screenshots?"checked":""}> I have added useful project screenshots or a walkthrough.</label><label class="career-inline-check"><input type="checkbox" data-portfolio-field="docs" ${state.portfolio.docs?"checked":""}> I have added setup and technical documentation.</label></section><aside class="career-surface"><div class="career-surface-label">PORTFOLIO READINESS CHECKLIST</div><h3>${audit.score}% complete</h3><div class="career-progress-track"><i style="width:${audit.score}%"></i></div>${audit.checks.map(item=>`<div class="career-audit-check"><span class="${item.ok?"ok":"not-ok"}">${item.ok?"✓":"!"}</span><div><b>${esc(item.label)}</b><small>${esc(item.ok?"Evidence provided.":item.advice)}</small></div></div>`).join("")}<p class="career-muted career-small-note">${audit.skillsMentioned.length?`Skills evidenced in the pasted project text: ${audit.skillsMentioned.join(", ")}.`:"Add relevant technical details to show which job skills your projects demonstrate."}</p></aside></div>`;
}
function renderApplicationsTab() {
  const search = state.applicationSearch || "";
  const filter = state.applicationFilter || "All";
  const sort = state.applicationSort || "newest";
  const apps = state.applications.filter(app => filter === "All" || app.status === filter).sort((a,b)=> sort === "oldest" ? String(a.appliedAt||"").localeCompare(String(b.appliedAt||"")) : sort === "deadline" ? String(a.deadline||"9999-12-31").localeCompare(String(b.deadline||"9999-12-31")) : String(b.appliedAt||"").localeCompare(String(a.appliedAt||"")));
  const statuses = ["Interested","Applied","Online assessment","Interview","Offer","Rejected","Withdrawn"];
  const now = new Date().toISOString().slice(0,10);
  const followUps = state.applications.filter(app=>app.followUp && app.followUp<=now && !["Offer","Rejected","Withdrawn"].includes(app.status)).length;
  return `<div class="career-tab-intro"><div><div class="career-section-kicker">08 / APPLICATION TRACKER</div><h2>Keep every opportunity in one place.</h2><p>Track internships and jobs, follow-ups, interviews and the resume version you used. Records are saved to your private career workspace.</p></div></div>
  <div class="career-application-stats"><div><b>${state.applications.length}</b><span>Total applications</span></div><div><b>${state.applications.filter(a=>a.status==="Interview").length}</b><span>Interviews</span></div><div><b>${state.applications.filter(a=>a.status==="Offer").length}</b><span>Offers</span></div><div><b>${followUps}</b><span>Follow-ups due</span></div></div>
  <section class="career-surface"><div class="career-surface-heading"><div><div class="career-surface-label">ADD AN OPPORTUNITY</div><h3>Save a job or internship.</h3></div></div><form id="careerApplicationForm" class="career-application-form"><label>Company name *<input name="company" required maxlength="100" placeholder="Company / organisation"></label><label>Job title *<input name="title" required maxlength="120" placeholder="Intern · Software Engineer"></label><label>Application status<select name="status">${statuses.map(value=>`<option>${value}</option>`).join("")}</select></label><label>Application date<input type="date" name="appliedAt" value="${new Date().toISOString().slice(0,10)}"></label><label>Deadline<input type="date" name="deadline"></label><label>Follow-up reminder<input type="date" name="followUp"></label><label>Recruiter contact<input name="recruiter" maxlength="160" placeholder="Name or professional email"></label><label>Resume version<input name="resumeVersion" maxlength="80" value="${esc(state.resumeFileName || "Current resume")}"></label><label class="career-field-span">Job description / notes<textarea name="notes" rows="2" maxlength="1800" placeholder="Paste the role link, key requirements, notes and next steps…"></textarea></label><button type="submit" class="career-primary-btn career-field-span">Add to tracker +</button></form></section>
  <section class="career-surface"><div class="career-surface-heading"><div><div class="career-surface-label">YOUR PIPELINE</div><h3>Applications and next steps.</h3></div><div class="career-app-filters"><input type="search" data-application-search value="${esc(search)}" placeholder="Search company or role"><select data-application-filter aria-label="Filter applications by status"><option>All</option>${statuses.map(value=>`<option ${filter===value?"selected":""}>${value}</option>`).join("")}</select><select data-application-sort aria-label="Sort applications"><option value="newest" ${sort==="newest"?"selected":""}>Newest first</option><option value="oldest" ${sort==="oldest"?"selected":""}>Oldest first</option><option value="deadline" ${sort==="deadline"?"selected":""}>Deadline soonest</option></select></div></div>${apps.length?`<div class="career-app-list">${apps.map(app=>`<article class="career-app-row" data-app-search-key="${esc(`${app.company} ${app.title} ${app.notes || ""} ${app.recruiter || ""} ${app.resumeVersion || ""} ${app.status || ""}`.toLowerCase())}" ${search && !`${app.company} ${app.title} ${app.notes || ""} ${app.recruiter || ""} ${app.resumeVersion || ""} ${app.status || ""}`.toLowerCase().includes(search.toLowerCase()) ? "hidden" : ""}><div><b>${esc(app.title)}</b><strong>${esc(app.company)}</strong><small>Applied: ${esc(formatDate(app.appliedAt))} · Deadline: ${esc(formatDate(app.deadline))}</small><small>${app.followUp?`Follow up: ${esc(formatDate(app.followUp))}`:"No follow-up reminder"}${app.recruiter?` · ${esc(app.recruiter)}`:""}</small>${(app.history||[]).length?`<small>History: ${app.history.slice(-3).map(item=>`${esc(item.status)} · ${esc(formatDate(String(item.at||"").slice(0,10)))}`).join(" → ")}</small>`:""}${app.notes?`<p>${esc(truncate(app.notes,180))}</p>`:""}</div><div class="career-app-actions"><select data-application-status="${esc(app.id)}">${statuses.map(value=>`<option ${app.status===value?"selected":""}>${value}</option>`).join("")}</select><button type="button" class="career-remove-btn" data-delete-application="${esc(app.id)}" aria-label="Delete ${esc(app.title)} at ${esc(app.company)}">Remove</button></div></article>`).join("")}</div><div class="career-empty-search" data-career-search-empty hidden>No applications match your search. Try another company, role or note.</div>`:`<div class="career-empty-state"><span>▤</span><b>No applications match this view.</b><p>Add your first opportunity above, or change the current search or filter.</p></div>`}</section>`;
}
function renderTabBody() {
  const tabs = { overview: renderOverview, resume: renderResumeTab, studio: renderStudioTab, roadmap: renderRoadmapTab, sprint: renderSprintTab, interview: renderInterviewTab, "career-studio": renderCareerStudioTab, portfolio: renderPortfolioTab, applications: renderApplicationsTab };
  return (tabs[activeTab] || tabs.overview)();
}
function renderCareerApp() {
  if (!mount) return;
  const tabs = [["overview","Overview"],["resume","Resume match"],["studio","Resume studio"],["roadmap","Learning roadmap"],["sprint","Skill sprint"],["interview","Interview lab"],["career-studio","Career studio"],["portfolio","Portfolio audit"],["applications","Applications"]];
  mount.innerHTML = `<div class="career-workspace-head"><div><span class="career-workspace-label">YOUR PRIVATE CAREER WORKSPACE</span><b>${esc(user.user_metadata?.full_name || user.email || "Member")}</b><small id="careerSaveStatus">${state.updatedAt?"Your last career workspace save was restored.":"Your career workspace is ready."}</small></div><button type="button" class="career-save-indicator" data-career-action="save">Save progress <span>✓</span></button></div>
  <nav class="career-tabs" aria-label="Career Match tools">${tabs.map(([id,label])=>`<button type="button" data-career-tab="${id}" class="${activeTab===id?"active":""}">${label}</button>`).join("")}</nav><div class="career-tab-content" data-career-content>${renderTabBody()}</div>
  <div class="career-copilot-wrap"><button type="button" class="career-copilot-launcher" id="careerCopilotToggle" aria-expanded="false">✦ <span>Career Copilot</span></button><aside class="career-copilot-panel" id="careerCopilotPanel" hidden><div class="career-copilot-head"><div><span>✦</span><b>Career Copilot</b><small>Powered by your existing Agent37 connection</small></div><button type="button" data-career-action="copilot-close" aria-label="Close copilot">×</button></div><div class="career-copilot-suggestions"><button type="button" data-copilot-prompt="Explain my biggest career gaps and what I should work on first.">Explain my top gaps</button><button type="button" data-copilot-prompt="Help me prepare for an interview based on this role and my resume.">Prepare me for an interview</button><button type="button" data-copilot-prompt="Suggest a realistic portfolio project that would demonstrate my highest-priority missing skill.">Suggest a portfolio project</button></div><div class="career-copilot-messages" id="careerCopilotMessages">${state.aiHistory.length?state.aiHistory.slice(-10).map(item=>`<div class="career-copilot-message ${item.role==="user"?"from-user":"from-ai"}">${esc(item.text)}</div>`).join(""):`<div class="career-copilot-welcome">Ask about your resume, missing skills, learning plan or interview preparation. Responses are generated only when the server confirms an Agent37 reply.</div>`}</div><form id="careerCopilotForm"><textarea name="message" rows="2" maxlength="1800" placeholder="Ask about your next career move…" required></textarea><button type="submit" ${prefs().careerAi===false?"disabled":""}>Send ↗</button></form>${prefs().careerAi===false?`<small class="career-muted">Career Copilot is disabled in Settings.</small>`:""}<div class="career-copilot-error" id="careerCopilotError" hidden></div></aside></div>`;
  mount.querySelector("#careerCopilotToggle")?.addEventListener("click",()=>toggleCopilot());
}
function switchCareerTab(tab) { activeTab = tab; renderCareerApp(); const top = mount?.querySelector(".career-tabs"); top?.scrollIntoView({ behavior: prefs().motion === "reduced" || prefs().reduceMotion ? "auto" : "smooth", block: "nearest" }); }
function toggleCopilot(forceOpen = null) {
  const panel = $("#careerCopilotPanel", mount);
  const button = $("#careerCopilotToggle", mount);
  if (!panel) return;
  const next = forceOpen == null ? panel.hidden : forceOpen;
  panel.hidden = !next; button?.setAttribute("aria-expanded", String(next));
  if (next) $("textarea", $("#careerCopilotForm", panel))?.focus();
}
function activeUid() { return user?.id || user?.uid || ""; }
function cloneCareerState(value) { return JSON.parse(JSON.stringify(value)); }
function scheduleSave() {
  const uid = activeUid();
  if (!uid || !state) return;
  clearTimeout(saveTimer);
  const snapshot = cloneCareerState(state);
  const status = $("#careerSaveStatus", mount);
  if (status) status.textContent = "Unsaved changes…";
  // Capture both owner and data now. A later sign-out/account switch must never
  // redirect this queued resume write into another member's record.
  saveTimer = setTimeout(() => { void persistCareerData(uid, snapshot); }, 650);
}
function persistCareerData(uid, data) {
  if (!uid || !data) return Promise.resolve();
  const snapshot = cloneCareerState(data);
  snapshot.updatedAt = new Date().toISOString();
  const write = async () => {
    try {
      const ref = doc(db, "careerMatchData", uid);
      await setDoc(ref, { ownerUid: uid, data: snapshot, updatedAt: serverTimestamp() });
      if (activeUid() === uid) {
        if (state) state.updatedAt = snapshot.updatedAt;
        const status = $("#careerSaveStatus", mount);
        if (status) status.textContent = `Saved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      }
    } catch (error) {
      console.error("Career Match save failed", error);
      localStorage.setItem(STORAGE_KEY(uid), JSON.stringify(snapshot));
      if (activeUid() === uid) {
        const status = $("#careerSaveStatus", mount);
        if (status) status.textContent = "Could not sync to your account. Your current page still has these changes.";
      }
    }
  };
  // Serialize writes so a slower older request cannot overwrite newer edits.
  const operation = saveQueue.then(write, write);
  saveQueue = operation.catch(() => {});
  return operation;
}
async function saveCareerData() {
  const uid = activeUid();
  if (!uid || !state) return;
  return persistCareerData(uid, state);
}
async function loadCareerData() {
  const uid = activeUid();
  if (!uid) return;
  const ref = doc(db, "careerMatchData", uid);
  let saved = null;
  try {
    const snapshot = await getDoc(ref);
    if (activeUid() !== uid) return;
    saved = snapshot.exists() && snapshot.data()?.ownerUid === uid ? snapshot.data()?.data : null;
  } catch (error) {
    console.warn("Could not load career profile from Supabase; falling back to this browser", error);
    if (activeUid() !== uid) return;
  }
  if (activeUid() !== uid) return;
  const local = (()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY(uid))||"null");}catch{return null;}})();
  state = { ...defaultState(), ...(saved && typeof saved === "object" ? saved : {}), ...(local && !saved ? local : {}) };
  if (!state.portfolio || typeof state.portfolio !== "object") state.portfolio = defaultState().portfolio;
  if (!Array.isArray(state.applications)) state.applications = [];
  if (!Array.isArray(state.aiHistory)) state.aiHistory = [];
  if (state.resumeText && state.jobText && !state.analysis) state.analysis = analyseResumeText(state.resumeText, state.jobText);
  careerConvId = state.aiConversationId || `career-${String(uid).replace(/[^a-z0-9_-]/gi, "")}`;
}
async function readPdf(file, progress = () => {}) {
  const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: true, isEvalSupported: false }).promise;
  const pages = [];
  let scannedPages = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    progress(`Reading PDF page ${pageNumber} of ${pdf.numPages}…`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: true });
    const items = content.items.filter(item => typeof item.str === "string" && item.str.trim()).map(item => ({ text: item.str.trim(), x: item.transform?.[4] || 0, y: item.transform?.[5] || 0 }));
    if (!items.length) { scannedPages += 1; pages.push(""); continue; }
    const orderedText = column => {
      const lines = [];
      for (const item of column.sort((a,b)=>Math.abs(b.y-a.y)>2 ? b.y-a.y : a.x-b.x)) {
        let line = lines.find(row => Math.abs(row.y - item.y) < 2.2);
        if (!line) { line = { y: item.y, items: [] }; lines.push(line); }
        line.items.push(item);
      }
      return lines.sort((a,b)=>b.y-a.y).map(line=>line.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(" ")).join("\n");
    };
    // Resume PDFs often use two columns. Detect a clear, balanced horizontal gap and
    // read the left column top-to-bottom before the right instead of interleaving rows.
    const xPositions = items.map(item=>item.x).sort((a,b)=>a-b);
    let splitAt = -1, largestGap = 0;
    for (let index=1; index<xPositions.length; index+=1) {
      const gap = xPositions[index] - xPositions[index-1];
      if (gap > largestGap) { largestGap = gap; splitAt = index; }
    }
    const twoColumns = largestGap >= 95 && splitAt >= 5 && (xPositions.length - splitAt) >= 5;
    if (twoColumns) {
      const pivot = (xPositions[splitAt-1] + xPositions[splitAt]) / 2;
      pages.push(`${orderedText(items.filter(item=>item.x<=pivot))}\n\n${orderedText(items.filter(item=>item.x>pivot))}`);
    } else pages.push(orderedText(items));
  }
  let text = pages.join("\n\n").trim();
  if (scannedPages || text.length < 120) {
    progress("This PDF appears to contain scanned pages. Trying optional browser OCR…");
    try {
      const { createWorker } = await import("https://esm.sh/tesseract.js@5.1.1");
      const worker = await createWorker("eng");
      const ocrPages = [];
      for (let index = 1; index <= pdf.numPages; index += 1) {
        const page = await pdf.getPage(index);
        const viewport = page.getViewport({ scale: 1.35 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        await page.render({ canvasContext: context, viewport }).promise;
        const result = await worker.recognize(canvas);
        ocrPages.push(result.data.text || "");
        canvas.width = 0; canvas.height = 0;
        progress(`OCR page ${index} of ${pdf.numPages}…`);
      }
      await worker.terminate();
      const ocrText = ocrPages.join("\n\n").trim();
      if (ocrText.length > text.length) text = ocrText;
    } catch (error) {
      console.warn("Optional scanned-PDF OCR could not be loaded", error);
      if (!text) throw new Error("This looks like a scanned PDF, but the optional OCR engine could not load. Try a text-searchable PDF or paste the resume text.");
    }
  }
  return { text, pageCount: pdf.numPages, scannedPages };
}
async function readTextFile(file) { return (await file.text()).slice(0, CAREER_LIMITS.resume); }
async function handleFileUpload(file, target) {
  if (!file) return;
  const uploadUid = activeUid();
  if (!uploadUid) return;
  if (file.size > CAREER_LIMITS.upload) { toastFn("Choose a file smaller than 15 MB."); return; }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf && !/\.(txt|md)$/i.test(file.name)) { toastFn("Upload a PDF, TXT or Markdown file."); return; }
  const progress = document.createElement("div"); progress.className = "career-upload-progress"; progress.textContent = "Reading file…";
  mount.querySelector(".career-action-row")?.before(progress);
  try {
    const result = isPdf ? await readPdf(file, message => { progress.textContent = message; }) : { text: await readTextFile(file), pageCount: 0, scannedPages: 0 };
    if (activeUid() !== uploadUid) { progress.remove(); return; }
    const content = truncate(result.text, target === "resume" ? CAREER_LIMITS.resume : CAREER_LIMITS.job);
    if (!content.trim()) throw new Error("No readable text was found in that file. Try a text-searchable PDF or paste the text.");
    if (target === "resume") { state.resumeText = content; state.resumeFileName = file.name; if (state.jobText) state.analysis = analyseResumeText(state.resumeText, state.jobText); }
    else { state.jobText = content; state.jobFileName = file.name; if (state.resumeText) state.analysis = analyseResumeText(state.resumeText, state.jobText); }
    renderCareerApp(); scheduleSave();
    toastFn(`${file.name} was read${result.pageCount ? ` (${result.pageCount} PDF pages)` : ""}. Check the extracted text before analysing.`);
  } catch (error) {
    progress.classList.add("is-error"); progress.textContent = error.message || "Could not read this file.";
    toastFn(error.message || "Could not read this file.");
    return;
  }
  progress.remove();
}
function careerContext() {
  const contextEnabled = prefs().careerContext !== false;
  if (!contextEnabled) return "Career context sharing is disabled in the member's Settings. Do not assume details that were not included in the user's message.";
  const analysis = state.analysis;
  return `RESUME EXCERPT (member-provided, may be incomplete):\n${truncate(state.resumeText, 850)}\n\nTARGET JOB DESCRIPTION EXCERPT:\n${truncate(state.jobText, 750)}\n\nMATCH SUMMARY:\n${analysis ? JSON.stringify({ score: analysis.score, matched: analysis.matched.map(x=>x.skill), transferable: analysis.partial.map(x=>({skill:x.skill,related:x.related})), missing: analysis.missing.map(x=>x.skill), priorities: analysis.priorities.slice(0,4).map(x=>({skill:x.skill,why:x.why})) }).slice(0,850) : "Not yet analysed"}`;
}
async function requestCareerAI(task, userInput = "") {
  if (prefs().careerAi === false) throw new Error("Career Copilot is disabled in Settings. Enable it in Settings → AI assistant.");
  if (aiBusy) throw new Error("Career Copilot is already preparing a response. Please wait for that request to finish.");
  aiBusy = true;
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    const session = sessionData?.session;
    const uid = session?.user?.id;
    if (sessionError || !uid || uid !== activeUid()) throw new Error("Your sign-in session has expired or changed. Sign in again.");
    const conversationId = state.aiConversationId || `career-${String(uid).replace(/[^a-z0-9_-]/gi, "")}`;
    if (activeUid() !== uid) throw new Error("Your sign-in session changed. Please retry from your own account.");
    careerConvId = conversationId;
    const conversationRef = doc(db, "aiConversations", conversationId);
    const existing = await getDoc(conversationRef);
    if (activeUid() !== uid) throw new Error("Your sign-in session changed. Please retry from your own account.");
    if (!existing.exists()) await setDoc(conversationRef, { ownerUid: uid, title: "Career Match Copilot", preview: "Private career-development conversation", mode: "chat", agentSessionId: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    else if (existing.data()?.ownerUid !== uid) throw new Error("The saved Copilot conversation is not owned by your account.");
    const prompt = `You are Career Copilot inside HackVerse Career Match. Help with career preparation using only the facts supplied. Never fabricate employers, dates, metrics, projects, qualifications, skill proficiency, job requirements or resource URLs. Distinguish suggestions from facts. Ask for clarification instead of filling missing personal information. When rewriting, preserve truth and mark placeholders clearly.\n\nTASK: ${truncate(task, 700)}\n\nUSER INPUT: ${truncate(userInput, 900)}\n\n${careerContext()}\n\nGive useful, structured feedback in plain language. Keep the response focused and practical.`.slice(0, 3900);
    await addDoc(collection(db, "aiConversations", conversationId, "messages"), { role: "user", content: prompt.slice(0, 4000), createdAt: serverTimestamp() });
    const response = await fetch("/api/agent37/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ conversationId, mode: "chat", message: prompt, page: "career-match", activeConversationId: "" }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Career Copilot request failed (${response.status}).`);
    const reply = String(data.reply || "The AI service did not return a response.").slice(0, 12000);
    if (activeUid() !== uid) throw new Error("Your sign-in session changed while the reply was being generated. Reopen Career Match to continue.");
    await addDoc(collection(db, "aiConversations", conversationId, "messages"), { role: "assistant", content: reply, createdAt: serverTimestamp() });
    await updateDoc(conversationRef, { preview: reply.slice(0, 160), updatedAt: serverTimestamp() });
    return reply;
  } finally { aiBusy = false; }
}
function addCopilotMessage(role, text) {
  state.aiHistory.push({ role, text: truncate(text, 5000), at: new Date().toISOString() });
  state.aiHistory = state.aiHistory.slice(-20);
  scheduleSave();
}
async function sendCopilotMessage(message, { retry = false } = {}) {
  const requestUid = activeUid();
  if (!requestUid) return;
  const trimmed = String(message || "").trim();
  if (!trimmed) return;
  if (prefs().careerAi === false) { toastFn("Enable Career Copilot in Settings first."); return; }
  lastCopilotQuestion = trimmed;
  if (!retry) addCopilotMessage("user", trimmed);
  renderCareerApp(); toggleCopilot(true);
  let failure = "";
  try {
    const reply = await requestCareerAI("Answer the member's career question. Use the actual resume and job context where sharing is enabled.", trimmed);
    if (activeUid() !== requestUid) return;
    addCopilotMessage("assistant", reply);
    lastCopilotQuestion = "";
  } catch (error) {
    if (activeUid() !== requestUid) return;
    failure = error.message || "Career Copilot is unavailable. Please retry.";
  }
  if (activeUid() !== requestUid) return;
  renderCareerApp(); toggleCopilot(true);
  const errorNode = $("#careerCopilotError", mount);
  if (errorNode && failure) {
    errorNode.hidden = false;
    errorNode.innerHTML = `<span>${esc(failure)} Your question has not been lost.</span> <button type="button" class="career-text-btn" data-career-action="copilot-retry">Retry request ↻</button>`;
  }
}
function aiTaskFor(kind) {
  const prompts = {
    summary: "Write a concise professional resume summary based only on verified facts in the supplied resume. Do not add proficiency or claims not supported by evidence.",
    experience: "Improve the supplied experience bullets. Explain the weakness, improve action verbs and clarity, suggest where real metrics could be added using [ADD VERIFIED METRIC] placeholders. Never invent quantities or outcomes.",
    project: "Rewrite the supplied project description to explain problem, personal contribution, technical choices and outcome. Use [CONFIRM] placeholders for facts not in evidence. Do not claim tools or results not supplied.",
    skills: "Organise only the skills actually listed in the resume into clear categories such as languages, frameworks, data, tools and professional skills. Do not add technologies or claim proficiency levels.",
    tailor: "Tailor the resume for the supplied job description. Identify existing evidence that should be prioritised and genuine gaps. Do not add missing skills or rewrite exposure as mastery.",
    "career-studio": `Draft a ${state.studioKind} using only the context below. Do not invent the recipient, employer, qualifications or achievements. Use clear placeholders where needed.`,
    "interview-review": "Review the candidate's answer for relevance, clarity, ownership, structure and evidence. Use STAR where applicable. Identify a weak point and offer a stronger version without inventing outcomes.",
    "interview-followups": "Create 3 realistic follow-up interview questions based on the selected question, the candidate's answer and the supplied job/resume context. Explain briefly what each interviewer is probing. Do not invent resume facts.",
    "portfolio-suggestion": "Suggest two practical mini-project improvements that would demonstrate the top career skill gaps, using the actual resume and role context. Do not invent existing project features."
  };
  return prompts[kind] || "Help the member improve their career preparation using only the supplied facts.";
}
async function runAITool(kind) {
  const requestUid = activeUid();
  if (!requestUid) return;
  const task = aiTaskFor(kind);
  const currentQuestion = state.selectedQuestion || interviewQuestions()[Number(state.mockQuestionIndex)||0]?.question || "Interview practice question";
  const input = ["interview-review","interview-followups"].includes(kind) ? `${currentQuestion}\n\nCandidate answer:\n${state.interviewAnswer}` : state.studioInput;
  const outputKey = kind === "interview-review" ? "interviewReview" : kind === "interview-followups" ? "interviewFollowups" : kind === "career-studio" ? "careerStudio" : "studio";
  const container = $("[data-career-content]", mount);
  const button = container?.querySelector(`[data-career-action][data-kind="${kind}"]`) || container?.querySelector(`[data-career-action="${kind}"]`);
  if (button) { button.disabled = true; button.textContent = "Copilot is thinking…"; }
  try {
    const output = await requestCareerAI(task, input);
    if (activeUid() !== requestUid) return;
    state.outputs[outputKey] = output; scheduleSave();
    renderCareerApp();
    toastFn("Career Copilot returned a draft. Review it carefully before using it.");
  } catch (error) {
    if (activeUid() !== requestUid) return;
    if (button) { button.disabled = false; button.textContent = "Retry with Copilot"; }
    toastFn(error.message || "Career Copilot is unavailable. Please retry.");
  }
}
function copyOutput(key) {
  const content = state.outputs[key] || "";
  if (!content) return;
  navigator.clipboard?.writeText(content).then(()=>toastFn("Draft copied to clipboard.")).catch(()=>toastFn("Clipboard access was blocked by your browser."));
}
function downloadOutput(key) {
  const content = String(state.outputs[key] || "");
  if (!content) { toastFn("There is no draft to download yet."); return; }
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `hackverse-${String(key).replace(/[^a-z0-9_-]/gi,"-")}.txt`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function addApplication(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const company = String(values.company || "").trim(), title = String(values.title || "").trim();
  if (!company || !title) { toastFn("Add the company and job title first."); return; }
  state.applications.unshift({ id: crypto.randomUUID(), company: company.slice(0,100), title: title.slice(0,120), status: values.status || "Interested", appliedAt: values.appliedAt || "", deadline: values.deadline || "", followUp: values.followUp || "", recruiter: String(values.recruiter || "").slice(0,160), resumeVersion: String(values.resumeVersion || "").slice(0,80), notes: String(values.notes || "").slice(0,1800), history: [{ status: values.status || "Interested", at: new Date().toISOString() }] });
  scheduleSave(); renderCareerApp(); toastFn("Opportunity added to your tracker.");
}
async function handleClick(event) {
  const tabButton = event.target.closest("[data-career-tab]");
  if (tabButton) { switchCareerTab(tabButton.dataset.careerTab); return; }
  const planButton = event.target.closest("[data-plan-days]");
  if (planButton) { state.roadmapDays = Number(planButton.dataset.planDays); scheduleSave(); renderCareerApp(); return; }
  const action = event.target.closest("[data-career-action]");
  if (action) {
    const kind = action.dataset.careerAction;
    if (kind === "analyse") {
      const resume = state.resumeText.trim(), job = state.jobText.trim();
      if (resume.length < 80) { toastFn("Add more resume text or upload a resume before analysing."); return; }
      if (!job.length) { state.analysis = analyseResumeText(resume, ""); toastFn("Resume profile extracted. Add a job description for a role match score."); }
      else state.analysis = analyseResumeText(resume, job);
      scheduleSave(); renderCareerApp(); return;
    }
    if (kind === "save") { await saveCareerData(); toastFn("Career progress saved."); return; }
    if (kind === "studio-ai") { await runAITool(action.dataset.kind || "experience"); return; }
    if (kind === "career-studio-ai") { await runAITool("career-studio"); return; }
    if (kind === "review-interview") { if (!state.interviewAnswer.trim()) { toastFn("Write an answer before requesting feedback."); return; } await runAITool("interview-review"); return; }
    if (kind === "generate-followups") { if (!state.interviewAnswer.trim()) { toastFn("Write an answer before requesting follow-up questions."); return; } await runAITool("interview-followups"); return; }
    if (kind === "mock-start") { state.mockMode = true; state.mockQuestionIndex = 0; state.selectedQuestion = interviewQuestions()[0]?.question || ""; state.interviewAnswer = ""; scheduleSave(); renderCareerApp(); return; }
    if (kind === "mock-next") { state.mockQuestionIndex = (Number(state.mockQuestionIndex)||0) + 1; state.selectedQuestion = interviewQuestions()[state.mockQuestionIndex % interviewQuestions().length]?.question || ""; state.interviewAnswer = ""; scheduleSave(); renderCareerApp(); return; }
    if (kind === "mock-stop") { state.mockMode = false; scheduleSave(); renderCareerApp(); return; }
    if (kind === "sprint-complete") { const today = new Date().toISOString().slice(0,10); if (!state.sprintDone.includes(today)) state.sprintDone.push(today); scheduleSave(); renderCareerApp(); toastFn("Daily learning check-in recorded."); return; }
    if (kind === "copy-output") { copyOutput(action.dataset.output); return; }
    if (kind === "download-output") { downloadOutput(action.dataset.output); return; }
    if (kind === "copilot-close") { toggleCopilot(false); return; }
    if (kind === "copilot-retry") { if (lastCopilotQuestion) await sendCopilotMessage(lastCopilotQuestion, { retry: true }); return; }
  }
  const prompt = event.target.closest("[data-copilot-prompt]");
  if (prompt) { await sendCopilotMessage(prompt.dataset.copilotPrompt); return; }
  const question = event.target.closest("[data-question-index]");
  if (question) { const item = interviewQuestions()[Number(question.dataset.questionIndex)]; state.selectedQuestion = item?.question || ""; scheduleSave(); renderCareerApp(); return; }
  const remove = event.target.closest("[data-delete-application]");
  if (remove) { state.applications = state.applications.filter(app=>app.id !== remove.dataset.deleteApplication); scheduleSave(); renderCareerApp(); return; }
}
function handleInput(event) {
  const field = event.target.dataset.cmField;
  if (field) {
    if (field === "studioKind") state.studioKind = event.target.value;
    else state[field] = event.target.value;
    if (field === "resumeText" && state.resumeText.length > CAREER_LIMITS.resume) { state.resumeText = state.resumeText.slice(0, CAREER_LIMITS.resume); event.target.value = state.resumeText; }
    if (field === "jobText" && state.jobText.length > CAREER_LIMITS.job) { state.jobText = state.jobText.slice(0, CAREER_LIMITS.job); event.target.value = state.jobText; }
    scheduleSave(); return;
  }
  const portfolioField = event.target.dataset.portfolioField;
  if (portfolioField) {
    state.portfolio[portfolioField] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    state.outputs.portfolioScore = runPortfolioAudit().score;
    scheduleSave();
    if (portfolioField === "screenshots" || portfolioField === "docs") renderCareerApp();
    return;
  }
  if (event.target.matches("[data-application-search]")) {
    state.applicationSearch = event.target.value;
    const term = state.applicationSearch.trim().toLowerCase();
    let visible = 0;
    mount.querySelectorAll("[data-app-search-key]").forEach(row => { const show = !term || row.dataset.appSearchKey.includes(term); row.hidden = !show; if (show) visible++; });
    const empty = mount.querySelector("[data-career-search-empty]"); if (empty) empty.hidden = !appsForActiveFilter().length || visible > 0;
    return;
  }
}
function handleChange(event) {
  if (event.target.matches("[data-application-filter]")) { state.applicationFilter = event.target.value; renderCareerApp(); return; }
  if (event.target.matches("[data-application-sort]")) { state.applicationSort = event.target.value; renderCareerApp(); return; }
  if (event.target.id === "careerResumeFile" && event.target.files?.[0]) void handleFileUpload(event.target.files[0], "resume");
  if (event.target.id === "careerJobFile" && event.target.files?.[0]) void handleFileUpload(event.target.files[0], "job");
  const roadmap = event.target.dataset.roadmapCheck;
  if (roadmap) { state.roadmapDone[roadmap] = event.target.checked; scheduleSave(); renderCareerApp(); }
  const skillStatus = event.target.dataset.sprintStatus;
  if (skillStatus) { state.sprintStatus[skillStatus] = event.target.value; scheduleSave(); renderCareerApp(); }
  const applicationId = event.target.dataset.applicationStatus;
  if (applicationId) {
    const app = state.applications.find(item=>item.id===applicationId);
    if (app) { if (app.status !== event.target.value) { app.status = event.target.value; app.history ||= []; app.history.push({ status: app.status, at: new Date().toISOString() }); scheduleSave(); } }
  }
  const portfolio = event.target.dataset.portfolioField;
  if (portfolio) { state.portfolio[portfolio] = event.target.type === "checkbox" ? event.target.checked : event.target.value; state.outputs.portfolioScore = runPortfolioAudit().score; scheduleSave(); renderCareerApp(); }
}
function handleSubmit(event) {
  if (event.target.id === "careerApplicationForm") { event.preventDefault(); addApplication(event.target); return; }
  if (event.target.id === "careerCopilotForm") { event.preventDefault(); const input = $("textarea[name=message]", event.target); const message = input.value; input.value = ""; void sendCopilotMessage(message); }
}
function installPageEvents() {
  const page = $("#careerMatchPage");
  if (!page || page.dataset.careerPageWired === "1") return;
  page.dataset.careerPageWired = "1";
  page.addEventListener("click", event => {
    const copilot = event.target.closest("#careerOpenCopilot");
    if (copilot) { toggleCopilot(true); return; }
    const tab = event.target.closest("[data-career-tab-open]");
    if (tab) switchCareerTab(tab.dataset.careerTabOpen);
  });
}
function appsForActiveFilter() { return state.applications.filter(app => (state.applicationFilter || "All") === "All" || app.status === state.applicationFilter); }
function installDelegatedEvents() {
  if (mount.dataset.careerWired === "1") return;
  mount.dataset.careerWired = "1";
  mount.addEventListener("click", event => { void handleClick(event); });
  mount.addEventListener("input", handleInput);
  mount.addEventListener("change", handleChange);
  mount.addEventListener("submit", handleSubmit);
}

export async function initCareerMatch(options = {}) {
  if (!options.user) return;
  user = options.user;
  toastFn = typeof options.toast === "function" ? options.toast : toastFn;
  mount = $("#careerMatchMount");
  if (!mount) return;
  const uid = user.id || user.uid;
  if (initialized && initializedUid === uid) { renderCareerApp(); installPageEvents(); return; }
  initializedUid = uid;
  lastCopilotQuestion = "";
  await loadCareerData();
  if (activeUid() !== uid) return;
  renderCareerApp();
  installDelegatedEvents();
  installPageEvents();
  initialized = true;
}
