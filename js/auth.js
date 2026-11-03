/**
 * Authentication facade.
 * Uses Firebase Auth when configured; otherwise a localStorage-backed demo
 * session so the whole flow (incl. admin) can be previewed without a project.
 */
import {
  firebaseConfig,
  firebaseReady,
  firebaseSdk,
  isFirebaseConfigured,
} from "./firebase-config.js?v=20261103a";
import { initials, storageGet, storageSet, storageRemove } from "./utils.js?v=20261103a";

const DEMO_ACCOUNTS = "as_demo_accounts_v1";
const DEMO_SESSION = "as_demo_session_v1";
const USER_HINT = "as_auth_hint_v1";
const SDK_APP_URL = "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

/** Root dealer account. Always super admin, regardless of Firestore state. */
const SUPER_ADMIN_UIDS = new Set(["NL3B6fmiZVUAMxaaAtwRYavYYY92"]);

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
  role: "super",
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
  rememberUser(user);
  notify();
}

/** Persist a minimal profile so the shell can paint the avatar before auth resolves. */
function rememberUser(user) {
  if (user?.uid) {
    storageSet(USER_HINT, {
      uid: user.uid,
      name: user.name || "",
      email: user.email || "",
      role: user.role || (user.isAdmin ? "admin" : "member"),
      isAdmin: Boolean(user.isAdmin),
      isSuperAdmin: Boolean(user.isSuperAdmin),
      isDemo: Boolean(user.isDemo),
    });
    return;
  }
  storageRemove(USER_HINT);
}

/** Last known profile from localStorage — safe for instant shell rendering only. */
export function getCachedUser() {
  const hint = storageGet(USER_HINT, null);
  return hint?.uid ? hint : null;
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
  const role = account.role === "super" ? "super" : account.role === "admin" ? "admin" : "member";
  return {
    ...safe,
    role,
    isAdmin: role !== "member",
    isSuperAdmin: role === "super",
    isDemo: true,
  };
}

function toAppUser(firebaseUser, access = {}) {
  const isAdmin = Boolean(access.isAdmin);
  return {
    uid: firebaseUser.uid,
    name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "AutoSelect Member",
    email: firebaseUser.email || "",
    phone: firebaseUser.phoneNumber || "",
    photoURL: firebaseUser.photoURL || "",
    role: access.role || (isAdmin ? "admin" : "member"),
    isAdmin,
    isSuperAdmin: Boolean(access.isSuperAdmin),
    isDemo: false,
  };
}

/**
 * Resolve portal access. The root UID short-circuits before any network call,
 * so the primary super admin never pays for a token/doc round trip.
 */
async function resolveAdmin(firebaseUser) {
  const member = { isAdmin: false, isSuperAdmin: false, role: "member" };
  if (!firebaseSdk.db) return member;
  if (SUPER_ADMIN_UIDS.has(firebaseUser.uid)) {
    return { isAdmin: true, isSuperAdmin: true, role: "super" };
  }
  try {
    const m = firebaseSdk.firestoreModule;
    const token = await firebaseUser.getIdTokenResult();
    const claimRole = token.claims?.role;
    if (token.claims?.super === true || claimRole === "super") {
      return { isAdmin: true, isSuperAdmin: true, role: "super" };
    }
    const claimAdmin = token.claims?.admin === true || claimRole === "admin";

    let docRole = null;
    try {
      const snap = await m.getDoc(m.doc(firebaseSdk.db, "admins", firebaseUser.uid));
      if (snap.exists()) docRole = snap.data().role === "super" ? "super" : "admin";
    } catch (error) {
      console.warn("[AutoSelect] admin record read failed", error);
    }
    if (docRole === "super") return { isAdmin: true, isSuperAdmin: true, role: "super" };
    if (claimAdmin || docRole === "admin") {
      return { isAdmin: true, isSuperAdmin: false, role: "admin" };
    }
    return member;
  } catch (error) {
    console.warn("[AutoSelect] admin check failed", error);
    return member;
  }
}

