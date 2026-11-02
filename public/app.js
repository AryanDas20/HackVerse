import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged,
  sendEmailVerification, updateProfile as updateAuthProfile
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy,
  startAt, endAt, limit, serverTimestamp, addDoc, setDoc, deleteDoc,
  onSnapshot, updateDoc, runTransaction, arrayUnion
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const CONFIGURED = Boolean(firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("YOUR_") && firebaseConfig.projectId && !String(firebaseConfig.projectId).startsWith("YOUR_"));
let app = null, auth = null, db = null, functions = null, currentUser = null, authMode = "signin", isAdminUser = false;
let privateProfile = null, publicProfile = null, events = [], savedIds = new Set(), people = [];
let activeConversationId = null, activeConversation = null, stopConversationListener = null, stopMessageListener = null;
let stopInboxListener = null, stopNotificationListener = null, profileIsMandatory = false, selectedMember = null, peopleSearchTimer = null;
let allEventsVisible = 24, currentConversations = [], currentMessages = [], currentNotifications = [], currentNotificationCategory = "all", selectedGroupMembers = new Map(), matchedTeamCandidates = [];
let replyingToMessage = null;
let profileWizardIndex = 0;
let profileWizardSteps = [];

function setupProfileWizard() {
  const form = $("#profileForm");
  if (!form || form.dataset.wizardReady === "true") return;
  const actionBar = form.querySelector(".profile-form-actions");
  const message = form.querySelector("#profileMessage");
  const original = [...form.children];
  const groups = [];
  let active = null;
  for (const node of original) {
    if (node.classList?.contains("form-section-title")) {
      active = { nodes: [node] }; groups.push(active);
    } else if (active && node !== actionBar && node !== message) {
      active.nodes.push(node);
    }
  }
  if (groups.length !== 3) return;
  const wizard = document.createElement("div"); wizard.className = "profile-wizard";
  const progress = document.createElement("div"); progress.className = "profile-wizard-progress"; progress.setAttribute("aria-live", "polite");
  const steps = groups.map((group, index) => {
    const section = document.createElement("section"); section.className = "profile-wizard-step"; section.dataset.profileStep = String(index); section.hidden = index !== 0;
    group.nodes.forEach(node => section.appendChild(node));
    wizard.appendChild(section); return section;
  });
  // Consent is part of the final privacy step, not a separate page.
  const consent = original.find(node => node.classList?.contains("consent-row"));
  if (consent) steps[2].appendChild(consent);
  const controls = document.createElement("div"); controls.className = "profile-wizard-controls";
  controls.innerHTML = '<button type="button" class="btn btn-outline" id="profileWizardBack">← Back</button><button type="button" class="btn btn-primary" id="profileWizardNext">Continue →</button>';
  form.insertBefore(progress, form.firstChild);
  form.insertBefore(wizard, actionBar);
  form.insertBefore(controls, actionBar);
  profileWizardSteps = steps;
  const render = () => {
    steps.forEach((step, index) => { step.hidden = index !== profileWizardIndex; });
    progress.innerHTML = `<span>Step ${profileWizardIndex + 1} of ${steps.length}</span><strong>${["Your basics", "Skills & interests", "Privacy & contact"][profileWizardIndex]}</strong><div class="wizard-progress-track"><i style="width:${((profileWizardIndex + 1) / steps.length) * 100}%"></i></div>`;
    $("#profileWizardBack").hidden = profileWizardIndex === 0;
    $("#profileWizardNext").hidden = profileWizardIndex === steps.length - 1;
    actionBar.hidden = profileWizardIndex !== steps.length - 1;
    if (message) message.textContent = "";
  };
  $("#profileWizardBack").onclick = () => { profileWizardIndex = Math.max(0, profileWizardIndex - 1); render(); };
  $("#profileWizardNext").onclick = () => {
    const invalid = [...steps[profileWizardIndex].querySelectorAll(":required")].find(input => !input.checkValidity());
    if (invalid) { invalid.reportValidity(); return; }
    profileWizardIndex = Math.min(steps.length - 1, profileWizardIndex + 1); render();
  };
  form.dataset.wizardReady = "true";
  form.dataset.wizardRender = "ready";
  form._renderProfileWizard = render;
  render();
}

const esc = (value = "") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const listFrom = value => String(value || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 30);
const normalizedList = value => listFrom(value).map(x => normalizeSearch(x)).filter((x, i, a) => a.indexOf(x) === i);
const normalizeSearch = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
function editDistance(a, b) {
  if (a === b) return 0; if (!a) return b.length; if (!b) return a.length;
  let row = Array.from({length:b.length+1}, (_,i)=>i);
  for (let i=1;i<=a.length;i++) { const next=[i]; for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1)); row=next; }
  return row[b.length];
}
function fuzzySearchMatch(queryText, haystackText) {
  const q=normalizeSearch(queryText), h=normalizeSearch(haystackText); if(!q) return true; if(h.includes(q)) return true;
  const queryWords=q.split(" ").filter(Boolean), words=h.split(/[^a-z0-9+.#]+/).filter(Boolean);
  return queryWords.every(part=>words.some(word=>word.startsWith(part) || (part.length>=4 && editDistance(part,word.slice(0,Math.min(word.length,part.length+1))) <= (part.length>=8?2:1))));
}
const validUrl = value => { if (!value) return ""; try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
const initials = name => String(name || "HS").trim().split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase() || "HS";
const toast = message => { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3000); };
const showModal = id => { const el = document.getElementById(id); if (el) el.hidden = false; };
const hideModal = id => { const el = document.getElementById(id); if (el) el.hidden = true; };
const requireAccount = () => { if (!currentUser) { openAuth(); toast("Sign in to use this feature."); return false; } if (!db) { toast("Connect Firebase before using account features."); return false; } return true; };
const tsMillis = value => value?.toMillis ? value.toMillis() : value?.seconds ? value.seconds * 1000 : (value ? new Date(value).getTime() : 0);
const friendlyError = error => {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "An account already exists with this email.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/weak-password": "Use a password with at least 8 characters.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Wait a while and try again.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed.",
    "auth/unauthorized-domain": "Add this domain in Firebase Authentication → Settings → Authorized domains.",
    "permission-denied": "Firebase denied this action. Check that the latest Firestore rules are deployed.",
    "USERNAME_TAKEN": "That username is already taken. Choose another one."
  };
  if (error?.message === "USERNAME_TAKEN") return map.USERNAME_TAKEN;
  return map[code] || error?.message || "Something went wrong. Check your Firebase setup and try again.";
};

function initFirebase() {
  if (!CONFIGURED) {
    setSystemNotice("Firebase is not configured yet. Add your Web App settings in public/firebase-config.js to enable live data, registration, profiles, and chat.");
    renderEvents(); renderSaved(); renderPeopleEmpty(); return;
  }
  try {
    app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); functions = getFunctions(app);
    onAuthStateChanged(auth, async user => {
      currentUser = user;
      isAdminUser = false;
      $("#discoveryAdminPanel").hidden = true;
      if (user) { try { const token = await user.getIdTokenResult(); isAdminUser = token.claims.admin === true; } catch (e) { console.warn("Admin claim check failed", e); } }
      $("#discoveryAdminPanel").hidden = !isAdminUser;
      if (isAdminUser) loadDiscoverySources();
      $("#authButton").textContent = user ? "Sign out" : "Sign in";
      $("#accountButton").textContent = user ? "My workspace ↗" : "Get started ↗";
      if (!user) {
        privateProfile = null; publicProfile = null; savedIds.clear(); profileIsMandatory = false; hideModal("profileModal");
        detachRealtimeListeners(); renderSaved(); renderMyProfile(); renderProjects([]); renderConversationList([]);
        $("#chatPlaceholder").hidden = false; $("#chatActive").hidden = true;
        setSystemNotice(""); renderEvents(); searchPeople(); handleRoute(); return;
      }
      await loadAccountWorkspace();
      handleRoute();
    });
    loadEvents();
  } catch (error) {
    console.error("Firebase initialization failed", error);
    setSystemNotice("Firebase could not start. Check the values in public/firebase-config.js.");
  }
}

function setSystemNotice(message) {
  const old = $("#systemNotice"); if (old) old.remove();
  if (!message) return;
  const notice = document.createElement("div"); notice.id = "systemNotice"; notice.className = "system-notice wrap"; notice.textContent = message;
  $("main").prepend(notice);
}

function openAuth(mode = "signin") {
  if (!CONFIGURED) { toast("Add your Firebase Web App config first."); return; }
  setAuthMode(mode); $("#authMessage").textContent = ""; showModal("authModal");
}
function closeProfileModal() { if (profileIsMandatory) return; hideModal("profileModal"); }
function setAuthMode(mode) {
  authMode = mode;
  $("#authTitle").textContent = mode === "signup" ? "Create your builder account." : "Your next build awaits.";
  $("#authSubtitle").textContent = mode === "signup" ? "Create an account, then set up your builder profile." : "Sign in to access your builder workspace.";
  $("#authSubmit").textContent = mode === "signup" ? "Create account →" : "Sign in →";
  $("#authModeToggle").textContent = mode === "signup" ? "Already have an account? Sign in" : "Create an account";
  $("#authPassword").autocomplete = mode === "signup" ? "new-password" : "current-password";
}

async function authSubmit(event) {
  event.preventDefault();
  if (!auth || !db) return;
  const email = $("#authEmail").value.trim(); const password = $("#authPassword").value;
  $("#authMessage").textContent = "";
  try {
    if (authMode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try { await sendEmailVerification(credential.user); } catch (verificationError) { console.warn("Verification email could not be sent", verificationError); }
      hideModal("authModal"); toast("Account created. Complete your builder profile to continue.");
    } else {
      await signInWithEmailAndPassword(auth, email, password); hideModal("authModal"); toast("Welcome back.");
    }
  } catch (error) { $("#authMessage").textContent = friendlyError(error); }
}

async function googleSignIn() {
  if (!auth || !db) return;
  try { await signInWithPopup(auth, new GoogleAuthProvider()); hideModal("authModal"); toast("Signed in with Google."); }
  catch (error) { $("#authMessage").textContent = friendlyError(error); }
}

async function resetPassword() {
  const email = $("#authEmail").value.trim();
  if (!email) { $("#authMessage").textContent = "Enter your email address first."; return; }
  try { await sendPasswordResetEmail(auth, email); $("#authMessage").textContent = "Password reset email sent."; }
  catch (error) { $("#authMessage").textContent = friendlyError(error); }
}

async function loadAccountWorkspace() {
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    privateProfile = snap.exists() ? snap.data() : null;
    const pubSnap = await getDoc(doc(db, "publicProfiles", currentUser.uid));
    publicProfile = pubSnap.exists() ? pubSnap.data() : (privateProfile?.profileVisibility === "private" ? (privateProfile?.profileData || null) : null);
    await loadSaved();
    renderMyProfile();
    if (!privateProfile?.profileComplete || !publicProfile) {
      openProfileEditor(true);
    } else {
      hideModal("profileModal");
      beginInboxListener();
      beginNotificationListener();
      loadProjects();
    }
  } catch (error) {
    console.error("Could not load account", error); toast(friendlyError(error));
  }
}

function formWizardRender() { const form = $("#profileForm"); form?._renderProfileWizard?.(); }

function openProfileEditor(mandatory = false) {
  if (!requireAccount()) return;
  profileIsMandatory = mandatory;
  setupProfileWizard();
  profileWizardIndex = 0;
  formWizardRender();
  const p = { ...(privateProfile || {}), ...(publicProfile || {}) };
  $("#profileName").value = p.displayName || currentUser.displayName || "";
  $("#profileUsername").value = p.username || "";
  $("#profileUsername").disabled = Boolean(p.usernameLower);
  $("#profileCollege").value = p.college || ""; $("#profileCollegeShort").value = p.collegeShort || ""; $("#profileCourse").value = p.course || "";
  $("#profileStudyLevel").value = p.studyLevel || ""; $("#profileGradYear").value = p.graduationYear || "";
  $("#profileCity").value = p.city || ""; $("#profileCountry").value = p.country || "";
  $("#profileBio").value = p.bio || ""; $("#profileSkills").value = (p.skills || []).join(", "); $("#profileSkillLevel").value = p.skillLevel || ""; $("#profileTracks").value = (p.tracks || []).join(", ");
  $("#profileRoles").value = (p.rolesInterested || []).join(", "); $("#profileInterests").value = (p.interests || []).join(", ");
  $("#profileAvailability").value = p.availability || "Open to opportunities"; $("#profileMode").value = p.preferredMode || "Any format";
  $("#profileAvatar").value = p.avatarUrl || ""; $("#profileGithub").value = p.github || "";
  $("#profileLinkedin").value = p.linkedin || ""; $("#profilePortfolio").value = p.portfolio || "";
  $("#profilePhone").value = privateProfile?.phone || ""; $("#profilePhoneVisibility").value = privateProfile?.phoneVisibility || "private"; $("#profileEmailVisibility").value = privateProfile?.emailVisibility || "private"; $("#profileVisibility").value = privateProfile?.profileVisibility || p.profileVisibility || "public"; $("#profileLooking").value = String(p.lookingForTeam !== false);
  $("#profilePublicConsent").checked = Boolean(p.profileConsentAt);
  $("#profileMessage").textContent = "";
  $("#profileModalTitle").textContent = mandatory ? "Complete your builder profile." : "Update your builder profile.";
  $("#profileModalHint").textContent = mandatory ? "Complete the required details to unlock the community directory and chat." : "Keep your builder profile current so collaborators can find you.";
  $("#profileModalClose").hidden = mandatory;
  $("#profileSignOutBtn").hidden = !mandatory;
  showModal("profileModal");
}

