import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseConfig } from "./supabase-config.js";

export const supabaseClient = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const pathJoin = parts => parts.map(String).filter(Boolean).join("/");
const splitPath = path => String(path || "").split("/").filter(Boolean);
const collectionPathOf = path => splitPath(path).length % 2 === 0 ? splitPath(path).slice(0, -1).join("/") : splitPath(path).join("/");
const docIdOf = path => splitPath(path).at(-1) || "";
const collectionNameOf = path => splitPath(path).at(-1) || "";

export function collection(_db, ...parts) { return { __kind: "collection", path: pathJoin(parts) }; }
export function doc(parent, ...parts) {
  if (parent?.__kind === "collection" && parts.length === 0) { const id = uuid(); return { __kind: "doc", path: `${parent.path}/${id}`, id }; }
  if (parent?.__kind === "collection") {
    const id = String(parts[0]); return { __kind: "doc", path: `${parent.path}/${id}`, id };
  }
  const path = pathJoin(parts);
  return { __kind: "doc", path, id: docIdOf(path) };
}

export function where(field, op, value) { return { type: "where", field, op, value }; }
export function orderBy(field, direction = "asc") { return { type: "orderBy", field, direction }; }
export function limit(value) { return { type: "limit", value: Math.max(1, Number(value) || 1) }; }
export function startAt(value) { return { type: "startAt", value }; }
export function endAt(value) { return { type: "endAt", value }; }
export function startAfter(value) { return { type: "startAfter", value }; }
export function serverTimestamp() { return new Date().toISOString(); }

function getField(data, field) {
  return String(field).split(".").reduce((value, key) => value == null ? undefined : value[key], data);
}
function setField(target, field, value) {
  const keys = String(field).split("."); let cursor = target;
  keys.slice(0, -1).forEach(key => { if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {}; cursor = cursor[key]; });
  cursor[keys.at(-1)] = value;
}
function mergeDeep(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) mergeDeep(target[key], value);
    else target[key] = clone(value);
  }
  return target;
}
function comparable(value) {
  if (value == null) return "";
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const date = Date.parse(value); if (!Number.isNaN(date) && /\d{4}-\d{2}-\d{2}/.test(value)) return date;
  }
  return value;
}
function matches(row, constraint) {
  const value = getField(row.data, constraint.field);
  const expected = constraint.value;
  switch (constraint.op) {
    case "==": return JSON.stringify(value) === JSON.stringify(expected);
    case "!=": return JSON.stringify(value) !== JSON.stringify(expected);
    case "array-contains": return Array.isArray(value) && value.includes(expected);
    case "<": return comparable(value) < comparable(expected);
    case "<=": return comparable(value) <= comparable(expected);
    case ">": return comparable(value) > comparable(expected);
    case ">=": return comparable(value) >= comparable(expected);
    default: return false;
  }
}

async function fetchRows(collectionRef) {
  let query = supabaseClient.from("documents").select("path,collection_path,doc_id,data,owner_uid,participants,created_at,updated_at").eq("collection_path", collectionRef.path);
  const { data, error } = await query.range(0, 49999);
  if (error) throw error;
  return (data || []).map(row => ({ ...row, data: row.data || {} }));
}

export function query(collectionRef, ...constraints) { return { __kind: "query", collectionRef, constraints }; }

function applyQuery(rows, constraints) {
  let result = [...rows];
  const wheres = constraints.filter(x => x.type === "where");
  result = result.filter(row => wheres.every(c => matches(row, c)));
  const sorts = constraints.filter(x => x.type === "orderBy");
  if (sorts.length) {
    result.sort((a,b) => {
      for (const s of sorts) {
        const av = comparable(getField(a.data, s.field)), bv = comparable(getField(b.data, s.field));
        if (av < bv) return s.direction === "desc" ? 1 : -1;
        if (av > bv) return s.direction === "desc" ? -1 : 1;
      }
      return a.doc_id.localeCompare(b.doc_id);
    });
  } else result.sort((a,b) => a.doc_id.localeCompare(b.doc_id));
  const starts = constraints.filter(x => x.type === "startAt" || x.type === "startAfter");
  const ends = constraints.filter(x => x.type === "endAt");
  if (starts.length) {
    const start = starts[starts.length - 1];
    const value = start.value?.id || start.value?.doc_id || start.value;
    const index = result.findIndex(row => row.doc_id === value);
    if (index >= 0) result = result.slice(start.type === "startAfter" ? index + 1 : index);
  }
  if (ends.length && sorts.length) {
    const field = sorts[0].field; const end = ends.at(-1).value;
    result = result.filter(row => comparable(getField(row.data, field)) <= comparable(end));
  }
  const lim = constraints.find(x => x.type === "limit");
  if (lim) result = result.slice(0, lim.value);
  return result;
}

