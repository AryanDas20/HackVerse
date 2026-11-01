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
import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const CONFIGURED = Boolean(firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("YOUR_") && firebaseConfig.projectId && !String(firebaseConfig.projectId).startsWith("YOUR_"));
let app = null, auth = null, db = null, currentUser = null, authMode = "signin";
let privateProfile = null, publicProfile = null, events = [], savedIds = new Set(), people = [];
let activeConversationId = null, activeConversation = null, stopConversationListener = null, stopMessageListener = null;
let stopInboxListener = null, profileIsMandatory = false, selectedMember = null, peopleSearchTimer = null;

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
    app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app);
    onAuthStateChanged(auth, async user => {
      currentUser = user;
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
    publicProfile = pubSnap.exists() ? pubSnap.data() : null;
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
  $("#profileCollege").value = p.college || ""; $("#profileCourse").value = p.course || "";
  $("#profileStudyLevel").value = p.studyLevel || ""; $("#profileGradYear").value = p.graduationYear || "";
  $("#profileCity").value = p.city || ""; $("#profileCountry").value = p.country || "";
  $("#profileBio").value = p.bio || ""; $("#profileSkills").value = (p.skills || []).join(", ");
  $("#profileRoles").value = (p.rolesInterested || []).join(", "); $("#profileInterests").value = (p.interests || []).join(", ");
  $("#profileAvailability").value = p.availability || "Open to opportunities"; $("#profileMode").value = p.preferredMode || "Any format";
  $("#profileAvatar").value = p.avatarUrl || ""; $("#profileGithub").value = p.github || "";
  $("#profileLinkedin").value = p.linkedin || ""; $("#profilePortfolio").value = p.portfolio || "";
  $("#profilePhone").value = privateProfile?.phone || ""; $("#profileLooking").value = String(p.lookingForTeam !== false);
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
    college, collegeLower: college.toLowerCase(), course, studyLevel: $("#profileStudyLevel").value,
    graduationYear: Number($("#profileGradYear").value) || null,
    city: $("#profileCity").value.trim(), country: $("#profileCountry").value.trim(),
    bio, skills, skillsLower: normalizedList(skills.join(",")),
    rolesInterested: listFrom($("#profileRoles").value), rolesLower: normalizedList($("#profileRoles").value),
    interests: listFrom($("#profileInterests").value), interestsLower: normalizedList($("#profileInterests").value),
    courseLower: course.toLowerCase(), availability: $("#profileAvailability").value,
    preferredMode: $("#profileMode").value, avatarUrl: validUrl($("#profileAvatar").value),
    github: validUrl($("#profileGithub").value), linkedin: validUrl($("#profileLinkedin").value),
    portfolio: validUrl($("#profilePortfolio").value), lookingForTeam: $("#profileLooking").value === "true",
    profileConsentAt: privateProfile?.profileConsentAt || serverTimestamp(), updatedAt: serverTimestamp()
  };
  const privateData = {
    email: currentUser.email || "", phone: $("#profilePhone").value.trim(),
    displayName: name, username, usernameLower, college, course, studyLevel: profile.studyLevel,
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
      transaction.set(publicRef, profile, { merge: true });
    });
    await updateAuthProfile(currentUser, { displayName: name, photoURL: profile.avatarUrl || null }).catch(() => {});
    privateProfile = { ...(privateProfile || {}), ...privateData, profileComplete: true };
    publicProfile = profile; profileIsMandatory = false; hideModal("profileModal");
    renderMyProfile(); beginInboxListener(); loadProjects(); searchPeople(); toast("Your builder profile is saved.");
  } catch (error) { console.error(error); message.textContent = friendlyError(error); }
}

async function loadEvents() {
  const grid = $("#eventGrid");
  if (!db) { grid.innerHTML = '<div class="loading-card">Connect Firebase to load real opportunities. No sample listings are bundled with this website.</div>'; return; }
  grid.innerHTML = '<div class="loading-card">Loading published opportunities…</div>';
  try {
    const snapshot = await getDocs(query(collection(db, "hackathons"), where("visibility", "==", "public"), limit(100)));
    events = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); renderEvents(); renderSaved();
  } catch (error) { console.error("Event feed read failed", error); grid.innerHTML = '<div class="loading-card">Could not load opportunities. Check your Firestore rules and connection.</div>'; }
}