async function saveProfile(event) {
  event.preventDefault();
  if (!requireAccount()) return;
  const message = $("#profileMessage"); message.textContent = "Saving profile…";
  const uid = currentUser.uid;
  const username = $("#profileUsername").value.trim().replace(/^@/, "");
  const usernameLower = username.toLowerCase();
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) { message.textContent = "Username must be 3–24 letters, numbers, or underscores."; return; }
  const skills = listFrom($("#profileSkills").value);
  const name = $("#profileName").value.trim(); const college = $("#profileCollege").value.trim();
  if (!name) { message.textContent = "Enter your name to continue."; return; }
  const course = $("#profileCourse").value.trim(); const bio = $("#profileBio").value.trim();
  const consent = $("#profilePublicConsent").checked;
  if (!consent) { message.textContent = "Please confirm the public profile visibility notice."; return; }
  const existingUsername = publicProfile?.usernameLower;
  if (existingUsername && existingUsername !== usernameLower) { message.textContent = "Username changes are disabled in this starter release."; return; }
  const profile = {
    uid, displayName: name, nameLower: name.toLowerCase(), username, usernameLower,
    college, collegeLower: college.toLowerCase(), collegeShort: $("#profileCollegeShort").value.trim(), collegeShortLower: $("#profileCollegeShort").value.trim().toLowerCase(), course, studyLevel: $("#profileStudyLevel").value,
    graduationYear: Number($("#profileGradYear").value) || null,
    city: $("#profileCity").value.trim(), country: $("#profileCountry").value.trim(),
    bio, skills, skillsLower: normalizedList(skills.join(",")),
    rolesInterested: listFrom($("#profileRoles").value), rolesLower: normalizedList($("#profileRoles").value),
    interests: listFrom($("#profileInterests").value), interestsLower: normalizedList($("#profileInterests").value),
    courseLower: course.toLowerCase(), availability: $("#profileAvailability").value,
    preferredMode: $("#profileMode").value, avatarUrl: validUrl($("#profileAvatar").value),
    github: validUrl($("#profileGithub").value), linkedin: validUrl($("#profileLinkedin").value),
    portfolio: validUrl($("#profilePortfolio").value), skillLevel: $("#profileSkillLevel").value, tracks: listFrom($("#profileTracks").value), lookingForTeam: $("#profileLooking").value === "true",
    publicEmail: $("#profileEmailVisibility").value === "public" ? (currentUser.email || "") : "",
    publicEmailLower: $("#profileEmailVisibility").value === "public" ? (currentUser.email || "").toLowerCase() : "",
    publicPhone: $("#profilePhoneVisibility").value === "public" ? $("#profilePhone").value.trim() : "",
    publicPhoneDigits: $("#profilePhoneVisibility").value === "public" ? $("#profilePhone").value.replace(/\D/g, "") : "",
    profileVisibility: $("#profileVisibility").value,
    profileConsentAt: privateProfile?.profileConsentAt || serverTimestamp(), updatedAt: serverTimestamp()
  };
  const privateData = {
    email: currentUser.email || "", phone: $("#profilePhone").value.trim(),
    profileVisibility: profile.profileVisibility, profileData: profile,
    displayName: name, username, usernameLower, college, collegeShort: profile.collegeShort, course, studyLevel: profile.studyLevel,
    phoneVisibility: $("#profilePhoneVisibility").value, emailVisibility: $("#profileEmailVisibility").value,
    graduationYear: profile.graduationYear, city: profile.city, country: profile.country,
    profileComplete: true, updatedAt: serverTimestamp(),
    ...(privateProfile ? {} : { role: "participant", createdAt: serverTimestamp() })
  };
  try {
    await runTransaction(db, async transaction => {
      const userRef = doc(db, "users", uid); const publicRef = doc(db, "publicProfiles", uid);
      const usernameRef = doc(db, "usernames", usernameLower);
      const [userSnap, usernameSnap] = await Promise.all([transaction.get(userRef), transaction.get(usernameRef)]);
      if (usernameSnap.exists() && usernameSnap.data().uid !== uid) throw new Error("USERNAME_TAKEN");
      if (!usernameSnap.exists()) transaction.set(usernameRef, { uid, createdAt: serverTimestamp() });
      const savedPrivate = { ...privateData };
      if (userSnap.exists()) delete savedPrivate.role;
      transaction.set(userRef, savedPrivate, { merge: true });
      if (profile.profileVisibility === "private") transaction.delete(publicRef);
      else transaction.set(publicRef, profile, { merge: true });
    });
    await updateAuthProfile(currentUser, { displayName: name, photoURL: profile.avatarUrl || null }).catch(() => {});
    privateProfile = { ...(privateProfile || {}), ...privateData, profileComplete: true };
    publicProfile = profile; profileIsMandatory = false; hideModal("profileModal");
    renderMyProfile(); beginInboxListener(); loadProjects(); searchPeople(); toast("Your builder profile is saved.");
  } catch (error) { console.error(error); message.textContent = friendlyError(error); }
}

async function loadDiscoverySources() {
  if (!db || !isAdminUser) return;
  try {
    const snap = await getDocs(query(collection(db, "discoverySources"), limit(50)));
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const host = $("#discoverySourcesList");
    host.innerHTML = rows.length ? rows.map(source => `<div class="discovery-source-row"><div><b>${esc(source.name || "RSS source")}</b><small>${esc(source.feedUrl || "")}</small></div><label class="source-toggle"><input type="checkbox" data-source-toggle="${esc(source.id)}" ${source.enabled ? "checked" : ""}> Enabled</label></div>`).join("") : '<p class="muted">No sources connected yet. Add an approved public RSS feed below.</p>';
    host.querySelectorAll("[data-source-toggle]").forEach(input => input.addEventListener("change", async () => {
      try { await httpsCallable(functions, "setDiscoverySourceEnabled")({ id: input.dataset.sourceToggle, enabled: input.checked }); toast("Source setting updated."); }
      catch (error) { input.checked = !input.checked; toast(friendlyError(error)); }
    }));
  } catch (error) { $("#discoverySourcesList").textContent = friendlyError(error); }
}
async function addDiscoverySource(event) {
  event.preventDefault();
  if (!isAdminUser || !functions) return;
  const name = $("#discoverySourceName").value.trim(); const feedUrl = $("#discoveryFeedUrl").value.trim();
  const button = $("#addDiscoverySourceBtn"); button.disabled = true;
  try {
    await httpsCallable(functions, "addDiscoverySource")({ name, feedUrl, autoPublish: true });
    $("#discoverySourceForm").reset(); toast("RSS source connected. It will be checked on the next run."); await loadDiscoverySources();
  } catch (error) { toast(friendlyError(error)); }
  finally { button.disabled = false; }
}
async function runDiscoveryManually() {
  if (!isAdminUser || !functions) return;
  const button = $("#runDiscoveryBtn"); button.disabled = true; button.textContent = "Discovering…";
  try {
    const result = await httpsCallable(functions, "runDiscoveryNow")({});
    const data = result.data || {};
    $("#discoveryStatus").textContent = `Checked ${data.sourceCount || 0} sources · fetched ${data.fetched || 0} items · published/updated ${data.published || 0} listings · ${data.errors?.length || 0} source errors.`;
    await loadEvents(); await loadDiscoverySources();
  } catch (error) { $("#discoveryStatus").textContent = friendlyError(error); }
  finally { button.disabled = false; button.textContent = "Run discovery now ↻"; }
}

async function loadEvents() {
  const grid = $("#eventGrid");
  if (!db) {
    grid.innerHTML = '<div class="loading-card">Connect Firebase to load real opportunities. No sample events are bundled with this website.</div>';
    $("#eventGridAll").innerHTML = '<div class="loading-card">Connect Firebase to load the live opportunity directory.</div>';
    return;
  }
  grid.innerHTML = '<div class="loading-card">Loading opportunities…</div>';
  try {
    const snapshot = await getDocs(query(collection(db, "hackathons"), where("visibility", "==", "public"), limit(500)));
    events = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== "expired");
    events.sort((a,b) => tsMillis(b.updatedAt || b.ingestedAt || b.createdAt) - tsMillis(a.updatedAt || a.ingestedAt || a.createdAt));
    allEventsVisible = 24; populateEventFilterOptions(); renderEvents(); renderSaved();
  } catch (error) {
    console.error("Opportunity feed read failed", error);
    grid.innerHTML = '<div class="loading-card">Could not load opportunities. Check your Firestore rules and connection.</div>';
    $("#eventGridAll").innerHTML = '<div class="loading-card">The opportunity directory could not be loaded.</div>';
  }
}

function eventCategoryValue(event) {
  const raw = String(event.category || event.opportunityType || event.type || "").toLowerCase();
  if (["hackathon","bootcamp","course","certification","coding-event","case-competition"].includes(raw)) return raw;
  const text = `${event.title || ""} ${event.summary || ""} ${(event.tags || []).join(" ")}`.toLowerCase();
  if (/boot ?camp|accelerator programme|developer intensive/.test(text)) return "bootcamp";
  if (/certif(?:ication|ied)|credential exam/.test(text)) return "certification";
  if (/online course|course enrollment|self.?paced course|learning path|mooc/.test(text)) return "course";
  if (/case competition|case study challenge|business case/.test(text)) return "case-competition";
  if (/hackathon|hack-a-thon/.test(text)) return "hackathon";
  if (/code jam|coding contest|programming contest|ctf|capture the flag|developer meetup|tech conference|open source sprint|code challenge/.test(text)) return "coding-event";
  return "hackathon";
}
function eventModeValue(event) {
  const value = String(event.mode || event.format || "").toLowerCase();
  if (value.includes("hybrid")) return "Hybrid";
  if (value.includes("online") || value.includes("virtual") || value.includes("remote")) return "Online";
  if (value.includes("in-person") || value.includes("in person") || value.includes("offline")) return "In-person";
  const text = `${event.summary || ""} ${event.location || ""}`.toLowerCase();
  if (/online|virtual|remote/.test(text)) return "Online";
  if (/in person|in-person|offline|on.?site/.test(text)) return "In-person";
  return "Not specified";
}
function populateEventFilterOptions() {
  const setOptions = (selector, values, label) => {
    const el = $(selector); if (!el) return;
    const selected = el.value || "all";
    el.innerHTML = `<option value="all">${label}</option>` + values.filter(Boolean).sort((a,b) => a.localeCompare(b)).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if ([...el.options].some(o => o.value === selected)) el.value = selected;
  };
  setOptions("#eventCountry", [...new Set(events.map(e => e.country || "").filter(Boolean))], "All countries");
  setOptions("#eventRegion", [...new Set(events.map(e => e.region || e.state || "").filter(Boolean))], "All regions");
  setOptions("#eventTrack", [...new Set(events.flatMap(e => e.tracks || e.tags || []))], "All tracks");
  setOptions("#eventSource", [...new Set(events.map(e => e.sourceName || e.sourcePlatform || "").filter(Boolean))], "All sources");
}
function filteredEvents() {
  const get = (id, fallback = "all") => $(id)?.value ?? fallback;
  const term = get("#eventSearch", "").trim().toLowerCase();
  const skill = get("#eventSkill", "").trim().toLowerCase();
  const category = get("#eventCategory"); const mode = get("#eventMode"); const track = get("#eventTrack");
  const country = get("#eventCountry"); const region = get("#eventRegion"); const level = get("#eventLevel");
  const cost = get("#eventCost"); const deadlineFilter = get("#eventDeadline"); const source = get("#eventSource");
  const now = Date.now();
  let list = events.filter(event => {
    if (event.status === "expired") return false;
    const categoryValue = eventCategoryValue(event);
    const eventMode = eventModeValue(event);
    const eventCountry = String(event.country || "").toLowerCase();
    const eventRegion = String(event.region || event.state || "").toLowerCase();
    const searchable = [event.title,event.organizer,event.summary,event.description,event.sourceName,event.location,event.city,event.region,event.country,event.eligibility,event.level,...(event.tracks||[]),...(event.technologies||[]),...(event.tags||[]),...(event.skills||[])].join(" ").toLowerCase();
    const trackMatch = track === "all" || (event.tracks || event.tags || []).some(t => t.toLowerCase() === track.toLowerCase());
    const deadline = tsMillis(event.registrationDeadline);
    const costText = `${event.summary || ""} ${event.description || ""} ${event.price || ""}`;
    const explicitlyFree = event.isFree === true || /\bfree (?:to enter|registration|entry)\b|\bno (?:registration )?fee\b|₹\s*0(?:\.00)?|\$\s*0(?:\.00)?/i.test(costText);
    const explicitlyPaid = event.isFree === false || /\bpaid (?:entry|registration)\b|\bregistration fee\b|\bentry fee\b|\btuition fee\b/i.test(costText);
    return (!term || fuzzySearchMatch(term,searchable))
      && (!skill || [ ...(event.skills||[]), ...(event.technologies||[]), ...(event.tracks||[]) ].join(" ").toLowerCase().includes(skill))
      && (category === "all" || categoryValue === category)
      && (mode === "all" || eventMode.toLowerCase() === mode.toLowerCase())
      && trackMatch
      && (source === "all" || String(event.sourceName || event.sourcePlatform || "").toLowerCase() === source.toLowerCase())
      && (country === "all" || eventCountry === country.toLowerCase())
      && (region === "all" || eventRegion === region.toLowerCase())
      && (level === "all" || String(event.level || "Open to all").toLowerCase() === level.toLowerCase())
      && (cost === "all" || (cost === "free" ? explicitlyFree : explicitlyPaid))
      && (deadlineFilter === "all" || (deadlineFilter === "open" ? !deadline : deadline && deadline >= now && deadline <= now + Number(deadlineFilter)*86400000));
  });
  const sort = get("#eventSort");
  if (sort === "deadline") list.sort((a,b) => (tsMillis(a.registrationDeadline) || Number.MAX_SAFE_INTEGER) - (tsMillis(b.registrationDeadline) || Number.MAX_SAFE_INTEGER));
  if (sort === "newest") list.sort((a,b) => tsMillis(b.createdAt || b.updatedAt || b.ingestedAt) - tsMillis(a.createdAt || a.updatedAt || a.ingestedAt));
  if (sort === "prize") list.sort((a,b) => (Number(b.prizePool) || 0) - (Number(a.prizePool) || 0));
  if (sort === "title") list.sort((a,b) => String(a.title||"").localeCompare(String(b.title||"")));
  return list;
}
function dateLabel(value) {
  const ms = tsMillis(value); return ms ? new Date(ms).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) : "Not provided";
}
function opportunityCard(event, index) {
  const deadlineMs = tsMillis(event.registrationDeadline);
  const deadlineText = deadlineMs ? (deadlineMs < Date.now() ? "Deadline passed" : `Closes ${new Date(deadlineMs).toLocaleDateString()}`) : "Deadline not listed";
  const categoryValue = eventCategoryValue(event);
  const prize = ["course", "bootcamp", "certification"].includes(categoryValue)
    ? (event.isFree === true ? "Free learning" : (event.price || "Check provider details"))
    : (event.prize || (Number(event.prizePool) > 0 ? `${esc(event.currency || "")} ${Number(event.prizePool).toLocaleString()}` : "Prize details not listed"));
  const organizer = event.organizer || event.sourceName || "Organiser not listed";
  const cat = eventCategoryValue(event).replace("-"," ");
  const mode = eventModeValue(event);
  const place = event.location || [event.city,event.region,event.country].filter(Boolean).join(", ") || (mode === "Online" ? "Online / remote" : "Location not listed");
  const track = (event.tracks || event.tags || []).slice(0,2).join(" · ");
  return `<article class="event-card opportunity-card"><div class="event-banner b${(index%3)+1}"><span class="tag">${esc(cat)}</span><span class="tag">${esc(mode)}</span></div><div class="event-body"><div class="event-source">${esc(organizer)}${event.sourceName && event.organizer ? ` · via ${esc(event.sourceName)}` : ""}</div><h3>${esc(event.title || "Untitled opportunity")}</h3><p class="event-desc">${esc(event.summary || "Open the original organiser listing for its full details.")}</p><div class="event-facts"><span>◎ ${esc(place)}</span>${track ? `<span>✦ ${esc(track)}</span>` : ""}<span>◷ ${esc(deadlineText)}</span></div><div class="event-bottom"><span class="event-prize">${esc(prize)}</span><div class="event-actions"><button class="save-btn" data-save="${esc(event.id)}">${savedIds.has(event.id)?"♥ Saved":"♡ Save"}</button><button class="register-btn" data-view-event="${esc(event.id)}">Read details ↗</button></div></div></div></article>`;
}
function renderLearningCatalog() {
  const panel = $("#learningCatalog");
  if (!panel) return;
  const category = $("#eventCategory")?.value || "all";
  const configs = {
    course: {
      title: "Explore online courses.",
      intro: "Browse live provider catalogues. Availability, enrolment dates, price and course status are confirmed by each provider.",
      providers: [
        ["openHPI", "Online ICT and computer science courses from the Hasso Plattner Institute.", "https://open.hpi.de/courses", "Public dated course feed connected to HackStop"],
        ["Coursera", "Courses and guided learning from universities and industry partners.", "https://www.coursera.org/browse", "Provider catalogue"],
        ["edX", "University and professional online courses, with availability and level filters.", "https://www.edx.org/courses", "Provider catalogue"],
        ["SWAYAM", "India's national online learning platform with courses from Indian institutions.", "https://swayam.gov.in/", "India · Provider catalogue"],
        ["Codecademy", "Interactive programming and technology courses, skill paths and career paths.", "https://www.codecademy.com/catalog", "Coding-focused catalogue"]
      ]
    },
    bootcamp: {
      title: "Find an online bootcamp.",
      intro: "Bootcamp cohorts, start dates and fees can change. Open the provider catalogue to confirm the next intake before enrolling.",
      providers: [
        ["edX Boot Camps", "Explore boot camp programmes through edX's learning-type catalogue filters.", "https://www.edx.org/courses", "Use Learning Type → Boot Camps"],
        ["Codecademy", "Explore structured career paths and intensive technical learning paths.", "https://www.codecademy.com/catalog", "Coding-focused catalogue"],
        ["Coursera", "Explore guided programmes and professional certificates for career development.", "https://www.coursera.org/browse", "Professional learning catalogue"]
      ]
    },
    certification: {
      title: "Explore certificates and certifications.",
      intro: "Check whether a programme awards a course-completion certificate, a professional certificate or an exam-based industry certification.",
      providers: [
        ["Coursera Professional Certificates", "Career-focused professional certificate programmes from industry partners.", "https://www.coursera.org/professional-certificates", "Professional certificates"],
        ["edX Certificates", "Courses and programmes with verified certificate options from partner institutions.", "https://www.edx.org/courses", "Course certificate options vary"],
        ["Codecademy Certification Paths", "Structured paths for preparing for technology and professional certifications.", "https://www.codecademy.com/catalog", "Certification paths"],
        ["SWAYAM", "Explore courses and certificates from India's national online learning platform.", "https://swayam.gov.in/", "India · Provider catalogue"]
      ]
    }
  };
  const config = configs[category];
  panel.hidden = !config;
  if (!config) return;
  $("#learningCatalogTitle").textContent = config.title;
  $("#learningCatalogIntro").textContent = config.intro;
  $("#learningProviderGrid").innerHTML = config.providers.map(([name, description, url, note]) =>
    `<article class="learning-provider-card"><div class="learning-provider-mark">${esc(name.slice(0,1))}</div><div class="learning-provider-copy"><h3>${esc(name)}</h3><p>${esc(description)}</p><small>${esc(note)}</small><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Browse provider ↗</a></div></article>`
  ).join("");
}

