/**
 * Data access layer.
 *
 * Public API talks to Firestore when configured, otherwise to the bundled
 * demo dataset persisted in localStorage. Every method is async so pages can
 * swap backends without branching.
 */
import {
  firebaseReady,
  firebaseSdk,
  isFirebaseConfigured,
} from "./firebase-config.js?v=20261101a";
import { demoVehicles, demoReviews } from "./demo-data.js?v=20261101a";
import {
  debounce,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatMileage,
  storageGet,
  storageSet,
  truncate,
  uid,
} from "./utils.js?v=20261101a";

const KEYS = {
  vehicles: "as_demo_vehicles_v1",
  reviews: "as_demo_reviews_v1",
  leads: "as_leads_v1",
  testDrives: "as_test_drives_v1",
  valuations: "as_valuations_v1",
  quiz: "as_quiz_results_v1",
  viewed: "as_viewed_v1",
};

const PUBLIC_STATUSES = ["available", "reserved"];
const SORT_FIELDS = {
  featured: [["featured", "desc"], ["createdAt", "desc"]],
  newest: [["createdAt", "desc"]],
  "price-asc": [["price", "asc"]],
  "price-desc": [["price", "desc"]],
  "mileage-asc": [["mileage", "asc"]],
};

let cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.promise;
}

function cacheSet(key, promise, ttl = 30000) {
  cache.set(key, { promise, expires: Date.now() + ttl });
  return promise;
}

function clearCache() {
  cache = new Map();
}

export function isDemoConfigured() {
  return !isFirebaseConfigured;
}

export async function dataMode() {
  await firebaseReady;
  return firebaseSdk.db ? "firebase" : "demo";
}

async function live() {
  await firebaseReady;
  return firebaseSdk.db ? firebaseSdk : null;
}

const nowIso = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));

/* ------------------------------------------------------------------ */
/* Local demo storage                                                  */
/* ------------------------------------------------------------------ */

function localVehicles() {
  const stored = storageGet(KEYS.vehicles, null);
  return Array.isArray(stored) ? stored : clone(demoVehicles);
}

function writeLocalVehicles(list) {
  storageSet(KEYS.vehicles, list);
  clearCache();
  window.dispatchEvent(new CustomEvent("as:vehicles-changed"));
}

function localReviews() {
  return storageGet(KEYS.reviews, clone(demoReviews));
}

/**
 * Static fallback inventory shipped with the site (`data/vehicles.json`).
 * Used when Firestore is configured but has no vehicles, so the catalogue
 * still renders before an admin seeds the collection.
 */
let jsonVehiclesPromise = null;
function jsonFallbackVehicles() {
  if (!jsonVehiclesPromise) {
    jsonVehiclesPromise = fetch(new URL("../data/vehicles.json", import.meta.url))
      .then((response) => (response.ok ? response.json() : []))
      .then((list) => (Array.isArray(list) ? list : []))
      .catch((error) => {
        console.warn("[AutoSelect] data/vehicles.json fallback unavailable", error);
        return [];
      });
  }
  return jsonVehiclesPromise;
}

async function fallbackVehicles() {
  const list = await jsonFallbackVehicles();
  return list.length ? list : localVehicles();
}

function readLocal(key) {
  return storageGet(key, []);
}

function pushLocal(key, entry) {
  const list = readLocal(key);
  list.unshift(entry);
  storageSet(key, list.slice(0, 500));
  return entry;
}

