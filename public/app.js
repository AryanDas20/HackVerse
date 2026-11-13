import {
  auth, db, functions, supabaseClient, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged,
  sendEmailVerification, reload, updateProfile as updateAuthProfile,
  getDoc, getDocs, collection, doc, query, where, orderBy, startAt, endAt, startAfter, limit,
  serverTimestamp, addDoc, setDoc, deleteDoc, onSnapshot, updateDoc, runTransaction, writeBatch, httpsCallable
} from './data-layer.js';
import { supabaseConfig } from './supabase-config.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const CONFIGURED = Boolean(supabaseConfig.url && !String(supabaseConfig.url).startsWith("YOUR_") && supabaseConfig.anonKey && !String(supabaseConfig.anonKey).startsWith("YOUR_"));
let currentUser = null, authMode = "signin", isAdminUser = false;
let privateProfile = null, publicProfile = null, events = [], savedIds = new Set(), people = [];
let activeConversationId = null, activeConversation = null, stopConversationListener = null, stopMessageListener = null;
let stopInboxListener = null, profileIsMandatory = false, selectedMember = null, peopleSearchTimer = null;
let allEventsVisible = 24, currentConversations = [], currentMessages = [], selectedGroupMembers = new Map(), matchedTeamCandidates = [];
let stopTypingListener = null, typingStopTimer = null, voiceRecorder = null, voiceChunks = [], activeChatFilter = "all", replyingToMessageId = null, aiAvailableBuilders = [], isSendingChatMessage = false;
let aiMode = "chat", activeAiConversationId = null, activeAiConversationMode = "chat", currentAiMessages = [], pendingAiActions = [], isAiSending = false, pendingAiUserMessage = "", aiAvailableBuilderUids = [];
let emailVerificationGuard = false, pendingChatFile = null;
let dialogResolver = null;

const esc = (value = "") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const listFrom = value => String(value || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 30);
const normalizedList = value => listFrom(value).map(x => x.toLowerCase()).filter((x, i, a) => a.indexOf(x) === i);
const validUrl = value => { if (!value) return ""; try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
const initials = name => String(name || "HV").trim().split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase() || "HV";
const toast = message => { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3000); };
const showModal = id => { const el = document.getElementById(id); if (el) el.hidden = false; };
const hideModal = id => { const el = document.getElementById(id); if (el) el.hidden = true; };
function chooseInApp(title, message, choices = [{value:"cancel",label:"Cancel",variant:"outline"}], inputConfig = null) {
  const modal=$("#appDialog"); if(!modal) return Promise.resolve(null);
  if(dialogResolver) dialogResolver(null);
  $("#appDialogTitle").textContent=title; $("#appDialogMessage").textContent=message;
  $("#appDialogInputWrap").hidden=!inputConfig;
  if(inputConfig){$("#appDialogInputLabel").textContent=inputConfig.label||"Your answer";$("#appDialogInput").value=inputConfig.value||"";}
  const actions=$("#appDialogActions"); actions.innerHTML="";
  choices.forEach(choice=>{const button=document.createElement("button");button.type="button";button.className=`btn ${choice.variant==="danger"?"btn-danger":choice.variant==="primary"?"btn-primary":"btn-outline"}`;button.textContent=choice.label;button.addEventListener("click",()=>{modal.hidden=true;const resolve=dialogResolver;dialogResolver=null;resolve?.(choice.value);},{once:true});actions.append(button);});
  modal.hidden=false;
  return new Promise(resolve=>{dialogResolver=resolve;});
}
async function promptInApp(title, message, initialValue="", inputLabel="Your answer") {
  const choice=await chooseInApp(title,message,[{value:"cancel",label:"Cancel",variant:"outline"},{value:"save",label:"Continue",variant:"primary"}],{value:initialValue,label:inputLabel});
  const value=$("#appDialogInput")?.value||"";
  return choice==="save"?value:null;
}

function confirmInApp(message,title="Are you sure?") {
  return chooseInApp(title,message,[{value:false,label:"Cancel",variant:"outline"},{value:true,label:"Continue",variant:"danger"}]);
}
function closeInAppDialog(){const modal=$("#appDialog");if(modal)modal.hidden=true;const resolve=dialogResolver;dialogResolver=null;resolve?.(null);}

const requireAccount = () => { if (!currentUser) { openAuth(); toast("Sign in to use this feature."); return false; } if (!db) { toast("Connect Supabase before using account features."); return false; } return true; };
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
    "auth/unauthorized-domain": "Add this domain in Supabase Authentication → Settings → Authorized domains.",
    "permission-denied": "Supabase denied this action. Check that the latest Supabase database rules are deployed.",
    "USERNAME_TAKEN": "That username is already taken. Choose another one."
  };
  if (error?.message === "USERNAME_TAKEN") return map.USERNAME_TAKEN;
  return map[code] || error?.message || "Something went wrong. Check your Supabase setup and try again.";
};

function initSupabase() {
  if (!CONFIGURED) {
    setSystemNotice("Supabase is not configured yet. Add your Supabase project URL and publishable key in public/supabase-config.js to enable live data, registration, profiles, and chat.");
    updateEventAccessUI(); updateAiAccessUI(); renderEvents(); renderSaved(); renderPeopleEmpty(); return;
  }
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    handleRoute();
    isAdminUser = Boolean(user?.app_metadata?.admin === true);
    $("#discoveryAdminPanel").hidden = !isAdminUser;
    if (isAdminUser) loadDiscoverySources();
    $("#authButton").textContent = user ? "Sign out" : "Sign in";
    $("#accountButton").textContent = user ? "My workspace ↗" : "Get started ↗";
    if (!user) {
      privateProfile = null; publicProfile = null; events = []; savedIds.clear(); currentConversations=[]; currentMessages=[]; pendingChatFile = null; renderPendingChatAttachment(); renderNotificationCenter(); profileIsMandatory = false; hideModal("profileModal"); hideModal("eventModal");
      $("#eventModalContent").innerHTML = ""; detachRealtimeListeners(); renderSaved(); renderMyProfile(); renderProjects([]); renderConversationList([]);
      $("#chatPlaceholder").hidden = false; $("#chatActive").hidden = true; activeAiConversationId = null; currentAiMessages = []; pendingAiActions = []; updateAiAccessUI(); renderAiMessages();
      setSystemNotice(""); updateEventAccessUI(); renderEvents(); searchPeople(); handleRoute(); return;
    }
    updateEventAccessUI();
    handleRoute();
    void loadEvents();
    void loadAccountWorkspace();
  });
}

function setSystemNotice(message) {
  const old = $("#systemNotice"); if (old) old.remove();
  if (!message) return;
  const notice = document.createElement("div"); notice.id = "systemNotice"; notice.className = "system-notice wrap"; notice.textContent = message;
  $("main").prepend(notice);
}

function openAuth(mode = "signin") {
  if (!CONFIGURED) { toast("Add your Supabase Web App config first."); return; }
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
  const submit = $("#authSubmit");
  if (submit.disabled) return;
  const originalLabel = authMode === "signup" ? "Create account →" : "Sign in →";
  submit.disabled = true;
  submit.setAttribute("aria-busy", "true");
  submit.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";
  $("#authMessage").textContent = authMode === "signup" ? "Creating your account and preparing email verification…" : "Checking your sign-in…";
  try {
    if (authMode === "signup") {
      emailVerificationGuard = true;
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(credential.user);
      await signOut(auth);
      $("#authMessage").textContent = "Verification email sent. Open the link in your inbox, then return here and sign in. Check Spam if it is missing.";
      setAuthMode("signin");
      return;
    }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await reload(credential.user);
    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user).catch(()=>{});
      await signOut(auth);
      $("#authMessage").textContent = "Your email is not verified yet. We sent another verification link. Verify it, then sign in again.";
      return;
    }
    hideModal("authModal"); toast("Welcome back.");
  } catch (error) { $("#authMessage").textContent = friendlyError(error); }
  finally {
    emailVerificationGuard = false;
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
    submit.textContent = authMode === "signup" ? "Create account →" : "Sign in →";
  }
}

async function googleSignIn() {
  if (!auth || !db) return;
  const button=$("#googleSignIn"); if(button.disabled)return;
  button.disabled=true; button.setAttribute("aria-busy","true"); button.textContent="Connecting to Google…";
  try { await signInWithPopup(auth, new GoogleAuthProvider()); hideModal("authModal"); toast("Signed in with Google."); }
  catch (error) { $("#authMessage").textContent = friendlyError(error); }
  finally { button.disabled=false; button.removeAttribute("aria-busy"); button.innerHTML='<span class="google-g">G</span> Continue with Google'; }
}

async function resetPassword() {
  const email = $("#authEmail").value.trim();
  if (!email) { $("#authMessage").textContent = "Enter your email address first."; return; }
  try { await sendPasswordResetEmail(auth, email); $("#authMessage").textContent = "Password reset email sent."; }
  catch (error) { $("#authMessage").textContent = friendlyError(error); }
}