function renderEvents() {
  const list = filteredEvents();
  renderLearningCatalog();
  const preview = $("#eventGrid"); const full = $("#eventGridAll");
  if (preview) {
    $("#homeOpportunityCount").textContent = `${events.length} live opportunities · ${list.length} match current filters`;
    const top = list.slice(0,6);
    preview.innerHTML = top.length ? top.map(opportunityCard).join("") : `<div class="loading-card">${db ? (events.length ? "No opportunities match this selection. Explore all opportunities and adjust filters." : "No opportunities have been published yet. New discoveries will appear here automatically.") : "Connect Firebase to load the live opportunity feed."}</div>`;
  }
  if (full) {
    $("#allOpportunityCount").textContent = `${list.length} opportunit${list.length === 1 ? "y" : "ies"} found`;
    $("#allOpportunityHint").textContent = list.length ? "Use the filters above to narrow your search." : "Try removing one or more filters.";
    const shown = list.slice(0,allEventsVisible);
    full.innerHTML = shown.length ? shown.map(opportunityCard).join("") : `<div class="loading-card">${events.length ? "No opportunities match these filters." : "No public opportunities are available yet."}</div>`;
    const pager = $("#eventPagination"); if (pager) pager.hidden = list.length <= allEventsVisible;
  }
  [preview,full].filter(Boolean).forEach(grid => {
    grid.querySelectorAll("[data-save]").forEach(button => button.addEventListener("click", () => saveEvent(button.dataset.save)));
    grid.querySelectorAll("[data-view-event]").forEach(button => button.addEventListener("click", () => viewEvent(button.dataset.viewEvent)));
  });
}
function viewEvent(eventId) {
  const event = events.find(e => e.id === eventId); if (!event) return;
  const cat = eventCategoryValue(event).replace("-"," ");
  const rows = [
    ["Opportunity type",cat], ["Organiser",event.organizer || event.sourceName], ["Country",event.country],
    ["Region / state",event.region || event.state], ["City",event.city], ["Location",event.location],
    ["Format",eventModeValue(event)], ["Track",(event.tracks || []).join(", ")],
    ["Skills / technologies",(event.skills || event.technologies || []).join(", ")], ["Level",event.level],
    ["Course provider",event.courseProvider], ["Course language",event.courseLanguage], ["Instructor",event.courseInstructor],
    ["Team size",event.teamSize], ["Prize",event.prize || (Number(event.prizePool)>0 ? `${event.currency||""} ${event.prizePool}` : "")],
    ["Registration deadline",dateLabel(event.registrationDeadline)], ["Event start",dateLabel(event.startAt)],
    ["Event end",dateLabel(event.endAt)], ["Eligibility",event.eligibility], ["Cost",event.isFree === true ? "Free" : event.price || "Not listed"],
    ["Source",event.sourceName || event.sourcePlatform], ["Source attribution",event.attributionText], ["Verification",event.verificationStatus || "Source attributed"]
  ].filter(([,v]) => v !== null && v !== undefined && String(v).trim() && String(v) !== "Not provided");
  const fullDescription = event.description || event.summary || "The source did not provide a longer description. Open the organiser listing for current requirements and details.";
  const url = validUrl(event.officialRegistrationUrl || event.officialEventUrl || event.sourceUrl);
  $("#eventModalContent").innerHTML = `<div class="event-detail-hero"><span class="detail-category">${esc(cat)}</span><span class="detail-status">${esc(event.verificationStatus || "Source attributed")}</span><h2 id="eventModalTitle">${esc(event.title || "Opportunity details")}</h2><p>${esc(event.organizer || event.sourceName || "Organiser not listed")}</p></div><div class="event-detail-description"><h3>About this opportunity</h3><p>${esc(fullDescription)}</p></div><div class="event-detail-grid">${rows.map(([k,v])=>`<div class="event-detail-fact"><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join("")}</div><div class="event-detail-actions"><button class="btn btn-outline" data-save="${esc(event.id)}">${savedIds.has(event.id)?"♥ Saved":"♡ Save opportunity"}</button>${url ? `<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open organiser / registration page ↗</a>` : ""}</div><small class="event-source-disclaimer">Details are based on the connected source and may change. Confirm requirements and deadlines on the organiser's page.</small>`;
  $("#eventModalContent [data-save]").onclick = () => saveEvent(event.id);
  showModal("eventModal");
}

async function loadSaved() {
  savedIds.clear();
  if (db && currentUser) {
    try { const snap = await getDocs(collection(db, "users", currentUser.uid, "savedEvents")); snap.forEach(d => savedIds.add(d.id)); }
    catch (error) { console.warn("Saved events unavailable", error); }
  }
  renderSaved(); renderEvents();
}
async function saveEvent(eventId) {
  if (!requireAccount()) return;
  const ref = doc(db, "users", currentUser.uid, "savedEvents", eventId);
  try {
    if (savedIds.has(eventId)) { await deleteDoc(ref); savedIds.delete(eventId); toast("Removed from your shortlist."); }
    else { await setDoc(ref, { eventId, savedAt: serverTimestamp() }); savedIds.add(eventId); toast("Saved to your shortlist."); }
    renderSaved(); renderEvents();
  } catch (error) { toast(friendlyError(error)); }
}
function renderSaved() {
  $("#savedCount").textContent = `${savedIds.size} SAVED`;
  const savedEvents = events.filter(e => savedIds.has(e.id));
  const preview = $("#savedPreview");
  if (!preview) return;
  preview.classList.toggle("saved-event-grid", Boolean(savedEvents.length));
  preview.innerHTML = savedEvents.length ? savedEvents.map(opportunityCard).join("") : `<div class="loading-card">${currentUser ? "Your saved opportunities will appear here when you bookmark an event." : "Sign in to save and revisit opportunities."}</div>`;
  preview.querySelectorAll("[data-save]").forEach(button => button.addEventListener("click", () => saveEvent(button.dataset.save)));
  preview.querySelectorAll("[data-view-event]").forEach(button => button.addEventListener("click", () => viewEvent(button.dataset.viewEvent)));
}