async function ensureUserDoc(firebaseUser, role) {
  if (!firebaseSdk.db) return;
  try {
    const m = firebaseSdk.firestoreModule;
    await m.setDoc(
      m.doc(firebaseSdk.db, "users", firebaseUser.uid),
      {
        name: firebaseUser.displayName || "",
        email: firebaseUser.email || "",
        phone: firebaseUser.phoneNumber || "",
        role: role === "member" ? "member" : "admin",
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
          const access = await resolveAdmin(firebaseUser);
          setCurrentUser(toAppUser(firebaseUser, access));
          ensureUserDoc(firebaseUser, access.role);
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
  if (account.password !== password) throw new Error("Incorrect password. Try again.");
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
      setCurrentUser(toAppUser({ ...cred.user, displayName: cleanName }, { role: "member" }));
      await ensureUserDoc({ ...cred.user, displayName: cleanName }, "member");
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

/** Portal admins, newest first. Includes the super admin record. */
export async function listAdminAccounts() {
  await authReady;
  if (isFirebaseConfigured && firebaseSdk.db) {
    const m = firebaseSdk.firestoreModule;
    const snap = await m.getDocs(
      m.query(m.collection(firebaseSdk.db, "admins"), m.limit(100))
    );
    return snap.docs
      .map((entry) => ({ uid: entry.id, ...entry.data(), isDemo: false }))
      .sort((a, b) => {
        const rank = (item) => (item.role === "super" ? 0 : 1);
        return rank(a) - rank(b) || String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""));
      });
  }
  return demoAccounts()
    .filter((account) => account.role === "super" || account.role === "admin")
    .map(({ password, ...account }) => ({
      ...account,
      role: account.role === "super" ? "super" : "admin",
      isDemo: true,
    }));
}

/**
 * Create a dealer admin. Super-admin only — enforced here, in the portal UI and
 * again by firestore.rules so a regular admin cannot escalate privileges.
 */
export async function createAdminAccount({ name, email, password } = {}) {
  await authReady;
  const actor = getCurrentUser();
  if (!actor?.isSuperAdmin) {
    throw new Error("Only the super admin can add dealer admins.");
  }
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (cleanName.length < 2) throw new Error("Enter the admin's full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("Enter a valid email address.");
  if (!password || password.length < 8) throw new Error("Use a password with at least 8 characters.");

  if (isFirebaseConfigured && firebaseSdk.db && firebaseSdk.authModule) {
    // Creating a user signs that user in, so use an isolated secondary app and
    // keep the super admin's session untouched.
    const appModule =
      firebaseSdk.appModule || (await import(SDK_APP_URL));
    const secondary = appModule.initializeApp(
      firebaseSdk.app?.options || firebaseConfig,
      `admin-provision-${Date.now().toString(36)}`
    );
    const secondaryAuth = firebaseSdk.authModule.getAuth(secondary);
    let uid = "";
    try {
      const cred = await firebaseSdk.authModule.createUserWithEmailAndPassword(
        secondaryAuth,
        cleanEmail,
        password
      );
      await firebaseSdk.authModule.updateProfile(cred.user, { displayName: cleanName });
      uid = cred.user.uid;
    } catch (error) {
      throw new Error(friendlyError(error));
    } finally {
      await firebaseSdk.authModule.signOut(secondaryAuth).catch(() => {});
      await appModule.deleteApp(secondary).catch(() => {});
    }

    const m = firebaseSdk.firestoreModule;
    try {
      await m.setDoc(m.doc(firebaseSdk.db, "admins", uid), {
        name: cleanName,
        email: cleanEmail,
        role: "admin",
        createdBy: actor.uid,
        createdAt: m.serverTimestamp(),
      });
    } catch (error) {
      console.error("[AutoSelect] admin record write failed", error);
      throw new Error(
        "The sign-in account was created but the admin record could not be saved. Deploy the latest firestore.rules and try again."
      );
    }
    return { uid, name: cleanName, email: cleanEmail, role: "admin", createdBy: actor.uid };
  }

  const accounts = demoAccounts();
  if (accounts.some((account) => account.email.toLowerCase() === cleanEmail)) {
    throw new Error("An account already exists with that email.");
  }
  const account = {
    uid: `demo-admin-${Date.now().toString(36)}`,
    name: cleanName,
    email: cleanEmail,
    password,
    role: "admin",
    createdBy: actor.uid,
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  storageSet(DEMO_ACCOUNTS, accounts);
  const { password: _password, ...safe } = account;
  return { ...safe, isDemo: true };
}

/** Remove a dealer admin. Super-admin only; the root and other super admins are protected. */
export async function deleteAdminAccount(uid) {
  await authReady;
  const actor = getCurrentUser();
  if (!actor?.isSuperAdmin) {
    throw new Error("Only the super admin can remove dealer admins.");
  }
  if (!uid) throw new Error("Missing admin id.");
  if (uid === actor.uid) throw new Error("You cannot remove your own super admin access.");
  if (SUPER_ADMIN_UIDS.has(uid)) throw new Error("The primary super admin cannot be removed.");

  if (isFirebaseConfigured && firebaseSdk.db) {
    const m = firebaseSdk.firestoreModule;
    const ref = m.doc(firebaseSdk.db, "admins", uid);
    const snap = await m.getDoc(ref);
    if (!snap.exists()) return true;
    if (snap.data().role === "super") throw new Error("Super admins cannot be removed from the portal.");
    await m.deleteDoc(ref);
    return true;
  }

  const accounts = demoAccounts();
  const target = accounts.find((account) => account.uid === uid);
  if (!target) return true;
  if (target.role === "super") throw new Error("Super admins cannot be removed from the portal.");
  storageSet(DEMO_ACCOUNTS, accounts.filter((account) => account.uid !== uid));
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
