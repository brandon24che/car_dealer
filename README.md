# AutoSelect — Vehicle Marketplace

A production-ready dealership storefront built with plain HTML, CSS, vanilla JavaScript (ES modules) and the Firebase v10 modular SDK. No frameworks, no build step, no Tailwind CDN.

The site ships with a complete demo mode, so every page — including the dealer portal — runs before Firebase is connected.

---

## What's included

**Storefront**
- Home page with hero, search, trust strip, body-style tiles, featured inventory, quiz CTA, trade-in promo and reviews.
- Inventory with live count, URL-synced filters, sort, grid/list views, cursor pagination, compare tray and a trade-in interstitial.
- Vehicle detail page with carousel + lightbox, 360° view, specs, finance calculator, inspection report, availability, similar vehicles and a WhatsApp concierge that logs a lead.
- Six-step Match Quiz with a pure-JS scoring engine (`js/quiz-engine.js`), live match count, top match and saved results.
- Saved vehicles, trade-in valuation flow with photo uploads, contact page, login, sign-up, password reset.
- Legal pages, custom 404, SEO metadata, Open Graph, JSON-LD, accessible markup, skeletons and empty states.

**Dealer portal** (`/admin/index.html`)
- Protected by a Firebase custom claim **or** an `admins/{uid}` Firestore document.
- Dashboard metrics, most-viewed stock, recent leads and a 7-day lead activity chart.
- Vehicle CRUD with every listing field, multi-image upload with drag-reorder/cover selection, featured/status flags, inline validation and delete confirmation.
- Inventory bulk actions: select many vehicles to feature, unfeature, mark available/sold or delete, plus a CSV export of the filtered stock.
- Leads table with search, type/status filters, persistent status changes and CSV export.
- Command palette (`Ctrl/Cmd + K`) for jumping between views, running portal actions and searching vehicles by make, model, stock number or VIN.
- Super-admin team management: the root admin can add and remove dealer admins from **Team**; admins created there can use the whole portal but cannot add or remove other admins.
- One-click import of the 15 Cars & Bids auction listings bundled in `js/demo-data.js`; imported cars use the normal CRUD editor, so any of them can be edited or deleted.
- One-click seed of the 39-vehicle showcase catalogue and a demo-data reset.

---

## Tech stack

| Choice | Detail |
| --- | --- |
| Markup | Semantic HTML5, one page per route |
| Styling | Hand-written CSS, mobile-first, design tokens in `css/variables.css` |
| Scripts | Native ES modules, no bundler |
| Backend | Firebase Auth, Firestore, Storage (v10.14.1, loaded from the CDN) |
| Icons | Material Symbols Outlined |
| Fonts | Plus Jakarta Sans + Inter |

---

## Run it locally

Any static server works. From the project root:

```bash
python -m http.server 4173 --bind 127.0.0.1
# open http://127.0.0.1:4173/
```

or

```bash
npx serve .
```

Do not open the HTML files with `file://` — ES modules and `data/vehicles.json` require HTTP.

### Demo mode

While `js/firebase-config.js` contains placeholders, all data lives in `localStorage`.

- Demo dealer account: **admin@autoselect.demo** / **autoselect** — this account is the super admin.
- The login page has a “Fill demo credentials” shortcut.
- The super admin can open **Team** in the portal and create or remove additional dealer admins. Admins created this way can manage inventory and leads but do not see the Team view.
- Accounts created from the public sign-up page are customers, not dealer admins.
- Seeded vehicles and reviews are stored under `as_demo_vehicles_v1` / `as_demo_reviews_v1`; leads under `as_leads_v1`.
- Use **Dashboard → Reset demo data** in the portal to restore the original catalogue.
- If Firestore is connected but the `vehicles` collection is empty, the storefront falls back to `data/vehicles.json` so the public site never looks broken.

---

## Firebase setup

### 1. Create the project and web app

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Project settings → General → Your apps → Web** and register the site.
3. Copy the config object into `js/firebase-config.js`:

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-XXXXXXX",
};
```

The web config is not a server secret, but this repository intentionally ships placeholders. Never put service-account JSON or other private credentials in client code.

As soon as the required values are replaced, `isFirebaseConfigured` becomes `true` and the site switches from demo mode to Firebase automatically.

### 2. Enable authentication

In **Authentication → Sign-in method** enable:

- Email/Password
- Google

Add your production domain under **Authentication → Settings → Authorized domains**.

### 3. Create Firestore and Storage

- **Firestore Database**: create in production mode (rules are deployed below).
- **Storage**: create a default bucket. Firestore is also used by Storage rules to resolve dealer access.

### 4. Connect the CLI and deploy security rules

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # choose your project, give it an alias
firebase deploy --only firestore:rules,firestore:indexes,storage
```