function renderPeopleEmpty() { $("#peopleGrid").innerHTML = '<div class="loading-card">Connect Firebase and create a profile to begin discovering teammates.</div>'; }
async function searchPeople() {
  clearTimeout(peopleSearchTimer);
  peopleSearchTimer = setTimeout(async () => {
    if (!db) { renderPeopleEmpty(); return; }
    const term = normalizeSearch($("#peopleSearch").value).replace(/^@/, "");
    const role = $("#peopleRole").value; const lookingOnly = $("#lookingForTeamOnly").checked;
    $("#peopleResultCount").textContent = "Searching public builder profiles…";
    try {
      let snapshots = [];
      if (!term) {
        snapshots = [await getDocs(query(collection(db, "publicProfiles"), orderBy("updatedAt", "desc"), limit(24)))];
      } else {
        const prefixes = ["usernameLower", "nameLower", "collegeLower", "collegeShortLower", "courseLower", "publicEmailLower"];
        const requests = prefixes.map(field => getDocs(query(collection(db, "publicProfiles"), orderBy(field), startAt(term), endAt(term + "\uf8ff"), limit(18))));
        requests.push(getDocs(query(collection(db, "publicProfiles"), where("skillsLower", "array-contains", term), limit(18))));
        requests.push(getDocs(query(collection(db, "publicProfiles"), where("interestsLower", "array-contains", term), limit(18))));
        requests.push(getDocs(query(collection(db, "publicProfiles"), orderBy("updatedAt", "desc"), limit(100))));
        const phoneDigits = term.replace(/\D/g, ""); if (phoneDigits.length >= 7) requests.push(getDocs(query(collection(db, "publicProfiles"), orderBy("publicPhoneDigits"), startAt(phoneDigits), endAt(phoneDigits + "\uf8ff"), limit(18))));
        snapshots = await Promise.all(requests);
      }
      const dedupe = new Map();
      snapshots.forEach(snap => snap.docs.forEach(d => dedupe.set(d.id, { uid: d.id, ...d.data() })));
      people = [...dedupe.values()].filter(p => p.uid !== currentUser?.uid);
      if (role !== "all") people = people.filter(p => (p.rolesInterested || []).some(r => r.toLowerCase() === role.toLowerCase()));
      if (lookingOnly) people = people.filter(p => p.lookingForTeam === true);
      if (term) {
        const digits = term.replace(/\D/g, "");
        people = people.filter(p => fuzzySearchMatch(term, [p.displayName, p.username, p.college, p.collegeShort, p.course, p.publicEmail, p.publicPhone, p.bio, p.city, p.country, ...(p.skills || []), ...(p.rolesInterested || []), ...(p.interests || [])].join(" "))
          || (digits.length >= 7 && String(p.publicPhoneDigits || "").startsWith(digits)));
      }
      populateMemberFilters(); renderPeople();
    } catch (error) { console.error("People search failed", error); $("#peopleResultCount").textContent = "Could not search profiles. Check your Firestore rules and indexes."; $("#peopleGrid").innerHTML = '<div class="loading-card">Profile search is temporarily unavailable.</div>'; }
  }, 220);
}
function overlapScore(profile) {
  if (!publicProfile) return 0;
  const mine = new Set([...(publicProfile.skillsLower || []), ...(publicProfile.interests || []).map(x => x.toLowerCase())]);
  const theirs = [...(profile.skillsLower || []), ...(profile.interests || []).map(x => x.toLowerCase())];
  return theirs.filter(x => mine.has(x)).length;
}
function populateMemberFilters() {
  const options={
    peopleSkillFilter:[...new Set(people.flatMap(p=>p.skills||[]))],
    peopleCollegeFilter:[...new Set(people.map(p=>p.college).filter(Boolean))],
    peopleYearFilter:[...new Set(people.map(p=>p.studyLevel).filter(Boolean))],
    peopleAvailabilityFilter:[...new Set(people.map(p=>p.availability).filter(Boolean))],
    peopleInterestFilter:[...new Set(people.flatMap(p=>p.interests||[]))]
  };
  for(const [id,values] of Object.entries(options)){const el=$("#"+id);if(!el)continue;const selected=el.value;const first=el.options[0];el.innerHTML="";el.add(new Option(first.textContent,"all"));values.sort((x,y)=>String(x).localeCompare(String(y))).slice(0,80).forEach(v=>el.add(new Option(v,v)));el.value=[...el.options].some(o=>o.value===selected)?selected:"all";}
}
function renderPeople() {
  const grid = $("#peopleGrid"); const role = $("#peopleRole").value; const lookingOnly = $("#lookingForTeamOnly").checked;
  const skill=normalizeSearch($("#peopleSkillFilter")?.value||"all"), college=normalizeSearch($("#peopleCollegeFilter")?.value||"all"), year=normalizeSearch($("#peopleYearFilter")?.value||"all"), availability=normalizeSearch($("#peopleAvailabilityFilter")?.value||"all"), interest=normalizeSearch($("#peopleInterestFilter")?.value||"all");
  const filtered=people.filter(p=>(role==="all"||(p.rolesInterested||[]).some(x=>normalizeSearch(x)===normalizeSearch(role)))&&(skill==="all"||(p.skills||[]).some(x=>normalizeSearch(x)===skill))&&(college==="all"||normalizeSearch(p.college)===college)&&(year==="all"||normalizeSearch(p.studyLevel)===year)&&(availability==="all"||normalizeSearch(p.availability)===availability)&&(interest==="all"||(p.interests||[]).some(x=>normalizeSearch(x)===interest))&&(!lookingOnly||p.lookingForTeam===true));
  const sorted = [...filtered].sort((a,b) => overlapScore(b) - overlapScore(a));
  $("#peopleResultCount").textContent = `${sorted.length} builder${sorted.length === 1 ? "" : "s"} found`;
  if (!sorted.length) { grid.innerHTML = '<div class="loading-card">No public profiles match your search yet. Try another skill or keyword.</div>'; return; }
  grid.innerHTML = sorted.map(p => `<article class="person-card"><div class="person-top"><div class="avatar">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div class="person-title"><h3>${esc(p.displayName || "HackStop member")}</h3><span>@${esc(p.username || "member")}</span></div>${p.lookingForTeam ? '<span class="open-pill">Open to team</span>' : ""}</div><p class="person-college">${esc([p.course, p.college].filter(Boolean).join(" · ") || "Education not listed")}</p><p class="person-bio">${esc(p.bio || "This builder has not added a bio yet.")}</p><div class="skill-tags">${(p.skills || []).slice(0,5).map(s => `<span>${esc(s)}</span>`).join("")}</div><div class="person-bottom"><small>${esc(p.availability || "Availability not listed")}</small><div><button class="save-btn" data-view-member="${esc(p.uid)}">View profile</button><button class="register-btn" data-message-member="${esc(p.uid)}">Chat</button><button class="save-btn" data-contact-member="${esc(p.uid)}">Contact</button></div></div></article>`).join("");
  grid.querySelectorAll("[data-view-member]").forEach(b => b.onclick = () => viewMember(b.dataset.viewMember));
  grid.querySelectorAll("[data-message-member]").forEach(b => b.onclick = () => { const p = people.find(x => x.uid === b.dataset.messageMember); if (p) startDirectConversation(p); });
  grid.querySelectorAll("[data-contact-member]").forEach(b => b.onclick = () => contactMember(b.dataset.contactMember));
}
function contactMember(uid,profileOverride=null) {
  const p=profileOverride||people.find(x=>x.uid===uid)||selectedMember;if(!p)return;
  const choices=[];
  if(p.publicEmail)choices.push(`<a class="btn btn-outline contact-option" href="mailto:${esc(p.publicEmail)}">Email ${esc(p.publicEmail)} ↗</a>`);
  if(p.publicPhone)choices.push(`<a class="btn btn-outline contact-option" href="tel:${esc(p.publicPhone)}">Call ${esc(p.publicPhone)} ↗</a>`);
  if(!choices.length){toast("This member has not shared contact details. You can still send a chat message.");return;}
  $("#contactOptionsContent").innerHTML=`<div class="eyebrow">CONTACT OPTIONS</div><h2 id="contactOptionsTitle">Reach ${esc(p.displayName||"this member")}</h2><p class="muted">Only contact methods this member chose to make public are shown here.</p><div class="contact-option-list">${choices.join("")}</div>`;
  showModal("contactOptionsModal");
}
async function viewMember(uid) {
  if (!db) return;
  try {
    const snap = await getDoc(doc(db, "publicProfiles", uid)); if (!snap.exists()) { toast("This profile is no longer available."); return; }
    selectedMember = { uid, ...snap.data() }; const p = selectedMember;
    $("#memberProfilePageContent").innerHTML = `<div class="member-profile-head"><div class="avatar avatar-large">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div><div class="eyebrow">HACKSTOP BUILDER</div><h2>${esc(p.displayName || "Builder")}</h2><p class="member-handle">@${esc(p.username || "member")}</p></div></div><p class="member-bio">${esc(p.bio || "No bio added yet.")}</p><div class="member-facts"><span>${esc([p.course,p.college].filter(Boolean).join(" · ") || "Education not listed")}</span><span>${esc([p.city,p.country].filter(Boolean).join(", ") || "Location not listed")}</span><span>${esc(p.availability || "Availability not listed")}</span></div><h3>Skills ${p.skillLevel ? `· ${esc(p.skillLevel)}` : ""}</h3><div class="skill-tags">${(p.skills || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interested tracks</h3><div class="skill-tags">${(p.tracks || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interested roles</h3><div class="skill-tags">${(p.rolesInterested || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interests</h3><div class="skill-tags">${(p.interests || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><div class="member-contact"><h3>Contact details</h3><p>${p.publicEmail ? `Email: <a href="mailto:${esc(p.publicEmail)}">${esc(p.publicEmail)}</a>` : "Email kept private by this member."}</p><p>${p.publicPhone ? `Phone: <a href="tel:${esc(p.publicPhone)}">${esc(p.publicPhone)}</a>` : "Phone kept private by this member."}</p></div><div class="member-links">${p.github ? `<a href="${esc(validUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}${p.linkedin ? `<a href="${esc(validUrl(p.linkedin))}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}${p.portfolio ? `<a href="${esc(validUrl(p.portfolio))}" target="_blank" rel="noopener">Portfolio ↗</a>` : ""}</div>`;
    const projectSnap = await getDocs(query(collection(db,"projects"),where("ownerUid","==",uid),where("visibility","==","public"),limit(20))).catch(()=>null);
    const publicProjects = projectSnap?.docs.map(d=>({id:d.id,...d.data()})) || [];
    const projectsHtml = `<section class="member-projects"><h3>Public projects</h3>${publicProjects.length?publicProjects.map(x=>`<article class="member-project-item"><strong>${esc(x.title||"Project")}</strong><p>${esc(x.description||"")}</p><div class="skill-tags">${(x.techStack||[]).map(s=>`<span>${esc(s)}</span>`).join("")}</div>${x.projectUrl?`<a href="${esc(validUrl(x.projectUrl))}" target="_blank" rel="noopener">Open project ↗</a>`:""}${x.githubUrl?` · <a href="${esc(validUrl(x.githubUrl))}" target="_blank" rel="noopener">GitHub ↗</a>`:""}</article>`).join(""):'<p class="muted">No public projects listed yet.</p>'}</section>`;
    $("#memberProfilePageContent").insertAdjacentHTML("beforeend", projectsHtml);
    $("#memberPageMessageBtn").onclick = () => startDirectConversation(selectedMember);
    $("#memberPageReportBtn").onclick = () => reportMember(selectedMember);
    $("#memberPageInviteBtn").onclick = () => { if (!requireAccount()) return; toast("Open a group or team and send this builder an invitation."); location.hash="#messages"; };
    $("#memberPageContactBtn").onclick = () => contactMember(uid,selectedMember);
    location.hash = `#member/${encodeURIComponent(uid)}`;
    handleRoute();
  } catch (error) { toast(friendlyError(error)); }
}

function beginNotificationListener() {
  if (!currentUser || !db) return;
  if (stopNotificationListener) stopNotificationListener();
  const notificationQuery=query(collection(db,"users",currentUser.uid,"notifications"),orderBy("createdAt","desc"),limit(100));
  stopNotificationListener=onSnapshot(notificationQuery,snapshot=>{
    currentNotifications=snapshot.docs.map(d=>({id:d.id,...d.data()}));
    renderNotifications();
  },error=>{console.warn("Notifications listener",error);$("#notificationList").innerHTML='<div class="empty-note">Notifications are temporarily unavailable. Check your Firestore rules.</div>';});
}
function agoLabel(value) {
  const ms=tsMillis(value); if(!ms)return "Just now";
  const mins=Math.max(0,Math.floor((Date.now()-ms)/60000));
  if(mins<1)return "Just now"; if(mins<60)return `${mins}m ago`;
  const hours=Math.floor(mins/60); if(hours<24)return `${hours}h ago`;
  const days=Math.floor(hours/24); return days<7?`${days}d ago`:new Date(ms).toLocaleDateString();
}
function renderNotifications() {
  const muted=new Set(privateProfile?.mutedNotificationCategories||[]);
  const unread=currentNotifications.filter(n=>!n.read&&!muted.has(n.category)).length;
  const countEl=$("#notificationUnreadCount"); if(countEl){countEl.textContent=unread>99?"99+":String(unread);countEl.hidden=unread===0;}
  const navCount=$("#navNotificationCount"); if(navCount){navCount.textContent=unread>99?"99+":String(unread);navCount.hidden=unread===0;}
  const list=$("#notificationList"); if(!list)return;
  const rows=currentNotifications.filter(n=>!muted.has(n.category)&&(currentNotificationCategory==="all"||n.category===currentNotificationCategory));
  $$('[data-mute-notification-category]').forEach(input=>{input.checked=muted.has(input.dataset.muteNotificationCategory);});
  if(!rows.length){list.innerHTML='<div class="notification-empty"><span>✧</span><h3>You are all caught up.</h3><p>New invitations and workspace updates will appear here.</p></div>';return;}
  const icons={teams:"✦",chat:"↗",hackathons:"⌁",community:"◎",system:"ⓘ"};
  list.innerHTML=rows.map(n=>{
    const isInvite=n.type==="team_invite"&&n.status!=="expired";
    const expired=tsMillis(n.expiresAt||n.inviteExpiresAt)>0&&tsMillis(n.expiresAt||n.inviteExpiresAt)<Date.now();
    return `<article class="notification-card ${n.read?"":"unread"}" data-notification-card="${esc(n.id)}"><span class="notification-icon">${icons[n.category]||"✧"}</span><div class="notification-copy"><div class="notification-title-row"><strong>${esc(n.title||"HackStop update")}</strong><time>${esc(agoLabel(n.createdAt))}</time></div><p>${esc(n.body||"")}</p>${isInvite?`<div class="notification-actions"><button class="btn btn-primary" data-invite-accept="${esc(n.id)}" ${expired?"disabled":""}>Accept invitation</button><button class="btn btn-outline" data-invite-decline="${esc(n.id)}" ${expired?"disabled":""}>Decline</button></div>${expired?'<small class="notification-expired">This invitation has expired.</small>':""}`:`<div class="notification-actions"><button class="btn btn-outline" data-open-notification="${esc(n.id)}">${esc(n.actionLabel||"Open")}</button></div>`}</div>${n.read?"":'<span class="unread-dot" aria-label="Unread"></span>'}</article>`;
  }).join("");
  list.querySelectorAll("[data-open-notification]").forEach(b=>b.onclick=()=>openNotification(b.dataset.openNotification));
  list.querySelectorAll("[data-invite-accept]").forEach(b=>b.onclick=()=>respondToTeamInvite(b.dataset.inviteAccept,"accepted"));
  list.querySelectorAll("[data-invite-decline]").forEach(b=>b.onclick=()=>respondToTeamInvite(b.dataset.inviteDecline,"declined"));
}
async function openNotification(id) {
  const n=currentNotifications.find(x=>x.id===id); if(!n)return;
  try { if(!n.read)await updateDoc(doc(db,"users",currentUser.uid,"notifications",id),{read:true}); } catch(error){console.warn("Could not mark notification read",error);}
  if(n.type === "group_deleted" || n.type === "team_deleted"){
    location.hash="#messages";
  } else if(n.profileUid){
    location.hash=`#member/${encodeURIComponent(n.profileUid)}`;
    await viewMember(n.profileUid);
  } else if(n.conversationId){
    location.hash="#messages";
    const conversation=currentConversations.find(c=>c.id===n.conversationId);
    if(conversation)selectConversation(conversation); else toast("This conversation is no longer available to your account.");
  } else if(n.eventId){
    location.hash="#opportunities";
    const event=events.find(item=>item.id===n.eventId);
    if(event)viewEvent(n.eventId);else toast("This opportunity is not in the latest loaded feed.");
  } else if(n.targetHash) location.hash=n.targetHash;
}
async function respondToTeamInvite(notificationId,response) {
  if(!requireAccount())return;
  const n=currentNotifications.find(x=>x.id===notificationId); if(!n?.invitationId)return;
  const inviteRef=doc(db,"teamInvitations",n.invitationId);
  try {
    const inviteSnap=await getDoc(inviteRef); if(!inviteSnap.exists())throw new Error("This invitation is no longer available.");
    const invite=inviteSnap.data();
    if(invite.toUid!==currentUser.uid||invite.status!=="pending")throw new Error("This invitation has already been handled.");
    if(tsMillis(invite.expiresAt)&&tsMillis(invite.expiresAt)<Date.now())throw new Error("This invitation has expired.");
    if(response==="accepted"){
      const conversationRef=doc(db,"conversations",invite.conversationId);
      let joinedConversation=null;
      const name=publicProfile?.displayName||currentUser.displayName||"Member";
      await runTransaction(db,async tx=>{
        const [freshInvite,conversationSnap]=await Promise.all([tx.get(inviteRef),tx.get(conversationRef)]);
        if(!freshInvite.exists()||!conversationSnap.exists())throw new Error("The invitation or team is no longer available.");
        const currentInvite=freshInvite.data(), conversation=conversationSnap.data();
        if(currentInvite.status!=="pending"||currentInvite.toUid!==currentUser.uid)throw new Error("This invitation has already been handled.");
        if((conversation.participants||[]).includes(currentUser.uid))throw new Error("You are already a member of this team.");
        const maxMembers=Math.min(10,Number(conversation.teamSize)||10);
        if((conversation.participants||[]).length>=maxMembers)throw new Error(`This ${invite.entityType||"team"} has reached its ${maxMembers}-member limit.`);
        const joinedParticipants=[...(conversation.participants||[]),currentUser.uid]; const joinedNames={...(conversation.participantNames||{}),[currentUser.uid]:name};
        tx.update(conversationRef,{participants:joinedParticipants,participantNames:joinedNames,updatedAt:serverTimestamp(),lastAcceptedInviteId:n.invitationId});
        joinedConversation={id:invite.conversationId,...conversation,participants:joinedParticipants,participantNames:joinedNames};
        tx.update(inviteRef,{status:"accepted",respondedAt:serverTimestamp()});
      });
      await addDoc(collection(db,"users",invite.fromUid,"notifications"),{type:"team_invite_response",category:"teams",title:`${name} joined ${invite.conversationName}`,body:`${name} accepted your invitation and joined the ${invite.entityType||"group"}.`,actorUid:currentUser.uid,actorName:name,conversationId:invite.conversationId,conversationName:invite.conversationName,targetHash:"#messages",invitationId:n.invitationId,createdAt:serverTimestamp(),read:false});
      toast(`You joined ${invite.conversationName}.`);
      const found=currentConversations.find(c=>c.id===invite.conversationId);
      location.hash="#messages"; selectConversation(found || joinedConversation);
    } else {
      await updateDoc(inviteRef,{status:"declined",respondedAt:serverTimestamp()});
      await addDoc(collection(db,"users",invite.fromUid,"notifications"),{type:"team_invite_response",category:"teams",title:`Invitation declined`,body:`${publicProfile?.displayName||currentUser.displayName||"A builder"} declined the invitation to ${invite.conversationName}.`,actorUid:currentUser.uid,actorName:publicProfile?.displayName||currentUser.displayName||"Member",conversationId:invite.conversationId,conversationName:invite.conversationName,targetHash:"#messages",invitationId:n.invitationId,createdAt:serverTimestamp(),read:false});
      toast("Invitation declined.");
    }
    await updateDoc(doc(db,"users",currentUser.uid,"notifications",notificationId),{read:true});
  } catch(error){toast(friendlyError(error));}
}
async function markAllNotificationsRead() {
  if(!requireAccount())return;
  try{await Promise.all(currentNotifications.filter(n=>!n.read).map(n=>updateDoc(doc(db,"users",currentUser.uid,"notifications",n.id),{read:true})));toast("All notifications marked as read.");}
  catch(error){toast(friendlyError(error));}
}
async function clearNotifications() {
  if(!requireAccount()||!currentNotifications.length)return;
  if(!confirm("Clear all notifications from your notification center?"))return;
  try{await Promise.all(currentNotifications.map(n=>deleteDoc(doc(db,"users",currentUser.uid,"notifications",n.id))));toast("Notifications cleared.");}
  catch(error){toast(friendlyError(error));}
}