/* ------------------------------------------------------------------ */
/* Normalization / querying                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_FILTERS = Object.freeze({
  priceMax: null,
  priceMin: null,
  bodyStyles: [],
  make: "",
  model: "",
  yearMin: null,
  transmission: "",
  fuelTypes: [],
  inspected150: false,
  carfaxClean: false,
  oneOwner: false,
  search: "",
});

export function normalizeFilters(filters = {}) {
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    bodyStyles: Array.isArray(filters.bodyStyles)
      ? filters.bodyStyles
      : filters.bodyStyle
        ? [filters.bodyStyle]
        : [],
    fuelTypes: Array.isArray(filters.fuelTypes)
      ? filters.fuelTypes
      : filters.fuelType
        ? [filters.fuelType]
        : [],
    priceMax: filters.priceMax ? Number(filters.priceMax) : null,
    priceMin: filters.priceMin ? Number(filters.priceMin) : null,
    yearMin: filters.yearMin ? Number(filters.yearMin) : null,
    inspected150: Boolean(filters.inspected150),
    carfaxClean: Boolean(filters.carfaxClean),
    oneOwner: Boolean(filters.oneOwner),
    search: String(filters.search || "").trim(),
  };
}

function transmissionMatches(vehicle, value) {
  if (!value) return true;
  const text = String(vehicle.transmission || "").toLowerCase();
  if (value === "Manual") return text.includes("manual");
  if (value === "Automatic") return !text.includes("manual");
  return text.includes(String(value).toLowerCase());
}

export function applyVehicleFilters(vehicles, rawFilters = {}, includeSold = false) {
  const filters = normalizeFilters(rawFilters);
  const search = filters.search.toLowerCase();
  return vehicles.filter((vehicle) => {
    if (!includeSold && !PUBLIC_STATUSES.includes(vehicle.status || "available")) return false;
    if (filters.priceMax && Number(vehicle.price) > filters.priceMax) return false;
    if (filters.priceMin && Number(vehicle.price) < filters.priceMin) return false;
    if (filters.bodyStyles.length && !filters.bodyStyles.includes(vehicle.bodyStyle)) return false;
    if (filters.make && vehicle.make !== filters.make) return false;
    if (filters.model && vehicle.model !== filters.model) return false;
    if (filters.yearMin && Number(vehicle.year) < filters.yearMin) return false;
    if (!transmissionMatches(vehicle, filters.transmission)) return false;
    if (filters.fuelTypes.length) {
      const matchesFuel = filters.fuelTypes.some((fuel) => {
        if (fuel === "EV") return vehicle.fuelType === "Electric";
        if (fuel === "Hybrid") return vehicle.fuelType === "Hybrid" || vehicle.fuelType === "PlugInHybrid";
        return vehicle.fuelType === fuel;
      });
      if (!matchesFuel) return false;
    }
    if (filters.inspected150 && !vehicle.inspected150) return false;
    if (filters.carfaxClean && !vehicle.carfaxClean) return false;
    if (filters.oneOwner && !vehicle.oneOwner) return false;
    if (search) {
      const haystack = [
        vehicle.year,
        vehicle.make,
        vehicle.model,
        vehicle.trim,
        vehicle.vin,
        vehicle.stockNumber,
        vehicle.bodyStyle,
        vehicle.exteriorColor,
        vehicle.interiorColor,
        vehicle.fuelType,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function timestampOf(value) {
  if (!value) return 0;
  if (value?.toDate) return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortVehicles(vehicles, sort = "featured") {
  const list = [...vehicles];
  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => Number(a.price) - Number(b.price));
    case "price-desc":
      return list.sort((a, b) => Number(b.price) - Number(a.price));
    case "mileage-asc":
      return list.sort((a, b) => Number(a.mileage) - Number(b.mileage));
    case "newest":
      return list.sort((a, b) => timestampOf(b.createdAt) - timestampOf(a.createdAt));
    case "featured":
    default:
      return list.sort(
        (a, b) =>
          Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
          timestampOf(b.createdAt) - timestampOf(a.createdAt)
      );
  }
}

function paginate(vehicles, limit = 10, offset = 0) {
  const total = vehicles.length;
  const safeLimit = Math.max(1, Number(limit) || 10);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const items = vehicles.slice(safeOffset, safeOffset + safeLimit);
  return {
    items,
    total,
    nextOffset: safeOffset + items.length,
    hasMore: safeOffset + items.length < total,
    cursor: null,
  };
}

/** Local query used for the demo dataset and as a Firestore fallback. */
function queryLocal(params = {}, vehicles) {
  const all = vehicles || localVehicles();
  let filtered = applyVehicleFilters(all, params.filters, params.includeSold);
  filtered = sortVehicles(filtered, params.sort);
  return paginate(filtered, params.limit, params.offset);
}

const docToVehicle = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

async function firestoreCollectionIsEmpty(collectionName = "vehicles") {
  const f = await live();
  if (!f) return true;
  const m = f.firestoreModule;
  return cacheSet(
    `empty:${collectionName}`,
    (async () => {
      const snap = await m.getDocs(m.query(m.collection(f.db, collectionName), m.limit(1)));
      return snap.empty;
    })(),
    12000
  );
}

/* ------------------------------------------------------------------ */
/* Vehicles                                                            */
/* ------------------------------------------------------------------ */

/**
 * Paginated inventory query.
 * @param {object} params
 * @param {object} params.filters normalized or raw filters
 * @param {string} params.sort featured|price-asc|price-desc|mileage-asc|newest
 * @param {number} params.limit
 * @param {number} params.offset local pagination offset
 * @param {*} params.startAfterDoc Firestore cursor from a previous page
 */
