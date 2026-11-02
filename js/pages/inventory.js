/**
 * Inventory browser: URL-synced filters, sort, grid/list layouts, cursor
 * pagination and the compare tray.
 */
import { initCompare } from "../compare.js?v=20261102f";
import { getFacets, normalizeFilters, queryVehicles, watchVehicleCount } from "../data-store.js?v=20261102f";
import {
  activeFilterChips,
  BODY_FILTERS,
  countActiveFilters,
  FUEL_FILTERS,
  removeFilterChip,
  renderFilterChips,
  SORT_OPTIONS,
} from "../filters.js?v=20261102f";
import { readInventoryState, writeInventoryState } from "../router-params.js?v=20261102f";
import { bindRange, mountShell, showToast } from "../ui.js?v=20261102f";
import {
  debounce,
  escapeHtml,
  formatCurrency,
  formatNumber,
  optionsHtml,
  qs,
  trapFocus,
} from "../utils.js?v=20261102f";
import { initVehicleCards, renderCardSkeletons, renderVehicleCard } from "../vehicles.js?v=20261102f";

const PAGE_SIZE = 10;
let state = readInventoryState();
let facets = {
  total: 0,
  bodyCounts: {},
  fuelCounts: {},
  maxPrice: 80000,
  minYear: 2018,
  makes: [],
};
let items = [];
let cursor = null;
let total = 0;
let loadToken = 0;
let loading = false;

const panel = qs("#filterPanel");
const backdrop = qs(".filter-backdrop");
const feed = qs("#inventoryFeed");
const price = qs("#invPrice");
const priceLabel = qs("#invPriceLabel");
const priceCap = qs("#invPriceCap");
const makeSelect = qs("#invMake");
const modelSelect = qs("#invModel");
const yearSelect = qs("#invYear");
const sortSelect = qs("#invSort");
const searchInput = qs("#invSearch");
const searchClear = qs("[data-search-clear]");
const chipRibbon = qs("#chipRibbon");
const loadMoreWrap = qs("#loadMoreWrap");
const loadMoreBtn = qs("#loadMoreBtn");
const showing = qs("[data-showing]");

const currentYear = new Date().getFullYear();

function priceCapValue() {
  return Number(price?.max || facets.maxPrice || 80000);
}

function syncChrome() {
  chipRibbon.innerHTML = renderFilterChips(state.filters);
  const activeCount = countActiveFilters(state.filters);
  const badge = qs("[data-filter-badge]");
  if (badge) {
    badge.textContent = String(activeCount);
    badge.classList.toggle("is-visible", activeCount > 0);
  }
  qs("[data-filter-foot-count]")?.replaceChildren(document.createTextNode(formatNumber(total)));
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (searchClear) searchClear.hidden = !searchInput.value;
}

function updatePriceLabel() {
  const cap = priceCapValue();
  const value = Number(price.value);
  const active = value < cap;
  if (priceLabel) priceLabel.textContent = active ? `Up to ${formatCurrency(value)}` : "Any price";
  price.style.setProperty("--range-pct", `${((value - Number(price.min)) / (Number(price.max) - Number(price.min))) * 100}%`);
}

function modelOptions(selected = "") {
  const entry = facets.makes.find((item) => item.make === makeSelect.value);
  if (!entry) {
    modelSelect.innerHTML = `<option value="">Any model</option>`;
    modelSelect.disabled = true;
    return;
  }
  modelSelect.disabled = false;
  modelSelect.innerHTML = optionsHtml(
    entry.models.map((model) => ({ value: model.model, label: `${model.model} (${model.count})` })),
    selected,
    "Any model"
  );
}