function detachRealtimeListeners() {
  if (stopInboxListener) stopInboxListener(); if (stopMessageListener) stopMessageListener(); if (stopNotificationListener) stopNotificationListener();
  stopInboxListener = null; stopMessageListener = null; stopNotificationListener = null; activeConversationId = null; activeConversation = null;
  currentNotifications = []; renderNotifications();
}
function beginInboxListener() {
  if (!currentUser || !db) return;
  if (stopInboxListener) stopInboxListener();
  const inboxQuery = query(collection(db, "conversations"), where("participants", "array-contains", currentUser.uid), limit(100));
  stopInboxListener = onSnapshot(inboxQuery, snapshot => {
    const blocked=new Set(privateProfile?.blockedUsers||[]);
    currentConversations = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(c=>c.isGroup||(c.participants||[]).every(uid=>uid===currentUser.uid||!blocked.has(uid))).sort((a,b) => tsMillis(b.updatedAt || b.lastMessageAt) - tsMillis(a.updatedAt || a.lastMessageAt));
    renderConversationList(currentConversations);
    if (activeConversationId) {
      const latest = currentConversations.find(x => x.id === activeConversationId);
      if (latest) { activeConversation = latest; renderChatHeading(); }
    }
  }, error => { console.error("Inbox listener", error); $("#conversationList").innerHTML = '<div class="empty-note">Could not load conversations. Check Firestore rules.</div>'; });
}
function conversationLabel(conversation) {
  if (conversation.isGroup) return conversation.groupName || "Team conversation";
  const names = conversation.participantNames || {};
  const otherUid = (conversation.participants || []).find(uid => uid !== currentUser?.uid);
  return names[otherUid] || "Direct message";
}
function renderConversationList(rows) {
  const term = normalizeSearch($("#conversationSearch")?.value || "");
  const visible = rows.filter(c => fuzzySearchMatch(term,`${conversationLabel(c)} ${c.lastMessage || ""} ${(c.participantNames ? Object.values(c.participantNames) : []).join(" ")}`));
  $("#conversationCount").textContent = String(visible.length);
  const list = $("#conversationList");
  if (!visible.length) { list.innerHTML = `<div class="empty-note">${term ? "No chats match that search." : "No conversations yet. Find a builder and send the first message."}</div>`; return; }
  list.innerHTML = visible.map(c => `<button class="conversation-item ${c.id === activeConversationId ? "selected" : ""}" data-conversation="${esc(c.id)}"><span class="conversation-avatar">${esc(initials(conversationLabel(c)))}</span><span class="conversation-copy"><b>${esc(conversationLabel(c))}</b><small>${esc(c.lastMessage || (c.isGroup ? "Group created" : "Conversation started"))}</small></span><span class="conversation-kind">${c.isGroup ? "GROUP" : "DM"}</span></button>`).join("");
  list.querySelectorAll("[data-conversation]").forEach(b => b.onclick = () => selectConversation(visible.find(c => c.id === b.dataset.conversation)));
}
function renderChatHeading() {
  if (!activeConversation) return;
  $("#chatTitle").textContent = conversationLabel(activeConversation);
  const members = (activeConversation.participants || []).length;
  $("#chatSubtitle").textContent = activeConversation.isGroup ? `${members} members · ${activeConversation.groupName || "Team chat"}` : "Direct conversation · click to view profile";
  const canManage = Boolean(activeConversation.isGroup && (activeConversation.createdBy === currentUser?.uid || (activeConversation.admins || []).includes(currentUser?.uid)));
  $("#groupManageBtn").hidden = !canManage;
}
function selectConversation(conversation) {
  if (!conversation || !currentUser) return;
  activeConversation = conversation; activeConversationId = conversation.id;
  $("#chatPlaceholder").hidden = true; $("#chatActive").hidden = false; renderChatHeading();
  if (stopMessageListener) stopMessageListener();
  const messagesQuery = query(collection(db, "conversations", conversation.id, "messages"), orderBy("createdAt", "desc"), limit(200));
  stopMessageListener = onSnapshot(messagesQuery, snapshot => {
    currentMessages = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
    renderMessages(currentMessages);
  }, error => { console.error("Messages listener", error); $("#messageList").innerHTML = '<div class="empty-note">Could not load messages. Check Firestore rules.</div>'; });
  renderConversationListFromSnapshotSelection();
}
function renderConversationListFromSnapshotSelection() { $$(".conversation-item").forEach(b => b.classList.toggle("selected", b.dataset.conversation === activeConversationId)); }
function renderMessages(messages) {
  const term = normalizeSearch($("#messageSearch")?.value || "");
  const visible = messages.filter(m => !term || fuzzySearchMatch(term,`${m.text||""} ${m.authorName||""}`));
  const box = $("#messageList"); $("#messageSearchCount").textContent = term ? `${visible.length} matches` : `${messages.length} messages`;
  if (!visible.length) { box.innerHTML = `<div class="empty-note message-empty">${term ? "No messages match your search." : "This is the start of the conversation. Say hello."}</div>`; return; }
  box.innerHTML = visible.map(m => {
    const mine = m.authorUid === currentUser?.uid;
    const created = tsMillis(m.createdAt); const time = created ? new Date(created).toLocaleString([], { dateStyle:"short", timeStyle:"short" }) : "Sending…";
    const canEdit = mine && !m.deleted && created && Date.now() - created <= 15*60*1000;
    const reactionMap=m.reactionsByUser||{}; const reactionButtons=["👍","❤️","😂","🎉"].map(emoji=>{const users=Object.entries(reactionMap).filter(([,items])=>Array.isArray(items)&&items.includes(emoji));const mine=(reactionMap[currentUser?.uid]||[]).includes(emoji);return `<button type="button" class="reaction-chip ${mine?"selected":""}" data-react-message="${esc(m.id)}" data-emoji="${emoji}" aria-label="React ${emoji}">${emoji} ${users.length||""}</button>`;}).join("");
    return `<div class="message-row ${mine ? "mine" : "theirs"}"><div class="message-bubble"><small>${mine ? "You" : `<button type="button" class="message-author-link" data-message-profile="${esc(m.authorUid)}">${esc(m.authorName || "Teammate")}</button>`}${m.edited ? " · edited" : ""}</small>${m.replyTo?`<blockquote class="message-reply-quote">Replying to ${esc(m.replyTo.authorName||"message")}: ${esc(m.replyTo.text||"").slice(0,180)}</blockquote>`:""}<p>${m.deleted ? '<span class="deleted-message">This message was deleted.</span>' : esc(m.text || "")}</p>${!m.deleted?`<div class="message-reactions">${reactionButtons}</div>`:""}<div class="message-meta"><time>${esc(time)}</time><span class="message-actions"><button type="button" data-copy-message="${esc(m.id)}">Copy</button>${!m.deleted?`<button type="button" data-reply-message="${esc(m.id)}">Reply</button>${canEdit ? `<button type="button" data-edit-message="${esc(m.id)}">Edit</button><button type="button" data-delete-message="${esc(m.id)}">Delete</button>` : ""}${!mine?`<button type="button" data-report-chat="${esc(m.id)}">Report</button><button type="button" data-block-chat="${esc(m.authorUid)}">Block</button>`:""}`:""}</span></div></div></div>`;
  }).join("");
  box.querySelectorAll("[data-edit-message]").forEach(b => b.onclick = () => editMessage(b.dataset.editMessage));
  box.querySelectorAll("[data-delete-message]").forEach(b => b.onclick = () => deleteMessage(b.dataset.deleteMessage));
  box.querySelectorAll("[data-copy-message]").forEach(b => b.onclick = () => copyMessage(b.dataset.copyMessage));
  box.querySelectorAll("[data-reply-message]").forEach(b => b.onclick = () => setReply(b.dataset.replyMessage));
  box.querySelectorAll("[data-react-message]").forEach(b => b.onclick = () => toggleMessageReaction(b.dataset.reactMessage,b.dataset.emoji));
  box.querySelectorAll("[data-message-profile]").forEach(b => b.onclick = () => viewMember(b.dataset.messageProfile));
  box.querySelectorAll("[data-report-chat]").forEach(b => b.onclick = () => reportChatMessage(b.dataset.reportChat));
  box.querySelectorAll("[data-block-chat]").forEach(b => b.onclick = () => blockChatUser(b.dataset.blockChat));
  box.scrollTop = box.scrollHeight;
}
async function copyMessage(messageId) {
  const message=currentMessages.find(m=>m.id===messageId); if(!message||message.deleted)return;
  try { await navigator.clipboard.writeText(message.text||""); toast("Message copied."); }
  catch { toast("Clipboard access is unavailable in this browser."); }
}
function setReply(messageId) {
  const message=currentMessages.find(m=>m.id===messageId); if(!message||message.deleted)return;
  replyingToMessage=message; $("#replyingToText").textContent=`Replying to ${message.authorName||"message"}: ${(message.text||"").slice(0,100)}`;
  $("#replyingToBar").hidden=false; $("#messageText").focus();
}
async function toggleMessageReaction(messageId,emoji) {
  const ref=doc(db,"conversations",activeConversationId,"messages",messageId);
  try { await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())return;const data=snap.data(),map={...(data.reactionsByUser||{})},mine=[...(map[currentUser.uid]||[])];const i=mine.indexOf(emoji);if(i>=0)mine.splice(i,1);else if(mine.length<4)mine.push(emoji);if(mine.length)map[currentUser.uid]=mine;else delete map[currentUser.uid];tx.update(ref,{reactionsByUser:map});}); }
  catch(error){toast(friendlyError(error));}
}
async function reportChatMessage(messageId) {
  const message=currentMessages.find(m=>m.id===messageId);if(!message||message.authorUid===currentUser?.uid||!requireAccount())return;
  const details=prompt("Tell us why this message should be reviewed:");if(!details?.trim())return;
  try{await addDoc(collection(db,"reports"),{createdBy:currentUser.uid,targetUid:message.authorUid,targetName:message.authorName||"Member",category:"chat-message",details:`Message: ${(message.text||"").slice(0,500)}\nReason: ${details.trim().slice(0,500)}`,status:"new",createdAt:serverTimestamp()});toast("Message reported to the HackStop moderation team.");}
  catch(error){toast(friendlyError(error));}
}
async function blockChatUser(uid) {
  if(!uid||uid===currentUser?.uid||!requireAccount())return;
  const name=currentMessages.find(m=>m.authorUid===uid)?.authorName||"this member";
  if(!confirm(`Block ${name}? Their direct messages will be hidden and new direct messages will be denied.`))return;
  try{await updateDoc(doc(db,"users",currentUser.uid),{blockedUsers:arrayUnion(uid)});privateProfile={...(privateProfile||{}),blockedUsers:[...new Set([...(privateProfile?.blockedUsers||[]),uid])]};if(activeConversation&&!activeConversation.isGroup&&(activeConversation.participants||[]).includes(uid)){if(stopMessageListener)stopMessageListener();stopMessageListener=null;activeConversation=null;activeConversationId=null;currentMessages=[];$("#chatActive").hidden=true;$("#chatPlaceholder").hidden=false;}currentConversations=currentConversations.filter(c=>c.isGroup||(c.participants||[]).every(x=>x===currentUser.uid||x!==uid));renderConversationList(currentConversations);toast("Member blocked.");}
  catch(error){toast(friendlyError(error));}
}
async function editMessage(messageId) {
  const message = currentMessages.find(m => m.id === messageId); if (!message || message.authorUid !== currentUser?.uid) return;
  const created = tsMillis(message.createdAt); if (!created || Date.now()-created > 15*60*1000) { toast("Messages can only be edited within 15 minutes."); return; }
  const text = prompt("Edit your message:", message.text || ""); if (text === null) return;
  const next = text.trim(); if (!next || next.length > 2000) { toast("Message must contain 1–2,000 characters."); return; }
  try { await updateDoc(doc(db,"conversations",activeConversationId,"messages",messageId), { text: next, edited: true, editedAt: serverTimestamp() }); toast("Message updated."); }
  catch (error) { toast(friendlyError(error)); }
}
async function deleteMessage(messageId) {
  const message = currentMessages.find(m => m.id === messageId); if (!message || message.authorUid !== currentUser?.uid) return;
  const created = tsMillis(message.createdAt); if (!created || Date.now()-created > 15*60*1000) { toast("Messages can only be deleted within 15 minutes."); return; }
  if (!confirm("Delete this message for everyone in the conversation?")) return;
  try { await updateDoc(doc(db,"conversations",activeConversationId,"messages",messageId), { text: "This message was deleted.", deleted: true, deletedAt: serverTimestamp() }); toast("Message deleted."); }
  catch (error) { toast(friendlyError(error)); }
}
async function openChatIdentity() {
  if (!activeConversation) return;
  if (activeConversation.isGroup) { openGroupManager(); return; }
  const uid = (activeConversation.participants || []).find(x => x !== currentUser?.uid);
  if (uid) await viewMember(uid);
}
async function openGroupManager() {
  if (!activeConversation?.isGroup) return;
  const canManage = activeConversation.createdBy === currentUser?.uid || (activeConversation.admins || []).includes(currentUser?.uid);
  const entityWord=activeConversation.entityType==="team"?"team":"group";
  $("#manageGroupTitle").textContent = `Manage ${activeConversation.groupName || entityWord}`;
  $("#openDeleteGroupBtn").hidden = activeConversation.createdBy !== currentUser?.uid;
  $("#openDeleteGroupBtn").textContent = `Delete ${entityWord}`;
  const rows = await Promise.all((activeConversation.participants || []).map(async uid => {
    try { const snap = await getDoc(doc(db,"publicProfiles",uid)); return { uid, isPublic: snap.exists(), ...(snap.exists()?snap.data():{}) }; }
    catch { return { uid, isPublic: false, displayName: activeConversation.participantNames?.[uid] || "Member" }; }
  }));
  $("#manageGroupMembers").innerHTML = rows.map(p => `<div class="group-member-row"><div>${p.isPublic ? `<button type="button" class="group-member-profile-link" data-view-group-member="${esc(p.uid)}">${esc(p.displayName || "Member")}</button>` : `<b>${esc(p.displayName || "Private member")}</b>`}<small>@${esc(p.username || "member")} ${p.uid === activeConversation.createdBy ? "· Group owner" : ""}</small></div>${p.uid===currentUser?.uid&&p.uid!==activeConversation.createdBy&&!(activeConversation.admins||[]).includes(p.uid) ? `<button class="text-danger" data-leave-group>Leave</button>` : canManage && (activeConversation.participants || []).length > 2 && p.uid !== activeConversation.createdBy ? `<button class="text-danger" data-remove-group-member="${esc(p.uid)}">Remove</button>` : ""}</div>`).join("");
  $("#manageGroupMembers").querySelectorAll("[data-remove-group-member]").forEach(b => b.onclick = () => removeGroupMember(b.dataset.removeGroupMember));
  $("#manageGroupMembers").querySelector("[data-leave-group]")?.addEventListener("click", leaveActiveGroup);
  $("#manageGroupMembers").querySelectorAll("[data-view-group-member]").forEach(b => b.onclick = () => viewMember(b.dataset.viewGroupMember));
  $("#manageGroupSearch").disabled = !canManage;
  $("#manageGroupSearchResults").innerHTML = canManage ? '<p class="muted">Search for a builder to add to this group.</p>' : '<p class="muted">Only group admins can add or remove members.</p>';
  showModal("manageGroupModal");
}
async function leaveActiveGroup() {
  const c=activeConversation; if(!c?.isGroup||!currentUser||c.createdBy===currentUser.uid||(c.admins||[]).includes(currentUser.uid))return;
  if(!confirm(`Leave ${c.entityType==="team"?"this team":"this group"}? You will no longer be able to read its messages.`))return;
  try {
    const participants=(c.participants||[]).filter(uid=>uid!==currentUser.uid);
    const participantNames={...(c.participantNames||{})}; delete participantNames[currentUser.uid];
    await updateDoc(doc(db,"conversations",c.id),{participants,participantNames,updatedAt:serverTimestamp()});
    hideModal("manageGroupModal"); if(stopMessageListener)stopMessageListener(); stopMessageListener=null; activeConversation=null; activeConversationId=null; currentMessages=[];
    $("#chatActive").hidden=true; $("#chatPlaceholder").hidden=false;
    currentConversations=currentConversations.filter(item=>item.id!==c.id); renderConversationList(currentConversations); toast(`You left ${c.groupName||"the group"}.`);
  } catch(error){toast(friendlyError(error));}
}

