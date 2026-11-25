import { supabaseClient } from './data-layer.js';

const $ = (selector) => document.querySelector(selector);
const BUCKET = 'pitch-arena-private';
const MAX_FILE_SIZE = 12 * 1024 * 1024;
const MAX_TOTAL_SIZE = 30 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'zip', 'pptx', 'docx', 'txt', 'md', 'markdown', 'readme', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'html', 'htm', 'css', 'scss', 'json', 'jsonc', 'yml', 'yaml', 'sql', 'py', 'java', 'kt', 'go', 'rs', 'c', 'cpp',
  'h', 'hpp', 'cc', 'cs', 'kt', 'swift', 'dart', 'ipynb', 'rst', 'ini', 'cfg', 'conf', 'properties', 'sass', 'less', 'php', 'rb', 'sh', 'bash', 'zsh', 'bat', 'ps1', 'xml', 'toml', 'vue', 'svelte', 'svg', 'graphql', 'gql', 'prisma', 'gradle', 'makefile'
]);
const JUDGES = {
  technical: { name: 'Dr. Mira Sen', role: 'Technical Architect', initials: 'MS', focus: 'Architecture · Code · Security', color: 'blue' },
  business: { name: 'Arjun Mehta', role: 'Product & Business Expert', initials: 'AM', focus: 'Product · Market · Feasibility', color: 'amber' },
  innovation: { name: 'Zoya Khan', role: 'Innovation Expert', initials: 'ZK', focus: 'Originality · Differentiation · Impact', color: 'violet' },
  critical: { name: 'Vikram Rao', role: 'Critical Judge', initials: 'VR', focus: 'Weaknesses · Evidence · Edge cases', color: 'rose' },
  presentation: { name: 'Ananya Iyer', role: 'Presentation & Communication Expert', initials: 'AI', focus: 'Clarity · Storytelling · Delivery', color: 'green' }
};
const STAGE_LABELS = {
  introduction: 'INTRODUCTION', pitch: 'PROJECT PITCH', deep_dive: 'PROJECT DEEP DIVE', technical: 'TECHNICAL CROSS-QUESTIONING',
  product: 'PRODUCT & BUSINESS', innovation: 'INNOVATION REVIEW', critical: 'CRITICAL JUDGE ROUND', rapid_fire: 'RAPID FIRE'
};
let authUser = null;
let projects = [];
let sessions = [];
let currentSession = null;
let currentQuestion = '';
let currentJudgeId = 'presentation';
let activeTurns = [];
let uploadBusy = false;
let answerBusy = false;
let cameraStream = null;
let micPermissionStream = null;
let recognition = null;
let micActive = false;
let cameraActive = false;
let speakerEnabled = true;
let speakerVolume = 1;
let captionsEnabled = true;
let sessionStartedAt = 0;
let questionStartedAt = 0;
let pitchDeadline = 0;
let pitchSubmitted = false;
let answerLimitReached = false;
let timerHandle = null;
let speechSequence = 0;
let currentReport = null;
let lastUploadedAnalysis = null;
let lastRouteLoadUser = '';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function showStatus(message, type = 'info') {
  const status = $('#paUploadStatus');
  if (status) {
    status.textContent = message;
    status.className = `pa-status ${type}`;
  }
}
function setSpeechStatus(message, type = '') {
  const status = $('#paSpeechStatus');
  if (!status) return;
  status.textContent = message;
  status.className = type ? `pa-speech-status ${type}` : 'pa-speech-status';
}
function getExtension(name) { return String(name || '').split('.').pop().toLowerCase(); }
function safeFileName(name) {
  return String(name || 'project-file').replace(/[\\/]/g, '_').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100) || 'project-file';
}
function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

async function getAccessToken() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error('Your HackTheta session has expired. Sign in again to use AI Pitch Arena.');
  authUser = data.session.user;
  return token;
}
async function api(action, payload = {}) {
  const token = await getAccessToken();
  const response = await fetch('/api/pitch-arena', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `AI Pitch Arena request failed (${response.status}).`);
  return data;
}

