/**
 * Favorites: works instantly for guests via localStorage and syncs to
 * Firestore (users/{uid}/favorites) once a member signs in.
 */
import { watchUser } from "./auth.js?v=20261101a";
import { firebaseReady, firebaseSdk } from "./firebase-config.js?v=20261101a";
import { storageGet, storageSet } from "./utils.js?v=20261101a";

const KEY = "as_favorites_v1";
const listeners = new Set();
let ids = new Set((storageGet(KEY, []) || []).filter((id) => typeof id === "string"));
let syncStarted = false;
let currentUid = null;

function emit() {
  const values = [...ids];
  listeners.forEach((listener) => {
    try {
      listener(values);
    } catch (error) {
      console.error(error);
    }
  });
  window.dispatchEvent(new CustomEvent("as:favorites-changed", { detail: values }));
}

function persistLocal() {
  storageSet(KEY, [...ids]);
  emit();
}

export function getFavoriteIds() {
  return [...ids];
}

export function countFavorites() {
  return ids.size;
}

export function isFavorite(id) {
  return ids.has(id);
}

export function subscribeFavorites(callback) {
  listeners.add(callback);
  callback([...ids]);
  return () => listeners.delete(callback);
}

async function remoteFavorite(id, saved) {
  await firebaseReady;
  if (!firebaseSdk.db || !firebaseSdk.auth?.currentUser) return;
  const uid = firebaseSdk.auth.currentUser.uid;
  const m = firebaseSdk.firestoreModule;
  const ref = m.doc(firebaseSdk.db, "users", uid, "favorites", id);
  try {
    if (saved) {
      await m.setDoc(ref, { vehicleId: id, createdAt: m.serverTimestamp() }, { merge: true });
    } else {
      await m.deleteDoc(ref);
    }
  } catch (error) {
    console.warn("[AutoSelect] favorite sync failed", error);
  }
}

export async function toggleFavorite(id) {
  if (!id) return false;
  const saved = !ids.has(id);
  if (saved) ids.add(id);
  else ids.delete(id);
  persistLocal();
  await remoteFavorite(id, saved);
  return saved;
}

export async function removeFavorite(id) {
  if (!ids.has(id)) return;
  ids.delete(id);
  persistLocal();
  await remoteFavorite(id, false);
}

export async function clearFavorites() {
  const previous = [...ids];
  ids = new Set();
  persistLocal();
  await Promise.all(previous.map((id) => remoteFavorite(id, false)));
}

/** Merge remote favorites into local storage for the signed-in user. */
export async function syncFavoritesForUser(user) {
  await firebaseReady;
  if (!firebaseSdk.db || !user) return;
  const m = firebaseSdk.firestoreModule;
  try {
    const snap = await m.getDocs(m.collection(firebaseSdk.db, "users", user.uid, "favorites"));
    const remoteIds = snap.docs.map((doc) => doc.id);
    let changed = false;
    remoteIds.forEach((id) => {
      if (!ids.has(id)) {
        ids.add(id);
        changed = true;
      }
    });
    if (changed) persistLocal();
    // Push any guest favorites saved locally before signing in.
    const missing = [...ids].filter((id) => !remoteIds.includes(id));
    await Promise.all(missing.map((id) => remoteFavorite(id, true)));
  } catch (error) {
    console.warn("[AutoSelect] favorites merge failed", error);
  }
}

/** Start once per page. Safe to call multiple times. */
export function initFavoritesSync() {
  if (syncStarted) return;
  syncStarted = true;
  watchUser((user) => {
    const uid = user?.uid || null;
    if (uid === currentUid) return;
    currentUid = uid;
    if (uid) syncFavoritesForUser(user);
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue);
      if (Array.isArray(parsed)) {
        ids = new Set(parsed.filter((id) => typeof id === "string"));
        emit();
      }
    } catch {
      /* ignore malformed external writes */
    }
  });
}