function openDeleteGroupConfirmation() {
  if(!activeConversation?.isGroup||activeConversation.createdBy!==currentUser?.uid){toast("Only the creator can delete this group or team.");return;}
  const isTeam=activeConversation.entityType==="team", phrase=isTeam?"DELETE TEAM":"DELETE GROUP";
  $("#deleteGroupTitle").textContent=isTeam?"Delete this team?":"Delete this group?";
  $("#deleteGroupDescription").textContent=`This is permanent. It removes the ${isTeam?"team":"group"} conversation, member list and message history, and sends a notification to each current member.`;
  $("#deleteGroupPhraseLabel").textContent=phrase; $("#deleteGroupPhrase").value=""; $("#confirmDeleteGroupBtn").disabled=true; $("#deleteGroupMessage").textContent="";
  showModal("deleteGroupModal");
}
async function deleteActiveGroup() {
  if(!activeConversation?.isGroup||activeConversation.createdBy!==currentUser?.uid)return;
  const c=activeConversation, isTeam=c.entityType==="team", phrase=isTeam?"DELETE TEAM":"DELETE GROUP";
  if($("#deleteGroupPhrase").value!==phrase)return;
  const btn=$("#confirmDeleteGroupBtn");btn.disabled=true;btn.textContent="Deleting…";
  try {
    for(const uid of c.participants||[]){
      if(uid===currentUser.uid)continue;
      await addDoc(collection(db,"users",uid,"notifications"),{type:isTeam?"team_deleted":"group_deleted",category:"teams",title:`${isTeam?"Team":"Group"} deleted`,body:`${publicProfile?.displayName||currentUser.displayName||"The creator"} deleted ${c.groupName||"the conversation"}.`,actorUid:currentUser.uid,actorName:publicProfile?.displayName||currentUser.displayName||"Creator",conversationId:c.id,conversationName:c.groupName||"",targetHash:"#messages",createdAt:serverTimestamp(),read:false});
    }
    await addDoc(collection(db,"auditLogs"),{action:isTeam?"team_deleted":"group_deleted",actorUid:currentUser.uid,conversationId:c.id,conversationName:c.groupName||"",affectedUsers:c.participants||[],createdAt:serverTimestamp()});
    const messagesRef=collection(db,"conversations",c.id,"messages");
    while(true){const batch=await getDocs(query(messagesRef,limit(250)));if(batch.empty)break;await Promise.all(batch.docs.map(d=>deleteDoc(d.ref)));}
    await deleteDoc(doc(db,"conversations",c.id));
    hideModal("deleteGroupModal");hideModal("manageGroupModal");
    if(stopMessageListener)stopMessageListener();stopMessageListener=null;activeConversation=null;activeConversationId=null;currentMessages=[];
    $("#chatActive").hidden=true;$("#chatPlaceholder").hidden=false;location.hash="#messages";toast(`${isTeam?"Team":"Group"} deleted.`);
  }catch(error){$("#deleteGroupMessage").textContent=friendlyError(error);btn.disabled=false;}
  finally{btn.textContent="Delete permanently";}
}

async function searchPublicProfiles(term, max=50) {
  const t = normalizeSearch(term).replace(/^@/, "");
  const base = collection(db, "publicProfiles");
  let snapshots = [];
  if (!t) {
    snapshots = [await getDocs(query(base, orderBy("updatedAt", "desc"), limit(max)))];
  } else {
    const fields = ["usernameLower", "nameLower", "collegeLower", "collegeShortLower", "courseLower", "publicEmailLower"];
    const requests = fields.map(field => getDocs(query(base, orderBy(field), startAt(t), endAt(t + "\uf8ff"), limit(30))));
    requests.push(getDocs(query(base, where("skillsLower", "array-contains", t), limit(30))));
    requests.push(getDocs(query(base, where("interestsLower", "array-contains", t), limit(30))));
    requests.push(getDocs(query(base, orderBy("updatedAt","desc"), limit(max))));
    const digits = t.replace(/\D/g, "");
    if (digits.length >= 7) requests.push(getDocs(query(base, orderBy("publicPhoneDigits"), startAt(digits), endAt(digits + "\uf8ff"), limit(30))));
    snapshots = await Promise.all(requests);
  }
  const merged = new Map();
  snapshots.forEach(snapshot => snapshot.docs.forEach(d => merged.set(d.id, { uid: d.id, ...d.data() })));
  return [...merged.values()]
    .filter(p => p.uid !== currentUser?.uid)
    .filter(p => !t || [p.displayName,p.username,p.college,p.collegeShort,p.course,p.publicEmail,p.publicPhone,p.bio,...(p.skills||[]),...(p.rolesInterested||[]),...(p.interests||[])].join(" ").toLowerCase().includes(t)
      || (t.replace(/\D/g, "").length >= 7 && String(p.publicPhoneDigits || "").startsWith(t.replace(/\D/g, ""))))
    .slice(0, max);
}
async function addGroupMember(uid) {
  if (!activeConversation?.isGroup) return;
  const c = activeConversation; const canManage = c.createdBy === currentUser?.uid || (c.admins || []).includes(currentUser?.uid);
  if (!canManage) { toast("Only group admins can invite members."); return; }
  try {
    const snap = await getDoc(doc(db,"publicProfiles",uid)); if (!snap.exists()) throw new Error("Profile unavailable.");
    const profile=snap.data(); const already=(c.participants||[]).length; const maxMembers=Math.min(10,Number(c.teamSize)||10); if(already>=maxMembers){toast(`This ${c.entityType||"group"} has reached its ${maxMembers}-member limit.`);return;}
    const pending=await getDocs(query(collection(db,"teamInvitations"),where("conversationId","==",c.id),where("fromUid","==",currentUser.uid),where("toUid","==",uid),where("status","==","pending"),limit(1)));
    if(!pending.empty){toast("An invitation is already pending for this builder.");return;}
    const invitationRef=doc(collection(db,"teamInvitations"));
    const invite={conversationId:c.id,conversationName:c.groupName||"HackStop team",entityType:c.entityType||"group",fromUid:currentUser.uid,fromName:publicProfile?.displayName||currentUser.displayName||"A HackStop member",toUid:uid,toName:profile.displayName||"Member",requiredSkills:c.requiredSkills||[],teamSize:c.teamSize||10,status:"pending",createdAt:serverTimestamp(),expiresAt:new Date(Date.now()+7*24*60*60*1000)};
    await setDoc(invitationRef,invite);
    await addDoc(collection(db,"users",uid,"notifications"),{type:"team_invite",category:"teams",title:`Invitation to ${invite.conversationName}`,body:`${invite.fromName} invited you to join ${invite.entityType}. Skills: ${(invite.requiredSkills||[]).join(", ")||"not specified"}. Team size: ${invite.teamSize}. Accept to join.`,actorUid:currentUser.uid,actorName:invite.fromName,conversationId:c.id,conversationName:invite.conversationName,invitationId:invitationRef.id,expiresAt:invite.expiresAt,targetHash:"#notifications",createdAt:serverTimestamp(),read:false});
    toast("Invitation sent. The builder must accept before joining.");
  } catch (error) { toast(friendlyError(error)); }
}
async function removeGroupMember(uid) {
  const c = activeConversation; if (!c?.isGroup || uid === c.createdBy) return;
  const canManage = c.createdBy === currentUser?.uid || (c.admins || []).includes(currentUser?.uid);
  if (!canManage || !confirm("Remove this person from the group? They will lose access to this chat.")) return;
  try {
    const participants = (c.participants||[]).filter(x => x !== uid); const participantNames = { ...(c.participantNames||{}) }; delete participantNames[uid];
    await updateDoc(doc(db,"conversations",c.id),{participants,participantNames,updatedAt:serverTimestamp()});
    activeConversation = { ...c, participants, participantNames }; renderChatHeading(); await openGroupManager(); toast("Member removed.");
  } catch (error) { toast(friendlyError(error)); }
}

async function reportMember(profile) {
  if (!requireAccount() || !profile?.uid) return;
  const details = prompt(`Briefly explain why you are reporting @${profile.username || "this member"} (max 1,000 characters):`);
  if (!details || !details.trim()) return;
  try {
    await addDoc(collection(db, "reports"), {
      createdBy: currentUser.uid, targetUid: profile.uid, targetName: profile.displayName || "Member",
      category: "profile", details: details.trim().slice(0, 1000), status: "new", createdAt: serverTimestamp()
    });
    toast("Report submitted. Thank you for helping keep the community safe.");
  } catch (error) { toast(friendlyError(error)); }
}