export async function queryVehicles(params = {}) {
  const options = {
    filters: normalizeFilters(params.filters || {}),
    sort: params.sort || "featured",
    limit: params.limit ?? 10,
    offset: params.offset ?? 0,
    includeSold: Boolean(params.includeSold),
    startAfterDoc: params.startAfterDoc || null,
  };

  const f = await live();
  if (!f) {
    return queryLocal(options);
  }

  if (await firestoreCollectionIsEmpty()) {
    return queryLocal(options, await fallbackVehicles());
  }

  const m = f.firestoreModule;
  const filters = options.filters;

  // Firestore cannot substring-search, so search falls back to a bounded
  // in-memory scan (500 docs) — plenty for a single rooftop.
  if (filters.search) {
    try {
      const snap = await m.getDocs(m.query(m.collection(f.db, "vehicles"), m.limit(500)));
      let list = snap.docs.map(docToVehicle);
      if (!options.includeSold) list = list.filter((v) => PUBLIC_STATUSES.includes(v.status || "available"));
      list = applyVehicleFilters(list, filters, options.includeSold);
      list = sortVehicles(list, options.sort);
      return paginate(list, options.limit, options.offset);
    } catch (error) {
      console.warn("[AutoSelect] search fallback", error);
      return queryLocal(options, await fallbackVehicles());
    }
  }

  try {
    const clauses = [
      m.where("status", "in", options.includeSold ? [...PUBLIC_STATUSES, "sold"] : PUBLIC_STATUSES),
    ];
    if (filters.priceMax) clauses.push(m.where("price", "<=", filters.priceMax));
    if (filters.priceMin) clauses.push(m.where("price", ">=", filters.priceMin));
    if (filters.bodyStyles.length) clauses.push(m.where("bodyStyle", "in", filters.bodyStyles.slice(0, 10)));
    if (filters.make) clauses.push(m.where("make", "==", filters.make));
    if (filters.model) clauses.push(m.where("model", "==", filters.model));
    if (filters.yearMin) clauses.push(m.where("year", ">=", filters.yearMin));
    if (filters.transmission) clauses.push(m.where("transmissionCategory", "==", filters.transmission));
    if (filters.fuelTypes.length) {
      const fuel = filters.fuelTypes.flatMap((type) =>
        type === "EV" ? ["Electric"] : type === "Hybrid" ? ["Hybrid", "PlugInHybrid"] : [type]
      );
      clauses.push(m.where("fuelType", "in", [...new Set(fuel)].slice(0, 10)));
    }
    if (filters.inspected150) clauses.push(m.where("inspected150", "==", true));
    if (filters.carfaxClean) clauses.push(m.where("carfaxClean", "==", true));
    if (filters.oneOwner) clauses.push(m.where("oneOwner", "==", true));

    const baseQuery = m.query(m.collection(f.db, "vehicles"), ...clauses);
    const countSnap = await m.getCountFromServer(baseQuery);

    const order = (SORT_FIELDS[options.sort] || SORT_FIELDS.featured).map(([field, direction]) =>
      m.orderBy(field, direction)
    );
    const pageClauses = [...clauses, ...order];
    if (options.startAfterDoc) pageClauses.push(m.startAfter(options.startAfterDoc));
    pageClauses.push(m.limit(options.limit));

    const snap = await m.getDocs(m.query(m.collection(f.db, "vehicles"), ...pageClauses));
    const items = snap.docs.map(docToVehicle);
    const lastDoc = snap.docs[snap.docs.length - 1] || null;
    return {
      items,
      total: countSnap.data().count,
      nextOffset: options.offset + items.length,
      hasMore: items.length === options.limit,
      cursor: lastDoc,
    };
  } catch (error) {
    console.warn("[AutoSelect] Firestore query failed, using cached/demo inventory.", error);
    const all = await getAllVehicles();
    return queryLocal(options, all);
  }
}

/**
 * Full inventory snapshot (bounded) — used for counts, facets and admin.
 * The portal must only ever see real Firestore documents: the JSON fallback
 * is read-only, so editing or deleting it would silently fail.
 */
export async function getAllVehicles({ admin = false } = {}) {
  const f = await live();
  if (!f) return localVehicles();

  const load = async () => {
    try {
      const snap = await f.firestoreModule.getDocs(
        f.firestoreModule.query(f.firestoreModule.collection(f.db, "vehicles"), f.firestoreModule.limit(1000))
      );
      if (snap.empty) return admin ? [] : await fallbackVehicles();
      return snap.docs.map(docToVehicle);
    } catch (error) {
      if (admin) throw error;
      console.warn("[AutoSelect] getAllVehicles fallback", error);
      return localVehicles();
    }
  };

  if (admin) return load();
  return cacheSet("all-vehicles", load(), 20000);
}

export async function getVehicle(id) {
  if (!id) return null;
  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      const snap = await m.getDoc(m.doc(f.db, "vehicles", id));
      if (snap.exists()) {
        const vehicle = docToVehicle(snap);
        if (typeof vehicle.viewCount !== "number") vehicle.viewCount = 0;
        return vehicle;
      }
      if (await firestoreCollectionIsEmpty()) {
        const list = await fallbackVehicles();
        return list.find((v) => v.id === id) || null;
      }
      return null;
    } catch (error) {
      console.warn("[AutoSelect] getVehicle fallback", error);
    }
  }
  return localVehicles().find((v) => v.id === id) || null;
}

export async function getFeaturedVehicles(limit = 4) {
  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      if (!(await firestoreCollectionIsEmpty())) {
        const snap = await m.getDocs(
          m.query(
            m.collection(f.db, "vehicles"),
            m.where("featured", "==", true),
            m.where("status", "in", PUBLIC_STATUSES),
            m.orderBy("createdAt", "desc"),
            m.limit(limit)
          )
        );
        if (!snap.empty) return snap.docs.map(docToVehicle);
      }
    } catch (error) {
      console.warn("[AutoSelect] featured fallback", error);
    }
  }
  const fallback = f ? await fallbackVehicles() : localVehicles();
  return sortVehicles(
    applyVehicleFilters(fallback, {}, false).filter((v) => v.featured),
    "featured"
  ).slice(0, limit);
}