async function extractPdfText(file) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes, maxImageSize: 1024 * 1024, isEvalSupported: false }).promise;
  const pages = [];
  const maxPages = Math.min(pdf.numPages, 40);
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    if (text) pages.push(`[Page ${pageNumber}] ${text}`);
    if (pages.join('\n').length >= 30000) break;
  }
  return pages.join('\n\n').slice(0, 30000);
}
async function renderReadinessProgress() {
  const strip = $('#paReadinessStrip');
  if (!strip) return;
  const completed = sessions.filter(item => item.status === 'completed' && Number.isFinite(Number(item.totalScore))).sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0));
  strip.hidden = !completed.length;
  if (!completed.length) return;
  const latest = completed[0];
  const previous = completed[1];
  $('#paReadinessValue').innerHTML = `${Math.max(0, Math.min(100, Number(latest.totalScore || 0)))}<small>/100</small>`;
  $('#paReadinessGrade').textContent = `${latest.grade || 'Practice'} grade · ${latest.projectName || 'Latest project'}`;
  if (!previous) $('#paReadinessChange').textContent = 'Complete another interview to compare your score and category progress.';
  else {
    const delta = Number(latest.totalScore || 0) - Number(previous.totalScore || 0);
    const percent = Number(previous.totalScore) > 0 ? `${Math.abs(delta / Number(previous.totalScore) * 100).toFixed(1)}%` : '—';
    $('#paReadinessChange').textContent = `${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} ${Math.abs(delta)} points (${percent}) ${delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'unchanged'} than your previous completed interview.`;
  }
  const latestCategories = latest.categoryScores || {};
  const previousCategories = previous?.categoryScores || {};
  const changes = Object.entries(latestCategories).map(([key, value]) => ({
    label: value?.label || key,
    delta: Number(value?.score || 0) - Number(previousCategories[key]?.score || 0)
  })).filter(item => Number.isFinite(item.delta));
  changes.sort((a, b) => b.delta - a.delta);
  $('#paCategoryProgress').innerHTML = previous && changes.length ? changes.slice(0, 4).map(item => `<span>${escapeHtml(item.label)} <b>${item.delta > 0 ? '+' : ''}${item.delta}</b></span>`).join('') : '<span>Category-by-category changes will appear after your next completed interview.</span>';
}
function renderHistory() {
  const host = $('#paHistoryGrid');
  renderReadinessProgress();
  if (!host) return;
  if (!sessions.length) {
    host.innerHTML = '<div class="pa-empty">No interviews yet. Complete your first practice round to build a readiness history.</div>';
    return;
  }
  host.innerHTML = sessions.map(session => {
    const completed = session.status === 'completed';
    const date = formatDate(session.completedAt || session.startedAt);
    return `<article class="pa-history-card"><div class="pa-history-card-top"><span class="pa-history-status ${completed ? 'is-complete' : 'is-active'}">${completed ? 'COMPLETED' : 'IN PROGRESS'}</span><small>${escapeHtml(date)}</small></div><h3>${escapeHtml(session.projectName || 'Untitled project')}</h3><p>${escapeHtml(String(session.mode || 'final-round').replaceAll('-', ' '))} · ${Number(session.turnsCount || 0)} answers</p><div class="pa-history-score">${completed ? `<strong>${Number(session.totalScore || 0)}<small>/100</small></strong><span>${escapeHtml(session.grade || '—')} grade</span>` : '<strong>—</strong><span>Practice session</span>'}</div><button type="button" class="pa-secondary" data-pa-history-action="${completed ? 'report' : 'resume'}" data-session-id="${escapeHtml(session.id)}">${completed ? 'View performance report ↗' : 'Resume interview →'}</button></article>`;
  }).join('');
}
async function loadDashboard() {
  try {
    const result = await api('list');
    projects = result.projects || [];
    sessions = result.sessions || [];
    renderProjectSelect();
    renderHistory();
  } catch (error) {
    showStatus(error.message, 'error');
  }
}
function renderProjectSelect(preferredId = '') {
  const select = $('#paProjectSelect');
  const start = $('#paStartBtn');
  if (!select) return;
  if (!projects.length) {
    select.innerHTML = '<option value="">Upload and analyse a project first</option>';
    select.disabled = true;
    if (start) start.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = '<option value="">Choose an analysed project</option>' + projects.map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)} · ${Number(project.filesCount || 0)} files</option>`).join('');
  const chosen = preferredId || select.value;
  if (chosen && projects.some(project => project.id === chosen)) select.value = chosen;
  if (start) start.disabled = !select.value;
}
function renderProjectAnalysis(project) {
  const host = $('#paAnalysisCard');
  if (!host || !project) return;
  host.hidden = false;
  $('#paAnalysisTitle').textContent = project.name || 'Project analysis';
  const analysis = project.analysis || {};
  $('#paAnalysisSummary').textContent = analysis.summary || 'The project files were processed, but the AI service did not return a summary.';
  const summaryFindings = Array.isArray(analysis.findings) ? analysis.findings : [];
  const features = Array.isArray(analysis.features) ? analysis.features : [];
  const cards = [
    { title: 'Problem', text: analysis.problem || 'Not clearly identified in the uploaded evidence.' },
    { title: 'Proposed solution', text: analysis.solution || 'Not clearly identified in the uploaded evidence.' },
    { title: 'Technology stack', text: Array.isArray(analysis.stack) && analysis.stack.length ? analysis.stack.join(' · ') : 'No stack details were extracted.' },
    { title: 'Implementation signals', text: `${features.length} feature references · ${summaryFindings.length} evidence findings` }
  ];
  $('#paAnalysisFindings').innerHTML = cards.map(card => `<article class="pa-finding-card"><span>${escapeHtml(card.title)}</span><p>${escapeHtml(card.text)}</p></article>`).join('');
  const warningItems = [...(project.warnings || []), ...(analysis.limitations || []).map(value => `Potential limitation: ${typeof value === 'string' ? value : JSON.stringify(value)}`)];
  $('#paAnalysisWarnings').innerHTML = warningItems.length ? warningItems.map(item => `<p>ⓘ ${escapeHtml(item)}</p>`).join('') : '<p class="pa-no-warning">No extraction warnings were returned. Review evidence classifications before the interview.</p>';
}
function appendTranscript({ kind, title, text, meta = '' }) {
  const host = $('#paTranscript');
  if (!host) return;
  host.querySelector('.pa-transcript-empty')?.remove();
  const article = document.createElement('article');
  article.className = `pa-transcript-item ${kind}`;
  const heading = document.createElement('div');
  heading.className = 'pa-transcript-meta';
  heading.textContent = meta ? `${title} · ${meta}` : title;
  const body = document.createElement('p');
  body.textContent = text;
  article.append(heading, body);
  host.append(article);
  host.scrollTop = host.scrollHeight;
}
function renderTranscript(turns = []) {
  const host = $('#paTranscript');
  if (!host) return;
  host.innerHTML = '';
  if (!turns.length) {
    host.innerHTML = '<div class="pa-transcript-empty">Your conversation will appear here.</div>';
    return;
  }
  for (const turn of turns) {
    appendTranscript({ kind: 'pa-transcript-judge', title: turn.judgeName || 'AI Judge', text: turn.question || '', meta: 'QUESTION' });
    appendTranscript({ kind: 'pa-transcript-user', title: 'You', text: turn.answer || '', meta: `${Number(turn.durationSeconds || 0)} sec` });
  }
  const latestQuestion = turns.at(-1)?.nextQuestion;
  if (latestQuestion) appendTranscript({ kind: 'pa-transcript-judge pa-transcript-next', title: turns.at(-1)?.nextJudgeId && JUDGES[turns.at(-1).nextJudgeId] ? JUDGES[turns.at(-1).nextJudgeId].name : 'AI Judge', text: latestQuestion, meta: 'CURRENT QUESTION' });
}
function applyJudge(judgeId, state = 'speaking') {
  currentJudgeId = JUDGES[judgeId] ? judgeId : 'presentation';
  const judge = JUDGES[currentJudgeId];
  $('#paJudgeName').textContent = judge.name;
  $('#paJudgeRole').textContent = judge.role;
  $('#paJudgeAvatar').textContent = judge.initials;
  $('#paJudgeFocus').textContent = judge.focus;
  $('#paJudgeAvatar').className = `pa-avatar pa-avatar-xl pa-avatar-${judge.color}`;
  $('#paJudgeState').innerHTML = `<i></i> ${state.toUpperCase()}`;
  $('#paJudgeScreen').classList.toggle('is-speaking', state === 'speaking');
  $('#paJudgeScreen').classList.toggle('is-listening', state === 'listening');
}
function setQuestion(question, stage = 'introduction') {
  currentQuestion = question || 'Please introduce your project and the problem it solves.';
  $('#paCurrentQuestion').textContent = currentQuestion;
  $('#paQuestionLabel').textContent = STAGE_LABELS[stage] || String(stage || 'INTERVIEW').toUpperCase().replaceAll('_', ' ');
  $('#paRoomStage').textContent = STAGE_LABELS[stage] || String(stage || 'INTERVIEW').toUpperCase();
  questionStartedAt = Date.now();
}
function speak(text) {
  if (!speakerEnabled || !('speechSynthesis' in window) || !text) return;
  const sequence = ++speechSequence;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  utterance.pitch = 0.96;
  utterance.volume = speakerVolume;
  utterance.onstart = () => { if (sequence === speechSequence) applyJudge(currentJudgeId, 'speaking'); };
  utterance.onend = () => { if (sequence === speechSequence) applyJudge(currentJudgeId, 'waiting'); };
  utterance.onerror = () => { if (sequence === speechSequence) applyJudge(currentJudgeId, 'waiting'); };
  window.speechSynthesis.speak(utterance);
}
function stopSpeech() {
  speechSequence++;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
function stopMedia() {
  if (recognition) {
    try { recognition.onend = null; recognition.stop(); } catch {}
    recognition = null;
  }
  micActive = false;
  micPermissionStream?.getTracks().forEach(track => track.stop());
  micPermissionStream = null;
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  cameraActive = false;
  $('#paCameraPreview')?.pause();
  if ($('#paCameraPreview')) $('#paCameraPreview').srcObject = null;
  $('#paCameraPlaceholder')?.classList.remove('is-hidden');
  $('#paCameraStatus') && ($('#paCameraStatus').textContent = 'CAMERA OFF');
  $('#paCameraToggle')?.setAttribute('aria-pressed', 'false');
  $('#paMicToggle')?.setAttribute('aria-pressed', 'false');
  $('#paMicToggle')?.classList.remove('is-active');
  $('#paCameraToggle')?.classList.remove('is-active');
  stopSpeech();
}
function updateRoomClocks() {
  const seconds = Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
  $('#paRoomTimer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const pitchClock = $('#paPitchTimer');
  if (!pitchClock) return;
  if (pitchSubmitted) {
    pitchClock.textContent = 'PITCH COMPLETE';
    pitchClock.classList.remove('is-expired');
  } else {
    const remaining = Math.max(0, Math.ceil((pitchDeadline - Date.now()) / 1000));
    pitchClock.textContent = remaining ? `PITCH ${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}` : 'PITCH TIME UP';
    pitchClock.classList.toggle('is-expired', remaining === 0);
  }
}
function startTimer(startedAt = Date.now(), pitchDuration = 3, pitchDone = false) {
  clearInterval(timerHandle);
  sessionStartedAt = startedAt;
  pitchSubmitted = pitchDone;
  pitchDeadline = startedAt + Math.max(1, Number(pitchDuration) || 3) * 60 * 1000;
  updateRoomClocks();
  timerHandle = setInterval(updateRoomClocks, 1000);
}
function showRoom(session, question, speech, judgeId, stage, turns = [], startedAt = Date.now()) {
  currentSession = session;
  activeTurns = turns || [];
  currentReport = null;
  $('#paRoom').hidden = false;
  $('#paReport').hidden = true;
  $('.pitch-arena-page').classList.add('pa-in-room');
  $('#paRoomProject').textContent = session.projectName || 'Project interview';
  const metadata = authUser?.user_metadata || {};
  $('#paParticipantName').textContent = metadata.full_name || metadata.name || authUser?.email?.split('@')[0] || 'Participant';
  applyJudge(judgeId || 'presentation', 'speaking');
  setQuestion(question, stage);
  renderTranscript(turns);
  const savedNextQuestion = turns.at(-1)?.nextQuestion || '';
  if (question && (!turns.length || question !== savedNextQuestion)) appendTranscript({ kind: 'pa-transcript-judge pa-transcript-next', title: JUDGES[judgeId]?.name || 'AI Judge', text: question, meta: turns.length ? 'CURRENT QUESTION' : 'OPENING QUESTION' });
  $('#paRoomProgress').textContent = `${turns.length} / 30`;
  $('#paProgressBar').style.width = `${Math.min(100, (turns.length / 30) * 100)}%`;
  $('#paAnswerInput').value = '';
  answerLimitReached = turns.length >= 30;
  $('#paAnswerInput').disabled = answerLimitReached;
  $('#paSendAnswer').disabled = answerLimitReached;
  if (answerLimitReached) {
    $('#paCurrentQuestion').textContent = 'This practice round has reached its 30-answer limit. End the interview to receive your report.';
    $('#paQuestionLabel').textContent = 'ROUND COMPLETE';
    $('#paRoomStage').textContent = 'ROUND COMPLETE';
  }
  startTimer(startedAt, session.pitchDuration || 3, turns.length > 0);
  stopMedia();
  setSpeechStatus('Text mode ready · Camera and mic are optional');
  setTimeout(() => $('#paRoom').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  if (answerLimitReached) speak('This practice round is complete. Please end the interview to view your report.');
  else speak(speech || question);
}
async function startInterview(event) {
  event.preventDefault();
  const projectId = $('#paProjectSelect').value;
  if (!projectId) return;
  const button = $('#paStartBtn');
  button.disabled = true;
  button.textContent = 'Preparing your interview…';
  try {
    const result = await api('start', { projectId, mode: $('#paMode').value, pitchDuration: Number($('#paPitchDuration').value) });
    showRoom(result.session, result.question, result.speech, result.judge?.id || 'presentation', 'introduction', [], result.startedAt ? new Date(result.startedAt).getTime() : Date.now());
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Enter interview room <span>→</span>';
  }
}
async function submitAnswer(event) {
  event?.preventDefault();
  if (!currentSession || answerBusy || answerLimitReached) return;
  const answer = $('#paAnswerInput').value.trim();
  if (!answer) return;
  answerBusy = true;
  $('#paSendAnswer').disabled = true;
  $('#paSendAnswer').textContent = 'Judge reviewing…';
  $('#paJudgeState').innerHTML = '<i></i> THINKING';
  $('#paJudgeScreen').classList.remove('is-speaking', 'is-listening');
  stopSpeech();
  const elapsed = Math.max(0, Math.floor((Date.now() - questionStartedAt) / 1000));
  if (!pitchSubmitted) { pitchSubmitted = true; updateRoomClocks(); }
  try {
    const result = await api('turn', { sessionId: currentSession.id, answer, previousQuestion: currentQuestion, durationSeconds: Math.min(elapsed, 900) });
    activeTurns.push(result.turn);
    appendTranscript({ kind: 'pa-transcript-user', title: 'You', text: answer, meta: `${Number(result.turn.durationSeconds || 0)} sec` });
    $('#paAnswerInput').value = '';
    currentSession.stage = result.stage;
    currentSession.judgeId = result.judge?.id || currentJudgeId;
    applyJudge(currentSession.judgeId, 'speaking');
    $('#paRoomProgress').textContent = `${result.progress} / ${result.maxTurns}`;
    $('#paProgressBar').style.width = `${Math.min(100, (result.progress / result.maxTurns) * 100)}%`;
    if (result.progress >= result.maxTurns) {
      answerLimitReached = true;
      $('#paCurrentQuestion').textContent = 'This practice round has reached its 30-answer limit. End the interview to receive your report.';
      $('#paQuestionLabel').textContent = 'ROUND COMPLETE';
      $('#paRoomStage').textContent = 'ROUND COMPLETE';
      appendTranscript({ kind: 'pa-transcript-judge pa-transcript-next', title: result.judge?.name || 'AI Judge', text: 'That completes this practice round. Please end the interview to view your performance report.', meta: 'ROUND COMPLETE' });
      speak('That completes this practice round. Please end the interview to view your performance report.');
    } else {
      if (result.nextQuestion) appendTranscript({ kind: 'pa-transcript-judge pa-transcript-next', title: result.judge?.name || 'AI Judge', text: result.nextQuestion, meta: 'FOLLOW-UP' });
      setQuestion(result.nextQuestion, result.stage);
      speak(result.speech || result.nextQuestion);
    }
  } catch (error) {
    setSpeechStatus(error.message, 'error');
    applyJudge(currentJudgeId, 'waiting');
  } finally {
    answerBusy = false;
    $('#paSendAnswer').disabled = answerLimitReached;
    $('#paAnswerInput').disabled = answerLimitReached;
    $('#paSendAnswer').textContent = answerLimitReached ? 'Round complete' : 'Submit answer ↑';
  }
}
async function finishInterview(force = false) {
  if (!currentSession || answerBusy) return;
  if (!force && !window.confirm('End this practice interview and generate your performance report?')) return;
  answerBusy = true;
  $('#paEndInterview').disabled = true;
  $('#paEndInterview').textContent = 'Evaluating…';
  stopMedia();
  clearInterval(timerHandle);
  try {
    const metadata = authUser?.user_metadata || {};
    const result = await api('finish', { sessionId: currentSession.id, participantName: metadata.full_name || metadata.name || authUser?.email?.split('@')[0] || 'Participant' });
    currentReport = result.report;
    renderReport(currentReport);
    $('#paRoom').hidden = true;
    $('#paReport').hidden = false;
    $('.pitch-arena-page').classList.remove('pa-in-room');
    $('.pitch-arena-page').classList.add('pa-report-view');
    setTimeout(() => $('#paReport').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    await loadDashboard();
  } catch (error) {
    setSpeechStatus(error.message, 'error');
    $('#paEndInterview').disabled = false;
    $('#paEndInterview').textContent = 'End interview';
  } finally {
    answerBusy = false;
  }
}
function renderList(host, items, empty) {
  if (!host) return;
  if (!items?.length) { host.innerHTML = `<p class="pa-report-empty">${escapeHtml(empty)}</p>`; return; }
  host.innerHTML = `<ul>${items.map(item => `<li>${escapeHtml(typeof item === 'string' ? item : item.issue || item.claim || item.focus || JSON.stringify(item))}</li>`).join('')}</ul>`;
}
function renderReport(report) {
  if (!report) return;
  currentReport = report;
  $('#paReportProject').textContent = `${report.projectName || 'Project'} · ${formatDate(report.interviewDate)}`;
  $('#paTotalScore').textContent = String(report.totalScore ?? '—');
  $('#paGrade').textContent = `${report.grade || '—'} · ${report.gradeLabel || 'Assessment'}`;
  $('#paVerdict').textContent = report.verdict || 'The panel has completed the simulated assessment.';
  $('#paReportMeta').textContent = `${Math.round((report.interviewDurationSeconds || 0) / 60)} min interview · ${report.turns?.length || 0} answers · Practice simulation`;
  $('#paScoreRing').style.setProperty('--pa-score', `${Math.max(0, Math.min(100, Number(report.totalScore || 0)))}%`);
  const categories = Object.values(report.categoryScores || {});
  $('#paCategoryScores').innerHTML = categories.map(item => `<div class="pa-category-row"><div><span>${escapeHtml(item.label)}</span><b>${Number(item.score || 0)} / ${Number(item.max || 0)}</b></div><i><em style="width:${item.max ? Math.max(0, Math.min(100, Number(item.score || 0) / Number(item.max) * 100)) : 0}%"></em></i></div>`).join('') || '<p class="pa-report-empty">Category scores are not available.</p>';
  $('#paJudgeFeedback').innerHTML = (report.judgeFeedback || []).map(item => `<article class="pa-judge-feedback-item"><div><b>${escapeHtml(item.name || item.role || 'Judge')}</b><small>${escapeHtml(item.role || '')}</small></div><p>${escapeHtml(item.feedback || 'No judge-specific feedback was returned.')}</p></article>`).join('') || '<p class="pa-report-empty">No judge-wise feedback was returned.</p>';
  renderList($('#paStrengths'), report.strengths, 'No specific strengths were returned.');
  renderList($('#paWeaknesses'), report.weaknesses, 'No specific weaknesses were returned.');
  const recommendations = report.recommendations || [];
  $('#paRecommendations').innerHTML = recommendations.length ? `<div class="pa-recommendations"><b>Recommended next actions</b><ul>${recommendations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
  const issues = [
    ...(report.technicalMistakes || []).map(item => ({ title: 'Technical mistake', body: `${item.issue || ''} ${item.context || ''}` })),
    ...(report.unsupportedClaims || []).map(item => ({ title: 'Unsupported claim', body: `${item.claim || ''} — ${item.reason || ''} ${item.evidence || ''}` })),
    ...(report.contradictions || []).map(item => ({ title: 'Contradiction', body: `${item.claimA || ''} / ${item.claimB || ''}: ${item.detail || ''}` }))
  ];
  $('#paEvidenceIssues').innerHTML = issues.length ? issues.map(item => `<article class="pa-evidence-issue"><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.body)}</p></article>`).join('') : '<p class="pa-report-empty">No explicit technical mistakes, unsupported claims or contradictions were returned. This does not prove the project is free of defects.</p>';
  $('#paQuestionReview').innerHTML = (report.turns || []).map((turn, index) => `<article class="pa-question-review"><div><span>QUESTION ${String(index + 1).padStart(2, '0')} · ${escapeHtml(turn.judgeName || 'AI Judge')}</span><b>${Number(turn.evaluation?.score || 0)} / ${Number(turn.evaluation?.maxScore || 10)}</b></div><h4>${escapeHtml(turn.question || '')}</h4><p><strong>Your answer:</strong> ${escapeHtml(turn.answer || '')}</p><small>${escapeHtml(turn.evaluation?.feedback || '')}</small>${turn.evaluation?.strongerAnswer ? `<blockquote><strong>Stronger answer approach:</strong> ${escapeHtml(turn.evaluation.strongerAnswer)}</blockquote>` : ''}</article>`).join('') || '<p class="pa-report-empty">No question transcript was saved.</p>';
  $('#paSevenDayPlan').innerHTML = (report.sevenDayPlan || []).map(item => `<article><span>DAY ${Number(item.day || 0)}</span><b>${escapeHtml(item.focus || 'Focus')}</b><p>${escapeHtml(item.task || '')}</p></article>`).join('') || '<p class="pa-report-empty">The AI did not return a seven-day plan. Use the recommendations above to create your next practice steps.</p>';
}
async function resumeSession(sessionId) {
  try {
    const result = await api('resume', { sessionId });
    showRoom(result.session, result.question, result.speech, result.judge?.id, result.session.stage, result.turns || [], result.startedAt ? new Date(result.startedAt).getTime() : Date.now());
    if (result.turns?.length && !answerLimitReached) {
      currentQuestion = result.question;
      setQuestion(currentQuestion, result.session.stage);
      applyJudge(result.judge?.id || 'technical', 'waiting');
    }
  } catch (error) { showStatus(error.message, 'error'); }
}
async function loadReport(sessionId) {
  try {
    const result = await api('get-report', { sessionId });
    renderReport(result.report);
    $('#paRoom').hidden = true;
    $('#paReport').hidden = false;
    $('.pitch-arena-page').classList.remove('pa-in-room');
    $('.pitch-arena-page').classList.add('pa-report-view');
    setTimeout(() => $('#paReport').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  } catch (error) { showStatus(error.message, 'error'); }
}
async function toggleCamera() {
  if (cameraActive) {
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    cameraActive = false;
    $('#paCameraPreview').srcObject = null;
    $('#paCameraPlaceholder').classList.remove('is-hidden');
    $('#paCameraStatus').textContent = 'CAMERA OFF';
    $('#paCameraToggle').setAttribute('aria-pressed', 'false');
    $('#paCameraToggle').classList.remove('is-active');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) { setSpeechStatus('Camera access requires a supported browser on HTTPS.', 'error'); return; }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    $('#paCameraPreview').srcObject = cameraStream;
    await $('#paCameraPreview').play();
    cameraActive = true;
    $('#paCameraPlaceholder').classList.add('is-hidden');
    $('#paCameraStatus').textContent = 'CAMERA ON';
    $('#paCameraToggle').setAttribute('aria-pressed', 'true');
    $('#paCameraToggle').classList.add('is-active');
  } catch (error) {
    setSpeechStatus(error.name === 'NotAllowedError' ? 'Camera permission was denied. You can continue without video.' : `Camera unavailable: ${error.message}`, 'error');
  }
}
function stopMic() {
  if (recognition) { try { recognition.onend = null; recognition.stop(); } catch {} recognition = null; }
  micActive = false;
  micPermissionStream?.getTracks().forEach(track => track.stop());
  micPermissionStream = null;
  $('#paMicToggle').setAttribute('aria-pressed', 'false');
  $('#paMicToggle').classList.remove('is-active');
  setSpeechStatus('Microphone off · Text mode ready');
}
async function toggleMic() {
  if (micActive) { stopMic(); return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { setSpeechStatus('Speech recognition is not supported in this browser. Type your answer instead.', 'error'); return; }
  if (!navigator.mediaDevices?.getUserMedia) { setSpeechStatus('Microphone access requires a supported browser on HTTPS.', 'error'); return; }
  try {
    stopSpeech(); // Starting the microphone interrupts the judge, just like a live call.
    micPermissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    recognition = new Recognition();
    recognition.lang = navigator.language || 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      micActive = true;
      $('#paMicToggle').setAttribute('aria-pressed', 'true');
      $('#paMicToggle').classList.add('is-active');
      applyJudge(currentJudgeId, 'listening');
      setSpeechStatus('Listening… speak your answer now');
    };
    recognition.onresult = event => {
      let finalText = '';
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const text = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) finalText += `${text} `;
        else interim += text;
      }
      if (finalText.trim()) {
        const input = $('#paAnswerInput');
        input.value = `${input.value.trim()} ${finalText.trim()}`.trim();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      setSpeechStatus(interim ? `Hearing: ${interim}` : 'Transcript captured · Continue speaking or submit');
    };
    recognition.onerror = event => {
      setSpeechStatus(event.error === 'not-allowed' ? 'Microphone permission was denied. Use text mode.' : `Speech recognition: ${event.error}. You can type your answer.`, 'error');
    };
    recognition.onend = () => {
      micActive = false;
      micPermissionStream?.getTracks().forEach(track => track.stop());
      micPermissionStream = null;
      recognition = null;
      $('#paMicToggle').setAttribute('aria-pressed', 'false');
      $('#paMicToggle').classList.remove('is-active');
      applyJudge(currentJudgeId, 'waiting');
      if (!$('#paSpeechStatus').classList.contains('error')) setSpeechStatus('Transcript ready · Review before submitting');
    };
    recognition.start();
  } catch (error) {
    micPermissionStream?.getTracks().forEach(track => track.stop());
    micPermissionStream = null;
    setSpeechStatus(error.name === 'NotAllowedError' ? 'Microphone permission was denied. Use text mode.' : `Microphone unavailable: ${error.message}`, 'error');
  }
}
async function clarifyQuestion() {
  if (!currentSession || !currentQuestion) return;
  $('#paClarifyBtn').disabled = true;
  try {
    const result = await api('clarify', { sessionId: currentSession.id, question: currentQuestion });
    currentQuestion = result.question;
    $('#paCurrentQuestion').textContent = currentQuestion;
    appendTranscript({ kind: 'pa-transcript-judge pa-transcript-next', title: JUDGES[currentJudgeId].name, text: currentQuestion, meta: 'CLARIFIED QUESTION' });
    speak(result.speech || result.question);
  } catch (error) { setSpeechStatus(error.message, 'error'); }
  finally { $('#paClarifyBtn').disabled = false; }
}
function backToWorkspace() {
  stopMedia();
  clearInterval(timerHandle);
  currentSession = null;
  activeTurns = [];
  currentReport = null;
  $('#paRoom').hidden = true;
  $('#paReport').hidden = true;
  $('.pitch-arena-page').classList.remove('pa-in-room', 'pa-report-view');
  $('#paAnswerInput').value = '';
  window.scrollTo({ top: $('#pitchArenaPage').offsetTop - 90, behavior: 'smooth' });
}
async function uploadAndAnalyze(event) {
  event.preventDefault();
  if (uploadBusy) return;
  const name = $('#paProjectName').value.trim();
  const files = Array.from($('#paProjectFiles').files || []);
  if (!name) return showStatus('Enter a project name.', 'error');
  if (!files.length) return showStatus('Choose at least one project file.', 'error');
  if (files.length > 12) return showStatus('Choose no more than 12 files.', 'error');
  let total = 0;
  for (const file of files) {
    total += file.size;
    const extension = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) return showStatus(`${file.name} is not a supported file type.`, 'error');
    if (file.size > MAX_FILE_SIZE) return showStatus(`${file.name} is larger than the 12 MB per-file limit.`, 'error');
    if (file.size === 0) return showStatus(`${file.name} is empty.`, 'error');
  }
  if (total > MAX_TOTAL_SIZE) return showStatus('The total upload size must be 30 MB or less.', 'error');
  uploadBusy = true;
  const button = $('#paAnalyzeBtn');
  button.disabled = true;
  button.textContent = 'Uploading private files…';
  showStatus('Preparing your private project upload…');
  const projectId = makeId();
  const uploadedPaths = [];
  try {
    const token = await getAccessToken();
    const pdfText = [];
    const metadata = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const objectPath = `${authUser.id}/${projectId}/${String(index + 1).padStart(2, '0')}-${safeFileName(file.name)}`;
      const { error } = await supabaseClient.storage.from(BUCKET).upload(objectPath, file, {
        cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream'
      });
      if (error) throw new Error(`Storage upload failed for ${file.name}: ${error.message}. Apply supabase-pitch-arena.sql and check the private bucket policy.`);
      uploadedPaths.push(objectPath);
      metadata.push({ name: file.name, path: objectPath, size: file.size, type: file.type || 'application/octet-stream' });
      if (getExtension(file.name) === 'pdf') {
        showStatus(`Uploaded ${index + 1}/${files.length}. Extracting PDF text from ${file.name}…`);
        try {
          const content = await extractPdfText(file);
          pdfText.push({ name: file.name, content });
        } catch (error) {
          pdfText.push({ name: file.name, content: '' });
          console.warn('PDF text extraction unavailable', error);
        }
      }
      showStatus(`Uploaded ${index + 1}/${files.length} project files…`);
    }
    button.textContent = 'Agent37 is analysing your project…';
    showStatus('Agent37 is reviewing your source code and documentation. This can take a little while.');
    const result = await api('analyze', { projectName: name, files: metadata, pdfText });
    lastUploadedAnalysis = result.project;
    renderProjectAnalysis(result.project);
    await loadDashboard();
    renderProjectSelect(result.project.id);
    $('#paProjectName').value = '';
    $('#paProjectFiles').value = '';
    $('#paSelectedFiles').innerHTML = '<span>No files selected yet.</span>';
    showStatus(`Project analysed and saved privately. ${result.project.filesCount} file(s) linked to this project.`, 'success');
    $('#paAnalysisCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (uploadedPaths.length) {
      try { await supabaseClient.storage.from(BUCKET).remove(uploadedPaths); } catch {}
    }
    showStatus(error.message, 'error');
  } finally {
    uploadBusy = false;
    button.disabled = false;
    button.innerHTML = 'Upload & analyse project <span>↗</span>';
  }
}
function updateSelectedFiles() {
  const files = Array.from($('#paProjectFiles').files || []);
  $('#paSelectedFiles').innerHTML = files.length ? files.map(file => `<span><b>${escapeHtml(file.name)}</b><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small></span>`).join('') : '<span>No files selected yet.</span>';
}
function bindUI() {
  $('#paProjectFiles')?.addEventListener('change', updateSelectedFiles);
  $('#paUploadForm')?.addEventListener('submit', uploadAndAnalyze);
  $('#paProjectSelect')?.addEventListener('change', () => { $('#paStartBtn').disabled = !$('#paProjectSelect').value; });
  $('#paStartForm')?.addEventListener('submit', startInterview);
  $('#paAnswerForm')?.addEventListener('submit', submitAnswer);
  $('#paRefreshHistory')?.addEventListener('click', loadDashboard);
  $('#paMicToggle')?.addEventListener('click', toggleMic);
  $('#paCameraToggle')?.addEventListener('click', toggleCamera);
  $('#paSpeakerToggle')?.addEventListener('click', () => {
    speakerEnabled = !speakerEnabled;
    $('#paSpeakerToggle').setAttribute('aria-pressed', String(speakerEnabled));
    $('#paSpeakerToggle').querySelector('small').textContent = speakerEnabled ? 'Speaker on' : 'Speaker off';
    if (!speakerEnabled) stopSpeech(); else speak(currentQuestion);
  });
  $('#paSpeakerVolume')?.addEventListener('input', event => { speakerVolume = Math.max(0, Math.min(1, Number(event.target.value))); });
  $('#paCaptionToggle')?.addEventListener('click', () => {
    captionsEnabled = !captionsEnabled;
    $('#paCaptionToggle').setAttribute('aria-pressed', String(captionsEnabled));
    $('#paTranscript').classList.toggle('pa-captions-hidden', !captionsEnabled);
    $('#paCaptionToggle').querySelector('small').textContent = captionsEnabled ? 'Captions' : 'Captions off';
  });
  $('#paRepeatQuestion')?.addEventListener('click', () => speak(currentQuestion));
  $('#paClarifyBtn')?.addEventListener('click', clarifyQuestion);
  $('#paEndInterview')?.addEventListener('click', () => finishInterview(false));
  $('#paNewInterview')?.addEventListener('click', backToWorkspace);
  $('#paPrintReport')?.addEventListener('click', () => window.print());
  $('#paHistoryGrid')?.addEventListener('click', event => {
    const button = event.target.closest('[data-pa-history-action]');
    if (!button) return;
    const sessionId = button.dataset.sessionId;
    if (button.dataset.paHistoryAction === 'report') loadReport(sessionId);
    else resumeSession(sessionId);
  });
  document.querySelectorAll('[data-pa-scroll]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    $('#paWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
async function onPitchArenaRoute() {
  if (location.pathname.replace(/\/+$/, '') !== '/pitch-arena') return;
  try {
    const token = await getAccessToken();
    if (!token) return;
    const uid = authUser?.id || '';
    if (lastRouteLoadUser !== uid) {
      lastRouteLoadUser = uid;
      await loadDashboard();
    }
  } catch (error) {
    showStatus(error.message, 'error');
  }
}

bindUI();
window.addEventListener('hackverse:pitch-arena:route', onPitchArenaRoute);
supabaseClient.auth.onAuthStateChange((_event, session) => {
  authUser = session?.user || null;
  if (!authUser) {
    lastRouteLoadUser = '';
    projects = [];
    sessions = [];
    stopMedia();
    clearInterval(timerHandle);
  } else if (location.pathname.replace(/\/+$/, '') === '/pitch-arena') {
    lastRouteLoadUser = '';
    void onPitchArenaRoute();
  }
});
if (location.pathname.replace(/\/+$/, '') === '/pitch-arena') void onPitchArenaRoute();