async function startDirectConversation(profile) {
  if (!requireAccount()) return;
  if (!profile?.uid || profile.uid === currentUser.uid) { toast("You cannot start a chat with your own account."); return; }
  if((privateProfile?.blockedUsers||[]).includes(profile.uid)){toast("You have blocked this member. Unblock them before starting a chat.");return;}
  try {
    const participants = [currentUser.uid, profile.uid].sort();
    const inbox = await getDocs(query(collection(db, "conversations"), where("participants", "array-contains", currentUser.uid)));
    const existing = inbox.docs.find(d => { const c = d.data(); return !c.isGroup && Array.isArray(c.participants) && c.participants.length === 2 && c.participants.includes(profile.uid); });
    const conversationId = existing?.id || `dm_${participants.map(encodeURIComponent).join("_")}`;
    const participantNames = { [currentUser.uid]: publicProfile?.displayName || currentUser.displayName || "Member", [profile.uid]: profile.displayName || "Member" };
    const conversation = existing ? { id: existing.id, ...existing.data() } : {
      id: conversationId, isGroup: false, participants, participantNames,
      groupName: "", lastMessage: "", createdAt: null, updatedAt: null, lastMessageAt: null
    };
    if (!existing) await setDoc(doc(db, "conversations", conversationId), {
      isGroup: false, participants, participantNames, groupName: "", lastMessage: "",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessageAt: serverTimestamp()
    });
    location.hash = "#messages";
    selectConversation(conversation);
  } catch (error) { console.error(error); toast(friendlyError(error)); }
}
async function sendMessage(event) {
  event.preventDefault(); if (!requireAccount() || !activeConversationId) { toast("Choose a conversation first."); return; }
  const text = $("#messageText").value.trim(); if (!text) return;
  if(!activeConversation.isGroup&&(activeConversation.participants||[]).some(uid=>uid!==currentUser.uid&&(privateProfile?.blockedUsers||[]).includes(uid))){toast("You have blocked this member. Unblock them from account settings to message again.");return;}
  if (text.length > 2000) { toast("Messages must be 2,000 characters or fewer."); return; }
  const sendButton = $("#messageForm button"); sendButton.disabled = true;
  try {
    const conversationRef = doc(db, "conversations", activeConversationId);
    const authorName=publicProfile?.displayName || currentUser.displayName || "Member";
    await addDoc(collection(conversationRef, "messages"), { authorUid: currentUser.uid, authorName, text, createdAt: serverTimestamp(), ...(replyingToMessage?{replyTo:{messageId:replyingToMessage.id,authorUid:replyingToMessage.authorUid,authorName:replyingToMessage.authorName||"Member",text:(replyingToMessage.text||"").slice(0,180)}:{}) });
    await updateDoc(conversationRef, { lastMessage: text.slice(0, 180), lastMessageSender: currentUser.uid, lastMessageAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await Promise.allSettled((activeConversation.participants||[]).filter(uid=>uid!==currentUser.uid).map(uid=>addDoc(collection(db,"users",uid,"notifications"),{type:"chat_message",category:"chat",title:`New message from ${authorName}`,body:text.slice(0,140),actorUid:currentUser.uid,actorName:authorName,conversationId:activeConversationId,conversationName:conversationLabel(activeConversation),targetHash:"#messages",createdAt:serverTimestamp(),read:false})));
    $("#messageText").value = ""; replyingToMessage=null; $("#replyingToBar").hidden=true; $("#replyingToText").textContent="";
  } catch (error) { console.error(error); toast(friendlyError(error)); }
  finally { sendButton.disabled = false; }
}
function refreshSelectedGroupMembers() {
  $("#groupMembers").value = [...selectedGroupMembers.values()].map(p => p.username).join(",");
  $("#groupSelectedMembers").innerHTML = selectedGroupMembers.size ? [...selectedGroupMembers.values()].map(p => `<span class="selected-member-chip">${esc(p.displayName || p.username)} <button type="button" data-unselect-group-member="${esc(p.uid)}" aria-label="Remove ${esc(p.displayName||p.username)}">×</button></span>`).join("") : "No members selected yet.";
  $("#groupSelectedMembers").querySelectorAll("[data-unselect-group-member]").forEach(b => b.onclick = () => { selectedGroupMembers.delete(b.dataset.unselectGroupMember); refreshSelectedGroupMembers(); });
}
async function searchGroupPicker() {
  if (!requireAccount()) return;
  const term = $("#groupMemberSearch").value.trim(); $("#groupMemberResults").innerHTML = '<p class="muted">Searching…</p>';
  try {
    const profiles = await searchPublicProfiles(term,100);
    $("#groupMemberResults").innerHTML = profiles.slice(0,24).map(p => `<button type="button" class="member-picker-option ${selectedGroupMembers.has(p.uid)?"chosen":""}" data-pick-group-member="${esc(p.uid)}"><span><b>${esc(p.displayName||"Member")}</b><small>@${esc(p.username||"member")} · ${esc(p.collegeShort||p.college||"College not listed")}</small></span><strong>${selectedGroupMembers.has(p.uid)?"Selected":"＋ Add"}</strong></button>`).join("") || '<p class="muted">No matching discoverable builders found.</p>';
    $("#groupMemberResults").querySelectorAll("[data-pick-group-member]").forEach(b => b.onclick = () => { const p=profiles.find(x=>x.uid===b.dataset.pickGroupMember); if(!p)return; if(selectedGroupMembers.has(p.uid))selectedGroupMembers.delete(p.uid); else if(selectedGroupMembers.size<9)selectedGroupMembers.set(p.uid,p); else toast("Choose up to 9 other members (10 total with you)."); refreshSelectedGroupMembers(); searchGroupPicker(); });
  } catch (error) { $("#groupMemberResults").textContent = friendlyError(error); }
}
async function createGroupWithMembers(groupName, peopleToAdd, entityType = "group", metadata = {}) {
  if (!requireAccount()) return;
  const unique = [...new Map((peopleToAdd || []).filter(p => p?.uid && p.uid !== currentUser.uid).map(p => [p.uid, p])).values()];
  if (!unique.length) { toast("Choose at least one builder to invite."); return; }
  if (unique.length > 9) { toast("HackStop groups and teams can have up to 10 members including the creator."); return; }
  const participants = [currentUser.uid];
  const participantNames = { [currentUser.uid]: publicProfile?.displayName || currentUser.displayName || "Member" };
  const conversationRef = doc(collection(db,"conversations"));
  await setDoc(conversationRef,{isGroup:true,entityType,groupName,participants,participantNames,createdBy:currentUser.uid,admins:[currentUser.uid],lastMessage:"Invitations sent · waiting for members to accept",createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastMessageAt:serverTimestamp(),...(entityType==="team"?metadata:{})});
  const expiresAt = new Date(Date.now() + 7*24*60*60*1000);
  for (const person of unique) {
    const invitationRef = doc(collection(db,"teamInvitations"));
    const invite = { conversationId:conversationRef.id, conversationName:groupName, entityType, fromUid:currentUser.uid, fromName:publicProfile?.displayName || currentUser.displayName || "A HackStop member", toUid:person.uid, toName:person.displayName || "Member", requiredSkills:metadata.requiredSkills||normalizedList($("#teamNeededSkills")?.value || ""), teamSize:Number(metadata.teamSize)||Number($("#teamSize")?.value)||Math.min(10,unique.length+1), status:"pending", createdAt:serverTimestamp(), expiresAt };
    await setDoc(invitationRef, invite);
    await addDoc(collection(db,"users",person.uid,"notifications"), { type:"team_invite", category:"teams", title:`Invitation to ${groupName}`, body:`${invite.fromName} invited you to join ${entityType === "team" ? "the team" : "the group"}. Skills: ${(invite.requiredSkills||[]).join(", ")||"not specified"}. Target size: ${invite.teamSize}. ${metadata.teamHackathon?`Hackathon: ${metadata.teamHackathon}. `:""}Availability: ${metadata.availability||"flexible"}. Accept to join.`, actorUid:currentUser.uid, actorName:invite.fromName, conversationId:conversationRef.id, conversationName:groupName, invitationId:invitationRef.id, expiresAt, targetHash:"#notifications", createdAt:serverTimestamp(), read:false });
  }
  const conversation = {id:conversationRef.id,isGroup:true,entityType,groupName,participants,participantNames,createdBy:currentUser.uid,admins:[currentUser.uid],lastMessage:`${unique.length} invitation${unique.length===1?"":"s"} sent`,updatedAt:Date.now()};
  location.hash="#messages"; selectConversation(conversation); toast(`${unique.length} invitation${unique.length===1?"":"s"} sent. Members join only after they accept.`);
}

async function createGroup(event) {
  event.preventDefault(); if (!requireAccount()) return;
  const groupName = $("#groupName").value.trim(); const msg = $("#groupMessage"); msg.textContent = "Creating your group…";
  const chosen = [...selectedGroupMembers.values()];
  if (!groupName) { msg.textContent="Enter a group name."; return; }
  if (!chosen.length) { msg.textContent="Search and select at least one member."; return; }
  try {
    await createGroupWithMembers(groupName,chosen,"group");
    hideModal("groupModal"); $("#groupForm").reset(); selectedGroupMembers.clear(); refreshSelectedGroupMembers();
  } catch (error) { console.error(error); msg.textContent = friendlyError(error); }
}
async function searchManageGroupMembers() {
  if (!activeConversation?.isGroup) return;
  const c=activeConversation; const canManage=c.createdBy===currentUser?.uid||(c.admins||[]).includes(currentUser?.uid);
  if(!canManage)return;
  const term=$("#manageGroupSearch").value.trim();
  try {
    const results=await searchPublicProfiles(term,100); const existing=new Set(c.participants||[]);
    $("#manageGroupSearchResults").innerHTML=results.filter(p=>!existing.has(p.uid)).slice(0,20).map(p=>`<button type="button" class="member-picker-option" data-add-group-member="${esc(p.uid)}"><span><b>${esc(p.displayName||"Member")}</b><small>@${esc(p.username||"member")} · ${esc(p.collegeShort||p.college||"College not listed")}</small></span><strong>＋ Add</strong></button>`).join("")||'<p class="muted">No new members match this search.</p>';
    $("#manageGroupSearchResults").querySelectorAll("[data-add-group-member]").forEach(b=>b.onclick=()=>addGroupMember(b.dataset.addGroupMember));
  }catch(error){$("#manageGroupSearchResults").textContent=friendlyError(error);}
}
async function runSmartTeamMatch(event) {
  event.preventDefault(); if(!requireAccount())return;
  if(!publicProfile){toast("Complete your profile first so team matching has your skills.");return;}
  const needed=normalizedList($("#teamNeededSkills").value); const size=Number($("#teamSize").value)||4; const name=$("#teamProjectName").value.trim(); const availability=$("#teamAvailability").value;
  if(!needed.length){toast("Add the skills or roles you need.");return;} if(!availability){toast("Choose the team availability so suggested members know the commitment.");return;}
  $("#teamMatchResults").innerHTML='<p class="muted">Finding complementary builders…</p>'; $("#createMatchedTeamBtn").hidden=true; matchedTeamCandidates=[];
  try{
    const profiles=await searchPublicProfiles("",150);
    const relatedSkillMap={react:["javascript","next.js","typescript","frontend development","tailwind css"],javascript:["react","next.js","node.js","typescript"],python:["django","fastapi","machine learning","data science"],figma:["ui/ux","user experience","product design"],"machine learning":["python","pytorch","tensorflow","data science"],node:["node.js","express","javascript","backend"],"node.js":["node","express","javascript","backend"],flutter:["dart","mobile development"],firebase:["firestore","authentication","cloud functions"]};
    const scored=profiles.map(p=>{
      const skills=[...(p.skills||[]),...(p.rolesInterested||[]),...(p.interests||[])].map(normalizeSearch);
      const fields=[...skills,p.bio||""].join(" ").toLowerCase();
      const matched=needed.filter(skill=>skills.some(x=>x===skill)||fields.includes(skill));
      const related=needed.filter(skill=>!matched.includes(skill)&&(relatedSkillMap[skill]||[]).some(alias=>skills.some(x=>x.includes(alias))));
      const score=Math.min(1,(matched.length+related.length*.6)/needed.length);
      const reasons=[...matched.map(x=>`Knows ${x}`),...related.map(x=>`Related experience for ${x}`)];
      if(p.availability&&normalizeSearch(p.availability)===normalizeSearch(availability))reasons.push(`Availability matches: ${p.availability}`);
      if($("#teamPreferredLevel").value&&p.skillLevel&&normalizeSearch($("#teamPreferredLevel").value)===normalizeSearch(p.skillLevel))reasons.push(`Skill level matches: ${p.skillLevel}`);
      if($("#teamCollege").value.trim()&&p.college&&normalizeSearch($("#teamCollege").value)===normalizeSearch(p.college))reasons.push("College preference matches");
      if(publicProfile?.college&&p.college&&normalizeSearch(p.college)===normalizeSearch(publicProfile.college))reasons.push("Same college");
      return {...p,matchScore:score,matchedSkills:matched,relatedSkills:related,matchReasons:reasons};
    }).filter(p=>p.matchScore>0).sort((a,b)=>b.matchScore-a.matchScore||overlapScore(b)-overlapScore(a)).slice(0,Math.max(20,(size-1)*4));
    matchedTeamCandidates=scored.slice(0,size-1);
    $("#teamMatchResults").innerHTML=matchedTeamCandidates.length?matchedTeamCandidates.map(p=>`<label class="team-match-option"><input type="checkbox" data-team-match="${esc(p.uid)}" checked><span><b>${esc(p.displayName||"Builder")}</b><small>@${esc(p.username||"member")} · ${esc(p.collegeShort||p.college||"College not listed")}</small><span class="skill-tags">${(p.skills||[]).slice(0,5).map(x=>`<i>${esc(x)}</i>`).join("")}</span><small>Exact: ${esc(p.matchedSkills.join(", ")||"—")} · Related: ${esc(p.relatedSkills.join(", ")||"—")} · ${Math.round(p.matchScore*100)}% match</small><small>${esc(p.matchReasons.slice(0,3).join(" · "))}</small></span></label>`).join(""):'<p class="muted">No matching builders are available yet. Try broader roles or skills.</p>';
    $("#teamMatchResults").dataset.teamName=name;
    $("#createMatchedTeamBtn").hidden=!matchedTeamCandidates.length;
  }catch(error){$("#teamMatchResults").textContent=friendlyError(error);}
}
async function createMatchedTeam() {
  const selected=[...$("#teamMatchResults").querySelectorAll("[data-team-match]:checked")].map(b=>matchedTeamCandidates.find(p=>p.uid===b.dataset.teamMatch)).filter(Boolean);
  if(!selected.length){toast("Select at least one builder.");return;}
  try{const metadata={requiredSkills:normalizedList($("#teamNeededSkills").value),teamSize:Number($("#teamSize").value)||4,availability:$("#teamAvailability").value,preferredLevel:$("#teamPreferredLevel").value,teamCollege:$("#teamCollege").value.trim(),teamYear:$("#teamYear").value,teamCourse:$("#teamCourse").value.trim(),teamLocation:$("#teamLocation").value.trim(),teamHackathon:$("#teamHackathon").value.trim(),teamCommunication:$("#teamCommunication").value,teamVisibility:$("#teamVisibility").value,teamJoinMode:$("#teamJoinMode").value,teamDescription:$("#teamDescription").value.trim(),teamIdea:$("#teamIdea").value.trim()};await createGroupWithMembers($("#teamProjectName").value.trim()||"HackStop project team",selected,"team",metadata);hideModal("teamBuilderModal");}
  catch(error){toast(friendlyError(error));}
}

function renderMyProfile() {
  const panel = $("#myProfilePanel");
  if (!currentUser || !publicProfile) {
    panel.innerHTML = `<div class="profile-empty"><div class="placeholder-icon">◎</div><h3>${currentUser ? "Complete your builder profile." : "Your profile starts here."}</h3><p>${currentUser ? "Add your skills, college, interests, and preferred team roles." : "Sign in and complete your builder profile to be discoverable by teammates."}</p><button class="btn btn-primary" id="profileStartInline">${currentUser ? "Complete profile" : "Sign in to create profile"}</button></div>`;
    $("#profileStartInline").onclick = () => currentUser ? openProfileEditor(false) : openAuth();
    return;
  }
  const p = publicProfile;
  panel.innerHTML = `<div class="profile-overview"><div class="avatar avatar-profile">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div class="profile-main"><div class="profile-name-line"><div><div class="eyebrow">${p.profileVisibility === "private" ? "YOUR PRIVATE BUILDER PROFILE" : "YOUR PUBLIC BUILDER PROFILE"}</div><h3>${esc(p.displayName)}</h3><span>@${esc(p.username)}</span></div>${p.lookingForTeam ? '<span class="open-pill">Open to teammates</span>' : ''}</div><p>${esc(p.bio || "")}</p>${p.profileVisibility === "private" ? '<p class="privacy-state-note">Private profile · only you can see these details. This profile is not in the public directory or public team matcher.</p>' : ''}<div class="profile-facts"><span>${esc(p.college)}${p.collegeShort ? ` (${esc(p.collegeShort)})` : ""}</span><span>${esc(p.course)}</span><span>${esc(p.studyLevel)}${p.graduationYear ? ` · Class of ${esc(p.graduationYear)}` : ""}</span><span>${esc([p.city,p.country].filter(Boolean).join(", "))}</span></div><h4>Skills</h4><div class="skill-tags">${(p.skills || []).map(s => `<span>${esc(s)}</span>`).join("")}</div><h4>Interested roles</h4><div class="skill-tags">${(p.rolesInterested || []).map(s => `<span>${esc(s)}</span>`).join("")}</div><div class="member-links">${p.github ? `<a href="${esc(validUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}${p.linkedin ? `<a href="${esc(validUrl(p.linkedin))}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}${p.portfolio ? `<a href="${esc(validUrl(p.portfolio))}" target="_blank" rel="noopener">Portfolio ↗</a>` : ""}</div><div class="member-contact">${p.profileVisibility === "private" ? "Your contact details are not displayed while your profile is private." : `${p.publicEmail ? `Public email: <a href="mailto:${esc(p.publicEmail)}">${esc(p.publicEmail)}</a>` : "Email is private."} · ${p.publicPhone ? `Public phone: <a href="tel:${esc(p.publicPhone)}">${esc(p.publicPhone)}</a>` : "Phone is private."}`}</div></div></div>`;
}

async function loadProjects() {
  if (!currentUser || !db) { renderProjects([]); return; }
  try { const snap = await getDocs(query(collection(db, "projects"), where("ownerUid", "==", currentUser.uid), limit(50))); renderProjects(snap.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => tsMillis(b.createdAt) - tsMillis(a.createdAt))); }
  catch (error) { console.error(error); $("#myProjects").innerHTML = '<div class="empty-note">Could not load projects. Check Firestore rules.</div>'; }
}
function renderProjects(projects) {
  const grid = $("#myProjects");
  if (!projects.length) { grid.innerHTML = `<div class="empty-note">${currentUser ? "No projects added yet. Use Add project to publish your work." : "Sign in to create your project showcase."}</div>`; return; }
  grid.innerHTML = projects.map(p => `<article class="project-card"><div class="project-card-top"><span class="project-mark">✳</span><span class="project-visibility">${p.visibility === "public" ? "PUBLIC" : "PRIVATE"}</span></div><h3>${esc(p.title || "Untitled project")}</h3><p>${esc(p.description || "")}</p><div class="skill-tags">${(p.techStack || []).map(t => `<span>${esc(t)}</span>`).join("")}</div><div class="member-links">${p.projectUrl ? `<a href="${esc(validUrl(p.projectUrl))}" target="_blank" rel="noopener">Live project ↗</a>` : ""}${p.githubUrl ? `<a href="${esc(validUrl(p.githubUrl))}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}</div><button class="text-danger" data-delete-project="${esc(p.id)}">Delete project</button></article>`).join("");
  grid.querySelectorAll("[data-delete-project]").forEach(b => b.onclick = () => deleteProject(b.dataset.deleteProject));
}
async function createProject(event) {
  event.preventDefault(); if (!requireAccount()) return;
  const msg = $("#projectMessage"); msg.textContent = "Publishing…";
  try {
    await addDoc(collection(db, "projects"), {
      ownerUid: currentUser.uid, ownerName: publicProfile?.displayName || currentUser.displayName || "Member",
      title: $("#projectName").value.trim(), description: $("#projectDescription").value.trim(),
      techStack: listFrom($("#projectTech").value), projectUrl: validUrl($("#projectUrl").value),
      githubUrl: validUrl($("#projectGithub").value), visibility: $("#projectVisibility").value,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    hideModal("projectModal"); $("#projectForm").reset(); loadProjects(); toast("Project saved.");
  } catch (error) { msg.textContent = friendlyError(error); }
}
async function deleteProject(id) {
  if (!requireAccount() || !confirm("Delete this project from your showcase?")) return;
  try { await deleteDoc(doc(db, "projects", id)); loadProjects(); toast("Project deleted."); }
  catch (error) { toast(friendlyError(error)); }
}

function handleRoute() {
  const raw=(location.hash||"#home").slice(1);
  const isMemberRoute=raw.startsWith("member/");
  const aliases={top:"home",discover:"home",opportunities:"opportunities",saved:"saved",people:"people",messages:"messages",profile:"profile",notifications:"notifications"};
  const view=isMemberRoute?"member-profile":(aliases[raw]||"home");
  $$('[data-view]').forEach(el=>{
    if(el.id==="discoveryAdminPanel"){el.hidden=!(view==="home"&&isAdminUser);return;}
    el.hidden=el.dataset.view!==view;
  });
  $$("[data-route]").forEach(a=>a.classList.toggle("active",a.dataset.route===view));
  document.querySelector(".desktop-nav")?.classList.remove("mobile-open");
  window.scrollTo({top:0,behavior:"auto"});
  if(view==="opportunities")renderEvents();
  if(view==="saved")renderSaved();
  if(view==="people" && currentUser && !$("#peopleDirectory").hidden) searchPeople();
  if(view==="notifications" && currentUser) renderNotifications();
  if(isMemberRoute){const uid=decodeURIComponent(raw.slice("member/".length));if(uid&&selectedMember?.uid!==uid)viewMember(uid);}
}

function bindUI() {
  $("#year").textContent = new Date().getFullYear();
  $("#authButton").onclick = () => currentUser ? signOut(auth).then(() => toast("Signed out.")) : openAuth();
  $("#accountButton").onclick = () => currentUser ? location.hash = "#profile" : openAuth("signup");
  $("#ctaJoin").onclick = () => currentUser ? location.hash = "#profile" : openAuth("signup");
  $("#profileStartBtn").onclick = () => currentUser ? openProfileEditor(false) : openAuth("signup");
  $("#editProfileBtn").onclick = () => currentUser ? openProfileEditor(false) : openAuth("signup");
  $("#editProfileFromPeople").onclick = () => currentUser ? openProfileEditor(false) : openAuth("signup");
  $("#authForm").addEventListener("submit", authSubmit);
  $("#authModeToggle").onclick = () => setAuthMode(authMode === "signin" ? "signup" : "signin");
  $("#googleSignIn").onclick = googleSignIn; $("#resetPassword").onclick = resetPassword;
  $("#profileForm").addEventListener("submit", saveProfile);
  $("#profileSignOutBtn").onclick = () => signOut(auth).then(() => { hideModal("profileModal"); profileIsMandatory = false; toast("Signed out."); }).catch(error => toast(friendlyError(error)));
  $("#newGroupBtn").onclick = () => { if(requireAccount()){ selectedGroupMembers.clear(); refreshSelectedGroupMembers(); $("#groupForm").reset(); $("#groupMemberResults").innerHTML="<p class=muted>Search public builder profiles to add teammates.</p>"; showModal("groupModal"); } };
  $("#groupMemberSearch").addEventListener("input", searchGroupPicker);
  $("#smartTeamBtn").onclick = () => requireAccount() && showModal("teamBuilderModal");
  $("#teamBuilderForm").addEventListener("submit",runSmartTeamMatch);
  $("#createMatchedTeamBtn").onclick=createMatchedTeam;
  $("#manageGroupSearch").addEventListener("input",searchManageGroupMembers);
  $("#groupManageBtn").onclick=openGroupManager;
  $("#chatTitle").onclick=openChatIdentity;
  $("#conversationSearch").addEventListener("input",()=>renderConversationList(currentConversations));
  $("#messageSearch").addEventListener("input",()=>renderMessages(currentMessages));
  $("#groupForm").addEventListener("submit", createGroup);
  $("#messageForm").addEventListener("submit", sendMessage);
  $("#cancelReplyBtn").onclick=()=>{replyingToMessage=null;$("#replyingToBar").hidden=true;$("#replyingToText").textContent="";};
  $("#addProjectBtn").onclick = () => requireAccount() && showModal("projectModal");
  $("#projectForm").addEventListener("submit", createProject);
  $$("[data-close]").forEach(button => button.addEventListener("click", () => { const id = button.dataset.close; if (id === "profileModal") closeProfileModal(); else hideModal(id); }));
  $$(".modal-backdrop").forEach(modal => modal.addEventListener("click", e => { if (e.target === modal) { if (modal.id === "profileModal") closeProfileModal(); else hideModal(modal.id); } }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") ["authModal","memberModal","groupModal","projectModal","eventModal","teamBuilderModal","manageGroupModal","deleteGroupModal"].forEach(hideModal); if (e.key === "Escape") closeProfileModal(); });
  ["#eventSearch","#eventSkill","#eventCategory","#eventCountry","#eventRegion","#eventMode","#eventTrack","#eventSource","#eventLevel","#eventCost","#eventDeadline","#eventSort"].forEach(sel=>{const el=$(sel);if(el){el.addEventListener(el.tagName==="INPUT"?"input":"change",()=>{allEventsVisible=24;renderEvents();});}});
  $("#clearEventFilters").onclick=()=>{["#eventSearch","#eventSkill"].forEach(id=>$(id).value="");["#eventCategory","#eventCountry","#eventRegion","#eventMode","#eventTrack","#eventSource","#eventLevel","#eventCost","#eventDeadline","#eventSort"].forEach(id=>{const el=$(id);if(el)el.value=id==="#eventSort"?"deadline":"all";});allEventsVisible=24;renderEvents();};
  $("#loadMoreEvents").onclick=()=>{allEventsVisible+=24;renderEvents();};
  $("#refreshEventsBtn").onclick = loadEvents;
  $("#discoverySourceForm").addEventListener("submit", addDiscoverySource);
  $("#runDiscoveryBtn").onclick = runDiscoveryManually;
  $("#heroSearch").addEventListener("keydown", e => { if (e.key === "Enter") runHeroSearch(); }); $("#heroSearchBtn").onclick = runHeroSearch;
  $("#peopleSearch").addEventListener("input", searchPeople); $("#peopleRole").onchange = searchPeople; $("#lookingForTeamOnly").onchange = searchPeople;
  ["#peopleSkillFilter","#peopleCollegeFilter","#peopleYearFilter","#peopleAvailabilityFilter","#peopleInterestFilter"].forEach(sel=>$(sel).addEventListener("change",renderPeople));
  $("#clearPeopleFilters").onclick=()=>{["#peopleRole","#peopleSkillFilter","#peopleCollegeFilter","#peopleYearFilter","#peopleAvailabilityFilter","#peopleInterestFilter"].forEach(sel=>$(sel).value="all");$("#lookingForTeamOnly").checked=false;$("#peopleSearch").value="";searchPeople();};
  $("#viewMembersBtn").onclick = () => { $("#peopleDirectory").hidden=false; searchPeople(); $("#peopleSearch").focus(); };
  $("#memberProfileBack").onclick = () => { location.hash="#people"; $("#peopleDirectory").hidden=false; };
  $("#notificationBell").onclick = () => { location.hash="#notifications"; };
  $("#markAllNotificationsRead").onclick = markAllNotificationsRead;
  $("#clearNotifications").onclick = clearNotifications;
  $$('[data-mute-notification-category]').forEach(input=>input.addEventListener("change",async()=>{if(!currentUser)return;const muted=$$('[data-mute-notification-category]').filter(x=>x.checked).map(x=>x.dataset.muteNotificationCategory);try{await updateDoc(doc(db,"users",currentUser.uid),{mutedNotificationCategories:muted});privateProfile={...(privateProfile||{}),mutedNotificationCategories:muted};renderNotifications();toast("Notification preferences saved.");}catch(error){input.checked=!input.checked;toast(friendlyError(error));}}));
  $$('[data-notification-filter]').forEach(b=>b.onclick=()=>{currentNotificationCategory=b.dataset.notificationFilter;$$('[data-notification-filter]').forEach(x=>{x.classList.toggle("active",x===b);x.setAttribute("aria-selected",String(x===b));});renderNotifications();});
  $("#openDeleteGroupBtn").onclick = openDeleteGroupConfirmation;
  $("#deleteGroupPhrase").addEventListener("input",()=>{const expected=activeConversation?.entityType==="team"?"DELETE TEAM":"DELETE GROUP";$("#confirmDeleteGroupBtn").disabled=$("#deleteGroupPhrase").value!==expected;});
  $("#confirmDeleteGroupBtn").onclick = deleteActiveGroup;
  $("#backToExploreBtn").onclick = () => { location.hash = "#opportunities"; };
  $("#menuToggle").onclick = () => { document.querySelector(".desktop-nav").classList.toggle("mobile-open"); };
  $$(".desktop-nav a").forEach(a => a.addEventListener("click", () => document.querySelector(".desktop-nav").classList.remove("mobile-open")));
  window.addEventListener("hashchange",handleRoute); handleRoute();
}
function runHeroSearch() { $("#eventSearch").value = $("#heroSearch").value; renderEvents(); location.hash = "#opportunities"; }

bindUI();
initFirebase();