function makeSnapshot(rows) {
  const docs = rows.map(row => ({
    id: row.doc_id,
    ref: { __kind: "doc", path: row.path, id: row.doc_id },
    exists: () => true,
    data: () => clone(row.data)
  }));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: fn => docs.forEach(fn) };
}

export async function getDocs(target) {
  const collectionRef = target?.__kind === "query" ? target.collectionRef : target;
  const constraints = target?.__kind === "query" ? target.constraints : [];
  return makeSnapshot(applyQuery(await fetchRows(collectionRef), constraints));
}

export async function getDoc(ref) {
  const { data, error } = await supabaseClient.from("documents").select("path,collection_path,doc_id,data,owner_uid,participants,created_at,updated_at").eq("path", ref.path).maybeSingle();
  if (error) throw error;
  if (!data) return { id: ref.id, exists: () => false, data: () => undefined, ref };
  return { id: data.doc_id, exists: () => true, data: () => clone(data.data || {}), ref: { ...ref, id: data.doc_id } };
}

function rowFor(ref, data) {
  const collectionPath = collectionPathOf(ref.path);
  const ownerUid = data?.ownerUid || data?.createdBy || data?.uid || (collectionPath.startsWith("users/") ? splitPath(collectionPath)[1] : null) || null;
  const participants = Array.isArray(data?.participants) ? data.participants : null;
  return { path: ref.path, collection_path: collectionPath, doc_id: ref.id, data: clone(data || {}), owner_uid: ownerUid, participants, updated_at: new Date().toISOString() };
}

export async function setDoc(ref, value, options = {}) {
  const existing = await getDoc(ref);
  const next = options.merge && existing.exists() ? mergeDeep(existing.data() || {}, value) : clone(value || {});
  const row = rowFor(ref, next);
  const { error } = await supabaseClient.from("documents").upsert(row, { onConflict: "path" });
  if (error) throw error;
}
export async function updateDoc(ref, value) {
  const existing = await getDoc(ref); if (!existing.exists()) throw new Error("Document does not exist.");
  const next = clone(existing.data() || {});
  for (const [key, val] of Object.entries(value || {})) setField(next, key, clone(val));
  await setDoc(ref, next);
}
export async function addDoc(collectionRef, value) { const ref = doc(collectionRef, uuid()); await setDoc(ref, value); return ref; }
export async function deleteDoc(ref) { const { error } = await supabaseClient.from("documents").delete().eq("path", ref.path); if (error) throw error; }

export function writeBatch(_db) {
  const ops = [];
  return { set(ref, value, options = {}) { ops.push(() => setDoc(ref, value, options)); }, update(ref, value) { ops.push(() => updateDoc(ref, value)); }, delete(ref) { ops.push(() => deleteDoc(ref)); }, async commit() { for (const op of ops) await op(); } };
}
export async function runTransaction(_db, callback) {
  const tx = {
    async get(ref) { return getDoc(ref); },
    set(ref, value, options = {}) { return setDoc(ref, value, options); },
    update(ref, value) { return updateDoc(ref, value); },
    delete(ref) { return deleteDoc(ref); }
  };
  return callback(tx);
}