async function loadAccountWorkspace() {
  try {
    const [snap, pubSnap] = await Promise.all([
      getDoc(doc(db, "users", currentUser.uid)),
      getDoc(doc(db, "publicProfiles", currentUser.uid))
    ]);
    privateProfile = snap.exists() ? snap.data() : null;
    publicProfile = pubSnap.exists() ? pubSnap.data() : (privateProfile?.profileVisibility === "private" ? (privateProfile?.profileData || null) : null);
    renderMyProfile(); loadSettingsUI(); renderNotificationCenter();
    // Saved items and projects are not required to render the first screen.
    void loadSaved();
    if (!privateProfile?.profileComplete || !publicProfile) {
      openProfileEditor(true);
    } else {
      hideModal("profileModal");
      beginInboxListener();
      void loadProjects();
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
  $("#profileBio").value = p.bio || ""; $("#profileStatus").value = p.statusText || ""; $("#profileSkills").value = (p.skills || []).join(", ");
  $("#profileRoles").value = (p.rolesInterested || []).join(", "); $("#profileInterests").value = (p.interests || []).join(", ");
  $("#profileAvailability").value = p.availability || "Open to opportunities"; $("#profileMode").value = p.preferredMode || "Any format";
  $("#profileAvatar").value = p.avatarUrl || ""; $("#profileAvatarFile").value = ""; $("#profileAvatarPreviewWrap").hidden = !p.avatarUrl; if(p.avatarUrl) $("#profileAvatarPreview").src = p.avatarUrl; $("#profileGithub").value = p.github || "";
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

async function uploadProfileAvatar(file) {
  if(!file || !requireAccount()) return;
  const allowed = new Set(["image/jpeg","image/png","image/webp"]);
  if(!allowed.has(file.type)){toast("Choose a JPG, PNG or WebP image.");return;}
  if(file.size>5*1024*1024){toast("Profile photos must be 5 MB or smaller.");return;}
  if(!supabaseClient){toast("Profile photo storage is not configured. Check the Supabase public key setup.");return;}
  const input=$("#profileAvatarFile"); if(input)input.disabled=true;
  try{
    const token=await currentUser.getIdToken();
    const response=await fetch("/api/profile-avatar",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({action:"create-upload",fileName:file.name,contentType:file.type,size:file.size})});
    const payload=await response.json().catch(()=>({})); if(!response.ok)throw new Error(payload.error||`Upload permission failed (${response.status}).`);
    const {error}=await supabaseClient.storage.from(payload.bucket).uploadToSignedUrl(payload.path,payload.token,file,{contentType:file.type,upsert:false});
    if(error)throw error;
    const publicUrl=supabaseClient.storage.from(payload.bucket).getPublicUrl(payload.path).data.publicUrl;
    $("#profileAvatar").value=publicUrl;
    $("#profileAvatarPreview").src=publicUrl; $("#profileAvatarPreviewWrap").hidden=false;
    toast("Profile photo uploaded. Save your profile to apply it.");
  }catch(error){console.error("Profile photo upload failed",error);toast(error.message||"Could not upload profile photo.");}
  finally{if(input)input.disabled=false;}
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
    bio, statusText: String($("#profileStatus").value || "").trim().slice(0,100), joinedAt: privateProfile?.createdAt || publicProfile?.joinedAt || Date.now(), skills, skillsLower: normalizedList(skills.join(",")),
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
    host.innerHTML = rows.length ? rows.map(source => {
      const lastRun = tsMillis(source.lastRunAt);
      const health = source.lastError ? `Error: ${source.lastError}` : lastRun ? `Last checked ${new Date(lastRun).toLocaleString()} · ${Number(source.lastItemCount || 0)} fetched · ${Number(source.lastPublishedCount || 0)} published` : "Waiting for first discovery run";
      const address = source.feedUrl || source.sourceUrl || "Managed connector";
      return `<div class="discovery-source-row"><div><b>${esc(source.name || "Opportunity source")}</b><small>${esc(source.platform || source.type || "RSS")} · ${esc(address)}</small><small class="source-health ${source.lastError ? "has-error" : ""}">${esc(health)}</small></div>${source.type === "rss" ? `<label class="source-toggle"><input type="checkbox" data-source-toggle="${esc(source.id)}" ${source.enabled ? "checked" : ""}> Enabled</label>` : `<span class="source-managed-label">Managed</span>`}</div>`;
    }).join("") : '<p class="muted">No sources connected yet. Add an approved public RSS feed below.</p>';
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
  const category = $("#discoverySourceCategory")?.value || "";
  const button = $("#addDiscoverySourceBtn"); button.disabled = true;
  try {
    await httpsCallable(functions, "addDiscoverySource")({ name, feedUrl, category, autoPublish: true });
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
    await loadEvents({ forceRefresh: true }); await loadDiscoverySources();
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

function canonicalOpportunityUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    url.hash = "";
    [...url.searchParams.keys()].forEach(key => { if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key); });
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch { return ""; }
}
function normalizeOpportunityText(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function reliableOpportunityOrganizer(event) {
  const organizer = normalizeOpportunityText(event.organizer);
  const source = normalizeOpportunityText(event.sourceName || event.sourcePlatform);
  return organizer && !["source publisher", "organiser not listed", "organizer not listed", "unknown", source].includes(organizer) ? organizer : "";
}
function sameOpportunityIdentity(a, b) {
  if (!a || !b || eventCategoryValue(a) !== eventCategoryValue(b)) return false;
  const urlsA = [a.sourceUrl, a.officialEventUrl, a.officialRegistrationUrl].map(canonicalOpportunityUrl).filter(Boolean);
  const urlsB = new Set([b.sourceUrl, b.officialEventUrl, b.officialRegistrationUrl].map(canonicalOpportunityUrl).filter(Boolean));
  if (urlsA.some(url => urlsB.has(url))) return true;
  const aTitle = normalizeOpportunityText(a.title), bTitle = normalizeOpportunityText(b.title);
  if (!aTitle || aTitle !== bTitle) return false;
  const orgA = reliableOpportunityOrganizer(a), orgB = reliableOpportunityOrganizer(b);
  if (orgA && orgB && orgA === orgB) return true;
  const dateKeys = ["registrationDeadline", "startAt", "endAt"];
  const closeDate = dateKeys.some(key => {
    const left = tsMillis(a[key]), right = tsMillis(b[key]);
    return left > 0 && right > 0 && Math.abs(left - right) <= 72 * 60 * 60 * 1000;
  });
  const locA = normalizeOpportunityText(a.location || a.city), locB = normalizeOpportunityText(b.location || b.city);
  const sameLocation = Boolean(locA && locB && locA !== "online" && locB !== "online" && (locA === locB || locA.includes(locB) || locB.includes(locA)));
  return closeDate && sameLocation;
}
function opportunityQualityScore(event) {
  return (event.verificationStatus === "verified" ? 100 : 0)
    + (event.officialRegistrationUrl ? 20 : 0) + (event.officialEventUrl ? 10 : 0)
    + (event.registrationDeadline ? 8 : 0) + (event.organizer ? 5 : 0)
    + (event.eligibility ? 4 : 0) + (event.prize || event.prizePool ? 3 : 0)
    + Math.min(10, Array.isArray(event.sourceRecords) ? event.sourceRecords.length : 0)
    + Math.min(5, Math.floor(tsMillis(event.updatedAt || event.ingestedAt) / 86400000 / 30));
}
function deduplicateVisibleOpportunities(records) {
  const sorted = [...records].sort((a,b) => opportunityQualityScore(b) - opportunityQualityScore(a));
  const unique = [];
  for (const record of sorted) {
    if (!unique.some(existing => sameOpportunityIdentity(record, existing))) unique.push(record);
  }
  return unique;
}

const OPPORTUNITY_CACHE_KEY = "hackverse-opportunities-cache-v1";
const OPPORTUNITY_CACHE_TTL = 30 * 60 * 1000;
function readOpportunityCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(OPPORTUNITY_CACHE_KEY) || "null");
    if (!cached || !Array.isArray(cached.records) || !Number.isFinite(cached.savedAt)) return null;
    if (Date.now() - cached.savedAt >= OPPORTUNITY_CACHE_TTL) return null;
    return cached.records;
  } catch { return null; }
}
function writeOpportunityCache(records) {
  try { localStorage.setItem(OPPORTUNITY_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), records })); }
  catch (error) { console.warn("Opportunity cache could not be saved; live directory remains available.", error); }
}
function displayOpportunityRecords(records) {
  const now = Date.now();
  const loaded = records.filter(e => {
    if (e.status === "expired") return false;
    const deadline = tsMillis(e.registrationDeadline);
    const courseEnd = tsMillis(e.endAt);
    if (deadline && deadline < now) return false;
    if (["course", "bootcamp", "certification"].includes(eventCategoryValue(e)) && courseEnd && courseEnd < now) return false;
    return true;
  });
  events = deduplicateVisibleOpportunities(loaded);
  events.sort((a,b) => tsMillis(b.updatedAt || b.ingestedAt || b.createdAt) - tsMillis(a.updatedAt || a.ingestedAt || a.createdAt));
  allEventsVisible = 24; populateEventFilterOptions(); renderEvents(); renderSaved();
}
async function loadEvents({ forceRefresh = false } = {}) {
  const grid = $("#eventGrid");
  if (!currentUser) { events = []; updateEventAccessUI(); renderEvents(); renderSaved(); return; }
  if (!db) {
    if (grid) grid.innerHTML = '<div class="loading-card">Connect Supabase to load real opportunities. No sample events are bundled with this website.</div>';
    $("#eventGridAll").innerHTML = '<div class="loading-card">Connect Supabase to load the live opportunity directory.</div>';
    return;
  }
  updateEventAccessUI();
  if (!forceRefresh) {
    const cached = readOpportunityCache();
    // Render cached data immediately for responsiveness, but still refresh from
    // Supabase database. The previous early return could leave the dashboard showing an
    // older opportunity count for up to 30 minutes after a discovery run.
    if (cached) displayOpportunityRecords(cached);
  }
  grid.innerHTML = '<div class="loading-card">Loading opportunities…</div>';
  try {
    // Read public listings in bounded pages rather than silently stopping at 500.
    const loadedDocs = [];
    let cursor = null;
    // Three bounded pages are enough for a useful first load without letting a
    // very large directory trigger dozens of sequential network round-trips.
    for (let page = 0; page < 3; page++) {
      const constraints = [where("visibility", "==", "public"), limit(500)];
      if (cursor) constraints.push(startAfter(cursor));
      const snapshot = await getDocs(query(collection(db, "hackathons"), ...constraints));
      loadedDocs.push(...snapshot.docs);
      if (snapshot.docs.length < 500) break;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
    const records = loadedDocs.map(d => ({ id: d.id, ...d.data() }));
    writeOpportunityCache(records);
    displayOpportunityRecords(records);
  } catch (error) {
    console.error("Opportunity feed read failed", error);
    const stale = (() => { try { const cached = JSON.parse(localStorage.getItem(OPPORTUNITY_CACHE_KEY) || "null"); return Array.isArray(cached?.records) ? cached.records : null; } catch { return null; } })();
    if (stale?.length) { displayOpportunityRecords(stale); toast("Showing your last loaded opportunities because the live refresh failed."); }
    else {
      grid.innerHTML = '<div class="loading-card">Could not load opportunities. Check your Supabase database rules and connection.</div>';
      $("#eventGridAll").innerHTML = '<div class="loading-card">The opportunity directory could not be loaded.</div>';
    }
  }
}

function eventCategoryValue(event) {
  const raw = String(event.category || event.opportunityType || event.type || "").toLowerCase();
  if (["hackathon","bootcamp","course","certification","coding-event","case-competition","internship","scholarship","fellowship","grant","research","competition","volunteering"].includes(raw)) return raw;
  const text = `${event.title || ""} ${event.summary || ""} ${(event.tags || []).join(" ")}`.toLowerCase();
  if (/\binternship\b|summer intern|winter intern/.test(text)) return "internship";
  if (/\bscholarship\b|bursary|tuition waiver/.test(text)) return "scholarship";
  if (/\bfellowship\b/.test(text)) return "fellowship";
  if (/\bgrant\b|seed funding/.test(text)) return "grant";
  if (/research assistant|research opportunity|research programme|research program/.test(text)) return "research";
  if (/volunteer opportunity|volunteering programme|volunteering program/.test(text)) return "volunteering";
  if (/\bcompetition\b|innovation challenge|student contest/.test(text)) return "competition";
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
  const ms = tsMillis(value);
  if (!ms) return "Not provided";
  const date = new Date(ms);
  const options = {day:"numeric",month:"short",year:"numeric"};
  if (date.getUTCHours() || date.getUTCMinutes() || date.getUTCSeconds()) {
    options.hour = "numeric"; options.minute = "2-digit";
  }
  return date.toLocaleString(undefined, options);
}
function opportunityCard(event, index) {
  const deadlineMs = tsMillis(event.registrationDeadline);
  const deadlineText = deadlineMs ? (deadlineMs < Date.now() ? "Deadline passed" : `Closes ${dateLabel(event.registrationDeadline)}`) : "Deadline not listed";
  const categoryValue = eventCategoryValue(event);
  const prize = ["course", "bootcamp", "certification", "internship", "scholarship", "fellowship", "grant", "research"].includes(categoryValue)
    ? (event.isFree === true ? "Free learning" : (event.price || "Check provider details"))
    : (event.prize || (Number(event.prizePool) > 0 ? `${esc(event.currency || "")} ${Number(event.prizePool).toLocaleString()}` : "Prize details not listed"));
  const organizer = event.organizer || event.sourceName || "Organiser not listed";
  const cat = eventCategoryValue(event).replace("-"," ");
  const mode = eventModeValue(event);
  const place = event.location || [event.city,event.region,event.country].filter(Boolean).join(", ") || (mode === "Online" ? "Online / remote" : "Location not listed");
  const track = (event.tracks || event.tags || []).slice(0,2).join(" · ");
  const sourceCredit = event.sourceName === "Brabble.ai" ? ' · via <a href="https://brabble.ai/" target="_blank" rel="noopener noreferrer">Brabble.ai</a>' : (event.sourceName && event.organizer ? ` · via ${esc(event.sourceName)}` : "");
  return `<article class="event-card opportunity-card"><div class="event-banner b${(index%3)+1}"><span class="tag">${esc(cat)}</span><span class="tag">${esc(mode)}</span></div><div class="event-body"><div class="event-source">${esc(organizer)}${sourceCredit}</div><h3>${esc(event.title || "Untitled opportunity")}</h3><p class="event-desc">${esc(event.summary || "Open the original organiser listing for its full details.")}</p><div class="event-facts"><span>◎ ${esc(place)}</span>${track ? `<span>✦ ${esc(track)}</span>` : ""}<span>◷ ${esc(deadlineText)}</span></div><div class="event-bottom"><span class="event-prize">${esc(prize)}</span><div class="event-actions"><button class="save-btn" data-save="${esc(event.id)}">${savedIds.has(event.id)?"♥ Saved":"♡ Save"}</button><button class="register-btn" data-view-event="${esc(event.id)}">Read details ↗</button></div></div></div></article>`;
}
function renderLearningCatalog() {
  const panel = $("#learningCatalog");
  if (!panel) return;
  const category = $("#eventCategory")?.value || "all";
  const configs = {
    hackathon: {
      eyebrow: "HACKATHON SOURCES", tag: "OFFICIAL DIRECTORIES", title: "Discover hackathons across more platforms.",
      intro: "Browse organiser platforms around the world. HackVerse imports available public feeds; other directories open directly so you can check current registration and eligibility.",
      providers: [
        ["Unstop", "India-focused hackathons, competitions, quizzes, hiring challenges and campus events.", "https://unstop.com/hackathons", "Public listing connector · India"],
        ["Devfolio", "Student and community hackathons, especially across India and Web3 communities.", "https://devfolio.co/hackathons", "Public listing connector"],
        ["Devpost", "Global online and in-person hackathons from companies, universities and communities.", "https://devpost.com/hackathons", "Public listing connector"],
        ["Major League Hacking", "University hackathons and student builder programmes.", "https://mlh.io/seasons/2026/events", "Official season directory"],
        ["HackerEarth", "Company, developer and recruiting hackathons.", "https://www.hackerearth.com/challenges/", "Public listing connector"],
        ["DoraHacks", "Global innovation, Web3, AI and open-source hackathons.", "https://dorahacks.io/hackathon", "Browse organiser listings"],
        ["ETHGlobal", "Ethereum ecosystem hackathons, build weeks and developer events.", "https://ethglobal.com/events", "Browse organiser listings"],
        ["Hack Club", "Student-led hackathons, coding events and maker programmes.", "https://hackathons.hackclub.com/", "Student community directory"],
        ["Lablab.ai", "AI-focused hackathons, challenges and collaborative build events.", "https://lablab.ai/event", "Browse organiser listings"],
        ["Hack2skill", "Technology innovation challenges, hackathons and student programmes.", "https://hack2skill.com/", "Browse organiser listings"],
        ["AngelHack", "Global developer hackathons and innovation programmes.", "https://angelhack.com/", "Browse organiser listings"],
        ["Brabble.ai", "Aggregated hackathon listings from multiple public competition platforms.", "https://brabble.ai/", "Attributed RSS source connected to HackVerse"]
      ]
    },
    "case-competition": {
      eyebrow: "CASE COMPETITION SOURCES", tag: "CHALLENGE DIRECTORIES", title: "Find business and innovation challenges.",
      intro: "Case competitions can have team, university, region and degree restrictions. Always confirm the official rules before applying.",
      providers: [
        ["Unstop", "Business case studies, strategy competitions, quizzes and innovation challenges.", "https://unstop.com/competitions", "Public platform"],
        ["Brabble.ai", "Aggregated student case competitions and open challenges.", "https://brabble.ai/", "Attributed public RSS feed connected"],
        ["Kaggle Competitions", "Data science, machine learning and business problem competitions.", "https://www.kaggle.com/competitions", "Official competition directory"],
        ["HackerEarth", "Company-sponsored problem-solving and technical challenges.", "https://www.hackerearth.com/challenges/", "Official challenge directory"],
        ["Devpost", "Innovation challenges and sponsored build competitions.", "https://devpost.com/hackathons", "Official hackathon directory"]
      ]
    },
    "coding-event": {
      eyebrow: "CODING CONTEST SOURCES", tag: "LIVE COMPETITION DIRECTORIES", title: "Find your next coding challenge.",
      intro: "Browse programming contests, algorithm rounds, CTFs and data competitions. The Codeforces public contest API is also imported into HackVerse.",
      providers: [
        ["Codeforces", "Competitive programming rounds and algorithm contests.", "https://codeforces.com/contests", "Public API connector"],
        ["CodeChef", "Rated contests, Starters and practice competitions.", "https://www.codechef.com/contests", "Official contest directory"],
        ["LeetCode", "Weekly and biweekly programming contests.", "https://leetcode.com/contest/", "Official contest directory"],
        ["AtCoder", "Beginner, regular and grand programming contests.", "https://atcoder.jp/contests/", "Official contest directory"],
        ["HackerRank", "Skills-based programming contests and challenges.", "https://www.hackerrank.com/contests", "Official contest directory"],
        ["Kaggle", "Machine learning, analytics and data-science competitions.", "https://www.kaggle.com/competitions", "Official competition directory"],
        ["CTFtime", "Capture-the-flag cybersecurity competitions worldwide.", "https://ctftime.org/event/list/", "Community event directory"],
        ["Codingame", "Programming competitions, bot challenges and developer games.", "https://www.codingame.com/contests", "Official contest directory"],
        ["Brabble.ai", "Aggregated coding contests from multiple platforms.", "https://brabble.ai/", "Attributed public RSS source connected"]
      ]
    },
    course: {
      eyebrow: "COURSE CATALOGUES", tag: "OFFICIAL PROVIDERS", title: "Explore coding and technology courses.",
      intro: "Browse a wider set of course libraries. Some courses are free to audit while certificates, graded work or guided programmes may cost extra; confirm details with the provider.",
      providers: [
        ["openHPI", "Computer science, data, AI and digital technology courses from HPI.", "https://open.hpi.de/courses", "Public dated course feed connected to HackVerse"],
        ["Coursera", "University and industry courses, guided projects and professional certificates.", "https://www.coursera.org/browse", "Official course catalogue"],
        ["edX", "University-level computer science, engineering and professional courses.", "https://www.edx.org/search", "Official course catalogue"],
        ["SWAYAM", "India's national online course platform from universities and institutions.", "https://swayam.gov.in/explorer", "India · Official catalogue"],
        ["NPTEL", "Engineering, science, management and technology courses from IITs and IISc.", "https://nptel.ac.in/", "India · Official catalogue"],
        ["freeCodeCamp", "Free web development, Python, data and computer science curriculum.", "https://www.freecodecamp.org/learn/", "Free learning platform"],
        ["MIT OpenCourseWare", "Free course materials from MIT subjects and departments.", "https://ocw.mit.edu/", "Open educational resources"],
        ["Harvard CS50", "Computer science and programming courses from Harvard.", "https://cs50.harvard.edu/", "Official course collection"],
        ["Microsoft Learn", "Role-based learning paths for cloud, AI, developer and data skills.", "https://learn.microsoft.com/training/", "Official learning paths"],
        ["Google Skills", "Hands-on labs and learning paths for cloud, AI and Google technologies.", "https://www.skills.google/", "Official learning catalogue"],
        ["AWS Skill Builder", "Cloud, AI, architecture and developer learning resources.", "https://skillbuilder.aws/", "Official learning catalogue"],
        ["IBM SkillsBuild", "Digital, AI, cybersecurity and professional skills learning.", "https://skillsbuild.org/", "Free learning resources available"],
        ["Cisco Networking Academy", "Networking, cybersecurity, programming and IT learning.", "https://www.netacad.com/", "Official learning platform"],
        ["Kaggle Learn", "Short practical courses in Python, ML, SQL and data science.", "https://www.kaggle.com/learn", "Free micro-courses"],
        ["FutureLearn", "Online courses and microcredentials from universities and organisations.", "https://www.futurelearn.com/", "Official course catalogue"],
        ["Class Central", "Search engine and directory for online courses from many providers.", "https://www.classcentral.com/", "Course discovery directory"],
        ["Udacity", "Technology courses and career-focused nanodegree programmes.", "https://www.udacity.com/courses/all", "Official course catalogue"],
        ["Codecademy", "Interactive programming courses, skill paths and career paths.", "https://www.codecademy.com/catalog", "Coding-focused catalogue"]
      ]
    },
    bootcamp: {
      eyebrow: "BOOTCAMP & FELLOWSHIP SOURCES", tag: "PROGRAMME DIRECTORIES", title: "Explore coding bootcamps and builder programmes.",
      intro: "Compare eligibility, cohort dates, outcomes, refund policies and fees carefully. Provider catalogues may include paid programmes and region-specific availability.",
      providers: [
        ["CodePath", "College-focused technical courses and career preparation programmes.", "https://www.codepath.org/courses", "Student programmes"],
        ["MLH Fellowship", "Remote collaborative software engineering fellowship programmes.", "https://fellowship.mlh.io/", "Fellowship · application windows vary"],
        ["Masai School", "India-based technology and career programmes.", "https://www.masaischool.com/", "India · Provider catalogue"],
        ["Scaler", "Software engineering, data science and technology learning programmes.", "https://www.scaler.com/", "India · Provider catalogue"],
        ["Coding Ninjas", "Programming, data science and software development courses.", "https://www.codingninjas.com/", "India · Provider catalogue"],
        ["GeeksforGeeks", "Structured coding, DSA, interview preparation and development courses.", "https://www.geeksforgeeks.org/courses/", "India · Course catalogue"],
        ["Le Wagon", "Full-stack web development and data bootcamps.", "https://www.lewagon.com/", "Global · Cohort availability varies"],
        ["Ironhack", "Web development, UX/UI and data bootcamps.", "https://www.ironhack.com/", "Global · Provider catalogue"],
        ["General Assembly", "Software engineering, data and product career programmes.", "https://generalassemb.ly/education", "Global · Provider catalogue"],
        ["Springboard", "Mentor-supported software, data and cybersecurity programmes.", "https://www.springboard.com/", "Online · Provider catalogue"],
        ["CareerFoundry", "Online technology and UX career-change programmes.", "https://careerfoundry.com/", "Online · Provider catalogue"],
        ["App Academy", "Software engineering bootcamp and coding curriculum.", "https://www.appacademy.io/", "Online · Provider catalogue"],
        ["Recurse Center", "Self-directed programming retreat and developer community.", "https://www.recurse.com/", "Fellowship-style programme"]
      ]
    },
    certification: {
      eyebrow: "CERTIFICATION CATALOGUES", tag: "OFFICIAL CREDENTIALS", title: "Find recognised technology credentials.",
      intro: "Distinguish a course-completion certificate from an exam-based professional certification. Check exam fees, renewal rules and prerequisites on the issuer's website.",
      providers: [
        ["Microsoft Credentials", "Azure, security, data, AI and Microsoft role-based credentials.", "https://learn.microsoft.com/credentials/", "Official issuer"],
        ["AWS Certification", "Cloud practitioner, architect, developer, operations and specialty exams.", "https://aws.amazon.com/certification/", "Official issuer"],
        ["Google Cloud Credentials", "Cloud, data, machine learning and infrastructure credentials.", "https://cloud.google.com/learn/certification", "Official issuer"],
        ["Cisco Certifications", "Networking, cybersecurity, automation and enterprise credentials.", "https://www.cisco.com/site/us/en/learn/training-certifications/certifications/index.html", "Official issuer"],
        ["IBM Training", "AI, data, cloud and enterprise technology learning and credentials.", "https://www.ibm.com/training/", "Official issuer"],
        ["CompTIA", "Vendor-neutral IT, cybersecurity, networking and infrastructure certifications.", "https://www.comptia.org/certifications", "Official issuer"],
        ["Coursera Certificates", "Professional certificate programmes from universities and companies.", "https://www.coursera.org/professional-certificates", "Provider catalogue"],
        ["edX Certificates", "Verified course certificates and professional programmes.", "https://www.edx.org/certificates", "Provider catalogue"]
      ]
    }
  };
  const config = configs[category];
  panel.hidden = !config;
  if (!config) return;
  $("#learningCatalogEyebrow").textContent = config.eyebrow;
  $("#learningCatalogTitle").textContent = config.title;
  $("#learningCatalogIntro").textContent = config.intro;
  $("#learningCatalogTag").textContent = config.tag;
  $("#learningProviderGrid").innerHTML = config.providers.map(([name, description, url, note]) =>
    `<article class="learning-provider-card"><div class="learning-provider-mark">${esc(name.slice(0,1))}</div><div class="learning-provider-copy"><h3>${esc(name)}</h3><p>${esc(description)}</p><small>${esc(note)}</small><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Browse provider ↗</a></div></article>`
  ).join("");
}

function renderEvents() {
  const list = filteredEvents();
  renderLearningCatalog();
  const preview = $("#eventGrid"); const full = $("#eventGridAll");
  if (preview) {
    $("#homeOpportunityCount").textContent = `${events.length} unique active opportunities · ${list.length} match current filters`;
    const top = list.slice(0,6);
    preview.innerHTML = top.length ? top.map(opportunityCard).join("") : `<div class="loading-card">${db ? (events.length ? "No opportunities match this selection. Explore all opportunities and adjust filters." : "No opportunities have been published yet. New discoveries will appear here automatically.") : "Connect Supabase to load the live opportunity feed."}</div>`;
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

function renderPeopleEmpty() { $("#peopleGrid").innerHTML = '<div class="loading-card">Connect Supabase and create a profile to begin discovering teammates.</div>'; }
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
    } catch (error) { console.error("People search failed", error); $("#peopleResultCount").textContent = "Could not search profiles. Check your Supabase database rules and indexes."; $("#peopleGrid").innerHTML = '<div class="loading-card">Profile search is temporarily unavailable.</div>'; }
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
    $("#memberProfileContent").innerHTML = `<div class="member-profile-head"><div class="avatar avatar-large">${p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" referrerpolicy="no-referrer">` : esc(initials(p.displayName))}</div><div><div class="eyebrow">HACKVERSE BUILDER</div><h2 id="memberModalTitle">${esc(p.displayName || "Builder")}</h2><p class="member-handle">@${esc(p.username || "member")}</p></div></div><p class="member-bio">${esc(p.statusText || "")}</p><p class="member-bio">${esc(p.bio || "No bio added yet.")}</p><div class="member-facts">${p.joinedAt ? `<span>Joined ${new Date(tsMillis(p.joinedAt)).toLocaleDateString(undefined,{month:"short",year:"numeric"})}</span>` : ""}<span>${esc([p.course,p.college].filter(Boolean).join(" · ") || "Education not listed")}</span><span>${esc([p.studyLevel,p.graduationYear ? `Class of ${p.graduationYear}` : ""].filter(Boolean).join(" · ") || "Study level not listed")}</span><span>${esc([p.city,p.country].filter(Boolean).join(", ") || "Location not listed")}</span><span>${esc(p.availability || "Availability not listed")}</span><span>Preferred format: ${esc(p.preferredMode || "Any format")}</span></div><h3>Skills</h3><div class="skill-tags">${(p.skills || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interested roles</h3><div class="skill-tags">${(p.rolesInterested || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><h3>Interests</h3><div class="skill-tags">${(p.interests || []).map(s => `<span>${esc(s)}</span>`).join("") || "Not listed"}</div><div class="member-contact"><h3>Contact details</h3><p>${p.publicEmail ? `Email: <a href="mailto:${esc(p.publicEmail)}">${esc(p.publicEmail)}</a>` : "Email kept private by this member."}</p><p>${p.publicPhone ? `Phone: <a href="tel:${esc(p.publicPhone)}">${esc(p.publicPhone)}</a>` : "Phone kept private by this member."}</p></div><div class="member-links">${p.github ? `<a href="${esc(validUrl(p.github))}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}${p.linkedin ? `<a href="${esc(validUrl(p.linkedin))}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ""}${p.portfolio ? `<a href="${esc(validUrl(p.portfolio))}" target="_blank" rel="noopener">Portfolio ↗</a>` : ""}</div>`;
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
      if (latest) { activeConversation = latest; renderChatHeading(); if(currentMessages.length)renderMessages(currentMessages); }
    }
  }, error => { console.error("Inbox listener", error); $("#conversationList").innerHTML = '<div class="empty-note">Could not load conversations. Check Supabase database rules.</div>'; });
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
  let visible = rows.filter(c => { const hiddenAt=tsMillis(c.hiddenForBy?.[currentUser?.uid]); return !hiddenAt || tsMillis(c.lastMessageAt)>hiddenAt; }).filter(c => `${conversationLabel(c)} ${c.lastMessage || ""} ${(c.participantNames ? Object.values(c.participantNames) : []).join(" ")}`.toLowerCase().includes(term));
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
async function hideChatForMe() {
  if(!activeConversationId||!requireAccount())return;
  try{await updateDoc(doc(db,"conversations",activeConversationId),{[`hiddenForBy.${currentUser.uid}`]:serverTimestamp()});toast("Chat deleted from your chat list. It will reappear if a new message arrives.");activeConversation=null;activeConversationId=null;if(stopMessageListener)stopMessageListener();stopMessageListener=null;$("#chatActive").hidden=true;$("#chatPlaceholder").hidden=false;renderConversationList(currentConversations);}catch(error){toast(friendlyError(error));}
}
async function clearChatForMe() {
  if(!activeConversationId||!requireAccount())return;
  if(!(await confirmInApp("Clear all messages from your view? Other members will still see their copies.","Clear chat")))return;
  try{await updateDoc(doc(db,"conversations",activeConversationId),{[`clearAtBy.${currentUser.uid}`]:serverTimestamp()});activeConversation={...activeConversation,clearAtBy:{...(activeConversation.clearAtBy||{}),[currentUser.uid]:Date.now()}};renderMessages(currentMessages);toast("Chat cleared from your view.");}catch(error){toast(friendlyError(error));}
}
async function openChatActions(){
  if(!activeConversation){toast("Choose a chat first.");return;}
  const prefs=getChatPreferences(),pinned=new Set(prefs.pinned||[]),archived=new Set(prefs.archived||[]);
  const c=activeConversation;
  const choice=await chooseInApp("Chat options",`Manage ${conversationLabel(c)}. Deleting a chat only removes it from your own list.`,[
    {value:"pin",label:pinned.has(c.id)?"Unpin chat":"Pin chat",variant:"outline"},
    {value:"archive",label:archived.has(c.id)?"Unarchive chat":"Archive chat",variant:"outline"},
    {value:"clear",label:"Clear chat for me",variant:"outline"},
    {value:"delete",label:"Delete chat for me",variant:"danger"},
    {value:"cancel",label:"Close",variant:"outline"}
  ]);
  if(!choice||choice==="cancel")return;
  if(choice==="clear"){await clearChatForMe();return;} if(choice==="delete"){if(await confirmInApp("Remove this conversation from your chat list? The other participants keep their chat and messages.","Delete chat for me"))await hideChatForMe();return;}
  const list=choice==="pin"?"pinned":"archived";const ids=new Set(prefs[list]||[]);ids.has(c.id)?ids.delete(c.id):ids.add(c.id);prefs[list]=[...ids];localStorage.setItem(`hv-chat-settings-${currentUser?.uid||"guest"}`,JSON.stringify(prefs));renderConversationList(currentConversations);toast(choice==="pin"?"Pin preference updated.":"Archive preference updated.");
}

function renderChatHeading() {
  if (!activeConversation) return;
  $("#chatTitle").textContent = conversationLabel(activeConversation);
  const avatarEl=$("#chatContactAvatar");
  if(avatarEl){const imageUrl=activeConversation.isGroup?validUrl(activeConversation.groupPhotoUrl):"";avatarEl.innerHTML=imageUrl?`<img src="${esc(imageUrl)}" alt="" loading="lazy">`:esc(activeConversation.isGroup?"✦":initials(conversationLabel(activeConversation)));if(!activeConversation.isGroup){const other=(activeConversation.participants||[]).find(uid=>uid!==currentUser?.uid);if(other)getDoc(doc(db,"publicProfiles",other)).then(snap=>{if(activeConversationId===activeConversation.id&&snap.exists()&&snap.data().avatarUrl){avatarEl.innerHTML=`<img src="${esc(validUrl(snap.data().avatarUrl))}" alt="" loading="lazy">`;}}).catch(()=>{});}}

  const members = (activeConversation.participants || []).length;
  $("#chatSubtitle").textContent = activeConversation.isGroup ? `${members} members · ${activeConversation.groupName || "Team chat"}` : "Direct conversation · click to view profile";
  const canManage = Boolean(activeConversation.isGroup && (activeConversation.createdBy === currentUser?.uid || (activeConversation.admins || []).includes(currentUser?.uid)));
  // Every group participant can open the roster and member profiles; management controls remain role-gated inside the dialog.
  $("#groupManageBtn").hidden = !activeConversation.isGroup;
}
function selectConversation(conversation) {
  if (!conversation || !currentUser) return;
  if (activeConversationId && activeConversationId !== conversation.id && pendingChatFile) {
    pendingChatFile = null;
    renderPendingChatAttachment();
  }
  activeConversation = conversation; activeConversationId = conversation.id; replyingToMessageId = null;
  $("#chatPlaceholder").hidden = true; $("#chatActive").hidden = false; renderChatHeading(); updateReplyPreview();
  if (stopMessageListener) stopMessageListener(); if (stopTypingListener) stopTypingListener();
  const messagesQuery = query(collection(db, "conversations", conversation.id, "messages"), orderBy("createdAt", "desc"), limit(300));
  let firstMessagesSnapshot = true;
  stopMessageListener = onSnapshot(messagesQuery, snapshot => {
    const nextMessages = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
    const oldIds = new Set(currentMessages.map(message => message.id));
    const arrivingIds = new Set(firstMessagesSnapshot ? [] : nextMessages.filter(message => !oldIds.has(message.id)).map(message => message.id));
    currentMessages = nextMessages;
    renderMessages(currentMessages, { animateIds: arrivingIds });
    firstMessagesSnapshot = false;
    hydrateChatAttachmentUrls(conversation.id, currentMessages).catch(error => console.warn("Chat attachment preview unavailable", error)); markConversationDelivered(conversation.id).catch(()=>{}); markConversationRead(conversation.id).catch(()=>{});
  }, error => { console.error("Messages listener", error); $("#messageList").innerHTML = '<div class="empty-note">Could not load messages. Check Supabase database rules.</div>'; });
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
function renderMessages(messages, options = {}) {
  const animateIds = options.animateIds instanceof Set ? options.animateIds : new Set();
  const term = $("#messageSearch")?.value.trim().toLowerCase() || "";
  const clearAt=tsMillis(activeConversation?.clearAtBy?.[currentUser?.uid]);
  const visible = messages.filter(m => !m.hiddenForBy?.[currentUser?.uid] && (!clearAt || tsMillis(m.createdAt)>clearAt)).filter(m => !term || String(m.text || "").toLowerCase().includes(term) || String(m.authorName || "").toLowerCase().includes(term) || String(m.attachment?.name || "").toLowerCase().includes(term));
  const box = $("#messageList"); if (!box) return;
  if ($("#messageSearchCount")) $("#messageSearchCount").textContent = term ? `${visible.length} matches` : `${messages.length} messages`;
  if (!visible.length) { box.innerHTML = `<div class="empty-note message-empty">${term ? "No messages match your search." : "This is the beginning of this chat. Say hello 👋"}</div>`; return; }
  const prefs = getChatPreferences(); const starred = new Set(prefs.starred || []);
  box.innerHTML = visible.map(m => {
    const mine = m.authorUid === currentUser?.uid; const created = tsMillis(m.createdAt); const time = created ? new Date(created).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "Sending…";
    const canEdit = mine && !m.deleted && created && Date.now() - created <= 15*60*1000;
    const reply = m.replyTo ? `<div class="message-reply-quote"><b>${esc(m.replyTo.authorName || "Reply")}</b><span>${esc(m.replyTo.text || "Original message")}</span></div>` : "";
    let attachment = "";
    if (m.attachment?.url && !m.deleted) {
      const url = validUrl(m.attachment.url); const type = String(m.attachment.type || "");
      if (type.startsWith("image/")) attachment = `<a class="chat-attachment-image" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(m.attachment.name || "Shared image")}" loading="lazy"></a>`;
      else if (type.startsWith("audio/")) attachment = `<audio class="chat-audio" controls preload="none" src="${esc(url)}"></audio>`;
      else if (type.startsWith("video/")) attachment = `<video class="chat-video" controls preload="metadata" src="${esc(url)}"></video>`;
      else attachment = `<a class="chat-file-card" href="${esc(url)}" target="_blank" rel="noopener"><span>↧</span><span><b>${esc(m.attachment.name || "Shared file")}</b><small>${esc(formatFileSize(m.attachment.size || 0))}</small></span></a>`;
    }
    const reactions = Object.entries(m.reactions || {}).reduce((acc,[uid,emoji]) => { if (emoji) acc[emoji]=(acc[emoji]||0)+1; return acc; }, {});
    const pinnedMessages = new Set(prefs.pinnedMessages || []);
    const isPinnedHere = pinnedMessages.has(`${activeConversationId}:${m.id}`);
    const reactionHtml = Object.entries(reactions).map(([emoji,count])=>`<button class="reaction-chip ${(m.reactions||{})[currentUser?.uid]===emoji?"mine":""}" type="button" data-react-message="${esc(m.id)}" data-emoji="${esc(emoji)}">${esc(emoji)} <span>${count}</span></button>`).join("");
    const readAt = activeConversation?.readAtBy || {}; const deliveredAt=activeConversation?.deliveredAtBy||{}; const recipients = (activeConversation?.participants || []).filter(uid=>uid!==currentUser?.uid);
    const readByAll = recipients.length && recipients.every(uid=>tsMillis(readAt[uid])>=created && created>0);
    const deliveredByAll = recipients.length && recipients.every(uid=>tsMillis(deliveredAt[uid])>=created && created>0);
    const deliveryLabel=readByAll?"Read":deliveredByAll?"Delivered":"Sent";
    const status = mine ? `<span class="message-ticks ${readByAll?"read":deliveredByAll?"delivered":""}" title="${deliveryLabel}">${readByAll?"✓✓":deliveredByAll?"✓✓":"✓"}</span>` : "";
    const messageText = m.deleted ? '<span class="deleted-message">This message was deleted.</span>' : esc(m.text || "");
    return `<article class="message-row ${mine ? "mine" : "theirs"} ${animateIds.has(m.id) ? "is-new" : ""}" data-message-row="${esc(m.id)}"><div class="message-bubble">${!mine?`<button type="button" class="message-author-button" data-view-message-author="${esc(m.authorUid || "")}">${esc(m.authorName || "Teammate")} <span>↗</span></button>`:""}${reply}${attachment}${messageText?`<p>${messageText}</p>`:""}<div class="message-meta"><time>${esc(time)}${m.edited ? " · edited" : ""}</time>${status}</div>${reactionHtml}${isPinnedHere?'<small class="message-pinned-label">⌖ Pinned on this device</small>':""}<div class="message-hover-actions"><button type="button" data-reply-message="${esc(m.id)}" title="Reply">↩</button><button type="button" data-pin-message="${esc(m.id)}" title="Pin on this device">${isPinnedHere?"⌖":"♧"}</button><button type="button" data-react-message="${esc(m.id)}" data-emoji="👍" title="React">☺</button><button type="button" data-copy-message="${esc(m.id)}" title="Copy">▢</button><button type="button" data-star-message="${esc(m.id)}" title="Star">${starred.has(`${activeConversationId}:${m.id}`)?"★":"☆"}</button>${mine&&canEdit?`<button type="button" data-edit-message="${esc(m.id)}" title="Edit">✎</button>`:""}${!mine?`<button type="button" data-report-message="${esc(m.id)}" title="Report message">⚑</button>`:""}<button type="button" data-delete-message="${esc(m.id)}" title="Delete for me or everyone">⌫</button><button type="button" data-forward-message="${esc(m.id)}" title="Forward">↗</button></div></div></article>`;
  }).join("");
  box.querySelectorAll("[data-view-message-author]").forEach(b => b.onclick = () => { if (b.dataset.viewMessageAuthor) viewMember(b.dataset.viewMessageAuthor); });
  box.querySelectorAll("[data-edit-message]").forEach(b => b.onclick = () => editMessage(b.dataset.editMessage));
  box.querySelectorAll("[data-delete-message]").forEach(b => b.onclick = () => deleteMessage(b.dataset.deleteMessage));
  box.querySelectorAll("[data-reply-message]").forEach(b => b.onclick = () => setReply(b.dataset.replyMessage));
  box.querySelectorAll("[data-react-message]").forEach(b => b.onclick = () => toggleMessageReaction(b.dataset.reactMessage,b.dataset.emoji || "👍"));
  box.querySelectorAll("[data-copy-message]").forEach(b => b.onclick = () => copyMessage(b.dataset.copyMessage));
  box.querySelectorAll("[data-star-message]").forEach(b => b.onclick = () => toggleStarMessage(b.dataset.starMessage));
  box.querySelectorAll("[data-pin-message]").forEach(b => b.onclick = () => togglePinMessage(b.dataset.pinMessage));
  box.querySelectorAll("[data-report-message]").forEach(b => b.onclick = () => reportMessage(b.dataset.reportMessage));
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
function togglePinMessage(messageId) {
  const prefs=getChatPreferences();const key=`${activeConversationId}:${messageId}`;const pins=new Set(prefs.pinnedMessages||[]);pins.has(key)?pins.delete(key):pins.add(key);setChatPreference("pinnedMessages",[...pins]);renderMessages(currentMessages);toast(pins.has(key)?"Message pinned on this device.":"Message unpinned on this device.");
}
async function reportMessage(messageId) {
  if(!requireAccount())return;
  const message=currentMessages.find(item=>item.id===messageId);
  if(!message||message.authorUid===currentUser.uid)return;
  const details=await promptInApp("Report this message",`Explain what is wrong with this message from ${message.authorName||"this member"}. Reports are reviewed by authorised moderators.`,"","Report reason");
  if(details===null||!details.trim())return;
  try{
    await addDoc(collection(db,"reports"),{createdBy:currentUser.uid,targetUid:message.authorUid,targetName:message.authorName||"Member",category:"message",details:`Conversation ${activeConversationId}; message ${messageId}. ${details.trim()}`.slice(0,1000),status:"new",createdAt:serverTimestamp()});
    toast("Message report submitted.");
  }catch(error){toast(friendlyError(error));}
}
async function forwardMessage(messageId) {
  const m=currentMessages.find(x=>x.id===messageId); if(!m)return;
  const choices=currentConversations.filter(c=>c.id!==activeConversationId).slice(0,20);
  if(!choices.length){toast("Open another conversation before forwarding.");return;}
  if(m.attachment){toast("For privacy, download the attachment and upload it again in the destination chat. Only text messages can be forwarded directly.");return;}
  const listing=choices.map((c,i)=>`${i+1}. ${conversationLabel(c)}`).join("\n");
  const entered=await promptInApp("Forward message", `Choose the destination number:\n${listing}`, "1", "Destination number");
  if(entered===null)return;const choice=Number(entered);const target=choices[choice-1]; if(!target){toast("Choose a valid conversation number.");return;}
  try{await addDoc(collection(db,"conversations",target.id,"messages"),{authorUid:currentUser.uid,authorName:publicProfile?.displayName||currentUser.displayName||"Member",text:m.text||"",kind:"text",createdAt:serverTimestamp(),forwarded:true});await updateDoc(doc(db,"conversations",target.id),{lastMessage:(m.text||"").slice(0,180),lastMessageSender:currentUser.uid,lastMessageAt:serverTimestamp(),updatedAt:serverTimestamp()});toast("Message forwarded.");}
  catch(error){toast(friendlyError(error));}
}
async function markConversationDelivered(conversationId) {if(!currentUser||!db||!conversationId)return;try{await updateDoc(doc(db,"conversations",conversationId),{[`deliveredAtBy.${currentUser.uid}`]:serverTimestamp()});}catch(error){console.warn("Delivery receipt update was blocked",error);}}
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
async function uploadChatFile(file, kindOverride="file", conversationId=activeConversationId) {
  if (!supabaseClient) throw new Error("Chat media storage is not configured yet. Complete the Supabase setup in docs/AGENT37_AI_SETUP.md.");
  if (!conversationId || !currentUser) throw new Error("Choose a conversation before uploading.");
  const allowed = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/") || ["application/pdf","text/plain","application/zip","application/msword","application/vnd.ms-excel","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(file.type);
  if (!allowed) throw new Error("That file type is not supported.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Attachments must be 15 MB or smaller.");
  const data = await chatMediaRequest({action:"create-upload",conversationId,fileName:file.name,contentType:file.type,size:file.size});
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
  event.preventDefault();
  if (!requireAccount()) return;
  if (!activeConversationId) { toast("Choose a conversation first."); return; }
  const text = $("#messageText").value.trim();
  if (!text && !pendingChatFile) return;
  if (text.length > 2000) { toast("Messages must be 2,000 characters or fewer."); return; }
  const file = pendingChatFile;
  const kind = file ? (file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "file") : "text";
  await submitChatMessage({ text, kind, ...(file ? { file } : {}) });
}
async function submitChatMessage(payload) {
  if (isSendingChatMessage) return false;
  if (!requireAccount() || !activeConversationId) { toast("Choose a conversation first."); return false; }

  const conversationId = activeConversationId;
  const messageText = String(payload.text || "").trim().slice(0, 2000);
  if (!messageText && !payload.attachment && !payload.file) return false;
  const sendButton = $("#messageForm button");
  const input = $("#messageText");
  const draftAtSend = input?.value ?? "";
  const previousLabel = sendButton?.textContent || "➤";
  const reply = replyingToMessageId ? currentMessages.find(m => m.id === replyingToMessageId) : null;
  const replyTo = reply ? {
    messageId: reply.id,
    authorName: reply.authorName || "Member",
    text: (reply.text || reply.attachment?.name || "Attachment").slice(0, 160)
  } : null;
  const conversationRef = doc(db, "conversations", conversationId);
  const body = {
    authorUid: currentUser.uid,
    authorName: publicProfile?.displayName || currentUser.displayName || "Member",
    text: messageText,
    kind: payload.kind || "text",
    createdAt: serverTimestamp(),
    ...(replyTo ? { replyTo } : {}),
    ...(payload.attachment ? { attachment: payload.attachment } : {})
  };

  isSendingChatMessage = true;
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.setAttribute("aria-busy", "true");
    sendButton.textContent = "…";
  }
  if (input) input.disabled = true;

  let saved = false;
  try {
    if (payload.file) {
      if (sendButton) sendButton.textContent = "Uploading…";
      const attachment = await uploadChatFile(payload.file, "file", conversationId);
      body.attachment = attachment;
    }
    // The nested collection path is conversations/{id}/messages. The data-layer
    // now preserves the parent document path for this Firestore-style call.
    if (sendButton && payload.file) sendButton.textContent = "Sending…";
    const savedMessageRef = await addDoc(collection(conversationRef, "messages"), body);
    saved = true;
    // Show the confirmed write immediately. The realtime/polling listener will
    // reconcile this optimistic row with the canonical database snapshot.
    if (activeConversationId === conversationId && savedMessageRef?.id) {
      currentMessages = [...currentMessages, { ...body, id: savedMessageRef.id, createdAt: Date.now() }];
      renderMessages(currentMessages);
      const messageList = $("#messageList");
      if (messageList) messageList.scrollTop = messageList.scrollHeight;
    }

    // A message is already safely stored at this point. A preview update failure
    // must not invite a retry that would create a duplicate message.
    try {
      await updateDoc(conversationRef, {
        lastMessage: (messageText || body.attachment?.name || "Attachment").slice(0, 180),
        lastMessageSender: currentUser.uid,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (metadataError) {
      console.warn("Message sent, but conversation preview update failed", metadataError);
      toast("Message sent. The chat preview may take a moment to refresh.");
    }

    if (activeConversationId === conversationId) {
      if (input && input.value === draftAtSend) input.value = "";
      if (payload.file && pendingChatFile === payload.file) {
        pendingChatFile = null;
        renderPendingChatAttachment();
      }
      replyingToMessageId = null;
      updateReplyPreview();
    }
    if (typingStopTimer) clearTimeout(typingStopTimer);
    deleteDoc(doc(db, "conversations", conversationId, "typing", currentUser.uid)).catch(() => {});
    return true;
  } catch (error) {
    console.error("Could not send chat message", error);
    toast(saved ? "Message sent, but the chat is still refreshing." : `Message not sent: ${friendlyError(error)}`);
    return saved;
  } finally {
    isSendingChatMessage = false;
    if (input) input.disabled = false;
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.removeAttribute("aria-busy");
      sendButton.textContent = previousLabel;
    }
    if (activeConversationId === conversationId && input && document.activeElement === input) input.focus();
  }
}
function renderPendingChatAttachment() {
  const preview = $("#chatAttachmentPreview");
  if (!preview) return;
  const file = pendingChatFile;
  preview.hidden = !file;
  if (!file) { preview.replaceChildren(); return; }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const label = isPdf ? "PDF document" : file.type.startsWith("image/") ? "Image" : file.type.startsWith("video/") ? "Video" : file.type.startsWith("audio/") ? "Audio" : "File attachment";
  preview.innerHTML = `<div class="chat-attachment-preview-icon" aria-hidden="true">${isPdf ? "PDF" : file.type.startsWith("image/") ? "IMG" : file.type.startsWith("video/") ? "VID" : file.type.startsWith("audio/") ? "AUD" : "FILE"}</div><div class="chat-attachment-preview-details"><b>${esc(file.name)}</b><span>${esc(label)} · ${esc(formatFileSize(file.size))}</span><small>Ready to send · This file has not been uploaded yet</small></div><button type="button" id="removePendingChatFile" class="chat-attachment-remove" aria-label="Remove attachment" title="Remove attachment">×</button>`;
  $("#removePendingChatFile").onclick = () => { pendingChatFile = null; $("#chatFileInput").value = ""; renderPendingChatAttachment(); };
}
function handleChatFile(file) {
  if (!file || !requireAccount() || !activeConversationId) return;
  const allowed = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/") || ["application/pdf","text/plain","application/zip","application/x-zip-compressed","application/msword","application/vnd.ms-excel","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(file.type);
  if (!allowed) { toast("That file type is not supported."); $("#chatFileInput").value = ""; return; }
  if (file.size > 15 * 1024 * 1024) { toast("Attachments must be 15 MB or smaller."); $("#chatFileInput").value = ""; return; }
  pendingChatFile = file;
  renderPendingChatAttachment();
  $("#chatFileInput").value = "";
  toast("Attachment added to your draft. Press Send when you are ready.");
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
  const text = await promptInApp("Edit message", "Update your message. You can edit it for 15 minutes after sending.", message.text || "", "Message text"); if (text === null) return;
  const next = text.trim(); if (!next || next.length > 2000) { toast("Message must contain 1–2,000 characters."); return; }
  try { await updateDoc(doc(db,"conversations",activeConversationId,"messages",messageId), { text: next, edited: true, editedAt: serverTimestamp() }); toast("Message updated."); }
  catch (error) { toast(friendlyError(error)); }
}
async function deleteMessage(messageId) {
  const message = currentMessages.find(m => m.id === messageId); if (!message || !currentUser) return;
  const isGroupAdmin = Boolean(activeConversation?.isGroup && (activeConversation.createdBy === currentUser.uid || (activeConversation.admins || []).includes(currentUser.uid)));
  const canDeleteForEveryone = (message.authorUid === currentUser.uid || isGroupAdmin) && tsMillis(message.createdAt) && Date.now()-tsMillis(message.createdAt) <= 60*60*1000;
  const choices=[{value:"cancel",label:"Cancel",variant:"outline"},{value:"me",label:"Delete for me",variant:"outline"}];
  if(canDeleteForEveryone)choices.push({value:"everyone",label:"Delete for everyone",variant:"danger"});
  const choice=await chooseInApp("Delete message",canDeleteForEveryone?"Choose whether to remove this message only from your view or for all chat members. Delete for everyone is available for one hour after sending.":"You can remove this message from your view. Only the author or an authorised group admin can delete it for everyone.",choices);
  if(choice==="cancel"||!choice)return;
  try {
    const ref=doc(db,"conversations",activeConversationId,"messages",messageId);
    if(choice==="me"){await updateDoc(ref,{[`hiddenForBy.${currentUser.uid}`]:true});toast("Message removed from your view.");}
    else {await updateDoc(ref,{text:"This message was deleted.",deleted:true,deletedAt:serverTimestamp()});toast("Message deleted for everyone.");}
  } catch (error) { toast(friendlyError(error)); }
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
  $("#groupInfoSummary").innerHTML = `<div class="group-info-stat"><b>${participantUids.length}</b><span>MEMBERS</span></div><div class="group-info-copy"><b>${esc(activeConversation.groupName || "Project group")}</b><small>${esc(activeConversation.groupDescription || "No group description yet.")} · Created by ${esc(activeConversation.participantNames?.[activeConversation.createdBy] || "Group owner")}</small></div><span class="group-info-badge">${canManage ? "ADMIN" : "MEMBER"}</span>`;
  $("#groupInfoEditor").hidden=!canManage;
  $("#editGroupName").value=activeConversation.groupName||""; $("#editGroupDescription").value=activeConversation.groupDescription||""; $("#editGroupPhoto").value=activeConversation.groupPhotoUrl||"";
  const rows = await Promise.all(participantUids.map(async uid => {
    try { const snap = await getDoc(doc(db,"publicProfiles",uid)); return { uid, isPublic: snap.exists(), ...(snap.exists()?snap.data():{}) }; }
    catch { return { uid, isPublic: false, displayName: activeConversation.participantNames?.[uid] || "Member" }; }
  }));
  $("#manageGroupMembers").innerHTML = rows.map(p => {
    const isOwner = p.uid === activeConversation.createdBy;
    const isAdmin = isOwner || (activeConversation.admins || []).includes(p.uid);
    const displayName = p.displayName || activeConversation.participantNames?.[p.uid] || "Member";
    const avatar = p.isPublic && p.avatarUrl ? `<img src="${esc(validUrl(p.avatarUrl))}" alt="" loading="lazy">` : esc(initials(displayName));
    return `<article class="group-member-row"><span class="group-member-avatar">${avatar}</span><div class="group-member-main">${p.isPublic ? `<button type="button" class="group-member-profile-link" data-view-group-member="${esc(p.uid)}">${esc(displayName)} <span>↗</span></button>` : `<b>${esc(displayName)}</b>`}<small>${p.isPublic ? `@${esc(p.username || "member")} · ${esc(p.collegeShort || p.college || "College not listed")}` : "Profile private or unavailable"}</small><span class="group-member-role">${isOwner ? "Group owner" : isAdmin ? "Group admin" : "Member"}</span></div>${canManage && participantUids.length > 2 && !isOwner ? `<div class="group-member-actions">${activeConversation.createdBy === currentUser.uid ? `<button class="text-link" data-toggle-group-admin="${esc(p.uid)}">${isAdmin?"Demote":"Promote admin"}</button>` : ""}<button class="text-danger group-remove-btn" data-remove-group-member="${esc(p.uid)}">Remove</button></div>` : ""}</article>`;
  }).join("");
  $("#manageGroupMembers").querySelectorAll("[data-remove-group-member]").forEach(b => b.onclick = () => removeGroupMember(b.dataset.removeGroupMember));
  $("#manageGroupMembers").querySelectorAll("[data-toggle-group-admin]").forEach(b => b.onclick = () => toggleGroupAdmin(b.dataset.toggleGroupAdmin));
  $("#manageGroupMembers").querySelectorAll("[data-view-group-member]").forEach(b => b.onclick = () => viewMember(b.dataset.viewGroupMember));
  $("#manageGroupSearch").disabled = !canManage;
  $("#manageGroupSearchResults").innerHTML = canManage ? '<p class="muted">Search for a builder to add to this group.</p>' : '<p class="muted">Only group admins can add or remove members.</p>';
  const deleteWrap = $("#deleteGroupWrap");
  if (deleteWrap) deleteWrap.hidden = activeConversation.createdBy !== currentUser?.uid;
  showModal("manageGroupModal");
}
async function saveGroupInfo(){
  if(!activeConversation?.isGroup||!requireAccount())return;
  const c=activeConversation;const canManage=c.createdBy===currentUser.uid||(c.admins||[]).includes(currentUser.uid);if(!canManage)return;
  const groupName=$("#editGroupName").value.trim();const groupDescription=$("#editGroupDescription").value.trim();const groupPhotoUrl=validUrl($("#editGroupPhoto").value.trim());
  if(!groupName){toast("Group name is required.");return;}
  try{await updateDoc(doc(db,"conversations",c.id),{groupName:groupName.slice(0,60),groupDescription:groupDescription.slice(0,300),groupPhotoUrl,updatedAt:serverTimestamp()});activeConversation={...c,groupName,groupDescription,groupPhotoUrl};renderChatHeading();await openGroupManager();toast("Group details updated.");}catch(error){toast(friendlyError(error));}
}
async function toggleGroupAdmin(uid){
  const c=activeConversation;if(!c?.isGroup||c.createdBy!==currentUser?.uid||uid===c.createdBy)return;
  const admins=new Set(c.admins||[c.createdBy]);if(admins.has(uid))admins.delete(uid);else admins.add(uid);admins.add(c.createdBy);
  try{await updateDoc(doc(db,"conversations",c.id),{admins:[...admins],updatedAt:serverTimestamp()});activeConversation={...c,admins:[...admins]};await openGroupManager();toast(admins.has(uid)?"Group admin promoted.":"Group admin role removed.");}catch(error){toast(friendlyError(error));}
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
  if (!canManage || !(await confirmInApp("Remove this person from the group? They will lose access to future messages in this chat.","Remove group member"))) return;
  try {
    const participants = (c.participants||[]).filter(x => x !== uid); const participantNames = { ...(c.participantNames||{}) }; delete participantNames[uid];
    await updateDoc(doc(db,"conversations",c.id),{participants,participantNames,updatedAt:serverTimestamp()});
    activeConversation = { ...c, participants, participantNames }; renderChatHeading(); await openGroupManager(); toast("Member removed.");
  } catch (error) { toast(friendlyError(error)); }
}

async function reportMember(profile) {
  if (!requireAccount() || !profile?.uid) return;
  const details = await promptInApp("Report this profile",`Briefly explain why you are reporting @${profile.username || "this member"}. Keep the report factual (max 1,000 characters).`,"","Report reason");
  if (details === null || !details.trim()) return;
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
async function createGroupWithMembers(groupName, peopleToAdd, groupDescription="", groupPhotoUrl="") {
  if (!requireAccount()) return;
  const members = [{uid:currentUser.uid,...publicProfile}, ...peopleToAdd.filter(p=>p.uid!==currentUser.uid)];
  const unique = [...new Map(members.map(p=>[p.uid,p])).values()];
  if (unique.length < 2) { toast("Choose at least one other builder."); return; }
  if (unique.length > 11) { toast("A group can contain up to 11 members including you."); return; }
  if (!(await confirmInApp(`Have all ${unique.length - 1} selected member${unique.length === 2 ? "" : "s"} agreed to be added to “${groupName}”? Only continue after they have agreed.`,"Group invitation consent"))) {
    toast("No one was added. Ask members for permission first.");
    return;
  }
  const participants = unique.map(p=>p.uid);
  const participantNames = Object.fromEntries(unique.map(p=>[p.uid,p.displayName||"Member"]));
  const conversationRef = doc(collection(db,"conversations"));
  const safeDescription=String(groupDescription||"").trim().slice(0,300);const safePhoto=validUrl(groupPhotoUrl||"");
  await setDoc(conversationRef,{isGroup:true,groupName,groupDescription:safeDescription,groupPhotoUrl:safePhoto,participants,participantNames,createdBy:currentUser.uid,admins:[currentUser.uid],lastMessage:"Group created",createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastMessageAt:serverTimestamp()});
  const conversation = {id:conversationRef.id,isGroup:true,groupName,groupDescription:safeDescription,groupPhotoUrl:safePhoto,participants,participantNames,createdBy:currentUser.uid,admins:[currentUser.uid],lastMessage:"Group created",updatedAt:Date.now()};
  location.hash="#messages"; selectConversation(conversation); toast("Team chat created.");
}
async function createGroup(event) {
  event.preventDefault(); if (!requireAccount()) return;
  const groupName = $("#groupName").value.trim(); const msg = $("#groupMessage"); msg.textContent = "Creating your group…";
  const chosen = [...selectedGroupMembers.values()];
  const groupDescription = $("#groupDescription").value.trim(); const groupPhotoUrl = validUrl($("#groupPhotoUrl").value.trim());
  if (!groupName) { msg.textContent="Enter a group name."; return; }
  if (!chosen.length) { msg.textContent="Search and select at least one member."; return; }
  try {
    await createGroupWithMembers(groupName,chosen,groupDescription,groupPhotoUrl);
    hideModal("groupModal"); $("#groupForm").reset(); selectedGroupMembers.clear(); refreshSelectedGroupMembers();
  } catch (error) { console.error(error); msg.textContent = friendlyError(error); }
}
async function deleteCurrentGroup() {
  const c = activeConversation;
  if (!c?.isGroup || c.createdBy !== currentUser?.uid) {
    toast("Only the group creator can delete this group.");
    return;
  }
  const note = await promptInApp("Delete this group",`Type a short confirmation note explaining why you are deleting “${c.groupName || "this group"}”. This note is saved with the deletion.`,"","Reason for deletion");
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
  if (!(await confirmInApp(`Delete “${c.groupName || "this group"}” for all members? This cannot be undone.`,"Delete group permanently"))) return;
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
function renderMatchedTeamResults(groups, needed, strategy) {
  if (!groups.length) return '<div class="team-match-empty"><span class="team-empty-icon">⌕</span><b>No matching builders yet</b><p>Try broader skills or invite more people to complete their profiles. Team suggestions improve as more builders add their skills and availability.</p></div>';
  const builderCount = groups.reduce((count, group) => count + group.length, 0);
  const strategyTitle = strategy === "balanced" ? "Balanced team allocation complete" : "Best-fit candidates ranked";
  const teamCards = groups.map((group, index) => {
    const covered = [...new Set(group.flatMap(person => person.matchedSkills || []))];
    const missing = needed.filter(skill => !covered.includes(skill));
    const coverage = needed.length ? Math.round(covered.length / needed.length * 100) : 0;
    const averageFit = Math.round(group.reduce((total, person) => total + person.matchScore, 0) / Math.max(1, group.length) * 100);
    const members = group.map(person => {
      const displayName = person.displayName || "Builder";
      const education = [person.collegeShort || person.college || "College not listed", person.collegeYear || person.studyYear ? `Year ${person.collegeYear || person.studyYear}` : ""].filter(Boolean).join(" · ");
      const skills = (person.skills || []).slice(0, 6);
      const matched = (person.matchedSkills || []).join(", ") || "Related skills";
      const related = person.relatedSkills?.length ? ` · Related: ${person.relatedSkills.join(", ")}` : "";
      return `<label class="team-match-option">
        <input type="checkbox" data-team-match="${esc(person.uid)}" data-team-index="${index}" checked aria-label="Select ${esc(displayName)} for team ${index + 1}">
        <span class="team-member-avatar" aria-hidden="true">${esc(initials(displayName))}</span>
        <span class="team-member-copy">
          <span class="team-member-heading"><b>${esc(displayName)}</b><strong class="team-fit-pill">${Math.round(person.matchScore * 100)}% fit</strong></span>
          <span class="team-member-meta">@${esc(person.username || "member")} <i>·</i> ${esc(education)}</span>
          ${skills.length ? `<span class="team-member-skills">${skills.map(skill => `<i>${esc(skill)}</i>`).join("")}</span>` : ""}
          <span class="team-member-match"><b>Matched:</b> ${esc(matched)}${esc(related)}</span>
        </span>
      </label>`;
    }).join("");
    return `<section class="generated-team" aria-label="Suggested team ${index + 1}">
      <div class="generated-team-head">
        <div class="team-heading-copy"><span class="team-card-kicker">TEAM ${String(index + 1).padStart(2, "0")}</span><h3>Suggested team ${index + 1}</h3><p>${group.length + 1} members including you <i>·</i> ${averageFit}% average fit</p></div>
        <div class="team-balance-score"><b>${covered.length}/${needed.length}</b><span>roles covered</span></div>
      </div>
      <div class="team-coverage"><div class="team-coverage-bar" role="progressbar" aria-label="Role coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${coverage}"><span style="width:${coverage}%"></span></div><small>${covered.length ? covered.map(esc).join(" · ") : "No required roles covered"}${missing.length ? `<em>Still needed: ${missing.map(esc).join(", ")}</em>` : ""}</small></div>
      <div class="team-match-options">${members}</div>
    </section>`;
  }).join("");
  return `<div class="team-match-summary"><div class="team-summary-copy"><span class="team-summary-kicker">MATCHING COMPLETE</span><b>${strategyTitle}</b><small>Suggestions are profile-based estimates, not guarantees. Review availability and confirm consent before creating a chat.</small></div><div class="team-summary-stats"><div><strong>${groups.length}</strong><span>Team${groups.length === 1 ? "" : "s"}</span></div><div><strong>${builderCount}</strong><span>Builder matches</span></div></div></div>${teamCards}`;
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
      "supabase":["supabase","authentication","google cloud"],"data science":["analytics","python","sql"]
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
    $("#teamMatchResults").innerHTML = renderMatchedTeamResults(groups, needed, strategy);
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
  if(!(await confirmInApp(`Create ${teams.length} separate team chat${teams.length===1?"":"s"}? Selected members will be added immediately. Confirm that each person has agreed to be added.`,"Create matched teams")))return;
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
      ${p.statusText ? `<p class="profile-status-text">${esc(p.statusText)}</p>` : ""}<p>${esc(p.bio || "Add a short introduction to help teammates understand what you build.")}</p>
      ${p.profileVisibility === "private" ? '<p class="privacy-state-note">Private profile · only you can see these details. This profile is not in the directory or public team matcher.</p>' : ''}
      <div class="profile-completion"><div><b>Profile completeness</b><strong>${completion}%</strong></div><span class="profile-completion-track"><i style="width:${completion}%"></i></span><small>A complete profile helps teammates understand your strengths before they contact you.</small></div>
      <div class="profile-detail-grid">
        <section class="profile-detail-card"><small>MEMBER SINCE</small><b>${p.joinedAt ? esc(new Date(tsMillis(p.joinedAt)).toLocaleDateString(undefined,{month:"long",year:"numeric"})) : "HackVerse member"}</b><span>@${esc(p.username)}</span></section>
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
  catch (error) { console.error(error); $("#myProjects").innerHTML = '<div class="empty-note">Could not load projects. Check Supabase database rules.</div>'; }
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
  if (!requireAccount() || !(await confirmInApp("Delete this project from your showcase? This action cannot be undone.","Delete project"))) return;
  try { await deleteDoc(doc(db, "projects", id)); loadProjects(); toast("Project deleted."); }
  catch (error) { toast(friendlyError(error)); }
}

function updateAiAccessUI() {
  const signedIn = Boolean(currentUser && db);
  const gate = $("#aiLoginGate");
  const form = $("#aiForm");
  const messages = $("#aiMessages");
  if (gate) gate.hidden = signedIn;
  const clearHistoryButton = $("#aiClearHistoryBtn");
  if (clearHistoryButton) clearHistoryButton.hidden = !signedIn;
  const launcher = $("#aiLaunchBtn");
  if (launcher) launcher.hidden = !signedIn;
  if (form) form.hidden = !signedIn;
  if (messages) messages.hidden = !signedIn;
  $("#aiNewChatBtn").disabled = !signedIn;
  if (!signedIn) {
    $("#aiHistoryList").innerHTML = '<p class="ai-history-empty">Sign in to keep your conversations.</p>';
    $("#aiActionReview").hidden = true;
  }
}

function setAiMode(mode) {
  const nextMode = mode === "wish" ? "wish" : "chat";
  if (aiMode !== nextMode && activeAiConversationMode !== nextMode) {
    // Do not carry a chatbot transcript into AI Wish (or vice versa).
    activeAiConversationId = null;
    activeAiConversationMode = nextMode;
    currentAiMessages = [];
    pendingAiActions = [];
  }
  aiMode = nextMode;
  const aiBrand = document.querySelector(".ai-brand-lockup b");
  if (aiBrand) aiBrand.textContent = aiMode === "wish" ? "AI Wish · Website actions" : "HackVerse AI · Help chatbot";
  $("#aiPanel").setAttribute("aria-label", aiMode === "wish" ? "AI Wish workspace" : "HackVerse AI assistant");
  $("#aiInput").placeholder = aiMode === "wish" ? "Describe the work you want done in HackVerse…" : "Ask a question about HackVerse or anything else…";
  $("#aiComposerHint").textContent = aiMode === "wish" ? "Describe the task · review the plan · approve changes" : "Ask freely · Enter to send · Shift + Enter for a new line";
  $("#aiModeIntro").innerHTML = aiMode === "wish"
    ? "<b>What would you like me to change or do?</b><span>Tell me the outcome you want. I’ll ask follow-up questions when needed, prepare a plan, and wait for your approval before changing account data.</span>"
    : "<b>Ask me anything.</b><span>Get explanations, troubleshooting, coding help and clear guidance about using HackVerse. I do not make account changes in this chat.</span>";
  pendingAiActions = [];
  renderAiMessages();
  renderAiActionReview();
}

function formatAiContent(content) {
  const lines = esc(String(content || "")).replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let listType = null;
  let codeLines = null;
  const closeList = () => { if (listType) { output.push(`</${listType}>`); listType = null; } };
  const inline = value => value
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      closeList();
      if (codeLines) {
        output.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        codeLines = null;
      } else codeLines = [];
      continue;
    }
    if (codeLines) { codeLines.push(line); continue; }
    if (!line.trim()) { closeList(); continue; }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const ordered = line.match(/^\s*(\d{1,2})[.)]\s+(.+)$/);
    const quote = line.match(/^\s*&gt;\s?(.+)$/);
    if (heading) { closeList(); output.push(`<h4>${inline(heading[1])}</h4>`); }
    else if (bullet || ordered) {
      const type = ordered ? "ol" : "ul";
      if (listType !== type) { closeList(); output.push(`<${type}>`); listType = type; }
      output.push(`<li>${inline((bullet || ordered)[ordered ? 2 : 1])}</li>`);
    } else if (quote) { closeList(); output.push(`<blockquote>${inline(quote[1])}</blockquote>`); }
    else { closeList(); output.push(`<p>${inline(line)}</p>`); }
  }
  if (codeLines) output.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
  closeList();
  return output.join("");
}

function renderAiMessages() {
  const box = $("#aiMessages");
  if (!box) return;
  const messages = currentAiMessages.length ? currentAiMessages : [{ role: "assistant", content: aiMode === "wish"
    ? "Tell me what you want to accomplish in HackVerse. I’ll analyse the request, prepare a clear action plan and wait for your approval before applying changes."
    : "Hi! I’m your HackVerse assistant. I can explain the platform, help you discover opportunities and guide you through your workspace." }];
  const rendered = messages.map(message => {
    const isUser = message.role === "user";
    const stamp = message.createdAt ? tsMillis(message.createdAt) : 0;
    const time = stamp ? new Date(stamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    const contentHtml = isUser ? esc(message.content || "") : formatAiContent(message.content || "");
    return `<div class="ai-message ${isUser ? "ai-message-user" : "ai-message-agent"}"><span class="ai-message-avatar" aria-hidden="true">${isUser ? "You" : "✦"}</span><div class="ai-message-body"><div class="ai-message-bubble">${contentHtml}</div>${time ? `<time class="ai-message-time">${esc(time)}</time>` : ""}</div></div>`;
  }).join("");
  const pendingUser = pendingAiUserMessage ? `<div class="ai-message ai-message-user ai-message-pending"><span class="ai-message-avatar" aria-hidden="true">You</span><div class="ai-message-body"><div class="ai-message-bubble">${esc(pendingAiUserMessage)}</div><time class="ai-message-time">Sending…</time></div></div>` : "";
  const thinking = isAiSending ? `<div class="ai-message ai-message-agent ai-thinking" role="status" aria-live="polite"><span class="ai-message-avatar" aria-hidden="true">✦</span><div class="ai-message-body"><div class="ai-message-bubble"><b>${aiMode === "wish" ? "AI Wish is thinking" : "HackVerse AI is thinking"}</b><span class="ai-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span><small>${aiMode === "wish" ? "Reviewing your request and preparing a safe action plan…" : "Preparing a helpful response…"}</small></div></div></div>` : "";
  box.innerHTML = rendered + pendingUser + thinking;
  box.setAttribute("aria-busy", String(isAiSending));
  box.scrollTop = box.scrollHeight;
}

function renderAiHistoryRows(rows) {
  const list = $("#aiHistoryList");
  if (!rows.length) {
    list.innerHTML = '<p class="ai-history-empty">Your conversations will appear here. Start a new chat whenever you need one.</p>';
    return;
  }
  list.innerHTML = rows.map(item => {
    const stamp = tsMillis(item.updatedAt || item.createdAt);
    const dateLabel = stamp ? new Date(stamp).toLocaleDateString([], { month: "short", day: "numeric" }) : "Saved chat";
    const modeLabel = item.mode === "wish" ? "AI Wish" : "AI Chat";
    return `<div class="ai-history-entry ${item.id === activeAiConversationId ? "active" : ""}">
      <button type="button" class="ai-history-item ${item.id === activeAiConversationId ? "active" : ""}" data-ai-conversation="${esc(item.id)}">
        <span class="ai-history-item-top"><b>${esc(item.title || "New conversation")}</b><time>${esc(dateLabel)}</time></span>
        <small><i>${modeLabel}</i><span>${esc(item.preview || "Start this conversation")}</span></small>
      </button>
      <button type="button" class="ai-history-delete" data-delete-ai-conversation="${esc(item.id)}" aria-label="Delete ${esc(item.title || "conversation")}" title="Delete conversation">×</button>
    </div>`;
  }).join("");
  list.querySelectorAll("[data-ai-conversation]").forEach(button => button.addEventListener("click", () => openAiConversation(button.dataset.aiConversation)));
  list.querySelectorAll("[data-delete-ai-conversation]").forEach(button => button.addEventListener("click", () => deleteAiConversation(button.dataset.deleteAiConversation)));
}

function setAiHistoryOpen(open) {
  const drawer = $("#aiHistoryDrawer");
  const button = $("#aiHistoryToggle");
  if (!drawer || !button) return;
  drawer.hidden = !open;
  button.setAttribute("aria-expanded", String(Boolean(open)));
  button.setAttribute("aria-label", open ? "Hide conversation history" : "Show conversation history");
  button.title = open ? "Hide conversation history" : "Show conversation history";
  if (open) void loadAiHistory();
}

async function loadAiHistory() {
  updateAiAccessUI();
  const list = $("#aiHistoryList");
  if (!currentUser || !db || $("#aiHistoryDrawer")?.hidden) return;
  list.innerHTML = '<p class="ai-history-empty">Loading your history…</p>';
  try {
    const snapshot = await getDocs(query(
      collection(db, "aiConversations"),
      where("ownerUid", "==", currentUser.uid),
      orderBy("updatedAt", "desc"),
      limit(30)
    ));
    const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => (item.mode === "wish" ? "wish" : "chat") === aiMode);
    renderAiHistoryRows(rows);
  } catch (error) {
    console.warn("Ordered AI history query failed; retrying without the composite sort index.", error);
    try {
      const fallback = await getDocs(query(collection(db, "aiConversations"), where("ownerUid", "==", currentUser.uid), limit(30)));
      const rows = fallback.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => (item.mode === "wish" ? "wish" : "chat") === aiMode).sort((a,b) => {
        const stamp = value => value?.toMillis ? value.toMillis() : (value instanceof Date ? value.getTime() : Number(value) || 0);
        return stamp(b.updatedAt) - stamp(a.updatedAt);
      });
      renderAiHistoryRows(rows);
    } catch (fallbackError) {
      console.warn("AI history fallback failed", fallbackError);
      list.innerHTML = `<p class="ai-history-empty">History is unavailable right now. ${esc(friendlyError(fallbackError))}</p>`;
    }
  }
}

async function deleteAiConversationData(conversationId) {
  const conversationRef = doc(db, "aiConversations", conversationId);
  const parent = await getDoc(conversationRef);
  if (!parent.exists() || parent.data().ownerUid !== currentUser?.uid) throw new Error("This conversation is not owned by your account.");
  const messagesRef = collection(db, "aiConversations", conversationId, "messages");
  let cursor = null;
  while (true) {
    const pageQuery = cursor
      ? query(messagesRef, orderBy("createdAt", "asc"), startAfter(cursor), limit(400))
      : query(messagesRef, orderBy("createdAt", "asc"), limit(400));
    const page = await getDocs(pageQuery);
    if (page.empty) break;
    const batch = writeBatch(db);
    page.docs.forEach(message => batch.delete(message.ref));
    await batch.commit();
    cursor = page.docs[page.docs.length - 1];
    if (page.size < 400) break;
  }
  await deleteDoc(conversationRef);
}

async function deleteAiConversation(conversationId) {
  if (!requireAccount()) return;
  const approved = await confirmInApp("Delete this AI conversation and all its messages? This cannot be undone.", "Delete AI history");
  if (!approved) return;
  try {
    await deleteAiConversationData(conversationId);
    if (activeAiConversationId === conversationId) {
      activeAiConversationId = null;
      activeAiConversationMode = aiMode;
      currentAiMessages = [];
      pendingAiActions = [];
      renderAiMessages();
      renderAiActionReview();
    }
    await loadAiHistory();
    toast("AI conversation deleted.");
  } catch (error) {
    console.error("AI conversation deletion failed", error);
    toast(`Could not delete AI history: ${friendlyError(error)}`);
  }
}

async function clearAiHistoryForMode() {
  if (!requireAccount()) return;
  const label = aiMode === "wish" ? "AI Wish" : "AI Chatbot";
  const approved = await confirmInApp(`Permanently delete all ${label} conversations and their messages from your account? This does not delete your normal website messages.`, `Clear ${label} history`);
  if (!approved) return;
  const button = $("#aiClearHistoryBtn");
  if (button) { button.disabled = true; button.textContent = "Deleting…"; }
  let cursor = null;
  let deleted = 0;
  try {
    while (true) {
      const pageQuery = cursor
        ? query(collection(db, "aiConversations"), where("ownerUid", "==", currentUser.uid), startAfter(cursor), limit(350))
        : query(collection(db, "aiConversations"), where("ownerUid", "==", currentUser.uid), limit(350));
      const page = await getDocs(pageQuery);
      if (page.empty) break;
      const selected = page.docs.filter(item => (item.data().mode === "wish" ? "wish" : "chat") === aiMode);
      for (const item of selected) {
        await deleteAiConversationData(item.id);
        deleted++;
      }
      cursor = page.docs[page.docs.length - 1];
      if (page.size < 350) break;
    }
    activeAiConversationId = null;
    activeAiConversationMode = aiMode;
    currentAiMessages = [];
    pendingAiActions = [];
    renderAiMessages();
    renderAiActionReview();
    await loadAiHistory();
    toast(`${deleted} ${label} conversation${deleted === 1 ? "" : "s"} deleted.`);
  } catch (error) {
    console.error("AI history clear failed", error);
    toast(`Could not clear history: ${friendlyError(error)}`);
    await loadAiHistory();
  } finally {
    if (button) { button.disabled = false; button.textContent = "Clear history"; }
  }
}

async function startAiConversation(mode = aiMode) {
  if (!requireAccount()) return null;
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    const sessionUser = sessionData?.session?.user;

    if (sessionError || !sessionUser?.id) {
      throw new Error("Your sign-in session has expired. Please sign in again.");
    }

    const conversationRef = doc(collection(db, "aiConversations"));
    await setDoc(conversationRef, {
      ownerUid: sessionUser.id,
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
    void loadAiHistory();
    return conversationRef.id;
  } catch (error) {
    toast(`Could not start AI conversation: ${friendlyError(error)}`);
    return null;
  }
}

async function openAiConversation(conversationId) {
  if (!requireAccount()) return;
  setAiHistoryOpen(false);
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

  const pages = new Set([
    "home","opportunities","saved","people","messages",
    "aiwish","profile","notifications","settings"
  ]);

  const categories = new Set([
    "hackathon","case-competition","coding-event","bootcamp",
    "course","certification","internship","scholarship",
    "fellowship","grant","research","competition",
    "volunteering","other"
  ]);

  const eventIds = new Set(events.map(e => String(e.id)));
  const conversationMap = new Map(
    currentConversations.map(c => [String(c.id), c])
  );
  const messageMap = new Map(
    currentMessages.map(m => [String(m.id), m])
  );
  const builders = new Set([
    ...aiAvailableBuilderUids.map(String),
    ...aiAvailableBuilders.map(p => String(p.uid))
  ]);

  return actions.slice(0, 8).map(action => {
    if (!action || typeof action !== 'object') return null;

    const type = String(action.type || '').trim();

    if (type === 'navigate' && pages.has(action.page))
      return { type, page: action.page };

    if (type === 'search_opportunities')
      return {
        type,
        query: String(action.query || '').slice(0, 100),
        skill: String(action.skill || '').slice(0, 60),
        category: categories.has(action.category) ? action.category : 'all',
        country: String(action.country || '').slice(0, 60)
      };

    if ((type === 'open_opportunity' || type === 'save_opportunity') &&
        eventIds.has(String(action.eventId || '')))
      return { type, eventId: String(action.eventId) };

    if (type === 'search_builders')
      return { type, query: String(action.query || '').trim().slice(0, 100) };

    if (type === 'start_direct_conversation') {
      const uid = String(action.uid || action.userUid || '');
      if (!uid || uid === currentUser?.uid || !builders.has(uid)) return null;
      return { type, uid };
    }

    if (type === 'create_group') {
      const name = String(action.groupName || '').trim();
      if (!name || !Array.isArray(action.memberUids)) return null;
      const memberUids = [...new Set(action.memberUids.map(String))]
        .filter(uid => uid && uid !== currentUser?.uid && builders.has(uid))
        .slice(0, 10);
      if (!memberUids.length) return null;
      return {
        type,
        groupName: name.slice(0, 60),
        memberUids,
        groupDescription: String(action.groupDescription || '').trim().slice(0, 300)
      };
    }

    if (type === 'add_group_member') {
      const conversationId = String(action.conversationId || '');
      const uid = String(action.uid || action.userUid || '');
      const c = conversationMap.get(conversationId);
      if (!c?.isGroup || !uid || !builders.has(uid)) return null;
      const manager = c.createdBy === currentUser?.uid ||
        (c.admins || []).includes(currentUser?.uid);
      if (!manager || (c.participants || []).includes(uid)) return null;
      return { type, conversationId, uid };
    }

    if (type === 'remove_group_member') {
      const conversationId = String(action.conversationId || '');
      const uid = String(action.uid || action.userUid || '');
      const c = conversationMap.get(conversationId);
      if (!c?.isGroup || !uid || uid === c.createdBy) return null;
      const manager = c.createdBy === currentUser?.uid ||
        (c.admins || []).includes(currentUser?.uid);
      if (!manager || !(c.participants || []).includes(uid)) return null;
      return { type, conversationId, uid };
    }

    if (type === 'update_group') {
      const conversationId = String(action.conversationId || '');
      const c = conversationMap.get(conversationId);
      if (!c?.isGroup) return null;
      const manager = c.createdBy === currentUser?.uid ||
        (c.admins || []).includes(currentUser?.uid);
      if (!manager) return null;

      const result = { type, conversationId };
      if (typeof action.groupName === 'string') {
        const name = action.groupName.trim();
        if (!name || name.length > 60) return null;
        result.groupName = name;
      }
      if (typeof action.groupDescription === 'string')
        result.groupDescription = action.groupDescription.trim().slice(0, 300);
      if (typeof action.groupPhotoUrl === 'string')
        result.groupPhotoUrl = validUrl(action.groupPhotoUrl.trim());
      if (Object.keys(result).length === 2) return null;
      return result;
    }

    if (type === 'toggle_group_admin') {
      const conversationId = String(action.conversationId || '');
      const uid = String(action.uid || action.userUid || '');
      const c = conversationMap.get(conversationId);
      if (!c?.isGroup || c.createdBy !== currentUser?.uid) return null;
      if (!uid || uid === c.createdBy || !(c.participants || []).includes(uid)) return null;
      return { type, conversationId, uid, makeAdmin: Boolean(action.makeAdmin) };
    }

    if (type === 'delete_group') {
      const conversationId = String(action.conversationId || '');
      const reason = String(action.reason || '').trim();
      const c = conversationMap.get(conversationId);
      if (!c?.isGroup || c.createdBy !== currentUser?.uid) return null;
      if (reason.length < 8 || reason.length > 300) return null;
      return { type, conversationId, reason };
    }

    if (type === 'send_message') {
      const conversationId = String(action.conversationId || '');
      const text = String(action.text || '').trim();
      const c = conversationMap.get(conversationId);
      if (!c || c.deleted || !(c.participants || []).includes(currentUser?.uid)) return null;
      if (!text || text.length > 2000) return null;
      return { type, conversationId, text };
    }

    if (type === 'edit_message') {
      const messageId = String(action.messageId || '');
      const text = String(action.text || '').trim();
      const m = messageMap.get(messageId);
      const created = m ? tsMillis(m.createdAt) : 0;
      if (!m || m.authorUid !== currentUser?.uid || !text || text.length > 2000) return null;
      if (!created || Date.now() - created > 15 * 60 * 1000) return null;
      return { type, messageId, text };
    }

    if (type === 'delete_message') {
      const messageId = String(action.messageId || '');
      const m = messageMap.get(messageId);
      if (!m) return null;
      const c = conversationMap.get(String(m.conversationId || activeConversationId));
      const admin = Boolean(c?.isGroup &&
        (c.createdBy === currentUser?.uid || (c.admins || []).includes(currentUser?.uid)));
      const created = tsMillis(m.createdAt);
      if (!created || Date.now() - created > 60 * 60 * 1000) return null;
      if (m.authorUid !== currentUser?.uid && !admin) return null;
      const conversationId = String(m.conversationId || activeConversationId || '');
      if (!c || !conversationId || !(c.participants || []).includes(currentUser?.uid)) return null;
      const scope = action.scope === 'everyone' ? 'everyone' : 'self';
      return { type, conversationId, messageId, scope, forEveryone: scope === 'everyone' };
    }

    if (type === 'react_message') {
      const messageId = String(action.messageId || '');
      const emoji = String(action.emoji || '').trim();
      const m = messageMap.get(messageId);
      const conversationId = String(m?.conversationId || activeConversationId || '');
      const c = conversationMap.get(conversationId);
      if (!m || !c || !(c.participants || []).includes(currentUser?.uid) || !emoji || emoji.length > 16) return null;
      return { type, conversationId, messageId, emoji };
    }

    if (type === 'forward_message') {
      const messageId = String(action.messageId || '');
      const targetConversationId = String(action.targetConversationId || '');
      const m = messageMap.get(messageId);
      const c = conversationMap.get(targetConversationId);
      const conversationId = String(m?.conversationId || activeConversationId || '');
      const sourceConversation = conversationMap.get(conversationId);
      if (!m || !sourceConversation || !c || m.deleted || m.attachment) return null;
      if (!(sourceConversation.participants || []).includes(currentUser?.uid) ||
          !(c.participants || []).includes(currentUser?.uid)) return null;
      return { type, conversationId, messageId, targetConversationId };
    }

    if (type === 'hide_conversation' || type === 'clear_conversation') {
      const conversationId = String(action.conversationId || '');
      const c = conversationMap.get(conversationId);
      if (!c || !(c.participants || []).includes(currentUser?.uid)) return null;
      return { type, conversationId };
    }

    if (type === 'update_profile') {
      const result = { type };
      if (typeof action.displayName === 'string' && action.displayName.trim())
        result.displayName = action.displayName.trim().slice(0, 80);
      if (typeof action.bio === 'string')
        result.bio = action.bio.trim().slice(0, 500);
      return Object.keys(result).length > 1 ? result : null;
    }

    if (type === 'create_project') {
      const title = String(action.title || '').trim();
      const description = String(action.description || '').trim();
      if (!title || !description) return null;
      return {
        type,
        title: title.slice(0, 100),
        description: description.slice(0, 600),
        techStack: Array.isArray(action.techStack) ?
          action.techStack.map(v => String(v).slice(0, 40)).slice(0, 12) : [],
        visibility: action.visibility === 'public' ? 'public' : 'private'
      };
    }

    if (type === 'delete_project') {
      const projectId = String(action.projectId || '').trim();
      return projectId ? { type, projectId } : null;
    }

    if (type === 'update_settings') {
      const result = {};
      if (['dark','light'].includes(action.theme)) result.theme = action.theme;
      if (['full','reduced'].includes(action.motion)) result.motion = action.motion;
      if (['normal','large','larger'].includes(action.textSize)) result.textSize = action.textSize;
      return Object.keys(result).length ? { type, ...result } : null;
    }

    return null;
  }).filter(Boolean);
}

function aiActionLabel(action) {
  if (action.type === 'navigate') return 'Open the ' + action.page + ' section';
  if (action.type === 'search_opportunities') return 'Search opportunities' + (action.query ? ' for “' + action.query + '”' : '');
  if (action.type === 'open_opportunity') return 'Open selected opportunity';
  if (action.type === 'save_opportunity') return 'Save selected opportunity';
  if (action.type === 'search_builders') return 'Search community for “' + action.query + '”';
  if (action.type === 'start_direct_conversation') return 'Start a direct conversation with the selected builder';
  if (action.type === 'create_group') return 'Create group “' + action.groupName + '” with ' + action.memberUids.length + ' builders';
  if (action.type === 'add_group_member') return 'Add selected builder to the group';
  if (action.type === 'remove_group_member') return 'Remove selected member from the group';
  if (action.type === 'update_group') return 'Update group details';
  if (action.type === 'toggle_group_admin') return action.makeAdmin ? 'Promote member to group admin' : 'Remove group admin role';
  if (action.type === 'delete_group') return 'Delete selected group';
  if (action.type === 'send_message') return 'Send message: “' + action.text.slice(0, 90) + '”';
  if (action.type === 'edit_message') return 'Edit selected message';
  if (action.type === 'delete_message') return action.scope === 'everyone' ? 'Delete message for everyone' : 'Remove message from your view';
  if (action.type === 'react_message') return 'React to selected message with ' + action.emoji;
  if (action.type === 'forward_message') return 'Forward selected message to another conversation';
  if (action.type === 'hide_conversation') return 'Hide selected conversation';
  if (action.type === 'clear_conversation') return 'Clear selected conversation from your view';
  if (action.type === 'update_profile') return 'Update your profile';
  if (action.type === 'create_project') return 'Create ' + action.visibility + ' project: ' + action.title;
  if (action.type === 'delete_project') return 'Delete your project';
  if (action.type === 'update_settings') return 'Update interface settings';
  return 'Apply website action';
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
  if (message.length > 4000) {
    toast("Keep each AI request under 4,000 characters.");
    return;
  }

  isAiSending = true;
  pendingAiUserMessage = message;
  $("#aiSendBtn").disabled = true;
  $("#aiSendBtn").setAttribute("aria-label", "AI is thinking");
  $("#aiSendBtn").textContent = "…";
  input.value = "";
  pendingAiActions = [];
  renderAiMessages();
  renderAiActionReview();

  let timeoutId = null;
  try {
    if (!activeAiConversationId || activeAiConversationMode !== aiMode) {
      const created = await startAiConversation(aiMode);
      if (!created) throw new Error("Could not start a new AI conversation. Please try again.");
    }

    await persistAiMessage("user", message);
    pendingAiUserMessage = "";
    renderAiMessages();

    const conversationRef = doc(db, "aiConversations", activeAiConversationId);
    await updateDoc(conversationRef, {
      title: currentAiMessages.filter(item => item.role === "user").length <= 1
        ? message.slice(0, 48)
        : (aiMode === "wish" ? "AI Wish · " : "Help · ") + message.slice(0, 34),
      preview: message.slice(0, 120),
      mode: aiMode,
      updatedAt: serverTimestamp()
    });

    const token = await currentUser.getIdToken();
    const controller = new AbortController();
    timeoutId = window.setTimeout(() => controller.abort(), 240000);
    // The server already loads a bounded public builder context for AI Wish.
    // Return its IDs with the answer so we avoid a second full-directory query in the browser.
    const response = await fetch("/api/agent37/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({
        conversationId: activeAiConversationId,
        mode: aiMode,
        message,
        page: (location.hash || "#home").slice(1),
        activeConversationId: activeConversationId || ""
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AI service returned " + response.status + ".");
    if (aiMode === "wish") {
      aiAvailableBuilderUids = Array.isArray(data.builderUids) ? [...new Set(data.builderUids.map(String))] : [];
      aiAvailableBuilders = aiAvailableBuilders.filter(profile => aiAvailableBuilderUids.includes(String(profile.uid)));
    }

    const reply = String(data.reply || "I could not prepare a response. Please try again.").slice(0, 12000);
    await persistAiMessage("assistant", reply);

    if (aiMode === "wish") {
      pendingAiActions = validateAiActions(data.actions);
      renderAiActionReview();
    }

    await updateDoc(conversationRef, {
      preview: reply.slice(0, 120),
      updatedAt: serverTimestamp()
    });
    // Refresh the sidebar without making the user wait for another history query.
    void loadAiHistory();
  } catch (error) {
    console.error("Agent37 assistant request failed", error);
    const messageText = error?.name === "AbortError"
      ? "The AI service is taking longer than expected. Please try again in a moment."
      : "I could not complete that request. " + (error?.message || "The AI service failed.");
    await persistAiMessage("assistant", messageText).catch(() => {});
    if (!activeAiConversationId) input.value = message;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
    pendingAiUserMessage = "";
    isAiSending = false;
    $("#aiSendBtn").disabled = false;
    $("#aiSendBtn").textContent = "↑";
    $("#aiSendBtn").setAttribute("aria-label", "Send message");
    renderAiMessages();
    if (!input.disabled && !$("#aiForm").hidden) input.focus();
  }
}
async function loadAiBuilderProfiles(uids) {
  const allowed = new Set(aiAvailableBuilderUids.map(String));
  const requested = [...new Set((uids || []).map(String))].filter(uid => allowed.has(uid));
  const cached = new Map(aiAvailableBuilders.map(profile => [String(profile.uid), profile]));
  const profiles = await Promise.all(requested.map(async uid => {
    if (cached.has(uid)) return cached.get(uid);
    const snapshot = await getDoc(doc(db, "publicProfiles", uid));
    if (!snapshot.exists()) return null;
    const profile = snapshot.data() || {};
    // Only use profiles that the server included in its public builder context.
    if (profile.profileVisibility !== "public") return null;
    return { ...profile, uid };
  }));
  const resolved = profiles.filter(Boolean);
  const merged = new Map(aiAvailableBuilders.map(profile => [String(profile.uid), profile]));
  resolved.forEach(profile => merged.set(String(profile.uid), profile));
  aiAvailableBuilders = [...merged.values()];
  return requested.map(uid => resolved.find(profile => String(profile.uid) === uid) || cached.get(uid)).filter(Boolean);
}

async function applyAiActions() {
  if (!requireAccount() || !pendingAiActions.length) return;
  const actions = pendingAiActions.slice();
  const summary = actions.map(aiActionLabel).join("\n• ");
  if (!(await confirmInApp(`Apply these ${actions.length} HackVerse action${actions.length === 1 ? "" : "s"}?\n\n• ${summary}\n\nReview the details before continuing.`, "Review AI Wish actions"))) return;

  const completed = [];
  const failed = [];

  const fail = (action, error) => {
    failed.push(`${aiActionLabel(action)} — ${friendlyError(error)}`);
  };

  try {
    for (const action of actions) {
      try {
        if (action.type === "navigate") {
          location.hash = `#${action.page}`;
          completed.push(`Opened ${action.page}`);

        } else if (action.type === "search_opportunities") {
          $("#eventSearch").value = action.query || "";
          $("#eventSkill").value = action.skill || "";
          $("#eventCategory").value = action.category || "";
          if (action.country) {
            const option = [...$("#eventCountry").options].find(item => item.value.toLowerCase() === String(action.country).toLowerCase());
            if (option) $("#eventCountry").value = option.value;
          }
          allEventsVisible = 24;
          renderEvents();
          location.hash = "#opportunities";
          completed.push("Applied opportunity search filters");

        } else if (action.type === "open_opportunity") {
          location.hash = "#opportunities";
          await viewEvent(action.eventId);
          completed.push("Opened opportunity details");

        } else if (action.type === "save_opportunity") {
          if (!savedIds.has(action.eventId)) {
            const saved = await saveEvent(action.eventId);
            if (!saved) throw new Error("HackVerse could not save that opportunity.");
            completed.push("Saved an opportunity to your shortlist");
          } else {
            completed.push("Opportunity was already in your shortlist");
          }

        } else if (action.type === "search_builders") {
          const searchQuery = String(action.query || "").trim().toLowerCase().replace(/^@/, "");
          $("#peopleSearch").value = action.query || "";
          location.hash = "#people";

          if (!db) throw new Error("Community search is unavailable until Supabase is configured.");

          $("#peopleResultCount").textContent = "Searching public builder profiles…";

          const profiles = await searchPublicProfiles(searchQuery, 200);
          people = (profiles || []).filter(p => p.uid !== currentUser?.uid);

          if (searchQuery) {
            const q = searchQuery;
            people = people.filter(p => {
              const haystack = [
                p.displayName,
                p.username,
                p.college,
                p.collegeShort,
                p.course,
                p.publicEmail,
                ...(p.skills || []),
                ...(p.interests || [])
              ].filter(Boolean).join(" ").toLowerCase();
              return haystack.includes(q);
            });
          }

          renderPeople();
          $("#peopleResultCount").textContent = `${people.length} builder${people.length === 1 ? "" : "s"} found`;
          completed.push(`Found ${people.length} builder${people.length === 1 ? "" : "s"} in the community`);

        } else if (action.type === "start_direct_conversation") {
          const [profile] = await loadAiBuilderProfiles([action.uid]);
          if (!profile) throw new Error("That builder is no longer available in the public directory.");
          await startDirectConversation(profile);
          completed.push(`Started a conversation with ${profile.displayName || "the builder"}`);

        } else if (action.type === "create_group") {
          const selected = await loadAiBuilderProfiles(action.memberUids || []);
          if (selected.length !== (action.memberUids || []).length) {
            throw new Error("One or more selected builders are no longer available.");
          }
          await createGroupWithMembers(action.groupName, selected, action.groupDescription || "", action.groupPhotoUrl || "");
          completed.push(`Created group “${action.groupName}”`);

        } else if (action.type === "add_group_member") {
          if (!activeConversation?.isGroup || activeConversation.id !== action.conversationId) {
            throw new Error("Open the target group before adding a member.");
          }
          await addGroupMember(action.uid);
          completed.push("Added a member to the group");

        } else if (action.type === "remove_group_member") {
          if (!activeConversation?.isGroup || activeConversation.id !== action.conversationId) {
            throw new Error("Open the target group before removing a member.");
          }
          const c = activeConversation;
          if (c.createdBy !== currentUser.uid && !(c.admins || []).includes(currentUser.uid)) {
            throw new Error("You do not have permission to remove group members.");
          }
          const uid = action.uid;
          if (!c.participants?.includes(uid)) throw new Error("That member is not in the group.");
          const participants = (c.participants || []).filter(x => x !== uid);
          const participantNames = { ...(c.participantNames || {}) };
          delete participantNames[uid];
          await updateDoc(doc(db, "conversations", c.id), { participants, participantNames, updatedAt: serverTimestamp() });
          activeConversation = { ...c, participants, participantNames };
          renderChatHeading();
          completed.push("Removed a member from the group");

        } else if (action.type === "update_group") {
          if (!activeConversation?.isGroup || activeConversation.id !== action.conversationId) {
            throw new Error("Open the target group before updating it.");
          }
          const c = activeConversation;
          if (c.createdBy !== currentUser.uid && !(c.admins || []).includes(currentUser.uid)) {
            throw new Error("You do not have permission to update this group.");
          }
          const updates = {
            updatedAt: serverTimestamp()
          };
          if (action.groupName) updates.groupName = String(action.groupName).trim().slice(0, 60);
          if (action.groupDescription !== undefined) updates.groupDescription = String(action.groupDescription).trim().slice(0, 300);
          if (action.groupPhotoUrl !== undefined) updates.groupPhotoUrl = validUrl(String(action.groupPhotoUrl || ""));
          if (!updates.groupName && !updates.groupDescription && !("groupPhotoUrl" in updates)) {
            throw new Error("No valid group changes were provided.");
          }
          await updateDoc(doc(db, "conversations", c.id), updates);
          activeConversation = { ...c, ...updates, updatedAt: Date.now() };
          renderChatHeading();
          completed.push("Updated group details");

        } else if (action.type === "toggle_group_admin") {
          if (!activeConversation?.isGroup || activeConversation.id !== action.conversationId) {
            throw new Error("Open the target group before changing admin status.");
          }
          const c = activeConversation;
          if (c.createdBy !== currentUser.uid) throw new Error("Only the group creator can change admin status.");
          if (action.uid === c.createdBy) throw new Error("The group creator is always an admin.");
          const admins = new Set(c.admins || [c.createdBy]);
          if (!c.participants?.includes(action.uid)) throw new Error("That member is not in the group.");
          if (action.makeAdmin === true) admins.add(action.uid);
          else admins.delete(action.uid);
          admins.add(c.createdBy);
          const nextAdmins = [...admins];
          await updateDoc(doc(db, "conversations", c.id), { admins: nextAdmins, updatedAt: serverTimestamp() });
          activeConversation = { ...c, admins: nextAdmins };
          completed.push(action.makeAdmin === true ? "Promoted group member to admin" : "Removed group admin role");

        } else if (action.type === "delete_group") {
          if (!activeConversation?.isGroup || activeConversation.id !== action.conversationId) {
            throw new Error("Open the target group before deleting it.");
          }
          const c = activeConversation;
          if (c.createdBy !== currentUser.uid) throw new Error("Only the group creator can delete this group.");
          const confirmation = String(action.reason || "Deleted by the group creator").trim().slice(0, 300);
          if (confirmation.length < 8) throw new Error("A group deletion reason must contain at least 8 characters.");
          await updateDoc(doc(db, "conversations", c.id), {
            deleted: true,
            deletedBy: currentUser.uid,
            deletionNote: confirmation,
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          if (stopMessageListener) stopMessageListener();
          stopMessageListener = null;
          activeConversation = null;
          activeConversationId = null;
          currentMessages = [];
          $("#chatActive").hidden = true;
          $("#chatPlaceholder").hidden = false;
          completed.push("Deleted the group");

        } else if (action.type === "send_message") {
          const conversation = currentConversations.find(c => c.id === action.conversationId);
          if (!conversation || !(conversation.participants || []).includes(currentUser.uid)) {
            throw new Error("That conversation is no longer available to your account.");
          }
          const text = String(action.text || "").trim();
          if (!text || text.length > 2000) throw new Error("Message must contain 1–2,000 characters.");
          await addDoc(collection(db, "conversations", action.conversationId, "messages"), {
            authorUid: currentUser.uid,
            authorName: publicProfile?.displayName || currentUser.displayName || "Member",
            text,
            kind: "text",
            createdAt: serverTimestamp()
          });
          await updateDoc(doc(db, "conversations", action.conversationId), {
            lastMessage: text.slice(0, 180),
            lastMessageSender: currentUser.uid,
            lastMessageAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          completed.push(`Sent a message in ${conversationLabel(conversation)}`);

        } else if (action.type === "edit_message") {
          const conversation = currentConversations.find(c => c.id === action.conversationId);
          if (!conversation || !(conversation.participants || []).includes(currentUser.uid)) throw new Error("Conversation unavailable.");
          const ref = doc(db, "conversations", action.conversationId, "messages", action.messageId);
          const snap = await getDoc(ref);
          if (!snap.exists()) throw new Error("Message not found.");
          const message = snap.data();
          if (message.authorUid !== currentUser.uid) throw new Error("You can edit only your own messages.");
          const created = tsMillis(message.createdAt);
          if (!created || Date.now() - created > 15 * 60 * 1000) throw new Error("Messages can only be edited within 15 minutes.");
          const text = String(action.text || "").trim();
          if (!text || text.length > 2000) throw new Error("Message must contain 1–2,000 characters.");
          await updateDoc(ref, { text, edited: true, editedAt: serverTimestamp() });
          completed.push("Edited your message");

        } else if (action.type === "delete_message") {
          const conversation = currentConversations.find(c => c.id === action.conversationId);
          if (!conversation || !(conversation.participants || []).includes(currentUser.uid)) throw new Error("Conversation unavailable.");
          const ref = doc(db, "conversations", action.conversationId, "messages", action.messageId);
          const snap = await getDoc(ref);
          if (!snap.exists()) throw new Error("Message not found.");
          const message = snap.data();
          const isGroupAdmin = Boolean(conversation.isGroup && (conversation.createdBy === currentUser.uid || (conversation.admins || []).includes(currentUser.uid)));
          const created = tsMillis(message.createdAt);
          if (action.forEveryone) {
            if (!((message.authorUid === currentUser.uid || isGroupAdmin) && created && Date.now() - created <= 60 * 60 * 1000)) {
              throw new Error("You do not have permission to delete this message for everyone.");
            }
            await updateDoc(ref, { text: "This message was deleted.", deleted: true, deletedAt: serverTimestamp() });
            completed.push("Deleted a message for everyone");
          } else {
            await updateDoc(ref, { [`hiddenForBy.${currentUser.uid}`]: true });
            completed.push("Removed a message from your view");
          }

        } else if (action.type === "react_message") {
          const conversation = currentConversations.find(c => c.id === action.conversationId);
          if (!conversation || !(conversation.participants || []).includes(currentUser.uid)) throw new Error("Conversation unavailable.");
          const ref = doc(db, "conversations", action.conversationId, "messages", action.messageId);
          const snap = await getDoc(ref);
          if (!snap.exists()) throw new Error("Message not found.");
          const reactions = { ...(snap.data().reactions || {}) };
          if (reactions[currentUser.uid] === action.emoji) delete reactions[currentUser.uid];
          else reactions[currentUser.uid] = action.emoji || "👍";
          await updateDoc(ref, { reactions });
          completed.push("Updated a message reaction");

        } else if (action.type === "forward_message") {
          const sourceConversation = currentConversations.find(c => c.id === action.conversationId);
          const targetConversation = currentConversations.find(c => c.id === action.targetConversationId);
          if (!sourceConversation || !targetConversation) throw new Error("Source or destination conversation is unavailable.");
          if (!(sourceConversation.participants || []).includes(currentUser.uid) || !(targetConversation.participants || []).includes(currentUser.uid)) {
            throw new Error("You do not have access to both conversations.");
          }
          const sourceRef = doc(db, "conversations", action.conversationId, "messages", action.messageId);
          const sourceSnap = await getDoc(sourceRef);
          if (!sourceSnap.exists()) throw new Error("Message not found.");
          const source = sourceSnap.data();
          if (source.attachment) throw new Error("Only text messages can be forwarded directly.");
          const text = String(source.text || "");
          await addDoc(collection(db, "conversations", action.targetConversationId, "messages"), {
            authorUid: currentUser.uid,
            authorName: publicProfile?.displayName || currentUser.displayName || "Member",
            text,
            kind: "text",
            forwarded: true,
            createdAt: serverTimestamp()
          });
          await updateDoc(doc(db, "conversations", action.targetConversationId), {
            lastMessage: text.slice(0, 180),
            lastMessageSender: currentUser.uid,
            lastMessageAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          completed.push("Forwarded a message");

        } else if (action.type === "hide_conversation") {
          const conversation = currentConversations.find(c => c.id === action.conversationId);
          if (!conversation || !(conversation.participants || []).includes(currentUser.uid)) throw new Error("Conversation unavailable.");
          const ref = doc(db, "conversations", action.conversationId);
          await updateDoc(ref, { [`hiddenForBy.${currentUser.uid}`]: true, updatedAt: serverTimestamp() });
          completed.push("Hidden the conversation");

        } else if (action.type === "clear_conversation") {
          const conversation = currentConversations.find(c => c.id === action.conversationId);
          if (!conversation || !(conversation.participants || []).includes(currentUser.uid)) throw new Error("Conversation unavailable.");
          const snap = await getDocs(collection(db, "conversations", action.conversationId, "messages"));
          const writes = snap.docs.map(m => updateDoc(m.ref, { [`hiddenForBy.${currentUser.uid}`]: true }));
          await Promise.all(writes);
          completed.push("Cleared the conversation from your view");

        } else if (action.type === "create_project") {
          const title = String(action.title || "").trim();
          const description = String(action.description || "").trim();
          if (!title || !description) throw new Error("Project title and description are required.");
          await addDoc(collection(db, "projects"), {
            ownerUid: currentUser.uid,
            ownerName: publicProfile?.displayName || currentUser.displayName || "Member",
            title: title.slice(0, 120),
            description: description.slice(0, 2000),
            techStack: Array.isArray(action.techStack) ? action.techStack.slice(0, 20) : [],
            projectUrl: "",
            githubUrl: "",
            visibility: action.visibility === "private" ? "private" : "public",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          await loadProjects();
          location.hash = "#profile";
          completed.push(`Created ${action.visibility === "private" ? "private" : "public"} project “${title}”`);

        } else if (action.type === "delete_project") {
          const projectRef = doc(db, "projects", action.projectId);
          const snap = await getDoc(projectRef);
          if (!snap.exists()) throw new Error("Project not found.");
          if (snap.data().ownerUid !== currentUser.uid) throw new Error("You can delete only your own projects.");
          await deleteDoc(projectRef);
          await loadProjects();
          completed.push("Deleted your project");

        } else if (action.type === "update_profile") {
          const updates = { updatedAt: serverTimestamp() };
          const publicUpdates = { updatedAt: serverTimestamp() };
          if (action.displayName) {
            updates.displayName = action.displayName;
            updates["profileData.displayName"] = action.displayName;
            publicUpdates.displayName = action.displayName;
            publicUpdates.nameLower = action.displayName.toLowerCase();
          }
          if (action.bio !== undefined) {
            updates["profileData.bio"] = action.bio;
            publicUpdates.bio = action.bio;
          }
          await updateDoc(doc(db, "users", currentUser.uid), updates);
          if (publicProfile?.profileVisibility !== "private") await updateDoc(doc(db, "publicProfiles", currentUser.uid), publicUpdates);
          if (action.displayName) await updateAuthProfile(currentUser, { displayName: action.displayName }).catch(() => {});
          privateProfile = { ...(privateProfile || {}), ...(action.displayName ? { displayName: action.displayName } : {}), profileData: { ...(privateProfile?.profileData || {}), ...(action.displayName ? { displayName: action.displayName } : {}), ...(action.bio !== undefined ? { bio: action.bio } : {}) } };
          if (publicProfile) publicProfile = { ...publicProfile, ...(action.displayName ? { displayName: action.displayName, nameLower: action.displayName.toLowerCase() } : {}), ...(action.bio !== undefined ? { bio: action.bio } : {}) };
          renderMyProfile();
          loadSettingsUI();
          completed.push("Updated your profile details");

        } else if (action.type === "update_settings") {
          const prefs = readAppPrefs();
          Object.assign(prefs, {
            ...(action.theme ? { theme: action.theme } : {}),
            ...(action.motion ? { motion: action.motion } : {}),
            ...(action.textSize ? { textSize: action.textSize } : {})
          });
          localStorage.setItem("hackverse-app-preferences", JSON.stringify(prefs));
          applyAppPrefs();
          loadSettingsUI();
          completed.push("Updated interface settings");
        }
      } catch (error) {
        console.error("AI ACTION FAILED:", action?.type, action, error);
        fail(action, error);
      }
    }

    pendingAiActions = [];
    renderAiActionReview();

    const resultParts = [];
    if (completed.length) resultParts.push(`Completed ${completed.length} action${completed.length === 1 ? "" : "s"}: ${completed.join("; ")}.`);
    if (failed.length) resultParts.push(`Could not complete ${failed.length} action${failed.length === 1 ? "" : "s"}: ${failed.join(" | ")}`);
    const resultText = resultParts.join(" ") || "No actions were applied.";

    if (failed.length && completed.length === 0) toast(`${failed.length} AI action${failed.length === 1 ? "" : "s"} failed.`); else if (completed.length) toast(`${completed.length} AI action${completed.length === 1 ? "" : "s"} applied.`);

    await persistAiMessage("assistant", resultText);
    if (activeAiConversationId) {
      await updateDoc(doc(db, "aiConversations", activeAiConversationId), {
        preview: resultText.slice(0, 120),
        updatedAt: serverTimestamp()
      });
    }
    await loadAiHistory();
  } catch (error) {
    console.error("AI executor failed", error);
    toast(`AI executor error: ${friendlyError(error)}`);
  }
}

function readAppPrefs(){try{return JSON.parse(localStorage.getItem("hackverse-app-preferences")||"{}");}catch{return {};}}
function applyAppPrefs(){const p=readAppPrefs();const theme=p.theme||localStorage.getItem("hackverse-theme")||"dark";document.body.classList.toggle("light",theme==="light");document.documentElement.style.colorScheme=theme==="light"?"light":"dark";const themeMeta=document.querySelector('meta[name="theme-color"]');if(themeMeta)themeMeta.content=theme==="light"?"#FFFFFF":"#222222";const toggle=$("#themeToggle");if(toggle){toggle.setAttribute("aria-label",theme==="light"?"Switch to dark mode":"Switch to light mode");toggle.title=theme==="light"?"Switch to dark mode":"Switch to light mode";}document.body.classList.toggle("reduce-motion",p.motion==="reduced"||p.reduceMotion===true);document.body.classList.toggle("text-large",p.textSize==="large");document.body.classList.toggle("text-larger",p.textSize==="larger");document.body.dataset.fontFamily=p.fontFamily||"dm";}
function saveAppPrefs(){const p={theme:$("#settingTheme").value,motion:$("#settingMotion").value,fontFamily:$("#settingFontFamily").value,reduceMotion:$("#prefReduceMotion").checked,textSize:$("#settingTextSize").value,inApp:$("#prefInApp").checked,desktop:$("#prefDesktop").checked,opportunity:$("#prefOpportunity").checked,sound:$("#prefSound").checked};localStorage.setItem("hackverse-app-preferences",JSON.stringify(p));localStorage.setItem("hackverse-theme",p.theme);applyAppPrefs();renderNotificationCenter();$("#settingsSaveStatus").textContent="Preferences saved just now.";if(p.desktop&&"Notification" in window&&Notification.permission==="default")Notification.requestPermission().then(result=>{if(result!=="granted"){const next=readAppPrefs();next.desktop=false;localStorage.setItem("hackverse-app-preferences",JSON.stringify(next));$("#prefDesktop").checked=false;toast("Browser notifications were not allowed.");}});}
function loadSettingsUI(){const p=readAppPrefs();$("#settingTheme").value=p.theme||localStorage.getItem("hackverse-theme")||(document.body.classList.contains("light")?"light":"dark");$("#settingMotion").value=p.motion||"full";$("#settingFontFamily").value=p.fontFamily||"dm";$("#prefReduceMotion").checked=Boolean(p.reduceMotion);$("#settingTextSize").value=p.textSize||"normal";$("#prefInApp").checked=p.inApp!==false;$("#prefDesktop").checked=Boolean(p.desktop);$("#prefOpportunity").checked=p.opportunity!==false;$("#prefSound").checked=Boolean(p.sound);$("#settingsAccountName").textContent=publicProfile?.displayName||currentUser?.displayName||"Guest session";$("#settingsAccountEmail").textContent=currentUser?.email||"Sign in to manage your account.";$("#settingProfileVisibility").value=publicProfile?.profileVisibility||"public";}
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
 {route:"settings",selector:".settings-grid",title:"Settings and personalisation",text:"Choose the theme, motion level, text size, notification preferences and profile visibility. Changes are stored in this browser, while your profile visibility is stored with your Supabase profile."},
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
  $("#saveSettingsBtn").onclick=saveAppPrefs;["#settingTheme","#settingMotion","#settingFontFamily","#settingTextSize","#prefReduceMotion"].forEach(sel=>$(sel).addEventListener("change",()=>{const p=readAppPrefs();p.theme=$("#settingTheme").value;p.motion=$("#settingMotion").value;p.textSize=$("#settingTextSize").value;p.fontFamily=$("#settingFontFamily").value;p.reduceMotion=$("#prefReduceMotion").checked;localStorage.setItem("hackverse-app-preferences",JSON.stringify({...p}));if(p.theme)localStorage.setItem("hackverse-theme",p.theme);applyAppPrefs();}));
  $("#privacyEditProfile").onclick=$("#settingsEditProfile").onclick=()=>currentUser?openProfileEditor(false):openAuth();
  $("#settingsSignOut").onclick=()=>currentUser&&signOut(auth).then(()=>toast("Signed out.")).catch(e=>toast(friendlyError(e)));
  $("#settingProfileVisibility").addEventListener("change",async e=>{if(!requireAccount())return;if(!publicProfile){toast("Complete your profile first.");return;}try{await updateDoc(doc(db,"publicProfiles",currentUser.uid),{profileVisibility:e.target.value,updatedAt:serverTimestamp()});publicProfile.profileVisibility=e.target.value;toast("Profile visibility updated.");}catch(error){toast(friendlyError(error));}});
  $$('[data-settings-tab]').forEach(b=>b.onclick=()=>showSettingsTab(b.dataset.settingsTab));
  $("#navTourBtn").onclick=()=>{ $("#navMoreMenu").hidden=true; $("#navMoreBtn").setAttribute("aria-expanded","false"); startWebsiteTour(); };$("#settingsTourBtn").onclick=startWebsiteTour;$("#tourSkipBtn").onclick=endWebsiteTour;$("#tourBackBtn").onclick=()=>renderTourStep(activeTourIndex-1);$("#tourNextBtn").onclick=()=>activeTourIndex===tourSteps.length-1?endWebsiteTour():renderTourStep(activeTourIndex+1);
  $("#newDirectChatBtn").onclick=()=>location.hash="#people";$("#chatMenuBtn").onclick=openChatActions;
  $$('[data-chat-filter]').forEach(b=>b.onclick=()=>{activeChatFilter=b.dataset.chatFilter;$$('[data-chat-filter]').forEach(x=>x.classList.toggle("active",x===b));renderConversationList(currentConversations);});
  $("#chatSearchToggle").onclick=()=>{$("#messageSearchWrap").hidden=!$("#messageSearchWrap").hidden;if(!$("#messageSearchWrap").hidden)$("#messageSearch").focus();};$("#chatDetailsBtn").onclick=openChatIdentity;
  $("#cancelReply").onclick=()=>{replyingToMessageId=null;updateReplyPreview();};
  $("#chatFileInput").addEventListener("change",e=>handleChatFile(e.target.files?.[0]));$("#attachFileBtn").onclick=()=>activeConversationId?$("#chatFileInput").click():toast("Choose a conversation first.");
  $("#voiceRecordBtn").onclick=toggleVoiceRecording;
  $("#emojiToggle").onclick=()=>$("#emojiTray").hidden=!$("#emojiTray").hidden;
  $$("#emojiTray button").forEach(b=>b.onclick=()=>{const input=$("#messageText"),start=input.selectionStart,end=input.selectionEnd;input.value=input.value.slice(0,start)+b.textContent+input.value.slice(end);input.focus();input.selectionStart=input.selectionEnd=start+b.textContent.length;$("#emojiTray").hidden=true;});
  $("#messageText").addEventListener("input",()=>{if($("#messageText").value.trim())publishTyping();});
  $("#messageText").addEventListener("keydown",event=>{
    if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();$("#messageForm").requestSubmit();}
  });
}

function handleRoute() {
  const raw=(location.hash||"#home").slice(1);
  const aliases={top:"home",discover:"home",opportunities:"opportunities",saved:"saved",people:"people",messages:"messages",aiwish:"aiwish",profile:"profile",notifications:"notifications",settings:"settings"};
  const view=aliases[raw]||"home";
  const aiPanel=$("#aiPanel"), wishMount=$("#aiWishMount"), aiAssistant=$("#aiAssistant");
  if(view==="aiwish"){
    if(aiPanel.parentElement!==wishMount) wishMount.append(aiPanel);
    aiPanel.classList.add("ai-panel-page"); aiPanel.hidden=false; aiAssistant.classList.add("ai-on-wish-page");
    setAiMode("wish"); updateAiAccessUI(); setAiHistoryOpen(false);
  }else{
    if(aiPanel.parentElement!==aiAssistant) aiAssistant.append(aiPanel);
    aiPanel.classList.remove("ai-panel-page"); aiPanel.hidden=true; aiAssistant.classList.remove("ai-on-wish-page");
    setAiHistoryOpen(false); setAiMode("chat");
  }
  const requiresMember = view !== "home";
  const blocked = requiresMember && !currentUser;
  $("#routeAccessGate").hidden=!blocked;
  $$('[data-view]').forEach(el=>{
    if(el.id==="discoveryAdminPanel"){el.hidden=blocked||!(view==="home"&&isAdminUser);return;}
    el.hidden=blocked || el.dataset.view!==view;
    if (!el.hidden) {
      el.classList.remove("hv-route-enter");
      requestAnimationFrame(() => {
        if (!el.hidden) {
          el.classList.add("hv-route-enter");
          el.addEventListener("animationend", () => el.classList.remove("hv-route-enter"), { once: true });
        }
      });
    }
  });
  if(blocked){aiPanel.hidden=true;aiAssistant.classList.remove("ai-on-wish-page");}
  $$("[data-route]").forEach(a=>a.classList.toggle("active",a.dataset.route===view));
  document.querySelector(".desktop-nav")?.classList.remove("mobile-open");
  window.scrollTo({top:0,behavior:"auto"});
  if(blocked)return;
  if(view==="opportunities"){ updateEventAccessUI(); if(currentUser)renderEvents(); }
  if(view==="saved")renderSaved();
  if(view==="people"&&currentUser)searchPeople();
  if(view==="notifications")renderNotificationCenter();
  if(view==="settings")loadSettingsUI();
}

function bindUI() {
  const bootSplash = $("#hvBootSplash");
  if (bootSplash) {
    let pageReady = document.readyState === "complete";
    let minimumElapsed = false;
    let dismissed = false;
    const dismissSplash = () => {
      if (!pageReady || !minimumElapsed || dismissed) return;
      dismissed = true;
      bootSplash.classList.add("is-hidden");
      window.setTimeout(() => bootSplash.remove(), 520);
    };
    if (!pageReady) window.addEventListener("load", () => { pageReady = true; dismissSplash(); }, { once: true });
    window.setTimeout(() => { minimumElapsed = true; dismissSplash(); }, 180);
    window.setTimeout(() => { pageReady = true; minimumElapsed = true; dismissSplash(); }, 1100);
  }
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&activeConversationId&&currentMessages.some(m=>m.attachment?.storagePath))hydrateChatAttachmentUrls(activeConversationId,currentMessages);});
  window.setInterval(()=>{if(!document.hidden&&activeConversationId&&currentMessages.some(m=>m.attachment?.storagePath))hydrateChatAttachmentUrls(activeConversationId,currentMessages);},10*60*1000);
  $("#year").textContent = new Date().getFullYear();
  initAdvancedUI();
  $("#appDialogClose").onclick=closeInAppDialog;
  $("#appDialog").addEventListener("click",event=>{if(event.target.id==="appDialog")closeInAppDialog();});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("#appDialog").hidden)closeInAppDialog();});
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
  $("#profileAvatarFile").addEventListener("change",e=>uploadProfileAvatar(e.target.files?.[0]));
  $("#removeProfileAvatarBtn").onclick=()=>{$("#profileAvatar").value="";$("#profileAvatarFile").value="";$("#profileAvatarPreviewWrap").hidden=true;toast("Profile photo removed from the draft. Save your profile to apply.");};
  $("#profileSignOutBtn").onclick = () => signOut(auth).then(() => { hideModal("profileModal"); profileIsMandatory = false; toast("Signed out."); }).catch(error => toast(friendlyError(error)));
  $("#newGroupBtn").onclick = () => { if(requireAccount()){ selectedGroupMembers.clear(); refreshSelectedGroupMembers(); $("#groupForm").reset(); $("#groupMemberResults").innerHTML="<p class=muted>Search public builder profiles to add teammates.</p>"; showModal("groupModal"); } };
  $("#groupMemberSearch").addEventListener("input", searchGroupPicker);
  $("#smartTeamBtn").onclick = () => requireAccount() && showModal("teamBuilderModal");
  $("#teamBuilderForm").addEventListener("submit",runSmartTeamMatch);
  $("#createMatchedTeamBtn").onclick=createMatchedTeam;
  $("#manageGroupSearch").addEventListener("input",searchManageGroupMembers);
  $("#groupManageBtn").onclick=openGroupManager;
  $("#deleteGroupBtn").onclick=deleteCurrentGroup;
  $("#saveGroupInfoBtn").onclick=saveGroupInfo;
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
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeMainNav(); } if (e.key === "Escape") ["authModal","memberModal","groupModal","projectModal","eventModal","teamBuilderModal","manageGroupModal"].forEach(hideModal); if (e.key === "Escape") { closeProfileModal(); if(location.hash==="#aiwish") location.hash="#home"; else { $("#aiPanel").hidden = true; setAiHistoryOpen(false); $("#aiLaunchBtn").setAttribute("aria-expanded", "false"); } } });
  ["#eventSearch","#eventSkill","#eventCategory","#eventCountry","#eventEligibility","#eventRegion","#eventMode","#eventTrack","#eventSource","#eventLevel","#eventCost","#eventDeadline","#eventSort"].forEach(sel=>{const el=$(sel);if(el){el.addEventListener(el.tagName==="INPUT"?"input":"change",()=>{allEventsVisible=24;renderEvents();});}});
  $("#clearEventFilters").onclick=()=>{["#eventSearch","#eventSkill"].forEach(id=>$(id).value="");["#eventCategory","#eventCountry","#eventEligibility","#eventRegion","#eventMode","#eventTrack","#eventSource","#eventLevel","#eventCost","#eventDeadline","#eventSort"].forEach(id=>{const el=$(id);if(el)el.value=id==="#eventSort"?"deadline":"all";});allEventsVisible=24;renderEvents();};
  $("#loadMoreEvents").onclick=()=>{allEventsVisible+=24;renderEvents();};
  $("#refreshEventsBtn").onclick = () => requireAccount() && loadEvents({ forceRefresh: true });
  // Refresh at the same 30-minute cadence as the local cache. Manual refresh always bypasses it.
  // Discovery runs every six hours, so frequent full-directory reads are unnecessary.
  let eventRefreshInProgress = false;
  const refreshOpportunityFeed = async () => {
    if (!currentUser || !db || document.hidden || eventRefreshInProgress) return;
    eventRefreshInProgress = true;
    try { await loadEvents(); } finally { eventRefreshInProgress = false; }
  };
  window.setInterval(refreshOpportunityFeed, 30 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshOpportunityFeed(); });
  $("#discoverySourceForm").addEventListener("submit", addDiscoverySource);
  $("#runDiscoveryBtn").onclick = runDiscoveryManually;
  $("#heroSearch").addEventListener("keydown", e => { if (e.key === "Enter") runHeroSearch(); }); $("#heroSearchBtn").onclick = runHeroSearch;
  $("#aiLaunchBtn").onclick = () => { if(location.hash==="#aiwish") location.hash="#home"; const panel=$("#aiPanel"),assistant=$("#aiAssistant"); if(panel.parentElement!==assistant) assistant.append(panel); panel.classList.remove("ai-panel-page"); setAiMode("chat"); panel.hidden=!panel.hidden; $("#aiLaunchBtn").setAttribute("aria-expanded",String(!panel.hidden)); if(!panel.hidden) setAiHistoryOpen(false); };
  $("#aiHistoryToggle").onclick = () => setAiHistoryOpen($("#aiHistoryDrawer").hidden);
  $("#aiCloseBtn").onclick = () => { if(location.hash==="#aiwish"){location.hash="#home";return;} $("#aiPanel").hidden=true; setAiHistoryOpen(false); $("#aiLaunchBtn").setAttribute("aria-expanded","false"); };
  $("#aiNewChatBtn").onclick = () => currentUser ? startAiConversation(aiMode) : (openAuth(), toast("Sign in to keep a private AI history."));
  $("#aiClearHistoryBtn").onclick = clearAiHistoryForMode;
  $("#aiForm").addEventListener("submit", sendAiMessage);
  $("#aiInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#aiForm").requestSubmit(); } });
  $("#peopleSearch").addEventListener("input", searchPeople); $("#peopleRole").onchange = searchPeople; $("#lookingForTeamOnly").onchange = searchPeople;
  $("#backToExploreBtn").onclick = () => { location.hash = "#opportunities"; };
  $("#themeToggle").onclick = () => { const prefs=readAppPrefs();prefs.theme=document.body.classList.contains("light")?"dark":"light";localStorage.setItem("hackverse-app-preferences",JSON.stringify(prefs));localStorage.setItem("hackverse-theme",prefs.theme);applyAppPrefs();if($("#settingTheme"))$("#settingTheme").value=prefs.theme; };
  const mainNav = document.querySelector(".desktop-nav");
  const closeMainNav = () => {
    mainNav?.classList.remove("mobile-open");
    $("#menuToggle").setAttribute("aria-expanded", "false");
    $("#menuToggle").setAttribute("aria-label", "Open navigation");
    $("#navMoreMenu").hidden = true;
    $("#navMoreBtn").setAttribute("aria-expanded", "false");
  };
  $("#menuToggle").onclick = () => {
    const open = mainNav.classList.toggle("mobile-open");
    $("#menuToggle").setAttribute("aria-expanded", String(open));
    $("#menuToggle").setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  };
  $("#navMoreBtn").onclick = () => {
    const menu = $("#navMoreMenu");
    menu.hidden = !menu.hidden;
    $("#navMoreBtn").setAttribute("aria-expanded", String(!menu.hidden));
  };
  $$(".desktop-nav a").forEach(a => a.addEventListener("click", closeMainNav));
  document.addEventListener("click", event => {
    if (!mainNav?.classList.contains("mobile-open") && $("#navMoreMenu").hidden) return;
    if (!event.target.closest(".topbar")) closeMainNav();
  });
  window.addEventListener("hashchange",handleRoute); handleRoute();
}
function runHeroSearch() { if (!requireAccount()) return; $("#eventSearch").value = $("#heroSearch").value; renderEvents(); location.hash = "#opportunities"; }

bindUI();
initSupabase();
