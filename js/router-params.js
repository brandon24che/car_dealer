/**
 * Shareable URL state for the inventory page and home search handoff.
 * Every inventory filter is encoded in the query string.
 */
import { normalizeFilters } from "./data-store.js?v=20261103a";

export const INVENTORY_KEYS = [
  "q",
  "body",
  "make",
  "model",
  "priceMin",
  "priceMax",
  "year",
  "transmission",
  "fuel",
  "inspected",
  "carfax",
  "owner",
  "sort",
  "view",
];

const list = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export function readInventoryState(url = window.location.href) {
  const params = new URL(url).searchParams;
  const number = (key) => {
    const raw = params.get(key);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    filters: normalizeFilters({
      search: params.get("q") || "",
      bodyStyles: list(params.get("body")),
      make: params.get("make") || "",
      model: params.get("model") || "",
      priceMin: number("priceMin"),
      priceMax: number("priceMax"),
      yearMin: number("year"),
      transmission: params.get("transmission") || "",
      fuelTypes: list(params.get("fuel")),
      inspected150: params.get("inspected") === "1",
      carfaxClean: params.get("carfax") === "1",
      oneOwner: params.get("owner") === "1",
    }),
    sort: params.get("sort") || "featured",
    view: params.get("view") === "list" ? "list" : "grid",
  };
}

export function inventorySearchParams(state = {}) {
  const filters = normalizeFilters(state.filters || {});
  const params = new URLSearchParams();
  const set = (key, value) => {
    if (value === null || value === undefined || value === "" || value === false) return;
    params.set(key, String(value));
  };

  set("q", filters.search);
  if (filters.bodyStyles.length) set("body", filters.bodyStyles.join(","));
  set("make", filters.make);
  set("model", filters.model);
  set("priceMin", filters.priceMin);
  set("priceMax", filters.priceMax);
  set("year", filters.yearMin);
  set("transmission", filters.transmission);
  if (filters.fuelTypes.length) set("fuel", filters.fuelTypes.join(","));
  if (filters.inspected150) set("inspected", "1");
  if (filters.carfaxClean) set("carfax", "1");
  if (filters.oneOwner) set("owner", "1");
  if (state.sort && state.sort !== "featured") set("sort", state.sort);
  if (state.view === "list") set("view", "list");

  return params;
}

export function inventoryUrl(state = {}, base = "inventory.html") {
  const query = inventorySearchParams(state).toString();
  return query ? `${base}?${query}` : base;
}

/**
 * Update the address bar without reloading. Unknown params are preserved.
 * @param {{filters:object, sort?:string, view?:string}} state
 * @param {{history?: "replace"|"push"}} options
 */
export function writeInventoryState(state, options = {}) {
  const url = new URL(window.location.href);
  INVENTORY_KEYS.forEach((key) => url.searchParams.delete(key));
  inventorySearchParams(state).forEach((value, key) => url.searchParams.set(key, value));
  const method = options.history === "push" ? "pushState" : "replaceState";
  window.history[method]({ ...window.history.state, inventory: true }, "", url.toString());
}

export function homeSearchUrl(values = {}) {
  return inventoryUrl({
    filters: {
      search: values.search || "",
      bodyStyles: values.body ? [values.body] : [],
      make: values.make || "",
      model: values.model || "",
      priceMax: values.priceMax || null,
      yearMin: values.yearMin || null,
      transmission: values.transmission || "",
    },
  });
}
