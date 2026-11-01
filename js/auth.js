/**
 * Authentication facade.
 * Uses Firebase Auth when configured; otherwise a localStorage-backed demo
 * session so the whole flow (incl. admin) can be previewed without a project.
 */
import {
  firebaseReady,
  firebaseSdk,
  isFirebaseConfigured,
} from "./firebase-config.js?v=20261101a";
import { initials, storageGet, storageSet, storageRemove } from "./utils.js?v=20261101a";

const DEMO_ACCOUNTS = "as_demo_accounts_v1";
const DEMO_SESSION = "as_demo_session_v1";

const listeners = new Set();
let currentUser = null;
let resolveAuthReady;
export const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});
let initialized = false;

const DEFAULT_DEMO_ACCOUNT = {
  uid: "demo-admin",
  name: "Alex Morgan",
  email: "admin@autoselect.demo",
  password: "autoselect",
  phone: "(214) 555-0148",
  createdAt: new Date().toISOString(),
};

function notify() {
  listeners.forEach((listener) => {
    try {
      listener(currentUser);
    } catch (error) {
      console.error(error);
    }
  });
}

function setCurrentUser(user) {
  currentUser = user;
  notify();
}

function demoAccounts() {
  const accounts = storageGet(DEMO_ACCOUNTS, null);
  if (Array.isArray(accounts) && accounts.length) return accounts;
  storageSet(DEMO_ACCOUNTS, [DEFAULT_DEMO_ACCOUNT]);
  return [DEFAULT_DEMO_ACCOUNT];
}

function demoSessionUser() {
  const session = storageGet(DEMO_SESSION, null);
  if (!session?.uid) return null;
  const account = demoAccounts().find((item) => item.uid === session.uid);
  if (!account) return null;
  const { password, ...safe } = account;
  return {
    ...safe,
    role: "admin",
    isAdmin: true,
    isDemo: true,
  };
}

function toAppUser(firebaseUser, { isAdmin = false } = {}) {
  return {
    uid: firebaseUser.uid,
    name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "AutoSelect Member",
    email: firebaseUser.email || "",
    phone: firebaseUser.phoneNumber || "",
    photoURL: firebaseUser.photoURL || "",
    role: isAdmin ? "admin" : "member",
    isAdmin,
    isDemo: false,
  };
}

const ADMIN_UIDS = new Set(["NL3B6fmiZVUAMxaaAtwRYavYYY92"]);

async function resolveAdmin(firebaseUser) {
  if (!firebaseSdk.db) return false;
  try {
    if (ADMIN_UIDS.has(firebaseUser.uid)) return true;
    const m = firebaseSdk.firestoreModule;
    const token = await firebaseUser.getIdTokenResult();
    if (token.claims?.admin === true) return true;
    const snap = await m.getDoc(m.doc(firebaseSdk.db, "admins", firebaseUser.uid));
    return snap.exists();
  } catch (error) {
    console.warn("[AutoSelect] admin check failed", error);
    return false;
  }
}

async function ensureUserDoc(firebaseUser, isAdmin) {
  if (!firebaseSdk.db) return;
  try {
    const m = firebaseSdk.firestoreModule;
    await m.setDoc(
      m.doc(firebaseSdk.db, "users", firebaseUser.uid),
      {
        name: firebaseUser.displayName || "",
        email: firebaseUser.email || "",
        phone: firebaseUser.phoneNumber || "",
        role: isAdmin ? "admin" : "member",
        lastLoginAt: m.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("[AutoSelect] user profile write failed", error);
  }
}

async function init() {
  if (initialized) return;
  initialized = true;
  await firebaseReady;

  if (isFirebaseConfigured && firebaseSdk.authModule && firebaseSdk.auth) {
    const m = firebaseSdk.authModule;
    let resolved = false;
    m.onAuthStateChanged(
      firebaseSdk.auth,
      async (firebaseUser) => {
        if (firebaseUser) {
          const isAdmin = await resolveAdmin(firebaseUser);
          setCurrentUser(toAppUser(firebaseUser, { isAdmin }));
          ensureUserDoc(firebaseUser, isAdmin);
        } else {
          setCurrentUser(null);
        }
        if (!resolved) {
          resolved = true;
          resolveAuthReady(currentUser);
        }
      },
      (error) => {
        console.warn("[AutoSelect] auth state error", error);
        setCurrentUser(null);
        if (!resolved) {
          resolved = true;
          resolveAuthReady(null);
        }
      }
    );
    return;
  }

  setCurrentUser(demoSessionUser());
  resolveAuthReady(currentUser);
}

// Kick off automatically; every consumer awaits authReady.
init();

export function getCurrentUser() {
  return currentUser;
}

/** Subscribe to auth changes. Returns an unsubscribe function. */
export function watchUser(callback) {
  listeners.add(callback);
  if (currentUser !== null || initialized) callback(currentUser);
  return () => listeners.delete(callback);
}

function friendlyError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Try again or reset it below.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account already exists with that email. Sign in instead.",
    "auth/weak-password": "Use a password with at least 8 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/operation-not-allowed": "This sign-in method isn't enabled in Firebase yet.",
    "auth/unauthorized-domain":
      "This domain isn't authorized for sign-in yet. Add it under Firebase Console → Authentication → Settings → Authorized domains.",
  };
  return messages[code] || error?.message || "Something went wrong. Please try again.";
}

