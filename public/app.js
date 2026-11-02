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
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const CONFIGURED = Boolean(firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("YOUR_") && firebaseConfig.projectId && !String(firebaseConfig.projectId).startsWith("YOUR_"));
let app = null, auth = null, db = null, functions = null, currentUser = null, authMode = "signin", isAdminUser = false;
let privateProfile = null, publicProfile = null, events = [], savedIds = new Set(), people = [];
let activeConversationId = null, activeConversation = null, stopConversationListener = null, stopMessageListener = null;
let stopInboxListener = null, profileIsMandatory = false, selectedMember = null, peopleSearchTimer = null;
let allEventsVisible = 24, currentConversations = [], currentMessages = [], selectedGroupMembers = new Map(), matchedTeamCandidates = [];

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
        setSystemNotice(""); renderEvents(); searchPeople(); return;
      }
      await loadAccountWorkspace();
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
    return (!term || searchable.includes(term))
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
  grid.innerHTML = sorted.map(p => `<article class="person-card"><div class="person-top"><div class="avatar">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div class="person-title"><h3>${esc(p.displayName || "HackVerse member")}</h3><span>@${esc(p.username || "member")}</span></div>${p.lookingForTeam ? '<span class="open-pill">Open to team</span>' : ""}</div><p class="person-college">${esc([p.course, p.college].filter(Boolean).join(" · ") || "Education not listed")}</p><p class="person-bio">${esc(p.bio || "This builder has not added a bio yet.")}</p><div class="skill-tags">${(p.skills || []).slice(0,5).map(s => `<span>${esc(s)}</span>`).join("")}</div><div class="person-bottom"><small>${esc(p.availability || "Availability not listed")}</small><div><button class="save-btn" data-view-member="${esc(p.uid)}">View profile</button><button class="register-btn" data-message-member="${esc(p.uid)}">Message</button></div></div></article>`).join("");
  grid.querySelectorAll("[data-view-member]").forEach(b => b.onclick = () => viewMember(b.dataset.viewMember));
  grid.querySelectorAll("[data-message-member]").forEach(b => b.onclick = () => { const p = people.find(x => x.uid === b.dataset.messageMember); if (p) startDirectConversation(p); });
}
async function viewMember(uid) {
  if (!db) return;
  try {
    const snap = await getDoc(doc(db, "publicProfiles", uid)); if (!snap.exists()) { toast("This profile is no longer available."); return; }
    selectedMember = { uid, ...snap.data() }; const p = selectedMember;
    $("#memberProfileContent").innerHTML = `<div class="member-profile-head"><div class="avatar avatar-large">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div><div class="eyebrow">HACKVERSE BUILDER</div><h2 id="memberModalTitle">${esc(p.displayName || "Builder")}</h2><p class="member-handle">@${esc(p.username || "member")}</p></div></div><p class="member-bio">${esc(p.bio || "No bio added yet.")}</p><div class="member-facts"><span>${esc([p.course,p.college].filter(Boolean).join(" · ") || "Education not listed")}</span><span>${esc([p.city,p.country].filter(Boolean).join(", ") || "Location not listed")}</span><span>${esc(p.availability || "Availability not listed")}</span></div><h3>Skills</h3><div class="skill-tags">${(p.skills || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interested roles</h3><div class="skill-tags">${(p.rolesInterested || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interests</h3><div class="skill-tags">${(p.interests || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><div class="member-contact"><h3>Contact details</h3><p>${p.publicEmail ? `Email: <a href="mailto:${esc(p.publicEmail)}">${esc(p.publicEmail)}</a>` : "Email kept private by this member."}</p><p>${p.publicPhone ? `Phone: <a href="tel:${esc(p.publicPhone)}">${esc(p.publicPhone)}</a>` : "Phone kept private by this member."}</p></div><div class="member-links">${p.github ? `<a href="${esc(validUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}${p.linkedin ? `<a href="${esc(validUrl(p.linkedin))}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}${p.portfolio ? `<a href="${esc(validUrl(p.portfolio))}" target="_blank" rel="noopener">Portfolio ↗</a>` : ""}</div>`;
    $("#memberMessageBtn").onclick = () => startDirectConversation(selectedMember);
    $("#memberReportBtn").onclick = () => reportMember(selectedMember);
    showModal("memberModal");
  } catch (error) { toast(friendlyError(error)); }
}

function detachRealtimeListeners() {
  if (stopInboxListener) stopInboxListener(); if (stopMessageListener) stopMessageListener();
  stopInboxListener = null; stopMessageListener = null; activeConversationId = null; activeConversation = null;
}
function beginInboxListener() {
  if (!currentUser || !db) return;
  if (stopInboxListener) stopInboxListener();
  const inboxQuery = query(collection(db, "conversations"), where("participants", "array-contains", currentUser.uid), limit(100));
  stopInboxListener = onSnapshot(inboxQuery, snapshot => {
    currentConversations = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => tsMillis(b.updatedAt || b.lastMessageAt) - tsMillis(a.updatedAt || a.lastMessageAt));
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
  const term = $("#conversationSearch")?.value.trim().toLowerCase() || "";
  const visible = rows.filter(c => `${conversationLabel(c)} ${c.lastMessage || ""} ${(c.participantNames ? Object.values(c.participantNames) : []).join(" ")}`.toLowerCase().includes(term));
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
  const term = $("#messageSearch")?.value.trim().toLowerCase() || "";
  const visible = messages.filter(m => !term || String(m.text || "").toLowerCase().includes(term) || String(m.authorName || "").toLowerCase().includes(term));
  const box = $("#messageList"); $("#messageSearchCount").textContent = term ? `${visible.length} matches` : `${messages.length} messages`;
  if (!visible.length) { box.innerHTML = `<div class="empty-note message-empty">${term ? "No messages match your search." : "This is the start of the conversation. Say hello."}</div>`; return; }
  box.innerHTML = visible.map(m => {
    const mine = m.authorUid === currentUser?.uid;
    const created = tsMillis(m.createdAt); const time = created ? new Date(created).toLocaleString([], { dateStyle:"short", timeStyle:"short" }) : "Sending…";
    const canEdit = mine && !m.deleted && created && Date.now() - created <= 15*60*1000;
    return `<div class="message-row ${mine ? "mine" : "theirs"}"><div class="message-bubble"><small>${mine ? "You" : esc(m.authorName || "Teammate")}${m.edited ? " · edited" : ""}</small><p>${m.deleted ? '<span class="deleted-message">This message was deleted.</span>' : esc(m.text || "")}</p><div class="message-meta"><time>${esc(time)}</time>${canEdit ? `<span class="message-actions"><button type="button" data-edit-message="${esc(m.id)}">Edit</button><button type="button" data-delete-message="${esc(m.id)}">Delete</button></span>` : ""}</div></div></div>`;
  }).join("");
  box.querySelectorAll("[data-edit-message]").forEach(b => b.onclick = () => editMessage(b.dataset.editMessage));
  box.querySelectorAll("[data-delete-message]").forEach(b => b.onclick = () => deleteMessage(b.dataset.deleteMessage));
  box.scrollTop = box.scrollHeight;
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
  $("#manageGroupTitle").textContent = `Manage ${activeConversation.groupName || "team"}`;
  const rows = await Promise.all((activeConversation.participants || []).map(async uid => {
    try { const snap = await getDoc(doc(db,"publicProfiles",uid)); return { uid, isPublic: snap.exists(), ...(snap.exists()?snap.data():{}) }; }
    catch { return { uid, isPublic: false, displayName: activeConversation.participantNames?.[uid] || "Member" }; }
  }));
  $("#manageGroupMembers").innerHTML = rows.map(p => `<div class="group-member-row"><div>${p.isPublic ? `<button type="button" class="group-member-profile-link" data-view-group-member="${esc(p.uid)}">${esc(p.displayName || "Member")}</button>` : `<b>${esc(p.displayName || "Private member")}</b>`}<small>@${esc(p.username || "member")} ${p.uid === activeConversation.createdBy ? "· Group owner" : ""}</small></div>${canManage && (activeConversation.participants || []).length > 2 && p.uid !== activeConversation.createdBy ? `<button class="text-danger" data-remove-group-member="${esc(p.uid)}">Remove</button>` : ""}</div>`).join("");
  $("#manageGroupMembers").querySelectorAll("[data-remove-group-member]").forEach(b => b.onclick = () => removeGroupMember(b.dataset.removeGroupMember));
  $("#manageGroupMembers").querySelectorAll("[data-view-group-member]").forEach(b => b.onclick = () => viewMember(b.dataset.viewGroupMember));
  $("#manageGroupSearch").disabled = !canManage;
  $("#manageGroupSearchResults").innerHTML = canManage ? '<p class="muted">Search for a builder to add to this group.</p>' : '<p class="muted">Only group admins can add or remove members.</p>';
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
async function sendMessage(event) {
  event.preventDefault(); if (!requireAccount() || !activeConversationId) { toast("Choose a conversation first."); return; }
  const text = $("#messageText").value.trim(); if (!text) return;
  if (text.length > 2000) { toast("Messages must be 2,000 characters or fewer."); return; }
  const sendButton = $("#messageForm button"); sendButton.disabled = true;
  try {
    const conversationRef = doc(db, "conversations", activeConversationId);
    await addDoc(collection(conversationRef, "messages"), { authorUid: currentUser.uid, authorName: publicProfile?.displayName || currentUser.displayName || "Member", text, createdAt: serverTimestamp() });
    await updateDoc(conversationRef, { lastMessage: text.slice(0, 180), lastMessageSender: currentUser.uid, lastMessageAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $("#messageText").value = "";
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
    $("#groupMemberResults").querySelectorAll("[data-pick-group-member]").forEach(b => b.onclick = () => { const p=profiles.find(x=>x.uid===b.dataset.pickGroupMember); if(!p)return; if(selectedGroupMembers.has(p.uid))selectedGroupMembers.delete(p.uid); else if(selectedGroupMembers.size<10)selectedGroupMembers.set(p.uid,p); else toast("You can add up to 10 other members."); refreshSelectedGroupMembers(); searchGroupPicker(); });
  } catch (error) { $("#groupMemberResults").textContent = friendlyError(error); }
}
async function createGroupWithMembers(groupName, peopleToAdd) {
  if (!requireAccount()) return;
  const members = [{uid:currentUser.uid,...publicProfile}, ...peopleToAdd.filter(p=>p.uid!==currentUser.uid)];
  const unique = [...new Map(members.map(p=>[p.uid,p])).values()];
  if (unique.length < 2) { toast("Choose at least one other builder."); return; }
  if (unique.length > 11) { toast("A group can contain up to 11 members including you."); return; }
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
  const needed=normalizedList($("#teamNeededSkills").value); const size=Number($("#teamSize").value)||4; const name=$("#teamProjectName").value.trim();
  if(!needed.length){toast("Add the skills or roles you need.");return;}
  $("#teamMatchResults").innerHTML='<p class="muted">Finding complementary builders…</p>'; $("#createMatchedTeamBtn").hidden=true; matchedTeamCandidates=[];
  try{
    const profiles=await searchPublicProfiles("",150);
    const scored=profiles.map(p=>{
      const fields=[...(p.skills||[]),...(p.rolesInterested||[]),...(p.interests||[]),p.bio||""].join(" ").toLowerCase();
      const matched=needed.filter(skill=>fields.includes(skill));
      const score=matched.length/needed.length;
      return {...p,matchScore:score,matchedSkills:matched};
    }).filter(p=>p.matchScore>0).sort((a,b)=>b.matchScore-a.matchScore||overlapScore(b)-overlapScore(a)).slice(0,Math.max(20,(size-1)*4));
    matchedTeamCandidates=scored.slice(0,size-1);
    $("#teamMatchResults").innerHTML=matchedTeamCandidates.length?matchedTeamCandidates.map(p=>`<label class="team-match-option"><input type="checkbox" data-team-match="${esc(p.uid)}" checked><span><b>${esc(p.displayName||"Builder")}</b><small>@${esc(p.username||"member")} · ${esc(p.collegeShort||p.college||"College not listed")}</small><span class="skill-tags">${(p.skills||[]).slice(0,5).map(x=>`<i>${esc(x)}</i>`).join("")}</span><small>Matched: ${esc(p.matchedSkills.join(", "))} · ${Math.round(p.matchScore*100)}% skill coverage</small></span></label>`).join(""):'<p class="muted">No matching builders are available yet. Try broader roles or skills.</p>';
    $("#teamMatchResults").dataset.teamName=name;
    $("#createMatchedTeamBtn").hidden=!matchedTeamCandidates.length;
  }catch(error){$("#teamMatchResults").textContent=friendlyError(error);}
}
async function createMatchedTeam() {
  const selected=[...$("#teamMatchResults").querySelectorAll("[data-team-match]:checked")].map(b=>matchedTeamCandidates.find(p=>p.uid===b.dataset.teamMatch)).filter(Boolean);
  if(!selected.length){toast("Select at least one builder.");return;}
  try{await createGroupWithMembers($("#teamProjectName").value.trim()||"HackVerse project team",selected);hideModal("teamBuilderModal");}
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
  const aliases={top:"home",discover:"home",opportunities:"opportunities",saved:"saved",people:"people",messages:"messages",profile:"profile"};
  const view=aliases[raw]||"home";
  $$('[data-view]').forEach(el=>{
    if(el.id==="discoveryAdminPanel"){el.hidden=!(view==="home"&&isAdminUser);return;}
    el.hidden=el.dataset.view!==view;
  });
  $$("[data-route]").forEach(a=>a.classList.toggle("active",a.dataset.route===view));
  document.querySelector(".desktop-nav")?.classList.remove("mobile-open");
  window.scrollTo({top:0,behavior:"auto"});
  if(view==="opportunities")renderEvents();
  if(view==="saved")renderSaved();
  if(view==="people"&&currentUser)searchPeople();
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
  $("#addProjectBtn").onclick = () => requireAccount() && showModal("projectModal");
  $("#projectForm").addEventListener("submit", createProject);
  $$("[data-close]").forEach(button => button.addEventListener("click", () => { const id = button.dataset.close; if (id === "profileModal") closeProfileModal(); else hideModal(id); }));
  $$(".modal-backdrop").forEach(modal => modal.addEventListener("click", e => { if (e.target === modal) { if (modal.id === "profileModal") closeProfileModal(); else hideModal(modal.id); } }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") ["authModal","memberModal","groupModal","projectModal","eventModal","teamBuilderModal","manageGroupModal"].forEach(hideModal); if (e.key === "Escape") closeProfileModal(); });
  ["#eventSearch","#eventSkill","#eventCategory","#eventCountry","#eventRegion","#eventMode","#eventTrack","#eventSource","#eventLevel","#eventCost","#eventDeadline","#eventSort"].forEach(sel=>{const el=$(sel);if(el){el.addEventListener(el.tagName==="INPUT"?"input":"change",()=>{allEventsVisible=24;renderEvents();});}});
  $("#clearEventFilters").onclick=()=>{["#eventSearch","#eventSkill"].forEach(id=>$(id).value="");["#eventCategory","#eventCountry","#eventRegion","#eventMode","#eventTrack","#eventSource","#eventLevel","#eventCost","#eventDeadline","#eventSort"].forEach(id=>{const el=$(id);if(el)el.value=id==="#eventSort"?"deadline":"all";});allEventsVisible=24;renderEvents();};
  $("#loadMoreEvents").onclick=()=>{allEventsVisible+=24;renderEvents();};
  $("#refreshEventsBtn").onclick = loadEvents;
  $("#discoverySourceForm").addEventListener("submit", addDiscoverySource);
  $("#runDiscoveryBtn").onclick = runDiscoveryManually;
  $("#heroSearch").addEventListener("keydown", e => { if (e.key === "Enter") runHeroSearch(); }); $("#heroSearchBtn").onclick = runHeroSearch;
  $("#peopleSearch").addEventListener("input", searchPeople); $("#peopleRole").onchange = searchPeople; $("#lookingForTeamOnly").onchange = searchPeople;
  $("#backToExploreBtn").onclick = () => { location.hash = "#opportunities"; };
  $("#themeToggle").onclick = () => { document.body.classList.toggle("light"); localStorage.setItem("hackverse-theme", document.body.classList.contains("light") ? "light" : "dark"); };
  if (localStorage.getItem("hackverse-theme") === "light") document.body.classList.add("light");
  $("#menuToggle").onclick = () => { document.querySelector(".desktop-nav").classList.toggle("mobile-open"); };
  $$(".desktop-nav a").forEach(a => a.addEventListener("click", () => document.querySelector(".desktop-nav").classList.remove("mobile-open")));
  window.addEventListener("hashchange",handleRoute); handleRoute();
}
function runHeroSearch() { $("#eventSearch").value = $("#heroSearch").value; renderEvents(); location.hash = "#opportunities"; }

bindUI();
initFirebase();