export async function getSimilarVehicles(vehicle, limit = 3) {
  if (!vehicle) return [];
  const all = await getAllVehicles();
  const min = Number(vehicle.price) * 0.8;
  const max = Number(vehicle.price) * 1.2;
  const pool = all.filter(
    (v) =>
      v.id !== vehicle.id &&
      PUBLIC_STATUSES.includes(v.status || "available") &&
      v.bodyStyle === vehicle.bodyStyle
  );
  let matches = pool.filter((v) => Number(v.price) >= min && Number(v.price) <= max);
  if (matches.length < limit) {
    matches = pool;
  }
  return sortVehicles(matches, "featured").slice(0, limit);
}

export async function getBodyStyleCounts() {
  const all = await getAllVehicles();
  const publicCars = all.filter((v) => PUBLIC_STATUSES.includes(v.status || "available"));
  const counts = {};
  publicCars.forEach((vehicle) => {
    counts[vehicle.bodyStyle] = (counts[vehicle.bodyStyle] || 0) + 1;
  });
  counts.evHybrid = publicCars.filter(
    (v) => v.fuelType === "Electric" || v.fuelType === "Hybrid" || v.fuelType === "PlugInHybrid"
  ).length;
  counts.electric = publicCars.filter((v) => v.fuelType === "Electric").length;
  counts.total = publicCars.length;
  counts.featured = publicCars.filter((v) => v.featured).length;
  return counts;
}

/** Facets for the filter sidebar: body styles, makes+models, years, price. */
export async function getFacets() {
  const all = await getAllVehicles();
  const publicCars = all.filter((v) => PUBLIC_STATUSES.includes(v.status || "available"));
  const bodyCounts = {};
  const fuelCounts = {};
  const makes = new Map();
  let maxPrice = 0;
  let minYear = 2030;

  publicCars.forEach((vehicle) => {
    bodyCounts[vehicle.bodyStyle] = (bodyCounts[vehicle.bodyStyle] || 0) + 1;
    fuelCounts[vehicle.fuelType] = (fuelCounts[vehicle.fuelType] || 0) + 1;
    if (!makes.has(vehicle.make)) makes.set(vehicle.make, { count: 0, models: new Map() });
    const makeEntry = makes.get(vehicle.make);
    makeEntry.count += 1;
    makeEntry.models.set(vehicle.model, (makeEntry.models.get(vehicle.model) || 0) + 1);
    maxPrice = Math.max(maxPrice, Number(vehicle.price) || 0);
    minYear = Math.min(minYear, Number(vehicle.year) || 2030);
  });

  return {
    total: publicCars.length,
    bodyCounts,
    fuelCounts,
    maxPrice: Math.max(100000, Math.ceil(maxPrice / 5000) * 5000),
    minYear: Number.isFinite(minYear) ? minYear : 2018,
    makes: [...makes.entries()]
      .map(([make, data]) => ({
        make,
        count: data.count,
        models: [...data.models.entries()].map(([model, count]) => ({ model, count })),
      }))
      .sort((a, b) => a.make.localeCompare(b.make)),
  };
}

/**
 * Subscribe to the live count for a filter set. Returns an unsubscribe function.
 * Uses onSnapshot in Firebase mode and lightweight events in demo mode.
 */
export async function watchVehicleCount(filters, callback) {
  const f = await live();
  const normalized = normalizeFilters(filters);
  if (f && !(await firestoreCollectionIsEmpty())) {
    try {
      const m = f.firestoreModule;
      const clauses = [m.where("status", "in", PUBLIC_STATUSES)];
      if (normalized.priceMax) clauses.push(m.where("price", "<=", normalized.priceMax));
      if (normalized.bodyStyles.length) clauses.push(m.where("bodyStyle", "in", normalized.bodyStyles.slice(0, 10)));
      if (normalized.make) clauses.push(m.where("make", "==", normalized.make));
      if (normalized.model) clauses.push(m.where("model", "==", normalized.model));
      const q = m.query(m.collection(f.db, "vehicles"), ...clauses);
      return m.onSnapshot(
        q,
        (snap) => {
          const count = snap.docs.filter((d) => applyVehicleFilters([docToVehicle(d)], normalized)).length;
          callback(count);
        },
        (error) => console.warn("[AutoSelect] count snapshot", error)
      );
    } catch (error) {
      console.warn("[AutoSelect] count subscription fallback", error);
    }
  }

  const update = async () => {
    const all = await getAllVehicles();
    callback(applyVehicleFilters(all, normalized).length);
  };
  update();
  window.addEventListener("as:vehicles-changed", update);
  window.addEventListener("storage", update);
  return () => {
    window.removeEventListener("as:vehicles-changed", update);
    window.removeEventListener("storage", update);
  };
}