The first composite index build can take several minutes. `firestore.indexes.json` covers the common single-filter + sort combinations. If you combine several filters at once (for example make + body style + price), Firestore may log a link to create an additional index; the storefront also falls back to client-side filtering, so the page still works.

### 5. Create the first dealer admin (super admin)

The root account is hard-coded in `js/auth.js` (`SUPER_ADMIN_UIDS`) and `firestore.rules`:

```
NL3B6fmiZVUAMxaaAtwRYavYYY92
```

That UID is always a super admin, regardless of Firestore state. Sign in with it once and the portal opens with the **Team** view. From there, use **Add admin** to create further dealer admins by name, email and password. The new account is created with a temporary secondary Firebase app so the super admin stays signed in, then gets an `admins/{uid}` document with `role: "admin"`.

- Super admin: full portal, plus create and remove dealer admins.
- Dealer admin (created by the super admin): full portal except the Team view; cannot create or remove admins.
- Removing an admin deletes the `admins/{uid}` document, revoking portal access immediately. The Firebase Authentication user itself is not deleted; remove it separately in **Authentication → Users** if needed.
- Self-deletion and deletion of the root/super admin are blocked in both the UI and the rules.

The Firestore rules in `firestore.rules` enforce the hierarchy server-side. Deploy them after pulling these changes:

```bash
firebase deploy --only firestore:rules
```

**Option A — `admins` collection (no code)**

1. Create the user in **Authentication → Users**.
2. Copy the user's UID.
3. In Firestore create `admins/{uid}` with `role: "admin"` plus the usual fields, for example `createdAt: <server timestamp>`.
4. Sign out and back in on the site. The portal opens at `/admin/`.

**Option B — custom claim**

```js
// Node.js script with firebase-admin and application-default credentials
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.applicationDefault() });

await admin.auth().setCustomUserClaims(UID, { admin: true });
```

The user must refresh their ID token (sign out/in) after the claim is set. Rules accept either mechanism (or `role: "super"` / `super: true` claims for another super admin).

### 6. Seed inventory

Open `/admin/`, go to **Overview → Add 15 Cars & Bids listings** to publish the auction cars, or **Seed showcase vehicles** to batch-write the full 39-vehicle catalogue and 4 reviews. Existing documents with the same IDs are overwritten by the seed; the auction import only touches its own 15 records.

### 7. Set the dealer WhatsApp number

Edit `js/whatsapp.js`:

```js
export const DEALER_WHATSAPP_NUMBER = "18005550199";
```

Use E.164 digits only (country code + number, no `+`, spaces or dashes). Vehicle, quiz, sell and contact pages all build `wa.me` links from this constant.

### 8. Deploy

```bash
firebase deploy --only hosting
```

`firebase.json` serves the repository root, excludes dev/test artifacts, sets long-lived image caching, no-cache for HTML and baseline security headers. `/admin` redirects to `/admin/index.html`.

### 9. Deploy to Vercel

The repository root is the deployable site — there is no build step.

