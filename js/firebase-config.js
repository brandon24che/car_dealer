/**
 * Firebase bootstrap.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Create a Firebase project → add a Web app.
 *  2. Paste the config values below (Project settings → General → Your apps).
 *  3. Enable Authentication → Email/Password + Google.
 *  4. Create Firestore (production mode) and Storage.
 *  5. Deploy rules/indexes: `firebase deploy --only firestore:rules,firestore:indexes,storage`
 *  See README.md for the full walkthrough.
 *
 *  While the placeholders are present the entire site runs on the bundled
 *  demo dataset (localStorage), so nothing breaks before Firebase is connected.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const firebaseConfig = {
  apiKey: "AIzaSyDlAOez09V9OgXu95ROAl9MTmvBosnCRe0",
  authDomain: "car-dealership-1b32c.firebaseapp.com",
  projectId: "car-dealership-1b32c",
  storageBucket: "car-dealership-1b32c.firebasestorage.app",
  messagingSenderId: "818608636132",
  appId: "1:818608636132:web:5b8395193b7c383ed5acf1",
};

const REQUIRED_KEYS = ["apiKey", "authDomain", "projectId", "storageBucket", "appId"];

export const isFirebaseConfigured = REQUIRED_KEYS.every((key) => {
  const value = firebaseConfig[key];
  return Boolean(value) && !/YOUR_|your-project|YOUR_PROJECT/i.test(value);
});

/**
 * Live Firebase handles. `app/auth/db/storage` are populated after firebaseReady resolves.
 * Module SDKs are exposed on `firebaseSdk` so the data layer can use them lazily.
 */
export let app = null;
export let auth = null;
export let db = null;
export let storage = null;

export const firebaseSdk = {
  app: null,
  auth: null,
  db: null,
  storage: null,
  appModule: null,
  authModule: null,
  firestoreModule: null,
  storageModule: null,
};

export let firebaseInitError = null;

const SDK_VERSION = "10.14.1";

async function bootstrap() {
  if (!isFirebaseConfigured) {
    return null;
  }
  try {
    const [appModule, authModule, firestoreModule, storageModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-storage.js`),
    ]);

    app = appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app);
    db = firestoreModule.getFirestore(app);
    storage = storageModule.getStorage(app);

    firebaseSdk.app = app;
    firebaseSdk.auth = auth;
    firebaseSdk.db = db;
    firebaseSdk.storage = storage;
    firebaseSdk.appModule = appModule;
    firebaseSdk.authModule = authModule;
    firebaseSdk.firestoreModule = firestoreModule;
    firebaseSdk.storageModule = storageModule;

    // Optional: connect to local emulators while developing.
    // if (location.hostname === "localhost") {
    //   firestoreModule.connectFirestoreEmulator(db, "localhost", 8080);
    //   authModule.connectAuthEmulator(auth, "http://localhost:9099");
    //   storageModule.connectStorageEmulator(storage, "localhost", 9199);
    // }

    return { app, auth, db, storage };
  } catch (error) {
    firebaseInitError = error;
    console.error("[AutoSelect] Firebase failed to initialize — using demo data.", error);
    app = null;
    auth = null;
    db = null;
    storage = null;
    firebaseSdk.app = null;
    firebaseSdk.auth = null;
    firebaseSdk.db = null;
    firebaseSdk.storage = null;
    return null;
  }
}

/** Resolves once (and only once) the Firebase SDK has been attempted. */
export const firebaseReady = bootstrap();

export async function getFirebase() {
  await firebaseReady;
  return { app, auth, db, storage, sdk: firebaseSdk, configured: Boolean(db) };
}
