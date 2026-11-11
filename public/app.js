import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged,
  sendEmailVerification, updateProfile as updateAuthProfile
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy,
  startAt, endAt, limit, serverTimestamp, addDoc, setDoc, deleteDoc,
  onSnapshot, updateDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseConfig } from "./supabase-config.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const CONFIGURED = Boolean(firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("YOUR_") && firebaseConfig.projectId && !String(firebaseConfig.projectId).startsWith("YOUR_"));
let app = null, auth = null, db = null, functions = null, supabaseClient = null, currentUser = null, authMode = "signin", isAdminUser = false;
let privateProfile = null, publicProfile = null, events = [], savedIds = new Set(), people = [];
let activeConversationId = null, activeConversation = null, stopConversationListener = null, stopMessageListener = null;
let stopInboxListener = null, profileIsMandatory = false, selectedMember = null, peopleSearchTimer = null;
let allEventsVisible = 24, currentConversations = [], currentMessages = [], selectedGroupMembers = new Map(), matchedTeamCandidates = [];
let stopTypingListener = null, typingStopTimer = null, voiceRecorder = null, voiceChunks = [], activeChatFilter = "all", replyingToMessageId = null, aiAvailableBuilders = [];
let aiMode = "chat", activeAiConversationId = null, activeAiConversationMode = "chat", currentAiMessages = [], pendingAiActions = [], isAiSending = false;

const esc = (value = "") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const listFrom = value => String(value || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 30);
const normalizedList = value => listFrom(value).map(x => x.toLowerCase()).filter((x, i, a) => a.indexOf(x) === i);
const validUrl = value => { if (!value) return ""; try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
const initials = name => String(name || "HV").trim().split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase() || "HV";
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
    updateEventAccessUI(); updateAiAccessUI(); renderEvents(); renderSaved(); renderPeopleEmpty(); return;
  }
  try {
    app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); functions = getFunctions(app);
    if (supabaseConfig.url && !supabaseConfig.url.startsWith("YOUR_") && supabaseConfig.anonKey && !supabaseConfig.anonKey.startsWith("YOUR_")) supabaseClient = createClient(supabaseConfig.url, supabaseConfig.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
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
        privateProfile = null; publicProfile = null; events = []; savedIds.clear(); currentConversations=[]; currentMessages=[];renderNotificationCenter(); profileIsMandatory = false; hideModal("profileModal"); hideModal("eventModal");
        $("#eventModalContent").innerHTML = "";
        detachRealtimeListeners(); renderSaved(); renderMyProfile(); renderProjects([]); renderConversationList([]);
        $("#chatPlaceholder").hidden = false; $("#chatActive").hidden = true;
        activeAiConversationId = null; currentAiMessages = []; pendingAiActions = []; updateAiAccessUI(); renderAiMessages();
        setSystemNotice(""); updateEventAccessUI(); renderEvents(); searchPeople(); return;
      }
      updateEventAccessUI();
      await loadEvents();
      await loadAccountWorkspace();
      await loadAiHistory();
    });
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
    renderMyProfile(); loadSettingsUI(); renderNotificationCenter();
    if (!privateProfile?.profileComplete || !publicProfile) {
      openProfileEditor(true);
    } else {
      hideModal("profileModal");
      beginInboxListener();
      loadProjects();
    }
  } catch (error) {
    console.error("Could not load account", error); toast(friendlyError(error));
  }
}