function populateFacets() {
  // Price
  price.max = String(facets.maxPrice || 80000);
  if (priceCap) priceCap.textContent = formatCurrency(facets.maxPrice || 80000);
  price.value = String(state.filters.priceMax || price.max);
  updatePriceLabel();

  // Body styles
  const bodies = [...new Set([...BODY_FILTERS, ...Object.keys(facets.bodyCounts || {})])];
  const bodyHost = qs("#bodyFilters");
  bodyHost.innerHTML = bodies
    .map(
      (body) => `<label class="filter-check">
        <input type="checkbox" data-body="${escapeHtml(body)}"${state.filters.bodyStyles.includes(body) ? " checked" : ""}>
        <span>${escapeHtml(body)}s</span>
        <span class="filter-count">${formatNumber(facets.bodyCounts[body] || 0)}</span>
      </label>`
    )
    .join("");

  // Fuel
  const fuelHost = qs("#fuelFilters");
  fuelHost.innerHTML = FUEL_FILTERS.map((fuel) => {
    const count = fuel.value === "Hybrid"
      ? (facets.fuelCounts.Hybrid || 0) + (facets.fuelCounts.PlugInHybrid || 0)
      : facets.fuelCounts[fuel.value] || 0;
    return `<label class="filter-check">
      <input type="checkbox" data-fuel="${escapeHtml(fuel.value)}"${state.filters.fuelTypes.includes(fuel.value) ? " checked" : ""}>
      <span>${escapeHtml(fuel.label)}</span>
      <span class="filter-count">${formatNumber(count)}</span>
    </label>`;
  }).join("");

  // Makes + models
  makeSelect.innerHTML = optionsHtml(
    facets.makes.map((entry) => ({ value: entry.make, label: `${entry.make} (${entry.count})` })),
    state.filters.make,
    "Any make"
  );
  modelOptions(state.filters.model);

  // Years
  const years = [];
  for (let year = currentYear + 1; year >= 2014; year -= 1) {
    years.push({ value: year, label: `${year} or newer` });
  }
  yearSelect.innerHTML = optionsHtml(years, state.filters.yearMin, "Any year");
}

function syncControls() {
  price.max = String(facets.maxPrice || price.max || 80000);
  price.value = String(state.filters.priceMax || price.max);
  if (priceCap) priceCap.textContent = formatCurrency(price.max);
  updatePriceLabel();

  document.querySelectorAll("[data-body]").forEach((input) => {
    input.checked = state.filters.bodyStyles.includes(input.dataset.body);
  });
  document.querySelectorAll("[data-fuel]").forEach((input) => {
    input.checked = state.filters.fuelTypes.includes(input.dataset.fuel);
  });
  makeSelect.value = state.filters.make;
  modelOptions(state.filters.model);
  yearSelect.value = state.filters.yearMin ? String(state.filters.yearMin) : "";
  document.querySelectorAll("[data-transmission]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.transmission === state.filters.transmission);
  });
  qs("#invInspected").checked = state.filters.inspected150;
  qs("#invCarfax").checked = state.filters.carfaxClean;
  qs("#invOwner").checked = state.filters.oneOwner;
  searchInput.value = state.filters.search;
  sortSelect.value = state.sort;
  syncChrome();
}

function updateShowing() {
  const countEl = qs("[data-result-count]");
  if (countEl) countEl.textContent = formatNumber(total);
  if (showing) {
    showing.textContent = total
      ? `Showing 1–${items.length} of ${formatNumber(total)} vehicles`
      : "No vehicles match these filters";
  }
  loadMoreWrap.hidden = !(items.length > 0 && items.length < total);
  qs("[data-load-note]")?.replaceChildren(
    document.createTextNode(`${formatNumber(Math.max(0, total - items.length))} more certified vehicles available`)
  );
  qs("[data-filter-foot-count]")?.replaceChildren(document.createTextNode(formatNumber(total)));
}

function interstitial() {
  return `<div class="tradein-inline">
    <span class="tradein-inline__icon" aria-hidden="true"><span class="material-symbols-outlined">price_change</span></span>
    <div class="tradein-inline__copy">
      <span class="tradein-inline__eyebrow">Limited offer</span>
      <h3>Get $500 more for your trade this weekend</h3>
      <p>Apply your trade value directly to this purchase, plus complimentary 50-state home delivery.</p>
    </div>
    <a class="btn btn--primary btn--sm" href="sell.html">Value my trade <span class="material-symbols-outlined">arrow_forward</span></a>
  </div>`;
}