export async function signIn(email, password) {
  await authReady;
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !password) throw new Error("Enter your email and password.");

  if (isFirebaseConfigured && firebaseSdk.authModule && firebaseSdk.auth) {
    try {
      const m = firebaseSdk.authModule;
      const cred = await m.signInWithEmailAndPassword(firebaseSdk.auth, cleanEmail, password);
      return getCurrentUser() || toAppUser(cred.user);
    } catch (error) {
      throw new Error(friendlyError(error));
    }
  }

  const account = demoAccounts().find((item) => item.email.toLowerCase() === cleanEmail);
  if (!account) throw new Error("No demo account found. Create one on the sign-up page.");
  if (account.password !== password) throw new Error("Incorrect password. The demo admin password is “autoselect”.");
  storageSet(DEMO_SESSION, { uid: account.uid });
  setCurrentUser(demoSessionUser());
  return currentUser;
}

export async function signUp({ name, email, password, phone = "" }) {
  await authReady;
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Please enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("Enter a valid email address.");
  if (!password || password.length < 8) throw new Error("Use a password with at least 8 characters.");

  if (isFirebaseConfigured && firebaseSdk.authModule && firebaseSdk.auth) {
    try {
      const m = firebaseSdk.authModule;
      const cred = await m.createUserWithEmailAndPassword(firebaseSdk.auth, cleanEmail, password);
      await m.updateProfile(cred.user, { displayName: cleanName });
      // Refresh local representation after profile update.
      setCurrentUser(toAppUser({ ...cred.user, displayName: cleanName }, { isAdmin: false }));
      await ensureUserDoc({ ...cred.user, displayName: cleanName }, false);
      return currentUser;
    } catch (error) {
      throw new Error(friendlyError(error));
    }
  }

  const accounts = demoAccounts();
  if (accounts.some((item) => item.email.toLowerCase() === cleanEmail)) {
    throw new Error("An account already exists with that email. Sign in instead.");
  }
  const account = {
    uid: `demo-${Date.now().toString(36)}`,
    name: cleanName,
    email: cleanEmail,
    password,
    phone,
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  storageSet(DEMO_ACCOUNTS, accounts);
  storageSet(DEMO_SESSION, { uid: account.uid });
  setCurrentUser(demoSessionUser());
  return currentUser;
}

export async function signInWithGoogle() {
  await authReady;
  if (isFirebaseConfigured && firebaseSdk.authModule && firebaseSdk.auth) {
    try {
      const m = firebaseSdk.authModule;
      const provider = new m.GoogleAuthProvider();
      const cred = await m.signInWithPopup(firebaseSdk.auth, provider);
      return getCurrentUser() || toAppUser(cred.user);
    } catch (error) {
      throw new Error(friendlyError(error));
    }
  }

  const email = "alex.morgan@gmail.com";
  const accounts = demoAccounts();
  let account = accounts.find((item) => item.email === email);
  if (!account) {
    account = {
      uid: "demo-google",
      name: "Alex Morgan",
      email,
      password: "google-demo",
      phone: "(214) 555-0148",
      createdAt: new Date().toISOString(),
    };
    accounts.push(account);
    storageSet(DEMO_ACCOUNTS, accounts);
  }
  storageSet(DEMO_SESSION, { uid: account.uid });
  setCurrentUser(demoSessionUser());
  return currentUser;
}

export async function resetPassword(email) {
  await authReady;
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("Enter a valid email address.");
  if (isFirebaseConfigured && firebaseSdk.authModule && firebaseSdk.auth) {
    try {
      await firebaseSdk.authModule.sendPasswordResetEmail(firebaseSdk.auth, cleanEmail);
      return true;
    } catch (error) {
      throw new Error(friendlyError(error));
    }
  }
  const account = demoAccounts().find((item) => item.email.toLowerCase() === cleanEmail);
  if (!account) throw new Error("No demo account found with that email.");
  return true;
}

export async function signOutUser() {
  await authReady;
  if (isFirebaseConfigured && firebaseSdk.authModule && firebaseSdk.auth) {
    await firebaseSdk.authModule.signOut(firebaseSdk.auth);
  }
  storageRemove(DEMO_SESSION);
  setCurrentUser(null);
}

/** Safe redirect target: only same-site relative paths. */
export function safeRedirect(target, fallback = "index.html") {
  const value = String(target || "").trim();
  if (!value) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return fallback;
  if (value.startsWith("//") || value.startsWith("\\\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

/**
 * Guards the admin area. Redirects unauthenticated users to login.
 * Returns the current user (Firebase) or null.
 */
export async function requireAdmin() {
  await authReady;
  const user = getCurrentUser();
  const redirect = encodeURIComponent(`admin/index.html${window.location.search}`);
  if (!user) {
    window.location.replace(`../login.html?redirect=${redirect}`);
    return null;
  }
  if (!user.isAdmin) {
    window.location.replace(`../index.html?denied=admin`);
    return null;
  }
  return user;
}

export function userInitials(user = currentUser) {
  return initials(user?.name || user?.email || "AutoSelect");
}