export async function incrementViewCount(id) {
  const f = await live();
  if (f && !(await firestoreCollectionIsEmpty())) {
    try {
      const m = f.firestoreModule;
      await m.updateDoc(m.doc(f.db, "vehicles", id), { viewCount: m.increment(1) });
      clearCache();
    } catch (error) {
      console.warn("[AutoSelect] view count", error);
    }
    return;
  }
  const list = localVehicles();
  const vehicle = list.find((v) => v.id === id);
  if (vehicle) {
    vehicle.viewCount = Number(vehicle.viewCount || 0) + 1;
    writeLocalVehicles(list);
  }
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export async function getReviews(limit = 6) {
  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      if (!(await firestoreCollectionIsEmpty("reviews"))) {
        const snap = await m.getDocs(
          m.query(m.collection(f.db, "reviews"), m.orderBy("createdAt", "desc"), m.limit(limit))
        );
        if (!snap.empty) return snap.docs.map(docToVehicle);
      }
    } catch (error) {
      console.warn("[AutoSelect] reviews fallback", error);
    }
  }
  return localReviews().slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Leads / test drives / valuations / quiz results                     */
/* ------------------------------------------------------------------ */

function sanitizeLead(payload = {}) {
  return {
    name: truncate(String(payload.name || "").trim(), 80),
    email: truncate(String(payload.email || "").trim(), 120),
    phone: truncate(String(payload.phone || "").trim(), 30),
    message: truncate(String(payload.message || "").trim(), 1000),
  };
}

export async function saveLead(payload = {}) {
  const lead = {
    type: ["whatsapp", "testDrive", "valuation", "contact"].includes(payload.type) ? payload.type : "whatsapp",
    vehicleId: payload.vehicleId || "",
    vehicleName: payload.vehicleName || "",
    status: "new",
    createdAt: nowIso(),
    ...sanitizeLead(payload),
    meta: payload.meta || {},
  };
  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      const ref = await m.addDoc(m.collection(f.db, "leads"), {
        ...lead,
        createdAt: m.serverTimestamp(),
      });
      return { id: ref.id, ...lead };
    } catch (error) {
      console.warn("[AutoSelect] lead write failed", error);
    }
  }
  return pushLocal(KEYS.leads, { id: uid("lead"), ...lead });
}

export async function saveTestDrive(payload = {}) {
  const record = {
    vehicleId: payload.vehicleId || "",
    vehicleName: payload.vehicleName || "",
    name: truncate(String(payload.name || "").trim(), 80),
    phone: truncate(String(payload.phone || "").trim(), 30),
    email: truncate(String(payload.email || "").trim(), 120),
    preferredDate: payload.preferredDate || "",
    dateOption: payload.dateOption || "Today",
    locationPreference: payload.locationPreference || "Dealership Hub",
    status: "new",
    createdAt: nowIso(),
  };
  const f = await live();
  let id = uid("drive");
  if (f) {
    try {
      const m = f.firestoreModule;
      const ref = await m.addDoc(m.collection(f.db, "testDrives"), {
        ...record,
        createdAt: m.serverTimestamp(),
      });
      id = ref.id;
    } catch (error) {
      console.warn("[AutoSelect] test drive write failed", error);
      pushLocal(KEYS.testDrives, { id, ...record });
    }
  } else {
    pushLocal(KEYS.testDrives, { id, ...record });
  }
  await saveLead({
    type: "testDrive",
    vehicleId: record.vehicleId,
    vehicleName: record.vehicleName,
    name: record.name,
    phone: record.phone,
    email: record.email,
    message: `Test drive — ${record.dateOption} (${record.preferredDate}) • ${record.locationPreference}`,
    meta: { ...record },
  });
  return { id, ...record };
}

export async function saveValuation(payload = {}) {
  const record = {
    year: Number(payload.year) || null,
    make: truncate(String(payload.make || "").trim(), 40),
    model: truncate(String(payload.model || "").trim(), 60),
    trim: truncate(String(payload.trim || "").trim(), 60),
    mileage: Number(payload.mileage) || 0,
    condition: payload.condition || "Good",
    vin: truncate(String(payload.vin || "").trim(), 20),
    name: truncate(String(payload.name || "").trim(), 80),
    phone: truncate(String(payload.phone || "").trim(), 30),
    email: truncate(String(payload.email || "").trim(), 120),
    estimateLow: Number(payload.estimateLow) || 0,
    estimateHigh: Number(payload.estimateHigh) || 0,
    photos: Array.isArray(payload.photos) ? payload.photos.slice(0, 8) : [],
    status: "new",
    createdAt: nowIso(),
  };
  const f = await live();
  let id = uid("val");
  if (f) {
    try {
      const m = f.firestoreModule;
      const ref = await m.addDoc(m.collection(f.db, "valuations"), {
        ...record,
        createdAt: m.serverTimestamp(),
      });
      id = ref.id;
    } catch (error) {
      console.warn("[AutoSelect] valuation write failed", error);
      pushLocal(KEYS.valuations, { id, ...record });
    }
  } else {
    pushLocal(KEYS.valuations, { id, ...record });
  }
  await saveLead({
    type: "valuation",
    vehicleName: `${record.year || ""} ${record.make} ${record.model}`.trim(),
    name: record.name,
    phone: record.phone,
    email: record.email,
    message: `Trade-in valuation: ${record.mileage.toLocaleString()} mi • ${record.condition} condition`,
    meta: { ...record },
  });
  return { id, ...record };
}