1. Import the repository at [vercel.com/new](https://vercel.com/new). Keep **Framework Preset: Other**, **Root Directory: ./**, no Build Command and no Output Directory.
2. `vercel.json` adds the `/admin` redirect, cache headers and security headers. `.vercelignore` keeps `.firebase/`, `.firebaserc`, `firebase.json`, the rules/index files and logs out of the upload.
3. After the first deploy, add your Vercel domain under **Firebase Console → Authentication → Settings → Authorized domains** (`your-project.vercel.app` and any custom domain). Google sign-in returns `auth/unauthorized-domain` until the domain is listed.
4. `404.html` is picked up automatically for unknown URLs, and all assets/links on it are root-absolute, so it works at any path.

Or from the CLI:

```bash
npx vercel --prod
```

Firestore, Auth and Storage need no Vercel-side configuration — the web config in `js/firebase-config.js` is public by design and works from any origin allowed by the security rules.

---

## Firestore data model

| Collection | Read | Write | Purpose |
| --- | --- | --- | --- |
| `vehicles/{id}` | Public | Dealer | Listings. The public may only increment `viewCount` by exactly one. |
| `reviews/{id}` | Public | Dealer | Home-page testimonials. |
| `users/{uid}` | Owner + dealer | Owner (own doc) | Profile mirror written after sign-in. Role cannot be escalated without dealer access. |
| `leads/{id}` | Dealer | Public create, dealer update | Every concierge, contact, test-drive and trade-in request. |
| `testDrives/{id}` | Dealer | Public create, dealer update | Structured test-drive bookings. |
| `valuations/{id}` | Dealer | Public create, dealer update | Trade-in submissions with photo URLs. |
| `quizResults/{id}` | Dealer | Signed-in create | Optional quiz analytics (`uid` must match the caller). |
| `admins/{uid}` | Owner + dealer | No client writes | Dealer authorization records; manage from the console or Admin SDK. |

Lead creation is validated for allowed fields, types, lengths, a `new` status and a server timestamp. Public storage uploads are limited to images under 8 MB; vehicle photos are dealer-only, while trade-in photos use the separate `valuations/` path.

### Vehicle fields

`year, make, model, trim, stockNumber, vin, price, msrp, belowMarketAmount, dealRating, mileage, bodyStyle, fuelType, transmission, transmissionCategory, drivetrain, engine, seats, mpgCity, mpgHwy, mpg, rangeMiles, exteriorColor, interiorColor, location, status, featured, certified, inspected150, carfaxClean, oneOwner, images[], features[], inspection { brakeLife, tireTread, battery, fluids }, viewCount, createdAt, updatedAt`.

---

## Project structure

```
index.html              Home
inventory.html          Inventory
vehicle.html            Vehicle detail
quiz.html               Match quiz
saved.html              Saved vehicles
sell.html               Trade-in valuation
contact.html            Contact
login.html / signup.html
privacy.html / terms.html / 404.html
admin/index.html        Dealer portal

css/
  variables.css         Design tokens
  base.css              Reset, typography, layout primitives
  components.css        Buttons, cards, header, footer, modals, toasts...
  pages/                Page-specific styles (admin.css, content.css...)
js/
  firebase-config.js    Firebase bootstrap (public web config)
  data-store.js         Unified async data facade + demo fallback
  demo-data.js          39 showcase vehicles (24 demo + 15 Cars & Bids), reviews
  auth.js               Auth + demo session + admin guard
  ui.js                 Shared shell, toasts, modal, skeletons
  quiz-engine.js        Pure scoring logic
  whatsapp.js           Dealer number + wa.me links
  pages/                Page controllers
  admin/                Portal controller, inventory, leads, helpers
data/vehicles.json      Static fallback inventory
assets/                 Logo, favicon, car photography
firestore.rules         Firestore security rules
storage.rules           Storage security rules
firestore.indexes.json  Composite indexes
firebase.json           Hosting + rules + cache configuration
vercel.json             Vercel redirects, cache and security headers
.vercelignore           Keeps Firebase config, rules and logs out of Vercel
```

---

## Customization

- **Colors, type scale, spacing, shadows:** `css/variables.css`.
- **Demo inventory and testimonials:** `js/demo-data.js`; regenerate `data/vehicles.json` if you want the static fallback to match.
- **Showroom locations:** the hub list appears in the vehicle editor (`admin/index.html`), contact page hours and footer data.
- **Brand marks and photos:** `assets/`.
- **SEO / social:** each page carries its own title, description, canonical URL, Open Graph tags and structured data. Update the production URLs when you attach a custom domain.

---

## Quality notes

- Mobile-first layouts tested at 375, 768, 1280 and 1440 px.
- Accessible: skip links, visible focus, labelled fields, error summaries, `aria-live` regions, focus-trapped dialogs, keyboard-operable image reordering and reduced-motion support.
- Performance: the header and footer paint synchronously instead of waiting for Firebase Auth (`mountShell()` renders from a cached session hint, then reconciles); lazy images, compressed image uploads, debounced search, cached Firestore reads, skeletons, and a single real-time listener (the inventory count).
- Failure handling: empty/error/offline states, a JSON inventory fallback, guarded admin routes and friendly auth errors.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| Site still shows demo data | Replace all placeholders in `js/firebase-config.js`; hard-refresh. |
| Admin redirects to login | Confirm the user is signed in and has either the `admin` claim or an `admins/{uid}` document. |
| Admin redirects to home | The account is authenticated but not a dealer. |
| Team view is missing | Only the root super admin (or an account with a `super` role/claim) can manage admins. Deploy the latest `firestore.rules`, then sign out and back in. |
| “Only the super admin can add dealer admins” | The signed-in account is a dealer admin created by the super admin; use the root account for team changes. |
| “Missing index” in console | Open the link Firestore logs and create the composite index, then redeploy `firestore.indexes.json`. |
| Vehicle images fail | Check `storage.rules`, the bucket name in the config, and that the file is under 8 MB. |
| Google sign-in popup blocked | Allow pop-ups for the site and add the domain to authorized domains. |

---

## License

The code and demo content are provided for the AutoSelect project. Replace stock photography with licensed dealership images before launch.