function renderResults() {
  feed.className = `cards-grid${state.view === "list" ? " cards-list" : ""}`;
  feed.setAttribute("aria-busy", "false");
  if (!items.length) {
    feed.innerHTML = `<div class="state">
      <div class="state__icon"><span class="material-symbols-outlined">search_off</span></div>
      <h3>No vehicles match these filters</h3>
      <p>Try widening your budget, removing a body style, or searching a different make.</p>
      <div class="state__actions">
        <button type="button" class="btn btn--primary" data-filter-reset>Clear all filters</button>
        <a class="btn btn--ghost" href="quiz.html">Take the match quiz</a>
      </div>
    </div>`;
    return;
  }
  const variant = state.view === "list" ? "list" : "default";
  feed.innerHTML = items
    .map((vehicle, index) => {
      const card = renderVehicleCard(vehicle, { variant });
      return index === 1 ? `${card}${interstitial()}` : card;
    })
    .join("");
}

async function load({ append = false } = {}) {
  if (append && loading) return;
  const token = ++loadToken;
  loading = true;
  feed.setAttribute("aria-busy", "true");
  if (append) {
    loadMoreBtn.disabled = true;
  } else {
    items = [];
    cursor = null;
    total = 0;
    feed.className = "cards-grid";
    feed.innerHTML = renderCardSkeletons(6);
    loading = true;
  }

  try {
    const result = await queryVehicles({
      filters: state.filters,
      sort: state.sort,
      limit: PAGE_SIZE,
      offset: append ? items.length : 0,
      startAfterDoc: append ? cursor : null,
    });
    if (token !== loadToken) return;
    items = append ? [...items, ...result.items] : result.items;
    cursor = result.cursor || null;
    total = Number(result.total) || items.length;
    renderResults();
    updateShowing();
  } catch (error) {
    console.error("[AutoSelect] inventory load failed", error);
    if (token !== loadToken) return;
    feed.setAttribute("aria-busy", "false");
    feed.innerHTML = `<div class="state">
      <div class="state__icon"><span class="material-symbols-outlined">cloud_off</span></div>
      <h3>Inventory is temporarily unavailable</h3>
      <p>${escapeHtml(error?.message || "Please check your connection and try again.")}</p>
      <div class="state__actions"><button type="button" class="btn btn--primary" data-retry>Try again</button></div>
    </div>`;
  } finally {
    if (token === loadToken) {
      loading = false;
      loadMoreBtn.disabled = false;
      feed.setAttribute("aria-busy", "false");
    }
  }
}

function refresh({ syncUrl = true } = {}) {
  state.filters = normalizeFilters(state.filters);
  syncChrome();
  if (syncUrl) writeInventoryState(state);
  load();
}

function resetFilters() {
  state.filters = normalizeFilters({});
  searchInput.value = "";
  syncControls();
  refresh();
  showToast("All filters cleared.", "info");
}

function setView(view) {
  if (state.view === view) return;
  state.view = view;
  writeInventoryState(state);
  syncChrome();
  renderResults();
}

/* ------------------------------------------------------------------ */
/* Filter drawer                                                      */
/* ------------------------------------------------------------------ */

function openFilters() {
  panel.classList.add("is-open");
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add("modal-open");
  panel.querySelector("[data-filter-close]")?.focus({ preventScroll: true });
}

function closeFilters() {
  panel.classList.remove("is-open");
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove("modal-open");
}

/* ------------------------------------------------------------------ */
/* Bindings                                                           */
/* ------------------------------------------------------------------ */