function filteredEvents() {
  const term = $("#eventSearch").value.trim().toLowerCase(); const mode = $("#eventMode").value; const track = $("#eventTrack").value;
  let list = events.filter(event => {
    const text = [event.title, event.organizer, event.summary, ...(event.tracks || []), ...(event.technologies || []), ...(event.tags || [])].join(" ").toLowerCase();
    return (!term || text.includes(term)) && (mode === "all" || event.mode === mode) && (track === "all" || (event.tracks || []).includes(track));
  });
  const sort = $("#eventSort").value;
  if (sort === "deadline") list.sort((a,b) => (tsMillis(a.registrationDeadline) || Number.MAX_SAFE_INTEGER) - (tsMillis(b.registrationDeadline) || Number.MAX_SAFE_INTEGER));
  if (sort === "newest") list.sort((a,b) => tsMillis(b.createdAt || b.updatedAt || b.ingestedAt) - tsMillis(a.createdAt || a.updatedAt || a.ingestedAt));
  if (sort === "prize") list.sort((a,b) => (Number(b.prizePool) || 0) - (Number(a.prizePool) || 0));
  return list;
}

function renderEvents() {
  const grid = $("#eventGrid"); if (!grid) return;
  const list = filteredEvents();
  if (!list.length) {
    grid.innerHTML = `<div class="loading-card">${db ? (events.length ? "No published opportunities match this search. Try another keyword or filter." : "No opportunities have been published yet. When real event records are added to Firestore, they will appear here.") : "Connect Firebase to load the live opportunity feed. This project contains no seeded event data."}</div>`;
    return;
  }
  grid.innerHTML = list.map((event, index) => {
    const prize = Number(event.prizePool) > 0 ? `${esc(event.currency || "")} ${Number(event.prizePool).toLocaleString()}` : "Prize TBA";
    const deadline = event.registrationDeadline ? new Date(tsMillis(event.registrationDeadline)) : null;
    const deadlineText = deadline && !Number.isNaN(deadline.getTime()) ? (deadline < new Date() ? "Deadline passed" : `Closes ${deadline.toLocaleDateString()}`) : "Deadline TBA";
    const officialUrl = validUrl(event.officialRegistrationUrl || event.officialEventUrl);
    return `<article class="event-card"><div class="event-banner b${(index % 3) + 1}"><span class="tag">${esc(event.mode || "Format TBA")}</span><span class="tag">${esc(event.verificationStatus || "Review status TBA")}</span></div><div class="event-body"><div class="event-source">${esc(event.organizer || "Organizer not listed")}</div><h3>${esc(event.title || "Untitled opportunity")}</h3><p class="event-desc">${esc(event.summary || "Visit the official page for event information.")}</p><div class="event-facts"><span>✦ ${esc((event.tracks || []).slice(0,2).join(" / ") || "Track TBA")}</span><span>⌘ ${esc(event.teamSize || "Team size TBA")}</span><span>◎ ${prize}</span></div><div class="event-bottom"><span class="deadline">${deadlineText}</span><div class="event-actions"><button class="save-btn" data-save="${esc(event.id)}">${savedIds.has(event.id) ? "♥ Saved" : "♡ Save"}</button>${officialUrl ? `<a class="register-btn" href="${esc(officialUrl)}" target="_blank" rel="noopener noreferrer">Official site ↗</a>` : ""}</div></div></div></article>`;
  }).join("");
  grid.querySelectorAll("[data-save]").forEach(button => button.addEventListener("click", () => saveEvent(button.dataset.save)));
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
  $("#savedPreview").innerHTML = savedEvents.length ? savedEvents.map(e => `<div class="saved-event-line"><span>${esc(e.title || "Untitled event")}</span><span>${esc(e.mode || "")}</span></div>`).join("") : (currentUser ? "Your saved opportunities will appear here when you bookmark an event." : "Sign in to save real opportunities. Your saved list belongs to your account.");
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
        const prefixes = ["usernameLower", "nameLower", "collegeLower", "courseLower"];
        const requests = prefixes.map(field => getDocs(query(collection(db, "publicProfiles"), orderBy(field), startAt(term), endAt(term + "\uf8ff"), limit(18))));
        requests.push(getDocs(query(collection(db, "publicProfiles"), where("skillsLower", "array-contains", term), limit(18))));
        requests.push(getDocs(query(collection(db, "publicProfiles"), where("interestsLower", "array-contains", term), limit(18))));
        snapshots = await Promise.all(requests);
      }
      const dedupe = new Map();
      snapshots.forEach(snap => snap.docs.forEach(d => dedupe.set(d.id, { uid: d.id, ...d.data() })));
      people = [...dedupe.values()].filter(p => p.uid !== currentUser?.uid);
      if (role !== "all") people = people.filter(p => (p.rolesInterested || []).some(r => r.toLowerCase() === role.toLowerCase()));
      if (lookingOnly) people = people.filter(p => p.lookingForTeam === true);
      if (term) people = people.filter(p => [p.displayName, p.username, p.college, p.course, p.bio, ...(p.skills || []), ...(p.rolesInterested || []), ...(p.interests || [])].join(" ").toLowerCase().includes(term));
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
    $("#memberProfileContent").innerHTML = `<div class="member-profile-head"><div class="avatar avatar-large">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div><div class="eyebrow">HACKVERSE BUILDER</div><h2 id="memberModalTitle">${esc(p.displayName || "Builder")}</h2><p class="member-handle">@${esc(p.username || "member")}</p></div></div><p class="member-bio">${esc(p.bio || "No bio added yet.")}</p><div class="member-facts"><span>${esc([p.course,p.college].filter(Boolean).join(" · ") || "Education not listed")}</span><span>${esc([p.city,p.country].filter(Boolean).join(", ") || "Location not listed")}</span><span>${esc(p.availability || "Availability not listed")}</span></div><h3>Skills</h3><div class="skill-tags">${(p.skills || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interested roles</h3><div class="skill-tags">${(p.rolesInterested || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interests</h3><div class="skill-tags">${(p.interests || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><div class="member-links">${p.github ? `<a href="${esc(validUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}${p.linkedin ? `<a href="${esc(validUrl(p.linkedin))}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}${p.portfolio ? `<a href="${esc(validUrl(p.portfolio))}" target="_blank" rel="noopener">Portfolio ↗</a>` : ""}</div>`;
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
    const rows = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => tsMillis(b.updatedAt || b.lastMessageAt) - tsMillis(a.updatedAt || a.lastMessageAt));
    renderConversationList(rows);
    if (activeConversationId) { const latest = rows.find(x => x.id === activeConversationId); if (latest) { activeConversation = latest; renderChatHeading(); } }
  }, error => { console.error("Inbox listener", error); $("#conversationList").innerHTML = '<div class="empty-note">Could not load conversations. Check Firestore rules.</div>'; });
}
function conversationLabel(conversation) {
  if (conversation.isGroup) return conversation.groupName || "Team conversation";
  const names = conversation.participantNames || {};
  const otherUid = (conversation.participants || []).find(uid => uid !== currentUser?.uid);
  return names[otherUid] || "Direct message";
}
function renderConversationList(rows) {
  $("#conversationCount").textContent = String(rows.length);
  const list = $("#conversationList");
  if (!rows.length) { list.innerHTML = '<div class="empty-note">No conversations yet. Find a builder and send the first message.</div>'; return; }
  list.innerHTML = rows.map(c => `<button class="conversation-item ${c.id === activeConversationId ? "selected" : ""}" data-conversation="${esc(c.id)}"><span class="conversation-avatar">${esc(initials(conversationLabel(c)))}</span><span class="conversation-copy"><b>${esc(conversationLabel(c))}</b><small>${esc(c.lastMessage || (c.isGroup ? "Group created" : "Conversation started"))}</small></span><span class="conversation-kind">${c.isGroup ? "GROUP" : "DM"}</span></button>`).join("");
  list.querySelectorAll("[data-conversation]").forEach(b => b.onclick = () => selectConversation(rows.find(c => c.id === b.dataset.conversation)));
}
function renderChatHeading() {
  if (!activeConversation) return;
  $("#chatTitle").textContent = conversationLabel(activeConversation);
  const members = (activeConversation.participants || []).length;
  $("#chatSubtitle").textContent = activeConversation.isGroup ? `${members} members` : "Direct conversation";
}
function selectConversation(conversation) {
  if (!conversation || !currentUser) return;
  activeConversation = conversation; activeConversationId = conversation.id;
  $("#chatPlaceholder").hidden = true; $("#chatActive").hidden = false; renderChatHeading();
  if (stopMessageListener) stopMessageListener();
  const messagesQuery = query(collection(db, "conversations", conversation.id, "messages"), orderBy("createdAt", "desc"), limit(100));
  stopMessageListener = onSnapshot(messagesQuery, snapshot => {
    const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
    renderMessages(messages);
  }, error => { console.error("Messages listener", error); $("#messageList").innerHTML = '<div class="empty-note">Could not load messages. Check Firestore rules.</div>'; });
  renderConversationListFromSnapshotSelection();
}
function renderConversationListFromSnapshotSelection() { $$(".conversation-item").forEach(b => b.classList.toggle("selected", b.dataset.conversation === activeConversationId)); }
function renderMessages(messages) {
  const box = $("#messageList");
  if (!messages.length) { box.innerHTML = '<div class="empty-note message-empty">This is the start of the conversation. Say hello.</div>'; return; }
  box.innerHTML = messages.map(m => { const mine = m.authorUid === currentUser?.uid; const time = tsMillis(m.createdAt) ? new Date(tsMillis(m.createdAt)).toLocaleString([], { dateStyle:"short", timeStyle:"short" }) : "Sending…"; return `<div class="message-row ${mine ? "mine" : "theirs"}"><div class="message-bubble"><small>${mine ? "You" : esc(m.authorName || "Teammate")}</small><p>${esc(m.text || "")}</p><time>${esc(time)}</time></div></div>`; }).join("");
  box.scrollTop = box.scrollHeight;
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
async function createGroup(event) {
  event.preventDefault(); if (!requireAccount()) return;
  const groupName = $("#groupName").value.trim();
  const usernames = normalizedList($("#groupMembers").value.replace(/@/g, "")).filter(x => x !== publicProfile?.usernameLower).slice(0, 10);
  const msg = $("#groupMessage"); msg.textContent = "Finding members…";
  if (!usernames.length) { msg.textContent = "Enter at least one other username."; return; }
  try {
    const snap = await getDocs(query(collection(db, "publicProfiles"), where("usernameLower", "in", usernames)));
    const found = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    const foundSet = new Set(found.map(p => p.usernameLower)); const missing = usernames.filter(u => !foundSet.has(u));
    if (missing.length) { msg.textContent = `Could not find: ${missing.map(x => "@" + x).join(", ")}. Check usernames and try again.`; return; }
    const members = [{ uid: currentUser.uid, ...publicProfile }, ...found];
    const participants = members.map(p => p.uid);
    const participantNames = Object.fromEntries(members.map(p => [p.uid, p.displayName || "Member"]));
    const conversationRef = doc(collection(db, "conversations"));
    await setDoc(conversationRef, { isGroup: true, groupName, participants, participantNames, lastMessage: "Group created", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessageAt: serverTimestamp() });
    hideModal("groupModal"); $("#groupForm").reset(); toast("Group chat created.");
    selectConversation({ id: conversationRef.id, isGroup: true, groupName, participants, participantNames, lastMessage: "Group created", updatedAt: Date.now() }); location.hash = "#messages";
  } catch (error) { console.error(error); msg.textContent = friendlyError(error); }
}

function renderMyProfile() {
  const panel = $("#myProfilePanel");
  if (!currentUser || !publicProfile) {
    panel.innerHTML = `<div class="profile-empty"><div class="placeholder-icon">◎</div><h3>${currentUser ? "Complete your builder profile." : "Your profile starts here."}</h3><p>${currentUser ? "Add your skills, college, interests, and preferred team roles." : "Sign in and complete your builder profile to be discoverable by teammates."}</p><button class="btn btn-primary" id="profileStartInline">${currentUser ? "Complete profile" : "Sign in to create profile"}</button></div>`;
    $("#profileStartInline").onclick = () => currentUser ? openProfileEditor(false) : openAuth();
    return;
  }
  const p = publicProfile;
  panel.innerHTML = `<div class="profile-overview"><div class="avatar avatar-profile">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div class="profile-main"><div class="profile-name-line"><div><div class="eyebrow">YOUR PUBLIC BUILDER PROFILE</div><h3>${esc(p.displayName)}</h3><span>@${esc(p.username)}</span></div>${p.lookingForTeam ? '<span class="open-pill">Open to teammates</span>' : ''}</div><p>${esc(p.bio || "")}</p><div class="profile-facts"><span>${esc(p.college)}</span><span>${esc(p.course)}</span><span>${esc(p.studyLevel)}${p.graduationYear ? ` · Class of ${esc(p.graduationYear)}` : ""}</span><span>${esc([p.city,p.country].filter(Boolean).join(", "))}</span></div><h4>Skills</h4><div class="skill-tags">${(p.skills || []).map(s => `<span>${esc(s)}</span>`).join("")}</div><h4>Interested roles</h4><div class="skill-tags">${(p.rolesInterested || []).map(s => `<span>${esc(s)}</span>`).join("")}</div><div class="member-links">${p.github ? `<a href="${esc(validUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}${p.linkedin ? `<a href="${esc(validUrl(p.linkedin))}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}${p.portfolio ? `<a href="${esc(validUrl(p.portfolio))}" target="_blank" rel="noopener">Portfolio ↗</a>` : ""}</div><small class="private-note">Your email and phone number are private and are not in this public profile.</small></div></div>`;
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
  $("#newGroupBtn").onclick = () => requireAccount() && showModal("groupModal");
  $("#groupForm").addEventListener("submit", createGroup);
  $("#messageForm").addEventListener("submit", sendMessage);
  $("#addProjectBtn").onclick = () => requireAccount() && showModal("projectModal");
  $("#projectForm").addEventListener("submit", createProject);
  $$("[data-close]").forEach(button => button.addEventListener("click", () => { const id = button.dataset.close; if (id === "profileModal") closeProfileModal(); else hideModal(id); }));
  $$(".modal-backdrop").forEach(modal => modal.addEventListener("click", e => { if (e.target === modal) { if (modal.id === "profileModal") closeProfileModal(); else hideModal(modal.id); } }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") ["authModal","memberModal","groupModal","projectModal"].forEach(hideModal); if (e.key === "Escape") closeProfileModal(); });
  $("#eventSearch").addEventListener("input", renderEvents); $("#eventMode").onchange = renderEvents; $("#eventTrack").onchange = renderEvents; $("#eventSort").onchange = renderEvents;
  $("#refreshEventsBtn").onclick = loadEvents;
  $("#heroSearch").addEventListener("keydown", e => { if (e.key === "Enter") runHeroSearch(); }); $("#heroSearchBtn").onclick = runHeroSearch;
  $("#peopleSearch").addEventListener("input", searchPeople); $("#peopleRole").onchange = searchPeople; $("#lookingForTeamOnly").onchange = searchPeople;
  $("#viewSavedBtn").onclick = () => { if (!currentUser) openAuth(); else { const saved = events.filter(e => savedIds.has(e.id)); if (!saved.length) toast("You have not saved any currently loaded opportunities."); else { $("#eventSearch").value = ""; $("#eventMode").value = "all"; $("#eventTrack").value = "all"; $("#eventGrid").innerHTML = saved.map(e => `<article class="saved-event-line">${esc(e.title || "Untitled event")}</article>`).join(""); location.hash = "#discover"; } } };
  $("#themeToggle").onclick = () => { document.body.classList.toggle("light"); localStorage.setItem("hackverse-theme", document.body.classList.contains("light") ? "light" : "dark"); };
  if (localStorage.getItem("hackverse-theme") === "light") document.body.classList.add("light");
  $("#menuToggle").onclick = () => { document.querySelector(".desktop-nav").classList.toggle("mobile-open"); };
  $$(".desktop-nav a").forEach(a => a.addEventListener("click", () => document.querySelector(".desktop-nav").classList.remove("mobile-open")));
}
function runHeroSearch() { $("#eventSearch").value = $("#heroSearch").value; renderEvents(); location.hash = "#discover"; }

bindUI();
initFirebase();