export function onSnapshot(target, callback, errorCallback) {
  let stopped = false;
  let previous = "";
  const tick = async () => {
    if (stopped) return;
    try {
      const snapshot = await getDocs(target);
      const signature = JSON.stringify(snapshot.docs.map(d => [d.id, d.data()]));
      if (signature !== previous) { previous = signature; callback(snapshot); }
    } catch (error) { errorCallback?.(error); }
  };
  tick();
  const timer = setInterval(tick, 3000);
  return () => { stopped = true; clearInterval(timer); };
}

export class Timestamp {
  constructor(date) { this.date = date instanceof Date ? date : new Date(date); }
  toDate() { return new Date(this.date); }
  toMillis() { return this.date.getTime(); }
  static now() { return new Timestamp(new Date()); }
  static fromDate(date) { return new Timestamp(date); }
}

export function initializeApp() { return {}; }

export const auth = {
  currentUser: null,
  async signInWithEmailAndPassword(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password }); if (error) throw error; return { user: adaptUser(data.user) };
  },
  async createUserWithEmailAndPassword(email, password) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password }); if (error) throw error; return { user: adaptUser(data.user) };
  },
  async signOut() { const { error } = await supabaseClient.auth.signOut(); if (error) throw error; },
  async sendPasswordResetEmail(email) { const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` }); if (error) throw error; },
  async sendEmailVerification(user) { const { error } = await supabaseClient.auth.resend({ type: "signup", email: user.email }); if (error) throw error; },
  async reload(user) { const { data, error } = await supabaseClient.auth.getUser(); if (error) throw error; Object.assign(user, adaptUser(data.user)); },
  async updateProfile(user, profile) { const { data, error } = await supabaseClient.auth.updateUser({ data: { full_name: profile.displayName ?? user.displayName, avatar_url: profile.photoURL ?? user.photoURL } }); if (error) throw error; Object.assign(user, adaptUser(data.user)); }
};
function adaptUser(user) {
  if (!user) return null;
  return { uid: user.id, id: user.id, email: user.email || "", emailVerified: Boolean(user.email_confirmed_at), displayName: user.user_metadata?.full_name || user.user_metadata?.name || "", photoURL: user.user_metadata?.avatar_url || "", providerData: (user.identities || []).map(i => ({ providerId: i.provider })), user_metadata: user.user_metadata || {}, app_metadata: user.app_metadata || {}, getIdToken: async () => (await supabaseClient.auth.getSession()).data.session?.access_token || "", getIdTokenResult: async () => ({ claims: user.app_metadata || {} }) };
}
export const GoogleAuthProvider = class { constructor() { this.provider = "google"; } };
export async function signInWithPopup(_auth, provider) { const { data, error } = await supabaseClient.auth.signInWithOAuth({ provider: provider.provider || "google", options: { redirectTo: location.href } }); if (error) throw error; return data; }
export async function createUserWithEmailAndPassword(_auth, email, password) { return auth.createUserWithEmailAndPassword(email, password); }
export async function signInWithEmailAndPassword(_auth, email, password) { return auth.signInWithEmailAndPassword(email, password); }
export async function sendPasswordResetEmail(_auth, email) { return auth.sendPasswordResetEmail(email); }
export async function signOut(_auth) { return auth.signOut(); }
export async function onAuthStateChanged(_auth, callback) {
  const { data } = await supabaseClient.auth.getUser(); auth.currentUser = adaptUser(data.user); queueMicrotask(() => callback(auth.currentUser));
  const subscription = supabaseClient.auth.onAuthStateChange((_event, user) => { auth.currentUser = adaptUser(user); queueMicrotask(() => callback(auth.currentUser)); });
  return subscription.data.subscription.unsubscribe;
}
export async function sendEmailVerification(user) { return auth.sendEmailVerification(user); }
export async function reload(user) { return auth.reload(user); }
export async function updateProfile(user, profile) { return auth.updateProfile(user, profile); }

export const db = {};
export const functions = {};
export async function httpsCallable(_functions, name) {
  return async payload => {
    const token = (await supabaseClient.auth.getSession()).data.session?.access_token || "";
    const response = await fetch(`/api/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload || {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `${name} failed`);
    return { data };
  };
}