export async function saveQuizResult(payload = {}) {
  const record = {
    answers: payload.answers || {},
    results: (payload.results || []).map((item) => ({
      id: item.id,
      score: item.score,
      reason: item.reason,
    })),
    createdAt: nowIso(),
  };
  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      const { auth } = f;
      if (auth?.currentUser) {
        await m.addDoc(m.collection(f.db, "quizResults"), {
          ...record,
          uid: auth.currentUser.uid,
          email: auth.currentUser.email || "",
          createdAt: m.serverTimestamp(),
        });
      }
    } catch (error) {
      console.warn("[AutoSelect] quiz result write failed", error);
    }
  }
  return pushLocal(KEYS.quiz, { id: uid("quiz"), ...record });
}

export async function listLeads({ limit = 300 } = {}) {
  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      const snap = await m.getDocs(
        m.query(m.collection(f.db, "leads"), m.orderBy("createdAt", "desc"), m.limit(limit))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.warn("[AutoSelect] leads fallback", error);
    }
  }
  return readLocal(KEYS.leads).slice(0, limit);
}

export async function updateLeadStatus(id, status) {
  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      await m.updateDoc(m.doc(f.db, "leads", id), { status });
      return;
    } catch (error) {
      console.warn("[AutoSelect] update lead failed", error);
    }
  }
  const leads = readLocal(KEYS.leads);
  const lead = leads.find((item) => item.id === id);
  if (lead) {
    lead.status = status;
    storageSet(KEYS.leads, leads);
  }
}

/* ------------------------------------------------------------------ */
/* Admin CRUD / seeding / uploads                                      */
/* ------------------------------------------------------------------ */

function firestoreWriteError(error, action) {
  const code = String(error?.code || "");
  const uid = firebaseSdk.auth?.currentUser?.uid || "signed out";
  console.error(`[AutoSelect] ${action} failed for ${uid}`, error);
  if (code === "permission-denied") {
    return new Error(
      `Firestore blocked this ${action} for account ${uid}. Make sure you are signed in with the dealer admin account and the latest security rules are deployed.`
    );
  }
  if (code === "invalid-argument") {
    return new Error(`Firestore rejected the ${action} data: ${error.message}`);
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return new Error("Firestore did not respond. Check your connection and try again.");
  }
  return new Error(`Could not ${action}. ${error?.message || "Check Firestore permissions."}`);
}