function bindEvents() {
  // Price
  bindRange(price, updatePriceLabel);
  price.addEventListener("change", () => {
    const value = Number(price.value);
    state.filters.priceMax = value >= priceCapValue() ? null : value;
    refresh();
  });

  document.querySelectorAll("[data-transmission]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filters.transmission = button.dataset.transmission;
      document.querySelectorAll("[data-transmission]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      refresh();
    });
  });

  qs("#bodyFilters").addEventListener("change", (event) => {
    const input = event.target.closest("[data-body]");
    if (!input) return;
    const body = input.dataset.body;
    state.filters.bodyStyles = input.checked
      ? [...new Set([...state.filters.bodyStyles, body])]
      : state.filters.bodyStyles.filter((item) => item !== body);
    refresh();
  });

  qs("#fuelFilters").addEventListener("change", (event) => {
    const input = event.target.closest("[data-fuel]");
    if (!input) return;
    const fuel = input.dataset.fuel;
    state.filters.fuelTypes = input.checked
      ? [...new Set([...state.filters.fuelTypes, fuel])]
      : state.filters.fuelTypes.filter((item) => item !== fuel);
    refresh();
  });

  makeSelect.addEventListener("change", () => {
    state.filters.make = makeSelect.value;
    state.filters.model = "";
    modelOptions("");
    refresh();
  });
  modelSelect.addEventListener("change", () => {
    state.filters.model = modelSelect.value;
    refresh();
  });
  yearSelect.addEventListener("change", () => {
    state.filters.yearMin = yearSelect.value ? Number(yearSelect.value) : null;
    refresh();
  });
  qs("#invInspected").addEventListener("change", (event) => {
    state.filters.inspected150 = event.target.checked;
    refresh();
  });
  qs("#invCarfax").addEventListener("change", (event) => {
    state.filters.carfaxClean = event.target.checked;
    refresh();
  });
  qs("#invOwner").addEventListener("change", (event) => {
    state.filters.oneOwner = event.target.checked;
    refresh();
  });

  const debouncedSearch = debounce(() => {
    const value = searchInput.value.trim();
    if (value === state.filters.search) return;
    state.filters.search = value;
    refresh();
  }, 320);
  searchInput.addEventListener("input", () => {
    if (searchClear) searchClear.hidden = !searchInput.value;
    debouncedSearch();
  });
  searchClear?.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.hidden = true;
    state.filters.search = "";
    refresh();
    searchInput.focus();
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      state.filters.search = searchInput.value.trim();
      refresh();
    }
  });

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    refresh();
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  chipRibbon.addEventListener("click", (event) => {
    if (event.target.closest("[data-filter-clear]")) {
      resetFilters();
      return;
    }
    const chipButton = event.target.closest("[data-chip-index]");
    if (!chipButton) return;
    const chips = activeFilterChips(state.filters);
    const chip = chips[Number(chipButton.dataset.chipIndex)];
    if (!chip) return;
    state.filters = removeFilterChip(state.filters, chip);
    state.filters = normalizeFilters(state.filters);
    syncControls();
    refresh();
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-filter-reset]")) resetFilters();
    if (event.target.closest("[data-filter-open]")) openFilters();
    if (event.target.closest("[data-filter-close]") || event.target.closest("[data-filter-apply]")) closeFilters();
    if (event.target.closest("[data-retry]")) load();
  });

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && panel.classList.contains("is-open")) trapFocus(panel, event);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) closeFilters();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 1024) closeFilters();
  });

  loadMoreBtn.addEventListener("click", () => load({ append: true }));

  qs("[data-share]")?.addEventListener("click", async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Shareable inventory link copied.", "success");
    } catch {
      window.prompt("Copy this link", url);
    }
  });

  window.addEventListener("popstate", () => {
    state = readInventoryState();
    syncControls();
    load();
  });
}

async function init() {
  await mountShell({ active: "inventory" });
  initVehicleCards();
  initCompare();

  sortSelect.innerHTML = optionsHtml(SORT_OPTIONS, state.sort);
  bindEvents();

  facets = await getFacets().catch(() => facets);
  populateFacets();
  syncControls();
  await load();

  // Live total in the banner (single onSnapshot in Firebase mode).
  watchVehicleCount({}, (count) => {
    const banner = qs("[data-banner-count]");
    if (banner) banner.textContent = `${formatNumber(count)} Vehicles`;
  }).catch(() => {});
}

init();
