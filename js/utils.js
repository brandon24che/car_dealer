/**
 * Small DOM / formatting / URL helpers shared across the site.
 */

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Escape a value for safe interpolation into HTML. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatCurrency(value, options = {}) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: options.cents ? 2 : 0,
    minimumFractionDigits: options.cents ? 2 : 0,
  }).format(amount);
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

export function formatMileage(value) {
  const miles = Number(value) || 0;
  if (miles >= 1000) return `${(miles / 1000).toFixed(1).replace(/\.0$/, "")}k mi`;
  return `${formatNumber(miles)} mi`;
}

export function formatMilesExact(value) {
  return `${formatNumber(value)} mi`;
}

export function formatDate(value, options = {}) {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: options.year === false ? undefined : "numeric",
  });
}

export function timeAgo(value) {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date, { year: false });
}

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function uid(prefix = "id") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "AS";
}

/**
 * Root of the deployment, derived from this module's URL. Pages served by a
 * host's 404 handler (e.g. Vercel at /some/deep/path) still resolve correctly.
 */
const MODULE_BASE = (() => {
  try {
    const path = new URL("../", import.meta.url).pathname;
    return path.endsWith("/") ? path : `${path}/`;
  } catch {
    return "/";
  }
})();

export function getBasePath() {
  return MODULE_BASE;
}

/** Resolve a stored image path (relative demo path or absolute URL). */
export function resolveAsset(path) {
  if (!path) return `${getBasePath()}assets/placeholder-car.svg`;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return `${getBasePath()}${path.replace(/^\.?\//, "")}`;
}

export function getParam(name, url = window.location.href) {
  return new URL(url).searchParams.get(name);
}

export function setParams(updates, { replace = true } = {}) {
  const url = new URL(window.location.href);
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "" || value === false) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", url.toString());
}

export function storageGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function sessionGet(key, fallback = null) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function sessionSet(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function truncate(value, length = 120) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

export function humanBodyStyle(style) {
  const map = {
    SUV: "SUV",
    Sedan: "Sedan",
    Truck: "Truck",
    Coupe: "Coupe",
    Crossover: "Crossover",
    Minivan: "Minivan",
    Hatchback: "Hatchback",
  };
  return map[style] || style || "Vehicle";
}

export function humanFuel(fuel) {
  const map = {
    Gasoline: "Gasoline",
    Hybrid: "Hybrid",
    Electric: "Electric",
    Diesel: "Diesel",
    PlugInHybrid: "Plug-in Hybrid",
  };
  return map[fuel] || fuel || "Gasoline";
}

export function bodyStyleIcon(style) {
  const map = {
    SUV: "directions_car",
    Sedan: "commute",
    Truck: "local_shipping",
    Coupe: "sports_score",
    Crossover: "electric_car",
    Minivan: "airport_shuttle",
  };
  return map[style] || "directions_car";
}

/** Simple accessible focus trap helper for dialogs. */
export function trapFocus(container, event) {
  const focusable = qsa(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    container
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Build a `<select>` options string (already HTML-escaped). */
export function optionsHtml(options, selected = "", placeholder = "") {
  let html = placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : "";
  for (const option of options) {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    html += `<option value="${escapeHtml(value)}"${String(value) === String(selected) ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }
  return html;
}

/** Contact form / lead basic validation. */
export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export function isValidPhone(value) {
  return /^[\d\s()+.-]{7,20}$/.test(String(value).trim()) && String(value).replace(/\D/g, "").length >= 7;
}