export async function saveVehicle(input = {}) {
  const existing = input.id ? await getVehicle(input.id) : null;
  const id = input.id || `${input.make || "vehicle"}-${Date.now().toString(36)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  const now = existing?.createdAt || nowIso();
  const numberOr = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const transmission = String(input.transmission || "Automatic");
  const record = {
    make: String(input.make || "").trim(),
    model: String(input.model || "").trim(),
    trim: String(input.trim || "").trim(),
    year: numberOr(input.year, new Date().getFullYear()),
    price: numberOr(input.price),
    msrp: numberOr(input.msrp),
    mileage: numberOr(input.mileage),
    bodyStyle: input.bodyStyle || "SUV",
    fuelType: input.fuelType || "Gasoline",
    transmission,
    transmissionCategory: input.transmissionCategory || (transmission.toLowerCase().includes("manual") ? "Manual" : "Automatic"),
    drivetrain: input.drivetrain || "FWD",
    engine: String(input.engine || "").trim(),
    mpg: numberOr(input.mpg),
    mpgCity: numberOr(input.mpgCity),
    mpgHwy: numberOr(input.mpgHwy),
    rangeMiles: input.rangeMiles ? numberOr(input.rangeMiles) : null,
    seats: numberOr(input.seats, 5),
    exteriorColor: String(input.exteriorColor || "").trim(),
    interiorColor: String(input.interiorColor || "").trim(),
    vin: String(input.vin || "").trim().toUpperCase(),
    stockNumber: String(input.stockNumber || `AS-${Math.floor(1000 + Math.random() * 9000)}`).trim(),
    images: Array.isArray(input.images) ? input.images.filter(Boolean).slice(0, 24) : [],
    featured: Boolean(input.featured),
    status: input.status || "available",
    dealRating: String(input.dealRating || "Fair Market Price").trim(),
    belowMarketAmount: numberOr(input.belowMarketAmount),
    certified: Boolean(input.certified),
    inspected150: Boolean(input.inspected150),
    carfaxClean: Boolean(input.carfaxClean),
    oneOwner: Boolean(input.oneOwner),
    features: Array.isArray(input.features) ? input.features.filter(Boolean) : [],
    inspection: {
      brakeLife: numberOr(input.inspection?.brakeLife, 85),
      tireTread: numberOr(input.inspection?.tireTread, 8),
      battery: input.inspection?.battery || "100% Pass",
      fluids: input.inspection?.fluids || "Fresh Service A",
    },
    location: input.location || "Dallas, TX",
    viewCount: numberOr(input.viewCount, 0),
    createdAt: now,
    updatedAt: nowIso(),
  };

  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      const createdAt = existing?.createdAt;
      const payload = {
        ...record,
        createdAt:
          createdAt && typeof createdAt.toDate === "function" ? createdAt : m.serverTimestamp(),
      };
      await m.setDoc(m.doc(f.db, "vehicles", id), payload, { merge: true });
      clearCache();
      return { id, ...record };
    } catch (error) {
      throw firestoreWriteError(error, "save vehicle");
    }
  }

  const list = localVehicles();
  const index = list.findIndex((vehicle) => vehicle.id === id);
  if (index >= 0) list[index] = { id, ...record };
  else list.unshift({ id, ...record });
  writeLocalVehicles(list);
  return { id, ...record };
}

export async function deleteVehicle(id) {
  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      await m.deleteDoc(m.doc(f.db, "vehicles", id));
      clearCache();
      return true;
    } catch (error) {
      throw firestoreWriteError(error, "delete vehicle");
    }
  }
  writeLocalVehicles(localVehicles().filter((vehicle) => vehicle.id !== id));
  return true;
}

export async function seedDemoInventory() {
  const f = await live();
  const vehicles = clone(demoVehicles);
  const reviews = clone(demoReviews);
  if (f) {
    try {
      const m = f.firestoreModule;
      const jobs = [];
      vehicles.forEach((vehicle) => {
        const { id, ...data } = vehicle;
        jobs.push({ ref: m.doc(f.db, "vehicles", id), data: { ...data, createdAt: m.serverTimestamp() } });
      });
      for (let i = 0; i < jobs.length; i += 400) {
        const batch = m.writeBatch(f.db);
        jobs.slice(i, i + 400).forEach(({ ref, data }) => batch.set(ref, data));
        await batch.commit();
      }
      const reviewJobs = reviews.map((review) => {
        const { id, ...data } = review;
        return { ref: m.doc(f.db, "reviews", id), data: { ...data, createdAt: m.serverTimestamp() } };
      });
      for (let i = 0; i < reviewJobs.length; i += 400) {
        const batch = m.writeBatch(f.db);
        reviewJobs.slice(i, i + 400).forEach(({ ref, data }) => batch.set(ref, data));
        await batch.commit();
      }
    } catch (error) {
      throw firestoreWriteError(error, "seed demo inventory");
    }
    clearCache();
    return vehicles.length;
  }
  storageSet(KEYS.vehicles, vehicles);
  storageSet(KEYS.reviews, reviews);
  clearCache();
  window.dispatchEvent(new CustomEvent("as:vehicles-changed"));
  return vehicles.length;
}

/**
 * Upsert a fixed set of listings without touching the rest of the inventory.
 * Used to publish the Cars & Bids imports bundled in `demo-data.js`; once they
 * land in Firestore they can be edited or deleted from the portal like any
 * other vehicle.
 */
export async function importVehicles(list = []) {
  const incoming = (Array.isArray(list) ? list : []).filter((vehicle) => vehicle?.id);
  if (!incoming.length) return 0;

  const f = await live();
  if (f) {
    try {
      const m = f.firestoreModule;
      const jobs = incoming.map((vehicle) => {
        const { id, createdAt, ...data } = vehicle;
        const date = createdAt ? new Date(createdAt) : null;
        return {
          ref: m.doc(f.db, "vehicles", id),
          data: {
            ...data,
            updatedAt: m.serverTimestamp(),
            createdAt:
              date && !Number.isNaN(date.getTime())
                ? m.Timestamp.fromDate(date)
                : m.serverTimestamp(),
          },
        };
      });
      for (let index = 0; index < jobs.length; index += 400) {
        const batch = m.writeBatch(f.db);
        jobs.slice(index, index + 400).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
        await batch.commit();
      }
    } catch (error) {
      throw firestoreWriteError(error, "import vehicles");
    }
    clearCache();
    return incoming.length;
  }

  const current = localVehicles();
  incoming.forEach((vehicle) => {
    const index = current.findIndex((item) => item.id === vehicle.id);
    if (index >= 0) current[index] = { ...current[index], ...vehicle };
    else current.unshift({ ...vehicle });
  });
  writeLocalVehicles(current);
  return incoming.length;
}

export async function resetDemoInventory() {
  const f = await live();
  if (f) return false;
  storageSet(KEYS.vehicles, clone(demoVehicles));
  storageSet(KEYS.reviews, clone(demoReviews));
  clearCache();
  window.dispatchEvent(new CustomEvent("as:vehicles-changed"));
  return true;
}

async function compressImage(file, maxWidth = 1200, quality = 0.78) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

let storageReady = null;

/**
 * A missing bucket makes the Storage SDK retry for minutes, so probe the
 * bucket first and embed images immediately when Storage is not provisioned.
 */
async function storageBucketAvailable() {
  if (storageReady !== null) return storageReady;
  const bucket = firebaseSdk.app?.options?.storageBucket;
  if (!bucket) {
    storageReady = false;
    return storageReady;
  }
  try {
    const response = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${bucket}/o`,
      { method: "GET" }
    );
    storageReady = response.status !== 404;
  } catch {
    storageReady = false;
  }
  return storageReady;
}