function openProfileEditor(mandatory = false) {
  if (!requireAccount()) return;
  profileIsMandatory = mandatory;
  const p = { ...(privateProfile || {}), ...(publicProfile || {}) };
  $("#profileName").value = p.displayName || currentUser.displayName || "";
  $("#profileUsername").value = p.username || "";
  $("#profileUsername").disabled = Boolean(p.usernameLower);
  $("#profileCollege").value = p.college || ""; $("#profileCollegeShort").value = p.collegeShort || ""; $("#profileCourse").value = p.course || "";
  $("#profileStudyLevel").value = p.studyLevel || ""; $("#profileGradYear").value = p.graduationYear || "";
  $("#profileCity").value = p.city || ""; $("#profileCountry").value = p.country || "";
  $("#profileBio").value = p.bio || ""; $("#profileSkills").value = (p.skills || []).join(", ");
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
  const skills = listFrom($("#profileSkills").value); if (!skills.length) { message.textContent = "Add at least one skill."; return; }
  const name = $("#profileName").value.trim(); const college = $("#profileCollege").value.trim();
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
    portfolio: validUrl($("#profilePortfolio").value), lookingForTeam: $("#profileLooking").value === "true",
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

function updateEventAccessUI() {
  const signedIn = Boolean(currentUser);
  const homeContent = $("#homeEventsContent"); const homeGate = $("#homeEventsSignInGate");
  const directoryContent = $("#opportunitiesContent"); const directoryGate = $("#opportunitiesSignInGate");
  if (homeContent) homeContent.hidden = !signedIn;
  if (homeGate) homeGate.hidden = signedIn;
  if (directoryContent) directoryContent.hidden = !signedIn;
  if (directoryGate) directoryGate.hidden = signedIn;
}

async function loadEvents() {
  const grid = $("#eventGrid");
  if (!currentUser) { events = []; updateEventAccessUI(); renderEvents(); renderSaved(); return; }
  if (!db) {
    if (grid) grid.innerHTML = '<div class="loading-card">Connect Firebase to load real opportunities. No sample events are bundled with this website.</div>';
    $("#eventGridAll").innerHTML = '<div class="loading-card">Connect Firebase to load the live opportunity directory.</div>';
    return;
  }
  updateEventAccessUI();
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
  return "other";
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
  setOptions("#eventCountry", [...new Set(events.map(e => e.country || "").filter(Boolean))], "All event countries");
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
  const eligibilityFilter = get("#eventEligibility");
  const now = Date.now();
  let list = events.filter(event => {
    if (event.status === "expired") return false;
    const categoryValue = eventCategoryValue(event);
    const eventMode = eventModeValue(event);
    const eventCountry = String(event.country || "").toLowerCase();
    const eventRegion = String(event.region || event.state || "").toLowerCase();
    const eligibilityText = String(event.eligibility || "").toLowerCase();
    const eligibleCountries = Array.isArray(event.eligibleCountries) ? event.eligibleCountries.map(v => String(v).toLowerCase()) : [];
    const eligibilityScope = event.isWorldwide === true || /worldwide|open to (?:all|everyone)|global eligibility|any country/.test(eligibilityText) ? "worldwide"
      : (eligibleCountries.length ? (eligibleCountries.includes("india") ? "india" : "country-specific")
      : (/india(?:n)? (?:students|residents|citizens)|only.*india|india-based|eligible in india/.test(eligibilityText) ? "india"
      : (/only (?:residents|citizens)|must be (?:a )?resident|country-specific|restricted to/.test(eligibilityText) ? "country-specific" : "unknown")));
    const searchable = [event.title,event.organizer,event.summary,event.description,event.sourceName,event.location,event.city,event.region,event.country,event.eligibility,event.level,...(event.tracks||[]),...(event.technologies||[]),...(event.tags||[]),...(event.skills||[])].join(" ").toLowerCase();
    const trackMatch = track === "all" || (event.tracks || event.tags || []).some(t => t.toLowerCase() === track.toLowerCase());
    const deadline = tsMillis(event.registrationDeadline);
    const costText = `${event.summary || ""} ${event.description || ""} ${event.price || ""}`;
    const explicitlyFree = event.isFree === true || /\bfree (?:to enter|registration|entry)\b|\bno (?:registration )?fee\b|₹\s*0(?:\.00)?|\$\s*0(?:\.00)?/i.test(costText);
    const explicitlyPaid = event.isFree === false || /\bpaid (?:entry|registration)\b|\bregistration fee\b|\bentry fee\b|\btuition fee\b/i.test(costText);
    return (!term || searchable.includes(term))
      && (!skill || [ ...(event.skills||[]), ...(event.technologies||[]), ...(event.tracks||[]) ].join(" ").toLowerCase().includes(skill))
      && (category === "all" || categoryValue === category)
      && (mode === "all" || eventMode.toLowerCase() === mode.toLowerCase())
      && trackMatch
      && (source === "all" || String(event.sourceName || event.sourcePlatform || "").toLowerCase() === source.toLowerCase())
      && (country === "all" || eventCountry === country.toLowerCase())
      && (region === "all" || eventRegion === region.toLowerCase())
      && (eligibilityFilter === "all" || eligibilityScope === eligibilityFilter || (eligibilityFilter === "india" && eligibilityScope === "worldwide"))
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
        ["openHPI", "Online ICT and computer science courses from the Hasso Plattner Institute.", "https://open.hpi.de/courses", "Public dated course feed connected to HackVerse"],
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
  if (!requireAccount()) return;
  const event = events.find(e => e.id === eventId); if (!event) { toast("Sign in and reload the opportunity directory first."); return; }
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
  renderSaved(); renderEvents(); renderNotificationCenter(); notifyUpcomingDeadlines();
}
async function saveEvent(eventId) {
  if (!requireAccount()) return;
  const ref = doc(db, "users", currentUser.uid, "savedEvents", eventId);
  try {
    if (savedIds.has(eventId)) { await deleteDoc(ref); savedIds.delete(eventId); toast("Removed from your shortlist."); }
    else { await setDoc(ref, { eventId, savedAt: serverTimestamp() }); savedIds.add(eventId); toast("Saved to your shortlist."); }
    renderSaved(); renderEvents(); renderNotificationCenter(); notifyUpcomingDeadlines();
    return true;
  } catch (error) { toast(friendlyError(error)); return false; }
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
    const term = $("#peopleSearch").value.trim().toLowerCase().replace(/^@/, "");
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
        people = people.filter(p => [p.displayName, p.username, p.college, p.collegeShort, p.course, p.publicEmail, p.publicPhone, p.bio, ...(p.skills || []), ...(p.rolesInterested || []), ...(p.interests || [])].join(" ").toLowerCase().includes(term)
          || (digits.length >= 7 && String(p.publicPhoneDigits || "").startsWith(digits)));
      }
      renderPeople();
    } catch (error) { console.error("People search failed", error); $("#peopleResultCount").textContent = "Could not search profiles. Check your Firestore rules and indexes."; $("#peopleGrid").innerHTML = '<div class="loading-card">Profile search is temporarily unavailable.</div>'; }
  }, 220);
}
function overlapScore(profile) {
  if (!publicProfile) return 0;
  const mine = new Set([...(publicProfile.skillsLower || []), ...(publicProfile.interests || []).map(x => x.toLowerCase())]);
  const theirs = [...(profile.skillsLower || []), ...(profile.interests || []).map(x => x.toLowerCase())];
  return theirs.filter(x => mine.has(x)).length;
}
function renderPeople() {
  const grid = $("#peopleGrid"); const role = $("#peopleRole").value; const lookingOnly = $("#lookingForTeamOnly").checked;
  const sorted = [...people].sort((a,b) => overlapScore(b) - overlapScore(a));
  $("#peopleResultCount").textContent = `${sorted.length} builder${sorted.length === 1 ? "" : "s"} found`;
  if (!sorted.length) { grid.innerHTML = '<div class="loading-card">No public profiles match your search yet. Try another skill or keyword.</div>'; return; }
  grid.innerHTML = sorted.map(p => `<article class="person-card"><div class="person-top"><div class="avatar">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div class="person-title"><h3>${esc(p.displayName || "HackVerse member")}</h3><span>@${esc(p.username || "member")}</span></div>${p.lookingForTeam ? '<span class="open-pill">Open to team</span>' : ""}</div><p class="person-college">${esc([p.course, p.college].filter(Boolean).join(" · ") || "Education not listed")}</p><p class="person-bio">${esc(p.bio || "This builder has not added a bio yet.")}</p><div class="skill-tags">${(p.skills || []).slice(0,5).map(s => `<span>${esc(s)}</span>`).join("")}</div><div class="person-bottom"><small>${esc(p.availability || "Availability not listed")}</small><div class="person-actions"><button class="save-btn" data-view-member="${esc(p.uid)}">View profile</button><button class="register-btn" data-message-member="${esc(p.uid)}">Chat</button><button class="save-btn" data-contact-member="${esc(p.uid)}" ${p.publicEmail || p.publicPhone ? "" : "disabled"}>Contact</button></div></div></article>`).join("");
  grid.querySelectorAll("[data-view-member]").forEach(b => b.onclick = () => viewMember(b.dataset.viewMember));
  grid.querySelectorAll("[data-message-member]").forEach(b => b.onclick = () => { const p = people.find(x => x.uid === b.dataset.messageMember); if (p) startDirectConversation(p); });
  grid.querySelectorAll("[data-contact-member]").forEach(b => b.onclick = () => {
    const p = people.find(x => x.uid === b.dataset.contactMember);
    if (!p) return;
    if (p.publicEmail) location.href = `mailto:${p.publicEmail}`;
    else if (p.publicPhone) location.href = `tel:${String(p.publicPhone).replace(/[^+\\d]/g,"")}`;
    else toast("This member has not shared contact details. You can message them instead.");
  });
}
async function viewMember(uid) {
  if (!db) return;
  try {
    const snap = await getDoc(doc(db, "publicProfiles", uid)); if (!snap.exists()) { toast("This profile is no longer available."); return; }
    selectedMember = { uid, ...snap.data() }; const p = selectedMember;
    $("#memberProfileContent").innerHTML = `<div class="member-profile-head"><div class="avatar avatar-large">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div><div class="eyebrow">HACKVERSE BUILDER</div><h2 id="memberModalTitle">${esc(p.displayName || "Builder")}</h2><p class="member-handle">@${esc(p.username || "member")}</p></div></div><p class="member-bio">${esc(p.bio || "No bio added yet.")}</p><div class="member-facts"><span>${esc([p.course,p.college].filter(Boolean).join(" · ") || "Education not listed")}</span><span>${esc([p.studyLevel,p.graduationYear ? `Class of ${p.graduationYear}` : ""].filter(Boolean).join(" · ") || "Study level not listed")}</span><span>${esc([p.city,p.country].filter(Boolean).join(", ") || "Location not listed")}</span><span>${esc(p.availability || "Availability not listed")}</span><span>Preferred format: ${esc(p.preferredMode || "Any format")}</span></div><h3>Skills</h3><div class="skill-tags">${(p.skills || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interested roles</h3><div class="skill-tags">${(p.rolesInterested || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interests</h3><div class="skill-tags">${(p.interests || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><div class="member-contact"><h3>Contact details</h3><p>${p.publicEmail ? `Email: <a href="mailto:${esc(p.publicEmail)}">${esc(p.publicEmail)}</a>` : "Email kept private by this member."}</p><p>${p.publicPhone ? `Phone: <a href="tel:${esc(p.publicPhone)}">${esc(p.publicPhone)}</a>` : "Phone kept private by this member."}</p></div><div class="member-links">${p.github ? `<a href="${esc(validUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}${p.linkedin ? `<a href="${esc(validUrl(p.linkedin))}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}${p.portfolio ? `<a href="${esc(validUrl(p.portfolio))}" target="_blank" rel="noopener">Portfolio ↗</a>` : ""}</div>`;
    $("#memberMessageBtn").onclick = () => startDirectConversation(selectedMember);
    $("#memberReportBtn").onclick = () => reportMember(selectedMember);
    showModal("memberModal");
  } catch (error) { toast(friendlyError(error)); }
}

function detachRealtimeListeners() {
  if (stopInboxListener) stopInboxListener(); if (stopMessageListener) stopMessageListener(); if (stopTypingListener) stopTypingListener();
  stopInboxListener = null; stopMessageListener = null; stopTypingListener = null; activeConversationId = null; activeConversation = null;
}
function beginInboxListener() {
  if (!currentUser || !db) return;
  if (stopInboxListener) stopInboxListener();
  const inboxQuery = query(collection(db, "conversations"), where("participants", "array-contains", currentUser.uid), limit(100));
  stopInboxListener = onSnapshot(inboxQuery, snapshot => {
    currentConversations = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.deleted).sort((a,b) => tsMillis(b.updatedAt || b.lastMessageAt) - tsMillis(a.updatedAt || a.lastMessageAt));
    renderConversationList(currentConversations);
    renderNotificationCenter();
    const notificationBaselineKey=`hv-inbox-baseline-${currentUser.uid}`;
    if(localStorage.getItem(notificationBaselineKey)==="1") notifyIncomingActivity(currentConversations);
    else { currentConversations.forEach(c=>{const stamp=tsMillis(c.lastMessageAt);if(stamp)localStorage.setItem(`hv-notified-${currentUser.uid}-${c.id}`,String(stamp));});localStorage.setItem(notificationBaselineKey,"1"); }
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
function getChatPreferences() {
  try { return JSON.parse(localStorage.getItem(`hv-chat-settings-${currentUser?.uid || "guest"}`) || "{}"); }
  catch { return {}; }
}
function setChatPreference(key, value) {
  const prefs = getChatPreferences(); prefs[key] = value;
  localStorage.setItem(`hv-chat-settings-${currentUser?.uid || "guest"}`, JSON.stringify(prefs));
}
function chatIsUnread(c) {
  if (!currentUser || c.lastMessageSender === currentUser.uid) return false;
  return tsMillis(c.lastMessageAt) > tsMillis(c.readAtBy?.[currentUser.uid]);
}
function renderConversationList(rows) {
  const term = $("#conversationSearch")?.value.trim().toLowerCase() || "";
  const prefs = getChatPreferences(); const archived = new Set(prefs.archived || []); const pinned = new Set(prefs.pinned || []);
  let visible = rows.filter(c => `${conversationLabel(c)} ${c.lastMessage || ""} ${(c.participantNames ? Object.values(c.participantNames) : []).join(" ")}`.toLowerCase().includes(term));
  visible = visible.filter(c => {
    if (activeChatFilter === "archived") return archived.has(c.id);
    if (archived.has(c.id)) return false;
    if (activeChatFilter === "unread") return chatIsUnread(c);
    if (activeChatFilter === "groups") return c.isGroup;
    return true;
  });
  visible.sort((a,b) => Number(pinned.has(b.id))-Number(pinned.has(a.id)) || tsMillis(b.updatedAt || b.lastMessageAt) - tsMillis(a.updatedAt || a.lastMessageAt));
  $("#conversationCount").textContent = String(visible.length);
  const list = $("#conversationList");
  if (!visible.length) { list.innerHTML = `<div class="empty-note">${term ? "No chats match that search." : activeChatFilter === "archived" ? "No archived chats." : "No conversations yet. Find a builder and send the first message."}</div>`; return; }
  list.innerHTML = visible.map(c => {
    const unread = chatIsUnread(c); const otherUid = (c.participants || []).find(uid => uid !== currentUser?.uid);
    const avatar = c.isGroup ? "✦" : initials(c.participantNames?.[otherUid] || conversationLabel(c));
    const time = tsMillis(c.lastMessageAt) ? new Date(tsMillis(c.lastMessageAt)).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "";
    const preview = c.lastMessageSender === currentUser?.uid ? `You: ${c.lastMessage || ""}` : (c.lastMessage || (c.isGroup ? "Group created" : "Say hello"));
    return `<button class="conversation-item ${c.id === activeConversationId ? "selected" : ""} ${unread ? "has-unread" : ""}" data-conversation="${esc(c.id)}"><span class="conversation-avatar ${c.isGroup ? "group-avatar" : ""}">${esc(avatar)}</span><span class="conversation-copy"><b>${esc(conversationLabel(c))}</b><small>${esc(preview)}</small></span><span class="conversation-side-meta"><time>${esc(time)}</time>${unread ? '<i class="unread-dot"></i>' : (pinned.has(c.id) ? '<i class="pinned-mark">⌖</i>' : '')}</span></button>`;
  }).join("");
  list.querySelectorAll("[data-conversation]").forEach(b => b.onclick = () => selectConversation(visible.find(c => c.id === b.dataset.conversation)));
}
function renderChatHeading() {
  if (!activeConversation) return;
  $("#chatTitle").textContent = conversationLabel(activeConversation);
  const members = (activeConversation.participants || []).length;
  $("#chatSubtitle").textContent = activeConversation.isGroup ? `${members} members · ${activeConversation.groupName || "Team chat"}` : "Direct conversation · click to view profile";
  const canManage = Boolean(activeConversation.isGroup && (activeConversation.createdBy === currentUser?.uid || (activeConversation.admins || []).includes(currentUser?.uid)));
  // Every group participant can open the roster and member profiles; management controls remain role-gated inside the dialog.
  $("#groupManageBtn").hidden = !activeConversation.isGroup;
}
function selectConversation(conversation) {
  if (!conversation || !currentUser) return;
  activeConversation = conversation; activeConversationId = conversation.id; replyingToMessageId = null;
  $("#chatPlaceholder").hidden = true; $("#chatActive").hidden = false; renderChatHeading(); updateReplyPreview();
  if (stopMessageListener) stopMessageListener(); if (stopTypingListener) stopTypingListener();
  const messagesQuery = query(collection(db, "conversations", conversation.id, "messages"), orderBy("createdAt", "desc"), limit(300));
  stopMessageListener = onSnapshot(messagesQuery, snapshot => {
    currentMessages = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
    renderMessages(currentMessages); hydrateChatAttachmentUrls(conversation.id, currentMessages).catch(error => console.warn("Chat attachment preview unavailable", error)); markConversationRead(conversation.id).catch(()=>{});
  }, error => { console.error("Messages listener", error); $("#messageList").innerHTML = '<div class="empty-note">Could not load messages. Check Firestore rules.</div>'; });
  startTypingListener(conversation.id);
  renderConversationListFromSnapshotSelection();
}
function renderConversationListFromSnapshotSelection() { $$(".conversation-item").forEach(b => b.classList.toggle("selected", b.dataset.conversation === activeConversationId)); }
function updateReplyPreview() {
  const preview = $("#replyPreview"); if (!preview) return;
  const message = currentMessages.find(m => m.id === replyingToMessageId);
  preview.hidden = !message;
  if (message) { $("#replyAuthor").textContent = message.authorUid === currentUser?.uid ? "yourself" : (message.authorName || "member"); $("#replyText").textContent = message.deleted ? "Deleted message" : (message.text || message.attachment?.name || "Attachment"); }
}
function renderMessages(messages) {
  const term = $("#messageSearch")?.value.trim().toLowerCase() || "";
  const visible = messages.filter(m => !term || String(m.text || "").toLowerCase().includes(term) || String(m.authorName || "").toLowerCase().includes(term) || String(m.attachment?.name || "").toLowerCase().includes(term));
  const box = $("#messageList"); if (!box) return;
  if ($("#messageSearchCount")) $("#messageSearchCount").textContent = term ? `${visible.length} matches` : `${messages.length} messages`;
  if (!visible.length) { box.innerHTML = `<div class="empty-note message-empty">${term ? "No messages match your search." : "This is the beginning of this chat. Say hello 👋"}</div>`; return; }
  const prefs = getChatPreferences(); const starred = new Set(prefs.starred || []);
  box.innerHTML = visible.map(m => {
    const mine = m.authorUid === currentUser?.uid; const created = tsMillis(m.createdAt); const time = created ? new Date(created).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "Sending…";
    const canEdit = mine && !m.deleted && created && Date.now() - created <= 15*60*1000;
    const reply = m.replyTo ? `<div class="message-reply-quote"><b>${esc(m.replyTo.authorName || "Reply")}</b><span>${esc(m.replyTo.text || "Original message")}</span></div>` : "";
    let attachment = "";
    if (m.attachment?.url) {
      const url = validUrl(m.attachment.url); const type = String(m.attachment.type || "");
      if (type.startsWith("image/")) attachment = `<a class="chat-attachment-image" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(m.attachment.name || "Shared image")}" loading="lazy"></a>`;
      else if (type.startsWith("audio/")) attachment = `<audio class="chat-audio" controls preload="none" src="${esc(url)}"></audio>`;
      else if (type.startsWith("video/")) attachment = `<video class="chat-video" controls preload="metadata" src="${esc(url)}"></video>`;
      else attachment = `<a class="chat-file-card" href="${esc(url)}" target="_blank" rel="noopener"><span>↧</span><span><b>${esc(m.attachment.name || "Shared file")}</b><small>${esc(formatFileSize(m.attachment.size || 0))}</small></span></a>`;
    }
    const reactions = Object.entries(m.reactions || {}).reduce((acc,[uid,emoji]) => { if (emoji) acc[emoji]=(acc[emoji]||0)+1; return acc; }, {});
    const reactionHtml = Object.entries(reactions).map(([emoji,count])=>`<button class="reaction-chip ${(m.reactions||{})[currentUser?.uid]===emoji?"mine":""}" type="button" data-react-message="${esc(m.id)}" data-emoji="${esc(emoji)}">${esc(emoji)} <span>${count}</span></button>`).join("");
    const readAt = activeConversation?.readAtBy || {}; const recipients = (activeConversation?.participants || []).filter(uid=>uid!==currentUser?.uid);
    const readByAll = recipients.length && recipients.every(uid=>tsMillis(readAt[uid])>=created && created>0);
    const status = mine ? `<span class="message-ticks ${readByAll?"read":""}" title="${readByAll?"Read":"Sent"}">${readByAll?"✓✓":"✓"}</span>` : "";
    const messageText = m.deleted ? '<span class="deleted-message">This message was deleted.</span>' : esc(m.text || "");
    return `<article class="message-row ${mine ? "mine" : "theirs"}" data-message-row="${esc(m.id)}"><div class="message-bubble">${!mine?`<button type="button" class="message-author-button" data-view-message-author="${esc(m.authorUid || "")}">${esc(m.authorName || "Teammate")} <span>↗</span></button>`:""}${reply}${attachment}${messageText?`<p>${messageText}</p>`:""}<div class="message-meta"><time>${esc(time)}${m.edited ? " · edited" : ""}</time>${status}</div>${reactionHtml}<div class="message-hover-actions"><button type="button" data-reply-message="${esc(m.id)}" title="Reply">↩</button><button type="button" data-react-message="${esc(m.id)}" data-emoji="👍" title="React">☺</button><button type="button" data-copy-message="${esc(m.id)}" title="Copy">▢</button><button type="button" data-star-message="${esc(m.id)}" title="Star">${starred.has(`${activeConversationId}:${m.id}`)?"★":"☆"}</button>${mine?`${canEdit?`<button type="button" data-edit-message="${esc(m.id)}" title="Edit">✎</button>`:""}<button type="button" data-delete-message="${esc(m.id)}" title="Delete">⌫</button>`:""}<button type="button" data-forward-message="${esc(m.id)}" title="Forward">↗</button></div></div></article>`;
  }).join("");
  box.querySelectorAll("[data-view-message-author]").forEach(b => b.onclick = () => { if (b.dataset.viewMessageAuthor) viewMember(b.dataset.viewMessageAuthor); });
  box.querySelectorAll("[data-edit-message]").forEach(b => b.onclick = () => editMessage(b.dataset.editMessage));
  box.querySelectorAll("[data-delete-message]").forEach(b => b.onclick = () => deleteMessage(b.dataset.deleteMessage));
  box.querySelectorAll("[data-reply-message]").forEach(b => b.onclick = () => setReply(b.dataset.replyMessage));
  box.querySelectorAll("[data-react-message]").forEach(b => b.onclick = () => toggleMessageReaction(b.dataset.reactMessage,b.dataset.emoji || "👍"));
  box.querySelectorAll("[data-copy-message]").forEach(b => b.onclick = () => copyMessage(b.dataset.copyMessage));
  box.querySelectorAll("[data-star-message]").forEach(b => b.onclick = () => toggleStarMessage(b.dataset.starMessage));
  box.querySelectorAll("[data-forward-message]").forEach(b => b.onclick = () => forwardMessage(b.dataset.forwardMessage));
  box.scrollTop = box.scrollHeight;
}
function formatFileSize(bytes) { if (!bytes) return "File"; const units=["B","KB","MB","GB"]; let value=bytes,index=0; while(value>=1024&&index<units.length-1){value/=1024;index++;} return `${value.toFixed(index?1:0)} ${units[index]}`; }
function setReply(messageId) { const message=currentMessages.find(m=>m.id===messageId); if(!message)return; replyingToMessageId=messageId; updateReplyPreview(); $("#messageText").focus(); }
async function toggleMessageReaction(messageId, emoji) {
  if (!requireAccount() || !activeConversationId) return;
  const message=currentMessages.find(m=>m.id===messageId); if(!message)return;
  const reactions={...(message.reactions||{})}; if(reactions[currentUser.uid]===emoji) delete reactions[currentUser.uid]; else reactions[currentUser.uid]=emoji;
  try { await updateDoc(doc(db,"conversations",activeConversationId,"messages",messageId),{reactions}); }
  catch(error){toast(friendlyError(error));}
}
async function copyMessage(messageId) { const m=currentMessages.find(x=>x.id===messageId); if(!m)return; try{await navigator.clipboard.writeText(m.text||m.attachment?.url||"");toast("Message copied.");}catch{toast("Clipboard access was blocked by your browser.");} }
function toggleStarMessage(messageId) { const prefs=getChatPreferences();const starred=new Set(prefs.starred||[]);const key=`${activeConversationId}:${messageId}`;starred.has(key)?starred.delete(key):starred.add(key);setChatPreference("starred",[...starred]);renderMessages(currentMessages);toast(starred.has(key)?"Message saved to starred items.":"Removed from starred items."); }
async function forwardMessage(messageId) {
  const m=currentMessages.find(x=>x.id===messageId); if(!m)return;
  const choices=currentConversations.filter(c=>c.id!==activeConversationId).slice(0,20);
  if(!choices.length){toast("Open another conversation before forwarding.");return;}
  if(m.attachment){toast("For privacy, download the attachment and upload it again in the destination chat. Only text messages can be forwarded directly.");return;}
  const listing=choices.map((c,i)=>`${i+1}. ${conversationLabel(c)}`).join("\n");
  const choice=Number(prompt(`Forward to which conversation?\n${listing}\n\nEnter a number:`));
  const target=choices[choice-1]; if(!target)return;
  try{await addDoc(collection(db,"conversations",target.id,"messages"),{authorUid:currentUser.uid,authorName:publicProfile?.displayName||currentUser.displayName||"Member",text:m.text||"",kind:"text",createdAt:serverTimestamp(),forwarded:true});await updateDoc(doc(db,"conversations",target.id),{lastMessage:(m.text||"").slice(0,180),lastMessageSender:currentUser.uid,lastMessageAt:serverTimestamp(),updatedAt:serverTimestamp()});toast("Message forwarded.");}
  catch(error){toast(friendlyError(error));}
}
async function markConversationRead(conversationId) { if(!currentUser||!db||!conversationId)return; try{await updateDoc(doc(db,"conversations",conversationId),{[`readAtBy.${currentUser.uid}`]:serverTimestamp()});}catch(error){console.warn("Read receipt update was blocked",error);} }
function startTypingListener(conversationId) {
  if(stopTypingListener)stopTypingListener();
  stopTypingListener=onSnapshot(collection(db,"conversations",conversationId,"typing"),snapshot=>{
    const active=snapshot.docs.map(d=>d.data()).filter(d=>d.uid!==currentUser?.uid&&Date.now()-tsMillis(d.updatedAt)<7000);
    const indicator=$("#typingIndicator"); if(indicator){indicator.hidden=!active.length;indicator.textContent=active.length===1?`${active[0].displayName||"Someone"} is typing…`:`${active.length} people are typing…`;}
  },()=>{});
}
async function publishTyping() {
  if(!currentUser||!activeConversationId||!db)return;
  try{await setDoc(doc(db,"conversations",activeConversationId,"typing",currentUser.uid),{uid:currentUser.uid,displayName:publicProfile?.displayName||currentUser.displayName||"Member",updatedAt:serverTimestamp()},{merge:true});}catch{}
  clearTimeout(typingStopTimer); typingStopTimer=setTimeout(()=>{if(activeConversationId&&currentUser)deleteDoc(doc(db,"conversations",activeConversationId,"typing",currentUser.uid)).catch(()=>{});},4500);
}
async function chatMediaRequest(payload) {
  if (!currentUser) throw new Error("Sign in to share chat media.");
  const idToken = await currentUser.getIdToken();
  const response = await fetch("/api/chat-media", { method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${idToken}`}, body:JSON.stringify(payload) });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Media service returned ${response.status}.`);
  return data;
}
async function uploadChatFile(file, kindOverride="file") {
  if (!supabaseClient) throw new Error("Chat media storage is not configured yet. Complete the Supabase setup in docs/AGENT37_AI_SETUP.md.");
  if (!activeConversationId || !currentUser) throw new Error("Choose a conversation before uploading.");
  const allowed = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/") || ["application/pdf","text/plain","application/zip","application/msword","application/vnd.ms-excel","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(file.type);
  if (!allowed) throw new Error("That file type is not supported.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Attachments must be 15 MB or smaller.");
  const data = await chatMediaRequest({action:"create-upload",conversationId:activeConversationId,fileName:file.name,contentType:file.type,size:file.size});
  const { error } = await supabaseClient.storage.from(supabaseConfig.bucket || "chat-media").uploadToSignedUrl(data.path,data.token,file,{contentType:file.type,upsert:false});
  if (error) throw new Error(error.message || "Supabase upload failed.");
  return {name:String(file.name||`${kindOverride}.bin`).slice(0,120),type:file.type,size:file.size,storagePath:data.path};
}
async function hydrateChatAttachmentUrls(conversationId, messages) {
  if (!supabaseClient || !currentUser) return;
  const paths=[...new Set(messages.map(m=>m.attachment?.storagePath).filter(Boolean))].slice(-40);
  if (!paths.length) return;
  try {
    const data=await chatMediaRequest({action:"create-downloads",conversationId,paths});
    if (activeConversationId!==conversationId) return;
    const byPath=new Map((data.urls||[]).map(item=>[item.path,item.signedUrl]));
    currentMessages=messages.map(m=>m.attachment?.storagePath?{...m,attachment:{...m.attachment,url:byPath.get(m.attachment.storagePath)||""}}:m);
    renderMessages(currentMessages);
  } catch(error) { console.warn("Could not sign private media URLs",error); }
}
async function sendMessage(event) {
  event.preventDefault(); if (!requireAccount() || !activeConversationId) { toast("Choose a conversation first."); return; }
  const text = $("#messageText").value.trim(); if (!text) return;
  if (text.length > 2000) { toast("Messages must be 2,000 characters or fewer."); return; }
  await submitChatMessage({text,kind:"text"});
}
async function submitChatMessage(payload) {
  const sendButton = $("#messageForm button"); if(sendButton)sendButton.disabled=true;
  try {
    const conversationRef = doc(db, "conversations", activeConversationId);
    const reply=replyingToMessageId?currentMessages.find(m=>m.id===replyingToMessageId):null;
    const replyTo=reply?{messageId:reply.id,authorName:reply.authorName||"Member",text:(reply.text||reply.attachment?.name||"Attachment").slice(0,160)}:null;
    const body={authorUid:currentUser.uid,authorName:publicProfile?.displayName||currentUser.displayName||"Member",text:String(payload.text||"").slice(0,2000),kind:payload.kind||"text",createdAt:serverTimestamp(),...(replyTo?{replyTo}:{}),...(payload.attachment?{attachment:payload.attachment}:{})};
    await addDoc(collection(conversationRef,"messages"),body);
    await updateDoc(conversationRef,{lastMessage:(payload.text||payload.attachment?.name||"Attachment").slice(0,180),lastMessageSender:currentUser.uid,lastMessageAt:serverTimestamp(),updatedAt:serverTimestamp()});
    $("#messageText").value=""; replyingToMessageId=null;updateReplyPreview();
    if(typingStopTimer)clearTimeout(typingStopTimer);deleteDoc(doc(db,"conversations",activeConversationId,"typing",currentUser.uid)).catch(()=>{});
  } catch(error) { console.error(error);toast(friendlyError(error)); }
  finally { if(sendButton)sendButton.disabled=false; }
}
async function handleChatFile(file) {
  if(!file||!requireAccount()||!activeConversationId)return;
  toast("Uploading attachment…");
  try{const attachment=await uploadChatFile(file);await submitChatMessage({text:"",kind:file.type.startsWith("image/")?"image":file.type.startsWith("video/")?"video":file.type.startsWith("audio/")?"audio":"file",attachment});toast("Attachment sent.");}
  catch(error){toast(error.message||friendlyError(error));}
  finally{$("#chatFileInput").value="";}
}
async function toggleVoiceRecording() {
  if(voiceRecorder?.state==="recording"){voiceRecorder.stop();$("#voiceRecordBtn").classList.remove("recording");$("#voiceRecordBtn").innerHTML="◉<span>Voice</span>";return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast("Voice recording is not supported in this browser.");return;}
  if(!activeConversationId||!requireAccount())return;
  try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});voiceChunks=[];voiceRecorder=new MediaRecorder(stream);voiceRecorder.ondataavailable=e=>{if(e.data.size)voiceChunks.push(e.data);};voiceRecorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(voiceChunks,{type:voiceRecorder.mimeType||"audio/webm"});const file=new File([blob],`voice-${Date.now()}.webm`,{type:blob.type});try{toast("Uploading voice note…");const attachment=await uploadChatFile(file,"voice");await submitChatMessage({text:"",kind:"voice",attachment});}catch(error){toast(error.message||friendlyError(error));}};voiceRecorder.start();$("#voiceRecordBtn").classList.add("recording");$("#voiceRecordBtn").innerHTML="■<span>Stop</span>";}
  catch(error){toast(`Microphone access unavailable: ${error.message}`);}
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
  const participantUids = activeConversation.participants || [];
  $("#manageGroupTitle").textContent = `Group details · ${activeConversation.groupName || "team"}`;
  $("#groupInfoSummary").innerHTML = `<div class="group-info-stat"><b>${participantUids.length}</b><span>MEMBERS</span></div><div class="group-info-copy"><b>${esc(activeConversation.groupName || "Project group")}</b><small>Created by ${esc(activeConversation.participantNames?.[activeConversation.createdBy] || "Group owner")} · ${canManage ? "You can manage members" : "Member view"}</small></div><span class="group-info-badge">${canManage ? "ADMIN" : "MEMBER"}</span>`;
  const rows = await Promise.all(participantUids.map(async uid => {
    try { const snap = await getDoc(doc(db,"publicProfiles",uid)); return { uid, isPublic: snap.exists(), ...(snap.exists()?snap.data():{}) }; }
    catch { return { uid, isPublic: false, displayName: activeConversation.participantNames?.[uid] || "Member" }; }
  }));
  $("#manageGroupMembers").innerHTML = rows.map(p => {
    const isOwner = p.uid === activeConversation.createdBy;
    const isAdmin = isOwner || (activeConversation.admins || []).includes(p.uid);
    const displayName = p.displayName || activeConversation.participantNames?.[p.uid] || "Member";
    const avatar = p.isPublic && p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" loading="lazy">` : esc(initials(displayName));
    return `<article class="group-member-row"><span class="group-member-avatar">${avatar}</span><div class="group-member-main">${p.isPublic ? `<button type="button" class="group-member-profile-link" data-view-group-member="${esc(p.uid)}">${esc(displayName)} <span>↗</span></button>` : `<b>${esc(displayName)}</b>`}<small>${p.isPublic ? `@${esc(p.username || "member")} · ${esc(p.collegeShort || p.college || "College not listed")}` : "Profile private or unavailable"}</small><span class="group-member-role">${isOwner ? "Group owner" : isAdmin ? "Group admin" : "Member"}</span></div>${canManage && participantUids.length > 2 && !isOwner ? `<button class="text-danger group-remove-btn" data-remove-group-member="${esc(p.uid)}">Remove</button>` : ""}</article>`;
  }).join("");
  $("#manageGroupMembers").querySelectorAll("[data-remove-group-member]").forEach(b => b.onclick = () => removeGroupMember(b.dataset.removeGroupMember));
  $("#manageGroupMembers").querySelectorAll("[data-view-group-member]").forEach(b => b.onclick = () => viewMember(b.dataset.viewGroupMember));
  $("#manageGroupSearch").disabled = !canManage;
  $("#manageGroupSearchResults").innerHTML = canManage ? '<p class="muted">Search for a builder to add to this group.</p>' : '<p class="muted">Only group admins can add or remove members.</p>';
  const deleteWrap = $("#deleteGroupWrap");
  if (deleteWrap) deleteWrap.hidden = activeConversation.createdBy !== currentUser?.uid;
  showModal("manageGroupModal");
}
async function searchPublicProfiles(term, max=50) {
  const t = String(term || "").trim().toLowerCase().replace(/^@/, "");
  const base = collection(db, "publicProfiles");
  let snapshots = [];
  if (!t) {
    snapshots = [await getDocs(query(base, orderBy("updatedAt", "desc"), limit(max)))];
  } else {
    const fields = ["usernameLower", "nameLower", "collegeLower", "collegeShortLower", "courseLower", "publicEmailLower"];
    const requests = fields.map(field => getDocs(query(base, orderBy(field), startAt(t), endAt(t + "\uf8ff"), limit(30))));
    requests.push(getDocs(query(base, where("skillsLower", "array-contains", t), limit(30))));
    requests.push(getDocs(query(base, where("interestsLower", "array-contains", t), limit(30))));
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
  if (!canManage) { toast("Only group admins can add members."); return; }
  try {
    const snap = await getDoc(doc(db,"publicProfiles",uid)); if (!snap.exists()) throw new Error("Profile unavailable.");
    const p = snap.data(); const participants = [...new Set([...(c.participants||[]),uid])];
    if (participants.length > 11) { toast("Groups can contain up to 11 members including you."); return; }
    const participantNames = { ...(c.participantNames||{}), [uid]: p.displayName || "Member" };
    await updateDoc(doc(db,"conversations",c.id),{participants,participantNames,updatedAt:serverTimestamp()});
    activeConversation = { ...c, participants, participantNames }; renderChatHeading(); await openGroupManager(); toast("Member added to the team.");
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
    hideModal("memberModal"); toast("Report submitted. Thank you for helping keep the community safe.");
  } catch (error) { toast(friendlyError(error)); }
}

async function startDirectConversation(profile) {
  if (!requireAccount()) return;
  if (!profile?.uid || profile.uid === currentUser.uid) { toast("You cannot start a chat with your own account."); return; }
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
    hideModal("memberModal"); location.hash = "#messages";
    selectConversation(conversation);
  } catch (error) { console.error(error); toast(friendlyError(error)); }
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
    $("#groupMemberResults").querySelectorAll("[data-pick-group-member]").forEach(b => b.onclick = () => { const p=profiles.find(x=>x.uid===b.dataset.pickGroupMember); if(!p)return; if(selectedGroupMembers.has(p.uid))selectedGroupMembers.delete(p.uid); else if(selectedGroupMembers.size<10)selectedGroupMembers.set(p.uid,p); else toast("You can add up to 10 other members."); refreshSelectedGroupMembers(); searchGroupPicker(); });
  } catch (error) { $("#groupMemberResults").textContent = friendlyError(error); }
}
async function createGroupWithMembers(groupName, peopleToAdd) {
  if (!requireAccount()) return;
  const members = [{uid:currentUser.uid,...publicProfile}, ...peopleToAdd.filter(p=>p.uid!==currentUser.uid)];
  const unique = [...new Map(members.map(p=>[p.uid,p])).values()];
  if (unique.length < 2) { toast("Choose at least one other builder."); return; }
  if (unique.length > 11) { toast("A group can contain up to 11 members including you."); return; }
  if (!confirm(`Consent check: have all ${unique.length - 1} selected member${unique.length === 2 ? "" : "s"} agreed to be added to “${groupName}”? Choose OK only after they have agreed.`)) {
    toast("No one was added. Ask members for permission first.");
    return;
  }
  const participants = unique.map(p=>p.uid);
  const participantNames = Object.fromEntries(unique.map(p=>[p.uid,p.displayName||"Member"]));
  const conversationRef = doc(collection(db,"conversations"));
  await setDoc(conversationRef,{isGroup:true,groupName,participants,participantNames,createdBy:currentUser.uid,admins:[currentUser.uid],lastMessage:"Group created",createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastMessageAt:serverTimestamp()});
  const conversation = {id:conversationRef.id,isGroup:true,groupName,participants,participantNames,createdBy:currentUser.uid,admins:[currentUser.uid],lastMessage:"Group created",updatedAt:Date.now()};
  location.hash="#messages"; selectConversation(conversation); toast("Team chat created.");
}
async function createGroup(event) {
  event.preventDefault(); if (!requireAccount()) return;
  const groupName = $("#groupName").value.trim(); const msg = $("#groupMessage"); msg.textContent = "Creating your group…";
  const chosen = [...selectedGroupMembers.values()];
  if (!groupName) { msg.textContent="Enter a group name."; return; }
  if (!chosen.length) { msg.textContent="Search and select at least one member."; return; }
  try {
    await createGroupWithMembers(groupName,chosen);
    hideModal("groupModal"); $("#groupForm").reset(); selectedGroupMembers.clear(); refreshSelectedGroupMembers();
  } catch (error) { console.error(error); msg.textContent = friendlyError(error); }
}
async function deleteCurrentGroup() {
  const c = activeConversation;
  if (!c?.isGroup || c.createdBy !== currentUser?.uid) {
    toast("Only the group creator can delete this group.");
    return;
  }
  const note = prompt(`Type a short confirmation note explaining why you are deleting “${c.groupName || "this group"}”. This note is saved with the deletion.`);
  if (note === null) return;
  const confirmation = note.trim();
  if (confirmation.length < 8) {
    toast("Please enter a confirmation note of at least 8 characters.");
    return;
  }
  if (confirmation.length > 300) {
    toast("The confirmation note must be 300 characters or fewer.");
    return;
  }
  if (!confirm(`Delete “${c.groupName || "this group"}” for all members? This action cannot be undone from the website.`)) return;
  try {
    await updateDoc(doc(db, "conversations", c.id), {
      deleted: true,
      deletedBy: currentUser.uid,
      deletionNote: confirmation,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    hideModal("manageGroupModal");
    if (stopMessageListener) stopMessageListener();
    stopMessageListener = null;
    activeConversation = null;
    activeConversationId = null;
    currentMessages = [];
    $("#chatActive").hidden = true;
    $("#chatPlaceholder").hidden = false;
    toast("Group deleted for all members.");
  } catch (error) {
    console.error("Group deletion failed", error);
    toast(friendlyError(error));
  }
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
  const needed=normalizedList($("#teamNeededSkills").value);
  const size=Number($("#teamSize").value)||4;
  const teamCount=Math.min(10,Math.max(1,Number($("#teamCount")?.value)||1));
  const name=$("#teamProjectName").value.trim();
  const preferredCollege=String($("#teamCollege")?.value||"").trim().toLowerCase();
  const preferredYear=String($("#teamCollegeYear")?.value||"").trim().toLowerCase();
  if(!needed.length){toast("Add the skills or roles you need.");return;}
  $("#teamMatchResults").innerHTML='<div class="team-match-loading"><span class="team-match-orbit"><i></i><b></b><em></em></span><strong>Finding your people</strong><small>Comparing skills, roles, interests and availability…</small><div class="team-match-loading-bar"><span></span></div></div>';
  $("#teamMatchResults").classList.add("is-matching");
  $("#createMatchedTeamBtn").hidden=true; matchedTeamCandidates=[];
  try{
    const profiles=await searchPublicProfiles("",250);
    await new Promise(resolve=>setTimeout(resolve,420));
    const synonyms={
      "react":["reactjs","frontend","javascript"],"reactjs":["react","frontend","javascript"],
      "javascript":["js","frontend","react"],"typescript":["javascript","frontend"],
      "python":["django","flask","fastapi","machine learning"],"machine learning":["ml","python","ai"],
      "ml":["machine learning","ai","python"],"ai":["artificial intelligence","machine learning","ml"],
      "ui/ux":["ui","ux","figma","design"],"design":["ui/ux","figma","product design"],
      "backend":["api","node","node.js","server"],"node.js":["node","backend","express"],
      "firebase":["firestore","authentication","google cloud"],"data science":["analytics","python","sql"]
    };
    const expand = skill => [skill,...(synonyms[skill]||[])].map(x=>x.toLowerCase());
    const poolOnlyOpen=$("#teamCandidatePool")?.value==="open";
    const preferredMode=$("#teamPreferredMode")?.value||"any";
    const strategy=$("#teamMatchStrategy")?.value||"balanced";
    const projectBrief=String($("#teamProjectBrief")?.value||"").toLowerCase();
    const scored=profiles.filter(p=>!poolOnlyOpen||p.lookingForTeam).map(p=>{
      const fields=[...(p.skills||[]),...(p.rolesInterested||[]),...(p.interests||[]),p.bio||""].join(" ").toLowerCase();
      const matched=needed.filter(skill=>expand(skill).some(alias=>fields.includes(alias)));
      const collegeBonus=preferredCollege && String(p.college||"").toLowerCase().includes(preferredCollege) ? 0.08 : 0;
      const yearBonus=preferredYear && String(p.collegeYear||p.studyYear||p.yearOfStudy||"").toLowerCase()===preferredYear ? 0.04 : 0;
      const modeBonus=preferredMode!=="any"&&String(p.preferredMode||"").toLowerCase()===preferredMode.toLowerCase()?0.06:0;
      const briefTokens=projectBrief.split(/[^a-z0-9+#.]+/).filter(x=>x.length>3).slice(0,30);
      const briefMatches=briefTokens.filter(token=>fields.includes(token)).length;
      const briefBonus=briefTokens.length?Math.min(.08,briefMatches/briefTokens.length*.08):0;
      const score=Math.min(1,matched.length/needed.length+collegeBonus+yearBonus+modeBonus+briefBonus);
      return {...p,matchScore:score,matchedSkills:matched,relatedSkills:(p.skills||[]).filter(s=>!matched.some(m=>expand(m).includes(String(s).toLowerCase())) && needed.some(m=>expand(m).some(a=>String(s).toLowerCase().includes(a))))};
    }).filter(p=>p.matchScore>0).sort((a,b)=>b.matchScore-a.matchScore||overlapScore(b)-overlapScore(a));
    const required=teamCount*(size-1);
    matchedTeamCandidates=scored.slice(0,Math.max(required,required*3));
    let groups=[];
    if(strategy==="best-fit"||strategy==="manual"){
      for(let i=0;i<teamCount;i++){const group=matchedTeamCandidates.slice(i*(size-1),(i+1)*(size-1));if(group.length)groups.push(group);}
    }else{
      groups=Array.from({length:teamCount},()=>[]);const remaining=[...matchedTeamCandidates];
      for(let slot=0;slot<size-1;slot++)for(let teamIndex=0;teamIndex<teamCount;teamIndex++){
        if(!remaining.length)break;const covered=new Set(groups[teamIndex].flatMap(p=>p.matchedSkills));
        remaining.sort((a,b)=>{const gainA=a.matchedSkills.filter(x=>!covered.has(x)).length;const gainB=b.matchedSkills.filter(x=>!covered.has(x)).length;return (gainB*.24+b.matchScore)-(gainA*.24+a.matchScore);});
        const chosen=remaining.shift();if(chosen)groups[teamIndex].push(chosen);
      }
      groups=groups.filter(g=>g.length);
    }
    const actual=groups.length;
    $("#teamMatchResults").innerHTML=groups.length?`<div class="team-match-summary"><b>${strategy==="balanced"?"Balanced team allocation complete":"Best-fit candidates ranked"}</b><span>${groups.length} team suggestion(s) · ${groups.reduce((n,g)=>n+g.length,0)} builder matches</span><small>Scores are profile-based estimates, not guarantees. Review availability and ask people before adding them to a chat.</small></div>`+groups.map((group,i)=>{const covered=[...new Set(group.flatMap(p=>p.matchedSkills))];const missing=needed.filter(x=>!covered.includes(x));return `<section class="generated-team"><div class="generated-team-head"><div><h3>Suggested team ${i+1}</h3><p class="muted">${group.length+1} members including you · ${Math.round(group.reduce((n,p)=>n+p.matchScore,0)/Math.max(1,group.length)*100)}% average fit</p></div><span class="team-balance-score">${covered.length}/${needed.length} roles covered</span></div><div class="team-coverage"><div class="team-coverage-bar"><span style="width:${Math.round(covered.length/needed.length*100)}%"></span></div><small>${covered.map(esc).join(" · ")}${missing.length?` <em>Missing: ${missing.map(esc).join(", ")}</em>`:""}</small></div>${group.map(p=>`<label class="team-match-option"><input type="checkbox" data-team-match="${esc(p.uid)}" data-team-index="${i}" checked><span><b>${esc(p.displayName||"Builder")}</b><small>@${esc(p.username||"member")} · ${esc(p.collegeShort||p.college||"College not listed")}${p.collegeYear||p.studyYear ? ` · Year ${esc(p.collegeYear||p.studyYear)}` : ""}</small><span class="skill-tags">${(p.skills||[]).slice(0,6).map(x=>`<i>${esc(x)}</i>`).join("")}</span><small>Matched: ${esc(p.matchedSkills.join(", ")||"Related skills")} · ${Math.round(p.matchScore*100)}% fit${p.relatedSkills?.length ? ` · Related: ${esc(p.relatedSkills.join(", "))}` : ""}</small></span></label>`).join("")}</section>`;}).join(""):'<p class="muted">No matching builders are available yet. Try broader roles or invite more people to complete their skills profiles.</p>';
    $("#teamMatchResults").classList.remove("is-matching");
    $("#teamMatchResults").dataset.teamName=name;
    $("#teamMatchResults").dataset.teamCount=String(actual);
    $("#createMatchedTeamBtn").hidden=!groups.length;
    $("#createMatchedTeamBtn").textContent=actual>1?`Create ${actual} suggested team chats →`:"Create team chat →";
  }catch(error){$("#teamMatchResults").classList.remove("is-matching");$("#teamMatchResults").textContent=friendlyError(error);}
}
async function createMatchedTeam() {
  const sections=[...$("#teamMatchResults").querySelectorAll(".generated-team")];
  const teams=sections.map((section,index)=>({
    index,
    members:[...section.querySelectorAll("[data-team-match]:checked")].map(b=>matchedTeamCandidates.find(p=>p.uid===b.dataset.teamMatch)).filter(Boolean)
  })).filter(team=>team.members.length);
  if(!teams.length){toast("Select at least one builder for a team.");return;}
  if(!confirm(`Create ${teams.length} separate team chat${teams.length===1?"":"s"}? Selected members will be added immediately. Ask each person for permission before creating a team with them.`))return;
  try{
    for(let i=0;i<teams.length;i++){
      const suffix=teams.length>1?` · Team ${i+1}`:"";
      await createGroupWithMembers((($("#teamProjectName").value.trim()||"HackStop project team")+suffix).slice(0,60),teams[i].members);
    }
    hideModal("teamBuilderModal");
    toast(`${teams.length} team chat${teams.length===1?"":"s"} created.`);
  }catch(error){toast(friendlyError(error));}
}

function renderMyProfile() {
  const panel = $("#myProfilePanel");
  if (!currentUser || !publicProfile) {
    panel.innerHTML = `<div class="profile-empty"><div class="placeholder-icon">◎</div><h3>${currentUser ? "Complete your builder profile." : "Your profile starts here."}</h3><p>${currentUser ? "Add your skills, college, interests, and preferred team roles." : "Sign in and complete your builder profile to be discoverable by teammates."}</p><button class="btn btn-primary" id="profileStartInline">${currentUser ? "Complete profile" : "Sign in to create profile"}</button></div>`;
    $("#profileStartInline").onclick = () => currentUser ? openProfileEditor(false) : openAuth();
    return;
  }
  const p = publicProfile;
  const skills = p.skills || [];
  const roles = p.rolesInterested || [];
  const interests = p.interests || [];
  const completedFields = [p.displayName,p.username,p.college,p.course,p.studyLevel,p.bio,skills.length,roles.length,interests.length,p.graduationYear,p.github||p.linkedin||p.portfolio].filter(Boolean).length;
  const completion = Math.round(completedFields / 11 * 100);
  panel.innerHTML = `<div class="profile-overview">
    <div class="avatar avatar-profile">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="Profile photo" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div>
    <div class="profile-main">
      <div class="profile-name-line"><div><div class="eyebrow">${p.profileVisibility === "private" ? "YOUR PRIVATE BUILDER PROFILE" : "YOUR PUBLIC BUILDER PROFILE"}</div><h3>${esc(p.displayName)}</h3><span>@${esc(p.username)}</span></div>${p.lookingForTeam ? '<span class="open-pill">Open to teammates</span>' : ''}</div>
      <p>${esc(p.bio || "Add a short introduction to help teammates understand what you build.")}</p>
      ${p.profileVisibility === "private" ? '<p class="privacy-state-note">Private profile · only you can see these details. This profile is not in the directory or public team matcher.</p>' : ''}
      <div class="profile-completion"><div><b>Profile completeness</b><strong>${completion}%</strong></div><span class="profile-completion-track"><i style="width:${completion}%"></i></span><small>A complete profile helps teammates understand your strengths before they contact you.</small></div>
      <div class="profile-detail-grid">
        <section class="profile-detail-card"><small>EDUCATION</small><b>${esc(p.college || "College not added")}</b><span>${esc([p.collegeShort,p.course].filter(Boolean).join(" · ") || "Course not added")}</span><span>${esc([p.studyLevel,p.graduationYear ? `Class of ${p.graduationYear}` : ""].filter(Boolean).join(" · ") || "Study level not added")}</span></section>
        <section class="profile-detail-card"><small>COLLABORATION</small><b>${esc(p.availability || "Availability not added")}</b><span>Preferred format: ${esc(p.preferredMode || "Any format")}</span><span>${p.lookingForTeam ? "Open to teammate invitations" : "Not currently looking for a team"}</span></section>
        <section class="profile-detail-card"><small>LOCATION</small><b>${esc([p.city,p.country].filter(Boolean).join(", ") || "Location not added")}</b><span>Visible according to your profile privacy settings</span></section>
        <section class="profile-detail-card"><small>CONTACT VISIBILITY</small><b>${p.profileVisibility === "private" ? "Private profile" : "Community profile"}</b><span>Email: ${p.publicEmail ? "Shared publicly" : "Private"}</span><span>Phone: ${p.publicPhone ? "Shared publicly" : "Private"}</span></section>
      </div>
      <h4>Skills</h4><div class="skill-tags">${skills.map(s => `<span>${esc(s)}</span>`).join("") || '<span>Add the skills you use</span>'}</div>
      <h4>Interested roles</h4><div class="skill-tags">${roles.map(s => `<span>${esc(s)}</span>`).join("") || '<span>Add roles you want to explore</span>'}</div>
      <h4>Interests & domains</h4><div class="skill-tags">${interests.map(s => `<span>${esc(s)}</span>`).join("") || '<span>Add domains that motivate you</span>'}</div>
      <div class="member-links">${p.github ? `<a href="${esc(validUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}${p.linkedin ? `<a href="${esc(validUrl(p.linkedin))}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}${p.portfolio ? `<a href="${esc(validUrl(p.portfolio))}" target="_blank" rel="noopener">Portfolio ↗</a>` : ""}</div>
    </div>
  </div>`;
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

function updateAiAccessUI() {
  const signedIn = Boolean(currentUser && db);
  const gate = $("#aiLoginGate");
  const form = $("#aiForm");
  const messages = $("#aiMessages");
  if (gate) gate.hidden = signedIn;
  if (form) form.hidden = !signedIn;
  if (messages) messages.hidden = !signedIn;
  $("#aiNewChatBtn").disabled = !signedIn;
  if (!signedIn) {
    $("#aiHistoryList").innerHTML = '<p class="ai-history-empty">Sign in to keep your conversations.</p>';
    $("#aiActionReview").hidden = true;
  }
}

function setAiMode(mode) {
  aiMode = mode === "wish" ? "wish" : "chat";
  const chatButton = $("#aiChatModeBtn");
  const wishButton = $("#aiWishModeBtn");
  chatButton.classList.toggle("active", aiMode === "chat");
  wishButton.classList.toggle("active", aiMode === "wish");
  chatButton.setAttribute("aria-selected", String(aiMode === "chat"));
  wishButton.setAttribute("aria-selected", String(aiMode === "wish"));
  const aiBrand = document.querySelector(".ai-brand-lockup b");
  if (aiBrand) aiBrand.textContent = aiMode === "wish" ? "AI Wish Workspace" : "HackVerse AI";
  $("#aiPanel").setAttribute("aria-label", aiMode === "wish" ? "AI Wish workspace" : "HackVerse AI assistant");
  $("#aiInput").placeholder = aiMode === "wish"
    ? "Tell HackVerse what you want done…"
    : "Ask anything about HackVerse…";
  $("#aiComposerHint").textContent = aiMode === "wish"
    ? "Describe a task · review the plan · apply it"
    : "Enter to send · Shift + Enter for a new line";
  $("#aiModeIntro").innerHTML = aiMode === "wish"
    ? "<b>What would you like HackVerse to do?</b><span>Describe a goal in plain language. I’ll prepare supported actions for you to review before anything changes.</span>"
    : "<b>What can I help you with?</b><span>Ask how HackVerse works, find a feature or get help with your account.</span>";
  pendingAiActions = [];
  renderAiActionReview();
}

function renderAiMessages() {
  const box = $("#aiMessages");
  if (!box) return;
  const messages = currentAiMessages.length ? currentAiMessages : [{ role: "assistant", content: aiMode === "wish"
    ? "Tell me what you want to accomplish in HackVerse. I’ll show you a clear action plan and wait for your approval before applying it."
    : "Hi! I’m your HackVerse assistant. I can explain the platform, help you discover opportunities and guide you through your workspace." }];
  box.innerHTML = messages.map(message => {
    const isUser = message.role === "user";
    return `<div class="ai-message ${isUser ? "ai-message-user" : "ai-message-agent"}"><span class="ai-message-avatar">${isUser ? "You" : "✦"}</span><div class="ai-message-bubble">${esc(message.content || "")}</div></div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

async function loadAiHistory() {
  updateAiAccessUI();
  const list = $("#aiHistoryList");
  if (!currentUser || !db) return;
  list.innerHTML = '<p class="ai-history-empty">Loading your history…</p>';
  try {
    const snapshot = await getDocs(query(
      collection(db, "aiConversations"),
      where("ownerUid", "==", currentUser.uid),
      orderBy("updatedAt", "desc"),
      limit(30)
    ));
    const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    if (!rows.length) {
      list.innerHTML = '<p class="ai-history-empty">Your chats will appear here. Start a new conversation whenever you need a fresh task.</p>';
      return;
    }
    list.innerHTML = rows.map(item => `<button type="button" class="ai-history-item ${item.id === activeAiConversationId ? "active" : ""}" data-ai-conversation="${esc(item.id)}"><b>${esc(item.title || "New conversation")}</b><small>${item.mode === "wish" ? "AI Wish" : "Website help"} · ${esc(item.preview || "Open conversation")}</small></button>`).join("");
    list.querySelectorAll("[data-ai-conversation]").forEach(button => button.addEventListener("click", () => openAiConversation(button.dataset.aiConversation)));
  } catch (error) {
    console.warn("Ordered AI history query failed; retrying without the composite sort index.", error);
    try {
      const fallback = await getDocs(query(collection(db, "aiConversations"), where("ownerUid", "==", currentUser.uid), limit(30)));
      const rows = fallback.docs.map(item => ({ id: item.id, ...item.data() })).sort((a,b) => {
        const stamp = value => value?.toMillis ? value.toMillis() : (value instanceof Date ? value.getTime() : Number(value) || 0);
        return stamp(b.updatedAt) - stamp(a.updatedAt);
      });
      list.innerHTML = rows.length ? rows.map(item => `<button type="button" class="ai-history-item ${item.id === activeAiConversationId ? "active" : ""}" data-ai-conversation="${esc(item.id)}"><b>${esc(item.title || "New conversation")}</b><small>${item.mode === "wish" ? "AI Wish" : "Website help"} · ${esc(item.preview || "Open conversation")}</small></button>`).join("") : '<p class="ai-history-empty">Your chats will appear here. Start a new conversation whenever you need a fresh task.</p>';
      list.querySelectorAll("[data-ai-conversation]").forEach(button => button.addEventListener("click", () => openAiConversation(button.dataset.aiConversation)));
    } catch (fallbackError) {
      console.warn("AI history fallback failed", fallbackError);
      list.innerHTML = `<p class="ai-history-empty">History is unavailable right now. ${esc(friendlyError(fallbackError))}</p>`;
    }
  }
}

async function startAiConversation(mode = aiMode) {
  if (!requireAccount()) return null;
  try {
    const conversationRef = doc(collection(db, "aiConversations"));
    await setDoc(conversationRef, {
      ownerUid: currentUser.uid,
      title: mode === "wish" ? "New AI Wish" : "New website help chat",
      preview: "",
      mode,
      agentSessionId: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    activeAiConversationId = conversationRef.id;
    activeAiConversationMode = mode;
    currentAiMessages = [];
    pendingAiActions = [];
    renderAiMessages();
    renderAiActionReview();
    await loadAiHistory();
    return conversationRef.id;
  } catch (error) {
    toast(`Could not start AI conversation: ${friendlyError(error)}`);
    return null;
  }
}

async function openAiConversation(conversationId) {
  if (!requireAccount()) return;
  try {
    const parent = await getDoc(doc(db, "aiConversations", conversationId));
    if (!parent.exists() || parent.data().ownerUid !== currentUser.uid) throw new Error("This conversation is not available to your account.");
    const data = parent.data();
    activeAiConversationId = conversationId;
    activeAiConversationMode = data.mode === "wish" ? "wish" : "chat";
    setAiMode(activeAiConversationMode);
    const snapshot = await getDocs(query(collection(db, "aiConversations", conversationId, "messages"), orderBy("createdAt", "asc"), limit(150)));
    currentAiMessages = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    pendingAiActions = [];
    renderAiMessages();
    renderAiActionReview();
    await loadAiHistory();
  } catch (error) {
    toast(`Could not open conversation: ${friendlyError(error)}`);
  }
}

async function persistAiMessage(role, content) {
  if (!activeAiConversationId || !currentUser || !db) return;
  const messageRef = doc(collection(db, "aiConversations", activeAiConversationId, "messages"));
  await setDoc(messageRef, { role, content: String(content || "").slice(0, 12000), createdAt: serverTimestamp() });
  currentAiMessages.push({ id: messageRef.id, role, content: String(content || "").slice(0, 12000), createdAt: Date.now() });
  renderAiMessages();
}

function validateAiActions(actions) {
  if (!Array.isArray(actions)) return [];
  const pages = new Set(["home", "opportunities", "saved", "people", "messages", "aiwish", "profile", "notifications", "settings"]);
  const categories = new Set(["hackathon", "case-competition", "coding-event", "bootcamp", "course", "certification", "other"]);
  const eventIds = new Set(events.map(event => event.id));
  return actions.slice(0, 8).map(action => {
    if (!action || typeof action !== "object") return null;
    const type = String(action.type || "");
    if (type === "navigate" && pages.has(action.page)) return { type, page: action.page };
    if (type === "search_opportunities") return {
      type,
      query: String(action.query || "").slice(0, 100),
      skill: String(action.skill || "").slice(0, 60),
      category: categories.has(action.category) ? action.category : "all",
      country: String(action.country || "").slice(0, 60)
    };
    if ((type === "open_opportunity" || type === "save_opportunity") && eventIds.has(String(action.eventId || "")))
      return { type, eventId: String(action.eventId) };
    if (type === "search_builders" && String(action.query || "").trim())
      return { type, query: String(action.query).trim().slice(0, 100) };
    if (type === "create_project" && String(action.title || "").trim() && String(action.description || "").trim())
      return {
        type,
        title: String(action.title).trim().slice(0, 100),
        description: String(action.description).trim().slice(0, 600),
        techStack: Array.isArray(action.techStack) ? action.techStack.map(value => String(value).slice(0, 40)).slice(0, 12) : [],
        visibility: action.visibility === "public" ? "public" : "private"
      };
    if (type === "create_group" && String(action.groupName || "").trim() && Array.isArray(action.memberUids)) {
      const allowed = new Set(aiAvailableBuilders.map(p => p.uid));
      const memberUids = [...new Set(action.memberUids.map(String))].filter(uid => allowed.has(uid) && uid !== currentUser?.uid).slice(0,10);
      if (memberUids.length) return { type, groupName: String(action.groupName).trim().slice(0,60), memberUids };
    }
    if (type === "send_message" && currentConversations.some(c => c.id === String(action.conversationId)) && String(action.text || "").trim())
      return { type, conversationId: String(action.conversationId), text: String(action.text).trim().slice(0,2000) };
    if (type === "update_settings") {
      const next = {};
      if (["dark","light"].includes(action.theme)) next.theme=action.theme;
      if (["full","reduced"].includes(action.motion)) next.motion=action.motion;
      if (["normal","large","larger"].includes(action.textSize)) next.textSize=action.textSize;
      if (Object.keys(next).length) return { type, ...next };
    }
    return null;
  }).filter(Boolean);
}

function aiActionLabel(action) {
  if (action.type === "navigate") return `Open the ${action.page} section`;
  if (action.type === "search_opportunities") return `Search opportunities${action.query ? ` for “${action.query}”` : ""}${action.category !== "all" ? ` · ${action.category}` : ""}`;
  if (action.type === "open_opportunity") return `Open: ${events.find(item => item.id === action.eventId)?.title || "selected opportunity"}`;
  if (action.type === "save_opportunity") return `Save: ${events.find(item => item.id === action.eventId)?.title || "selected opportunity"}`;
  if (action.type === "search_builders") return `Search community for “${action.query}”`;
  if (action.type === "create_project") return `Create ${action.visibility === "public" ? "public" : "private"} project: ${action.title}`;
  if (action.type === "create_group") return `Create group “${action.groupName}” with ${action.memberUids.length} selected builders`;
  if (action.type === "send_message") return `Send a message in ${conversationLabel(currentConversations.find(c=>c.id===action.conversationId)||{})}: “${action.text.slice(0,90)}”`;
  if (action.type === "update_settings") return `Update interface settings${action.theme?` · ${action.theme} theme`:""}${action.motion?` · ${action.motion} motion`:""}${action.textSize?` · ${action.textSize} text`:""}`;
  return "Apply website action";
}

function renderAiActionReview() {
  const panel = $("#aiActionReview");
  if (!panel) return;
  if (!pendingAiActions.length || !currentUser) { panel.hidden = true; panel.innerHTML = ""; return; }
  panel.hidden = false;
  panel.innerHTML = `<b>Ready for your review · ${pendingAiActions.length} action${pendingAiActions.length === 1 ? "" : "s"}</b><ul>${pendingAiActions.map(action => `<li>${esc(aiActionLabel(action))}</li>`).join("")}</ul><button type="button" class="btn btn-primary" id="aiApplyActionsBtn">Apply these actions →</button><small>Nothing changes until you press Apply. Project records are created as private unless you explicitly asked for public visibility.</small>`;
  $("#aiApplyActionsBtn").onclick = applyAiActions;
}

async function sendAiMessage(event) {
  event.preventDefault();
  if (!requireAccount() || isAiSending) return;
  const input = $("#aiInput");
  const message = input.value.trim();
  if (!message) return;
  if (message.length > 4000) { toast("Keep each AI request under 4,000 characters."); return; }
  if (!activeAiConversationId || activeAiConversationMode !== aiMode) {
    const created = await startAiConversation(aiMode);
    if (!created) return;
  }
  isAiSending = true;
  $("#aiSendBtn").disabled = true;
  $("#aiSendBtn").textContent = "…";
  input.value = "";
  pendingAiActions = [];
  renderAiActionReview();
  try {
    await persistAiMessage("user", message);
    const conversationRef = doc(db, "aiConversations", activeAiConversationId);
    await updateDoc(conversationRef, {
      title: currentAiMessages.filter(item => item.role === "user").length <= 1 ? message.slice(0, 48) : (activeAiConversationMode === "wish" ? "AI Wish · " : "Help · ") + message.slice(0, 34),
      preview: message.slice(0, 120),
      mode: aiMode,
      updatedAt: serverTimestamp()
    });
    if (aiMode === "wish") {
      try { aiAvailableBuilders = await searchPublicProfiles("", 200); } catch { aiAvailableBuilders = []; }
    }
    const token = await currentUser.getIdToken();
    const response = await fetch("/api/agent37/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ conversationId: activeAiConversationId, mode: aiMode, message, page: (location.hash || "#home").slice(1) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `AI service returned ${response.status}.`);
    const reply = String(data.reply || "I could not prepare a response. Please try again.").slice(0, 12000);
    await persistAiMessage("assistant", reply);
    if (aiMode === "wish") {
      pendingAiActions = validateAiActions(data.actions);
      renderAiActionReview();
      if (Array.isArray(data.actions) && data.actions.length && !pendingAiActions.length) {
        await persistAiMessage("assistant", "I couldn't validate the requested website actions. Try describing a search, navigation, save, community lookup or project creation task more specifically.");
      }
    }
    await updateDoc(conversationRef, { preview: reply.slice(0, 120), updatedAt: serverTimestamp() });
    await loadAiHistory();
  } catch (error) {
    console.error("Agent37 assistant request failed", error);
    const messageText = error?.message || "The AI service could not complete this request.";
    const help = messageText.includes("404") || messageText.toLowerCase().includes("not found")
      ? `${messageText}\n\nThe /api/agent37/chat endpoint must be deployed on Vercel. A static Firebase Hosting deployment does not run this API route.`
      : messageText;
    await persistAiMessage("assistant", `I couldn't complete that request. ${help}`.slice(0, 12000)).catch(() => {});
  } finally {
    isAiSending = false;
    $("#aiSendBtn").disabled = false;
    $("#aiSendBtn").textContent = "↑";
    input.focus();
  }
}

async function applyAiActions() {
  if (!requireAccount() || !pendingAiActions.length) return;
  const actions = pendingAiActions.slice();
  const summary = actions.map(aiActionLabel).join("\n• ");
  if (!confirm(`Apply these ${actions.length} HackVerse action${actions.length === 1 ? "" : "s"}?\n\n• ${summary}\n\nYou can review project visibility before sharing it.`)) return;
  const completed = [];
  try {
    for (const action of actions) {
      if (action.type === "navigate") {
        location.hash = `#${action.page}`;
        completed.push(`Opened ${action.page}`);
      } else if (action.type === "search_opportunities") {
        $("#eventSearch").value = action.query;
        $("#eventSkill").value = action.skill;
        $("#eventCategory").value = action.category;
        if (action.country) {
          const option = [...$("#eventCountry").options].find(item => item.value.toLowerCase() === action.country.toLowerCase());
          if (option) $("#eventCountry").value = option.value;
        }
        allEventsVisible = 24;
        renderEvents();
        location.hash = "#opportunities";
        completed.push("Applied opportunity search filters");
      } else if (action.type === "open_opportunity") {
        location.hash = "#opportunities";
        viewEvent(action.eventId);
        completed.push("Opened opportunity details");
      } else if (action.type === "save_opportunity") {
        if (!savedIds.has(action.eventId)) {
          const saved = await saveEvent(action.eventId);
          if (!saved) throw new Error("HackVerse could not save that opportunity. Check your connection and Firestore rules.");
          completed.push("Saved an opportunity to your shortlist");
        } else {
          completed.push("Opportunity was already in your shortlist");
        }
      } else if (action.type === "search_builders") {
        $("#peopleSearch").value = action.query;
        location.hash = "#people";
        searchPeople();
        completed.push("Started a community search");
      } else if (action.type === "create_project") {
        await addDoc(collection(db, "projects"), {
          ownerUid: currentUser.uid,
          ownerName: publicProfile?.displayName || currentUser.displayName || "Member",
          title: action.title,
          description: action.description,
          techStack: action.techStack,
          projectUrl: "",
          githubUrl: "",
          visibility: action.visibility,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        await loadProjects();
        location.hash = "#profile";
        completed.push(`Created ${action.visibility} project “${action.title}”`);
      } else if (action.type === "create_group") {
        const selected = aiAvailableBuilders.filter(p=>action.memberUids.includes(p.uid));
        if(selected.length!==action.memberUids.length)throw new Error("One or more suggested builders are no longer available in the public directory.");
        await createGroupWithMembers(action.groupName,selected);
        completed.push(`Created group “${action.groupName}”`);
      } else if (action.type === "send_message") {
        const conversation=currentConversations.find(c=>c.id===action.conversationId);
        if(!conversation || !(conversation.participants||[]).includes(currentUser.uid))throw new Error("That conversation is no longer available to your account.");
        await addDoc(collection(db,"conversations",action.conversationId,"messages"),{authorUid:currentUser.uid,authorName:publicProfile?.displayName||currentUser.displayName||"Member",text:action.text,kind:"text",createdAt:serverTimestamp()});
        await updateDoc(doc(db,"conversations",action.conversationId),{lastMessage:action.text.slice(0,180),lastMessageSender:currentUser.uid,lastMessageAt:serverTimestamp(),updatedAt:serverTimestamp()});
        completed.push(`Sent a message in ${conversationLabel(conversation)}`);
      } else if (action.type === "update_settings") {
        const prefs=readAppPrefs();Object.assign(prefs,{...(action.theme?{theme:action.theme}:{}),...(action.motion?{motion:action.motion}:{}),...(action.textSize?{textSize:action.textSize}:{})});localStorage.setItem("hackverse-app-preferences",JSON.stringify(prefs));applyAppPrefs();loadSettingsUI();
        completed.push("Updated interface settings");
      }
    }
    pendingAiActions = [];
    renderAiActionReview();
    toast(`${completed.length} AI action${completed.length === 1 ? "" : "s"} applied.`);
    const resultText = `Done. ${completed.join("; ")}.`;
    await persistAiMessage("assistant", resultText);
    await updateDoc(doc(db, "aiConversations", activeAiConversationId), { preview: resultText.slice(0, 120), updatedAt: serverTimestamp() });
    await loadAiHistory();
  } catch (error) {
    toast(`Some actions could not be applied: ${friendlyError(error)}`);
    await persistAiMessage("assistant", `I applied ${completed.length} action(s), but the remaining work stopped because: ${friendlyError(error)}`).catch(() => {});
  }
}



function readAppPrefs(){try{return JSON.parse(localStorage.getItem("hackverse-app-preferences")||"{}");}catch{return {};}}
function applyAppPrefs(){const p=readAppPrefs();document.body.classList.toggle("light",p.theme==="light");document.body.classList.toggle("reduce-motion",p.motion==="reduced"||p.reduceMotion===true);document.body.classList.toggle("text-large",p.textSize==="large");document.body.classList.toggle("text-larger",p.textSize==="larger");}
function saveAppPrefs(){const p={theme:$("#settingTheme").value,motion:$("#settingMotion").value,reduceMotion:$("#prefReduceMotion").checked,textSize:$("#settingTextSize").value,inApp:$("#prefInApp").checked,desktop:$("#prefDesktop").checked,opportunity:$("#prefOpportunity").checked,sound:$("#prefSound").checked};localStorage.setItem("hackverse-app-preferences",JSON.stringify(p));applyAppPrefs();renderNotificationCenter();$("#settingsSaveStatus").textContent="Preferences saved just now.";if(p.desktop&&"Notification" in window&&Notification.permission==="default")Notification.requestPermission().then(result=>{if(result!=="granted"){const next=readAppPrefs();next.desktop=false;localStorage.setItem("hackverse-app-preferences",JSON.stringify(next));$("#prefDesktop").checked=false;toast("Browser notifications were not allowed.");}});}
function loadSettingsUI(){const p=readAppPrefs();$("#settingTheme").value=p.theme|| (document.body.classList.contains("light")?"light":"dark");$("#settingMotion").value=p.motion||"full";$("#prefReduceMotion").checked=Boolean(p.reduceMotion);$("#settingTextSize").value=p.textSize||"normal";$("#prefInApp").checked=p.inApp!==false;$("#prefDesktop").checked=Boolean(p.desktop);$("#prefOpportunity").checked=p.opportunity!==false;$("#prefSound").checked=Boolean(p.sound);$("#settingsAccountName").textContent=publicProfile?.displayName||currentUser?.displayName||"Guest session";$("#settingsAccountEmail").textContent=currentUser?.email||"Sign in to manage your account.";$("#settingProfileVisibility").value=publicProfile?.profileVisibility||"public";}
function upcomingSavedDeadlines(){if(!currentUser||readAppPrefs().opportunity===false)return [];const now=Date.now();return events.filter(e=>savedIds.has(e.id)).map(e=>({...e,deadlineMs:tsMillis(e.registrationDeadline)})).filter(e=>e.deadlineMs>now&&e.deadlineMs<=now+14*86400000).sort((a,b)=>a.deadlineMs-b.deadlineMs);}
function notifyUpcomingDeadlines(){const prefs=readAppPrefs();if(!currentUser||!prefs.desktop||!("Notification" in window)||Notification.permission!=="granted")return;for(const e of upcomingSavedDeadlines()){const key=`hv-deadline-notified-${currentUser.uid}-${e.id}`;const stamp=String(e.deadlineMs);if(localStorage.getItem(key)===stamp)continue;localStorage.setItem(key,stamp);try{const days=Math.max(0,Math.ceil((e.deadlineMs-Date.now())/86400000));const n=new Notification("Saved opportunity deadline",{body:`${e.title||"A saved opportunity"} closes in ${days} day${days===1?"":"s"}.`,tag:`deadline-${e.id}`});n.onclick=()=>{window.focus();location.hash="#opportunities";viewEvent(e.id);};}catch{}}}
function renderNotificationCenter(){
  const feed=$("#notificationFeed");if(!feed)return;const prefs=readAppPrefs();
  if(!currentUser){feed.innerHTML='<div class="empty-note">Sign in to view your notifications and chat activity.</div>';$("#notificationBadge").hidden=true;$("#unreadChatCount").textContent="0";$("#activeChatCount").textContent="0";$("#savedOpportunityCount").textContent="0";return;}
  const unread=currentConversations.filter(chatIsUnread);const unreadCount=unread.length;const reminders=upcomingSavedDeadlines();
  $("#unreadChatCount").textContent=String(unreadCount);$("#activeChatCount").textContent=String(currentConversations.length);$("#savedOpportunityCount").textContent=String(savedIds.size);
  const badge=$("#notificationBadge");const totalAlerts=unreadCount+reminders.length;badge.hidden=totalAlerts===0;badge.textContent=totalAlerts>9?"9+":String(totalAlerts);
  if(prefs.inApp===false){feed.innerHTML='<div class="empty-note">In-app activity is paused in your preferences.</div>';return;}
  const rows=[...currentConversations].sort((a,b)=>tsMillis(b.lastMessageAt)-tsMillis(a.lastMessageAt)).slice(0,30);
  const chatHtml=rows.length?'<div class="notification-section-heading">MESSAGES & CONVERSATIONS</div>'+rows.map(c=>{const unreadNow=chatIsUnread(c);const when=tsMillis(c.lastMessageAt)?new Date(tsMillis(c.lastMessageAt)).toLocaleString():"Recently";const preview=c.lastMessage||"Conversation updated";return `<button class="notification-item ${unreadNow?"unread":""}" type="button" data-open-notification-chat="${esc(c.id)}"><span class="notification-icon">${c.isGroup?"✦":"↗"}</span><span><b>${esc(conversationLabel(c))}${unreadNow?" · New message":""}</b><small>${esc(preview)}</small><time>${esc(when)}</time></span><i>${unreadNow?"NEW":"CHAT"}</i></button>`;}).join("") : "";
  const deadlineHtml=reminders.length?'<div class="notification-section-heading">SAVED OPPORTUNITY DEADLINES</div>'+reminders.map(e=>{const days=Math.max(0,Math.ceil((e.deadlineMs-Date.now())/86400000));return `<button class="notification-item deadline-item" type="button" data-open-notification-event="${esc(e.id)}"><span class="notification-icon">◷</span><span><b>${esc(e.title||"Saved opportunity")}</b><small>Registration closes in ${days} day${days===1?"":"s"} · ${esc(e.organizer||e.sourceName||"Organiser not listed")}</small><time>${new Date(e.deadlineMs).toLocaleDateString()}</time></span><i>DEADLINE</i></button>`;}).join("") : "";
  feed.innerHTML=chatHtml+deadlineHtml||'<div class="empty-note">You are all caught up. New chat activity and saved-opportunity deadlines will appear here.</div>';
  feed.querySelectorAll("[data-open-notification-chat]").forEach(b=>b.onclick=()=>{const c=currentConversations.find(x=>x.id===b.dataset.openNotificationChat);if(c){location.hash="#messages";selectConversation(c);}});
  feed.querySelectorAll("[data-open-notification-event]").forEach(b=>b.onclick=()=>{location.hash="#opportunities";viewEvent(b.dataset.openNotificationEvent);});
}
function playAppNotificationTone(){try{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;const context=new AudioContextClass();const oscillator=context.createOscillator();const gain=context.createGain();oscillator.type="sine";oscillator.frequency.value=740;gain.gain.setValueAtTime(0.0001,context.currentTime);gain.gain.exponentialRampToValueAtTime(0.08,context.currentTime+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+0.16);oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+0.17);oscillator.onended=()=>context.close().catch(()=>{});}catch{}}
function notifyIncomingActivity(rows){if(!currentUser)return;const prefs=readAppPrefs();for(const c of rows){if(c.lastMessageSender===currentUser.uid||!chatIsUnread(c))continue;const stamp=tsMillis(c.lastMessageAt);const key=`hv-notified-${currentUser.uid}-${c.id}`;if(!stamp||Number(localStorage.getItem(key)||0)>=stamp)continue;localStorage.setItem(key,String(stamp));if(prefs.sound)playAppNotificationTone();if(prefs.desktop&&"Notification" in window&&Notification.permission==="granted"){try{const n=new Notification(conversationLabel(c),{body:c.lastMessage||"New message",tag:c.id});n.onclick=()=>{window.focus();location.hash="#messages";selectConversation(c);};}catch{}}}}
function showSettingsTab(tab){$$('[data-settings-panel]').forEach(p=>p.classList.toggle("active",p.dataset.settingsPanel===tab));$$('[data-settings-tab]').forEach(b=>b.classList.toggle("active",b.dataset.settingsTab===tab));}
const tourSteps=[
 {route:"home",selector:".hero-copy",title:"Welcome to HackVerse",text:"Your builder network starts here. Discover opportunities, build your profile, meet collaborators and turn your ideas into real projects. The top navigation opens dedicated sections rather than stacking every feature on one screen."},
 {route:"opportunities",selector:"#opportunitiesContent, #opportunitiesSignInGate",title:"Opportunity radar",text:"Explore hackathons, case competitions, coding events, bootcamps and courses. Filter by skill, country, format, eligibility, cost and deadline. Event listings and details require a signed-in member account."},
 {route:"people",selector:"#people .section-heading",title:"Community directory",text:"Search discoverable builders by their public profile, interests and skills. Open a profile to understand a builder's background, then start a direct conversation or invite them to a project group."},
 {route:"people",selector:"#smartTeamBtn",title:"Automatic team builder",text:"Describe your project, choose team size and roles, and run the matching engine. Balanced mode spreads complementary skills across teams; you can review and select people before creating chats."},
 {route:"messages",selector:".chat-workspace",title:"Messaging workspace",text:"Your chat area supports direct and group conversations, live message updates, replies, reactions, edit/delete, files, voice notes, read receipts and typing indicators. Open a name or group details to view member profiles."},
 {route:"aiwish",selector:"#aiWishPage",title:"AI Wish workspace",text:"Describe a website task in plain language. AI Wish prepares supported changes and waits for your approval before applying them."},
 {route:"profile",selector:"#myProfilePanel",title:"Your builder profile",text:"Your profile is your professional identity on HackVerse. Add skills, education, interests, links and availability, then showcase the projects you build. Your public visibility is controlled in Settings."},
 {route:"notifications",selector:"#activitySummary",title:"Notification centre",text:"Track unread chats and saved opportunity deadlines here. Desktop alerts work while HackVerse is open and your browser has granted notification permission."},
 {route:"settings",selector:".settings-grid",title:"Settings and personalisation",text:"Choose the theme, motion level, text size, notification preferences and profile visibility. Changes are stored in this browser, while your profile visibility is stored with your Firebase profile."},
 {route:"home",selector:"#aiLaunchBtn",title:"Meet HackVerse AI",text:"Open the floating Agent37 chatbot for website help. Use the dedicated AI Wish page to describe tasks and review supported website actions before applying them. AI access depends on the server credentials being configured."}
];
let activeTourIndex=-1;
function removeTourHighlight(){document.querySelectorAll(".tour-highlight").forEach(el=>el.classList.remove("tour-highlight"));}
function renderTourStep(index){activeTourIndex=Math.max(0,Math.min(index,tourSteps.length-1));const step=tourSteps[activeTourIndex];removeTourHighlight();if(location.hash!==`#${step.route}`)location.hash=`#${step.route}`;setTimeout(()=>{const target= [...document.querySelectorAll(step.selector)].find(el=>!el.hidden&&el.getClientRects().length) || document.querySelector("main");target?.scrollIntoView({behavior:readAppPrefs().motion==="reduced"?"auto":"smooth",block:"center"});target?.classList.add("tour-highlight");$("#tourStepCount").textContent=`GUIDE ${activeTourIndex+1} / ${tourSteps.length}`;$("#tourProgressBar").style.width=`${((activeTourIndex+1)/tourSteps.length)*100}%`;$("#tourTitle").textContent=step.title;$("#tourDescription").textContent=step.text;$("#tourBackBtn").disabled=activeTourIndex===0;$("#tourNextBtn").textContent=activeTourIndex===tourSteps.length-1?"Finish tour ✓":"Next →";},180);}
function startWebsiteTour(){activeTourIndex=0;$("#tourOverlay").hidden=false;renderTourStep(0);}
function endWebsiteTour(){removeTourHighlight();$("#tourOverlay").hidden=true;activeTourIndex=-1;localStorage.setItem("hackverse-tour-complete","1");}
function initAdvancedUI(){
  applyAppPrefs();loadSettingsUI();
  $("#notificationBell").onclick=()=>location.hash="#notifications";
  $("#notificationSettingsBtn").onclick=()=>{location.hash="#settings";setTimeout(()=>showSettingsTab("notifications"),100);};
  $("#openNotificationPreferences").onclick=$("#notificationSettingsBtn").onclick;
  $("#markAllReadBtn").onclick=async()=>{if(!requireAccount())return;await Promise.all(currentConversations.map(c=>markConversationRead(c.id)));toast("Your conversation activity is marked as read.");};
  $("#saveSettingsBtn").onclick=saveAppPrefs;["#settingTheme","#settingMotion","#settingTextSize","#prefReduceMotion"].forEach(sel=>$(sel).addEventListener("change",()=>{const p=readAppPrefs();p.theme=$("#settingTheme").value;p.motion=$("#settingMotion").value;p.textSize=$("#settingTextSize").value;p.reduceMotion=$("#prefReduceMotion").checked;localStorage.setItem("hackverse-app-preferences",JSON.stringify({...p}));applyAppPrefs();}));
  $("#privacyEditProfile").onclick=$("#settingsEditProfile").onclick=()=>currentUser?openProfileEditor(false):openAuth();
  $("#settingsSignOut").onclick=()=>currentUser&&signOut(auth).then(()=>toast("Signed out.")).catch(e=>toast(friendlyError(e)));
  $("#settingProfileVisibility").addEventListener("change",async e=>{if(!requireAccount())return;if(!publicProfile){toast("Complete your profile first.");return;}try{await updateDoc(doc(db,"publicProfiles",currentUser.uid),{profileVisibility:e.target.value,updatedAt:serverTimestamp()});publicProfile.profileVisibility=e.target.value;toast("Profile visibility updated.");}catch(error){toast(friendlyError(error));}});
  $$('[data-settings-tab]').forEach(b=>b.onclick=()=>showSettingsTab(b.dataset.settingsTab));
  $("#navTourBtn").onclick=()=>{ $("#navMoreMenu").hidden=true; $("#navMoreBtn").setAttribute("aria-expanded","false"); startWebsiteTour(); };$("#settingsTourBtn").onclick=startWebsiteTour;$("#tourSkipBtn").onclick=endWebsiteTour;$("#tourBackBtn").onclick=()=>renderTourStep(activeTourIndex-1);$("#tourNextBtn").onclick=()=>activeTourIndex===tourSteps.length-1?endWebsiteTour():renderTourStep(activeTourIndex+1);
  $("#newDirectChatBtn").onclick=()=>location.hash="#people";$("#chatMenuBtn").onclick=()=>{const c=activeConversation;if(!c){toast("Choose a chat first.");return;}const action=prompt("Chat options: type pin, archive, or unarchive");if(!action)return;const prefs=getChatPreferences();const key=action.trim().toLowerCase();for(const list of ["pinned","archived"]){prefs[list]=prefs[list]||[];}const list=key==="pin"?"pinned":key==="archive"||key==="unarchive"?"archived":null;if(!list){toast("Choose pin, archive or unarchive.");return;}const ids=new Set(prefs[list]);if(key==="unarchive")ids.delete(c.id);else if(ids.has(c.id))ids.delete(c.id);else ids.add(c.id);prefs[list]=[...ids];localStorage.setItem(`hv-chat-settings-${currentUser?.uid||"guest"}`,JSON.stringify(prefs));renderConversationList(currentConversations);toast(key==="pin"?"Chat pin updated.":"Chat archive updated.");};
  $$('[data-chat-filter]').forEach(b=>b.onclick=()=>{activeChatFilter=b.dataset.chatFilter;$$('[data-chat-filter]').forEach(x=>x.classList.toggle("active",x===b));renderConversationList(currentConversations);});
  $("#chatSearchToggle").onclick=()=>{$("#messageSearchWrap").hidden=!$("#messageSearchWrap").hidden;if(!$("#messageSearchWrap").hidden)$("#messageSearch").focus();};$("#chatDetailsBtn").onclick=openChatIdentity;
  $("#cancelReply").onclick=()=>{replyingToMessageId=null;updateReplyPreview();};
  $("#chatFileInput").addEventListener("change",e=>handleChatFile(e.target.files?.[0]));$("#attachFileBtn").onclick=()=>activeConversationId?$("#chatFileInput").click():toast("Choose a conversation first.");
  $("#voiceRecordBtn").onclick=toggleVoiceRecording;
  $("#emojiToggle").onclick=()=>$("#emojiTray").hidden=!$("#emojiTray").hidden;
  $$("#emojiTray button").forEach(b=>b.onclick=()=>{const input=$("#messageText"),start=input.selectionStart,end=input.selectionEnd;input.value=input.value.slice(0,start)+b.textContent+input.value.slice(end);input.focus();input.selectionStart=input.selectionEnd=start+b.textContent.length;$("#emojiTray").hidden=true;});
  $("#messageText").addEventListener("input",()=>{if($("#messageText").value.trim())publishTyping();});
}

function handleRoute() {
  const raw=(location.hash||"#home").slice(1);
  const aliases={top:"home",discover:"home",opportunities:"opportunities",saved:"saved",people:"people",messages:"messages",aiwish:"aiwish",profile:"profile",notifications:"notifications",settings:"settings"};
  const view=aliases[raw]||"home";
  const aiPanel=$("#aiPanel"), wishMount=$("#aiWishMount"), aiAssistant=$("#aiAssistant");
  if(view==="aiwish"){
    if(aiPanel.parentElement!==wishMount) wishMount.append(aiPanel);
    aiPanel.classList.add("ai-panel-page"); aiPanel.hidden=false; aiAssistant.classList.add("ai-on-wish-page");
    setAiMode("wish"); updateAiAccessUI(); if(currentUser) loadAiHistory();
  }else{
    if(aiPanel.parentElement!==aiAssistant) aiAssistant.append(aiPanel);
    aiPanel.classList.remove("ai-panel-page"); aiPanel.hidden=true; aiAssistant.classList.remove("ai-on-wish-page");
    setAiMode("chat");
  }
  $$('[data-view]').forEach(el=>{
    if(el.id==="discoveryAdminPanel"){el.hidden=!(view==="home"&&isAdminUser);return;}
    el.hidden=el.dataset.view!==view;
  });
  $$("[data-route]").forEach(a=>a.classList.toggle("active",a.dataset.route===view));
  document.querySelector(".desktop-nav")?.classList.remove("mobile-open");
  window.scrollTo({top:0,behavior:"auto"});
  if(view==="opportunities"){ updateEventAccessUI(); if(currentUser)renderEvents(); }
  if(view==="saved")renderSaved();
  if(view==="people"&&currentUser)searchPeople();
  if(view==="notifications")renderNotificationCenter();
  if(view==="settings")loadSettingsUI();
}

function bindUI() {
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&activeConversationId&&currentMessages.some(m=>m.attachment?.storagePath))hydrateChatAttachmentUrls(activeConversationId,currentMessages);});
  window.setInterval(()=>{if(!document.hidden&&activeConversationId&&currentMessages.some(m=>m.attachment?.storagePath))hydrateChatAttachmentUrls(activeConversationId,currentMessages);},10*60*1000);
  $("#year").textContent = new Date().getFullYear();
  initAdvancedUI();
  $("#authButton").onclick = () => currentUser ? signOut(auth).then(() => toast("Signed out.")) : openAuth();
  $$('[data-open-auth]').forEach(button => button.addEventListener("click", () => openAuth()));
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
  $("#deleteGroupBtn").onclick=deleteCurrentGroup;
  $("#viewMembersBtn").onclick=()=>{const grid=$("#peopleGrid");const open=grid.hidden;grid.hidden=!open;$("#viewMembersBtn").textContent=open?"Hide members":"View members";$("#viewMembersBtn").setAttribute("aria-expanded",String(open));if(open&&currentUser)searchPeople();};
  $("#chatTitle").onclick=openChatIdentity;
  $("#conversationSearch").addEventListener("input",()=>renderConversationList(currentConversations));
  $("#messageSearch").addEventListener("input",()=>renderMessages(currentMessages));
  $("#groupForm").addEventListener("submit", createGroup);
  $("#messageForm").addEventListener("submit", sendMessage);
  $("#addProjectBtn").onclick = () => requireAccount() && showModal("projectModal");
  $("#projectForm").addEventListener("submit", createProject);
  $$("[data-close]").forEach(button => button.addEventListener("click", () => { const id = button.dataset.close; if (id === "profileModal") closeProfileModal(); else hideModal(id); }));
  $$(".modal-backdrop").forEach(modal => modal.addEventListener("click", e => { if (e.target === modal) { if (modal.id === "profileModal") closeProfileModal(); else hideModal(modal.id); } }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") ["authModal","memberModal","groupModal","projectModal","eventModal","teamBuilderModal","manageGroupModal"].forEach(hideModal); if (e.key === "Escape") { closeProfileModal(); if(location.hash==="#aiwish") location.hash="#home"; else { $("#aiPanel").hidden = true; $("#aiLaunchBtn").setAttribute("aria-expanded", "false"); } } });
  ["#eventSearch","#eventSkill","#eventCategory","#eventCountry","#eventEligibility","#eventRegion","#eventMode","#eventTrack","#eventSource","#eventLevel","#eventCost","#eventDeadline","#eventSort"].forEach(sel=>{const el=$(sel);if(el){el.addEventListener(el.tagName==="INPUT"?"input":"change",()=>{allEventsVisible=24;renderEvents();});}});
  $("#clearEventFilters").onclick=()=>{["#eventSearch","#eventSkill"].forEach(id=>$(id).value="");["#eventCategory","#eventCountry","#eventEligibility","#eventRegion","#eventMode","#eventTrack","#eventSource","#eventLevel","#eventCost","#eventDeadline","#eventSort"].forEach(id=>{const el=$(id);if(el)el.value=id==="#eventSort"?"deadline":"all";});allEventsVisible=24;renderEvents();};
  $("#loadMoreEvents").onclick=()=>{allEventsVisible+=24;renderEvents();};
  $("#refreshEventsBtn").onclick = () => requireAccount() && loadEvents();
  $("#discoverySourceForm").addEventListener("submit", addDiscoverySource);
  $("#runDiscoveryBtn").onclick = runDiscoveryManually;
  $("#heroSearch").addEventListener("keydown", e => { if (e.key === "Enter") runHeroSearch(); }); $("#heroSearchBtn").onclick = runHeroSearch;
  $("#aiLaunchBtn").onclick = () => { if(location.hash==="#aiwish") location.hash="#home"; const panel=$("#aiPanel"),assistant=$("#aiAssistant"); if(panel.parentElement!==assistant) assistant.append(panel); panel.classList.remove("ai-panel-page"); setAiMode("chat"); panel.hidden=!panel.hidden; $("#aiLaunchBtn").setAttribute("aria-expanded",String(!panel.hidden)); if(!panel.hidden&&currentUser)loadAiHistory(); };
  $("#aiCloseBtn").onclick = () => { if(location.hash==="#aiwish"){location.hash="#home";return;} $("#aiPanel").hidden=true; $("#aiLaunchBtn").setAttribute("aria-expanded","false"); };
  $("#aiChatModeBtn").onclick = () => setAiMode("chat");
  $("#aiWishModeBtn").onclick = () => { location.hash="#aiwish"; };
  $("#aiNewChatBtn").onclick = () => currentUser ? startAiConversation(aiMode) : (openAuth(), toast("Sign in to keep a private AI history."));
  $("#aiForm").addEventListener("submit", sendAiMessage);
  $("#aiInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#aiForm").requestSubmit(); } });
  $("#peopleSearch").addEventListener("input", searchPeople); $("#peopleRole").onchange = searchPeople; $("#lookingForTeamOnly").onchange = searchPeople;
  $("#backToExploreBtn").onclick = () => { location.hash = "#opportunities"; };
  $("#themeToggle").onclick = () => { document.body.classList.toggle("light"); const prefs=readAppPrefs();prefs.theme=document.body.classList.contains("light")?"light":"dark";localStorage.setItem("hackverse-app-preferences",JSON.stringify(prefs));localStorage.setItem("hackverse-theme",prefs.theme); };
  if (localStorage.getItem("hackverse-theme") === "light") document.body.classList.add("light");
  $("#menuToggle").onclick = () => { const nav=document.querySelector(".desktop-nav"); const open=nav.classList.toggle("mobile-open"); $("#menuToggle").setAttribute("aria-expanded",String(open)); };
  $("#navMoreBtn").onclick = () => { const menu=$("#navMoreMenu"); menu.hidden=!menu.hidden; $("#navMoreBtn").setAttribute("aria-expanded",String(!menu.hidden)); };
  $$(".desktop-nav a").forEach(a => a.addEventListener("click", () => { document.querySelector(".desktop-nav").classList.remove("mobile-open"); $("#navMoreMenu").hidden=true; $("#navMoreBtn").setAttribute("aria-expanded","false"); $("#menuToggle").setAttribute("aria-expanded","false"); }));
  window.addEventListener("hashchange",handleRoute); handleRoute();
}
function runHeroSearch() { if (!requireAccount()) return; $("#eventSearch").value = $("#heroSearch").value; renderEvents(); location.hash = "#opportunities"; }

bindUI();
initFirebase();
