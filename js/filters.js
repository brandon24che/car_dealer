/**
 * Inventory filter helpers: human labels, removable chips and counts.
 * Shared by the inventory page, home search card and admin previews.
 */
import { escapeHtml, formatCurrency, humanFuel } from "./utils.js?v=20261102d";

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured Matches" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "mileage-asc", label: "Lowest Mileage" },
  { value: "newest", label: "Newest Arrivals" },
];

export const BODY_FILTERS = ["SUV", "Sedan", "Truck", "Coupe", "Crossover"];
export const FUEL_FILTERS = [
  { value: "Gasoline", label: "Gasoline" },
  { value: "Hybrid", label: "Hybrid" },
  { value: "Electric", label: "Electric" },
  { value: "PlugInHybrid", label: "Plug-in Hybrid" },
  { value: "Diesel", label: "Diesel" },
];

function compactMoney(value) {
  const amount = Number(value) || 0;
  if (amount >= 1000 && amount % 1000 === 0) return `$${amount / 1000}k`;
  return formatCurrency(amount);
}

/**
 * Turn a filter object into removable chips.
 * @returns {{key:string,value?:string,label:string,icon?:string}[]}
 */
export function activeFilterChips(filters = {}) {
  const chips = [];
  if (filters.search) {
    chips.push({ key: "search", label: `“${filters.search}”`, icon: "search" });
  }
  if (filters.make) {
    chips.push({ key: "make", label: filters.make });
  }
  if (filters.model) {
    chips.push({ key: "model", label: filters.model });
  }
  (filters.bodyStyles || []).forEach((body) => {
    chips.push({ key: "bodyStyles", value: body, label: body });
  });
  (filters.fuelTypes || []).forEach((fuel) => {
    chips.push({ key: "fuelTypes", value: fuel, label: humanFuel(fuel) });
  });
  if (filters.priceMax) {
    chips.push({ key: "priceMax", label: `Under ${compactMoney(filters.priceMax)}`, icon: "payments" });
  }
  if (filters.priceMin) {
    chips.push({ key: "priceMin", label: `From ${compactMoney(filters.priceMin)}` });
  }
  if (filters.yearMin) {
    chips.push({ key: "yearMin", label: `${filters.yearMin} or newer` });
  }
  if (filters.transmission) {
    chips.push({ key: "transmission", label: filters.transmission });
  }
  if (filters.inspected150) {
    chips.push({ key: "inspected150", label: "150-pt inspected", icon: "verified_user" });
  }
  if (filters.carfaxClean) {
    chips.push({ key: "carfaxClean", label: "Clean CARFAX", icon: "verified" });
  }
  if (filters.oneOwner) {
    chips.push({ key: "oneOwner", label: "1-Owner" });
  }
  return chips;
}

/** Clone-on-write removal of a single chip from a filter set. */
export function removeFilterChip(filters = {}, chip = {}) {
  const next = { ...filters };
  switch (chip.key) {
    case "search":
      next.search = "";
      break;
    case "make":
      next.make = "";
      next.model = "";
      break;
    case "model":
      next.model = "";
      break;
    case "bodyStyles":
      next.bodyStyles = (filters.bodyStyles || []).filter((item) => item !== chip.value);
      break;
    case "fuelTypes":
      next.fuelTypes = (filters.fuelTypes || []).filter((item) => item !== chip.value);
      break;
    case "priceMax":
      next.priceMax = null;
      break;
    case "priceMin":
      next.priceMin = null;
      break;
    case "yearMin":
      next.yearMin = null;
      break;
    case "transmission":
      next.transmission = "";
      break;
    default:
      if (chip.key in next) next[chip.key] = false;
  }
  return next;
}

export function countActiveFilters(filters = {}) {
  return activeFilterChips(filters).length;
}

/** Render the removable chip ribbon. */
export function renderFilterChips(filters = {}) {
  const chips = activeFilterChips(filters);
  if (!chips.length) return "";
  return `<div class="active-filters" data-filter-chips>
    ${chips
      .map(
        (chip, index) => `<button type="button" class="filter-chip" data-chip-index="${index}">
          ${chip.icon ? `<span class="material-symbols-outlined">${chip.icon}</span>` : ""}
          <span>${escapeHtml(chip.label)}</span>
          <span class="material-symbols-outlined">close</span>
        </button>`
      )
      .join("")}
    <button type="button" class="filter-chip filter-chip--clear" data-filter-clear>Clear All</button>
  </div>`;
}