/**
 * Uploads an image to Firebase Storage, or embeds a compressed copy in the
 * listing when Storage is not provisioned for the project.
 * @returns {Promise<string>} public URL or data URL
 */
export async function uploadVehicleImage(file, vehicleId = "vehicle") {
  if (!file || !/^image\//.test(file.type)) {
    throw new Error("Please choose an image file (JPG, PNG or WebP).");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Images must be smaller than 8 MB.");
  }
  const f = await live();
  if (f && f.storage && (await storageBucketAvailable())) {
    try {
      const m = f.storageModule;
      const safeName = file.name.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();
      const ref = m.ref(f.storage, `vehicles/${vehicleId}/${Date.now()}-${safeName}`);
      await m.uploadBytes(ref, file, { contentType: file.type });
      return m.getDownloadURL(ref);
    } catch (error) {
      if (storageUnavailable(error)) return compressForFirestore(file);
      throw storageUploadError(error);
    }
  }
  return compressForFirestore(file);
}

/** Trade-in photos are uploaded by the public, so they live outside vehicles/. */
export async function uploadValuationImage(file) {
  if (!file || !/^image\//.test(file.type)) {
    throw new Error("Please choose an image file (JPG, PNG or WebP).");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Images must be smaller than 8 MB.");
  }
  const f = await live();
  if (f && f.storage && (await storageBucketAvailable())) {
    try {
      const m = f.storageModule;
      const safeName = file.name.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();
      const ref = m.ref(f.storage, `valuations/${Date.now()}-${safeName}`);
      await m.uploadBytes(ref, file, { contentType: file.type });
      return m.getDownloadURL(ref);
    } catch (error) {
      if (storageUnavailable(error)) return compressForFirestore(file, 800, 0.6);
      throw storageUploadError(error);
    }
  }
  return compressForFirestore(file, 800, 0.6);
}

function storageUnavailable(error) {
  const code = error?.code || "";
  const message = String(error?.message || "");
  return (
    code === "storage/bucket-not-found" ||
    code === "storage/unknown" ||
    /bucket[\s\S]*not[\s\S]*found/i.test(message) ||
    /\b404\b/.test(message)
  );
}

/**
 * Firebase Storage requires a provisioned bucket (Blaze plan). Until one
 * exists, photos are embedded as compressed data URLs so listings still work.
 */
async function compressForFirestore(file, maxWidth = 900, quality = 0.62) {
  let data = await compressImage(file, maxWidth, quality);
  for (const [width, nextQuality] of [[720, 0.5], [600, 0.42]]) {
    if (data.length <= 200000) break;
    data = await compressImage(file, width, nextQuality);
  }
  if (data.length > 300000) {
    throw new Error(
      "That photo is too large to embed without Firebase Storage. Try a smaller image or use Add by URL."
    );
  }
  return data;
}

function storageUploadError(error) {
  const code = error?.code || "";
  if (
    code === "storage/unauthorized" ||
    code === "storage/bucket-not-found" ||
    code === "storage/unknown" ||
    code === "storage/retry-limit-exceeded"
  ) {
    return new Error(
      "Photo upload failed. Confirm Firebase Storage is enabled for this project and storage.rules is deployed, then try again."
    );
  }
  return error instanceof Error ? error : new Error("Photo upload failed.");
}

/* ------------------------------------------------------------------ */
/* Dashboard metrics                                                   */
/* ------------------------------------------------------------------ */

export async function getDashboardStats() {
  const all = await getAllVehicles();
  const leads = await listLeads({ limit: 500 });
  const weekAgo = Date.now() - 7 * 86400000;
  const leadsThisWeek = leads.filter((lead) => timestampOf(lead.createdAt) >= weekAgo).length;
  const mostViewed = [...all]
    .filter((vehicle) => PUBLIC_STATUSES.includes(vehicle.status || "available"))
    .sort((a, b) => Number(b.viewCount || 0) - Number(a.viewCount || 0))
    .slice(0, 5);
  return {
    totalStock: all.length,
    availableStock: all.filter((v) => (v.status || "available") === "available").length,
    leadsThisWeek,
    totalLeads: leads.length,
    newLeads: leads.filter((l) => l.status === "new").length,
    mostViewed,
  };
}

/* ------------------------------------------------------------------ */
/* Extras used by the UI                                               */
/* ------------------------------------------------------------------ */

/** Format helper re-exported for cards (keeps imports small). */
export const formatters = { formatCurrency, formatDate, formatMileage, escapeHtml };

export { clearCache };
