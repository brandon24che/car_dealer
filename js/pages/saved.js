/**
 * Saved vehicles page: shortlist summary, cards, compare seeding and
 * account sync status.
 */
import { getCurrentUser, watchUser } from "../auth.js?v=20261101a";
import {
  MAX_COMPARE,
  clearCompare,
  getCompareIds,
  initCompare,
  isCompared,
  openCompare,
  toggleCompare,
} from "../compare.js?v=20261101a";
import { getAllVehicles } from "../data-store.js?v=20261101a";
import { clearFavorites, getFavoriteIds, subscribeFavorites } from "../favorites.js?v=20261101a";
import { estimateMonthly, roundPayment } from "../finance.js?v=20261101a";
import { closeModal, mountShell, openModal, showToast } from "../ui.js?v=20261101a";
import { escapeHtml, formatCurrency, qs, qsa } from "../utils.js?v=20261101a";
import { initVehicleCards, renderVehicleCard } from "../vehicles.js?v=20261101a";

const state = {
  vehicles: [],
  favorites: getFavoriteIds(),
  loading: true,
  error: false,
};

function savedVehicles() {
  const byId = new Map(state.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  return state.favorites.map((id) => byId.get(id)).filter(Boolean);
}

function skeletonHtml(count = 3) {
  return Array.from(
    { length: count },
    () => `<div class="skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-card__media"></div>
      <div class="skeleton-card__body">
        <div class="skeleton skeleton-line skeleton-line--sm"></div>
        <div class="skeleton skeleton-line skeleton-line--lg"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line" style="height:44px"></div>
      </div>
    </div>`
  ).join("");
}

function renderSyncNote() {
  const note = qs("[data-sync-note]");
  if (!note) return;
  const icon = note.querySelector(".saved-sync__icon");
  const copy = note.querySelector("p");
  const user = getCurrentUser();
  if (user) {
    icon.textContent = "cloud_done";
    icon.classList.add("is-synced");
    copy.innerHTML = `<strong>Synced to ${escapeHtml(user.email)}.</strong> Your saved cars appear on every device you sign in to.`;
  } else {
    icon.textContent = "cloud_off";
    icon.classList.remove("is-synced");
    copy.innerHTML =
      'Saved on this device. <a href="login.html?redirect=saved.html">Sign in</a> to sync your shortlist across devices.';
  }
}

function render() {
  const grid = qs("#savedGrid");
  const empty = qs("#savedEmpty");
  const errorBox = qs("#savedError");
  const countEls = qsa("[data-saved-count]");
  const shortlistCount = qs("[data-shortlist-count]");
  const shortlistNoun = qs("[data-shortlist-noun]");
  const valueEl = qs("[data-saved-value]");
  const monthlyEl = qs("[data-saved-monthly]");
  const compareBtn = qs("[data-compare-saved]");
  const clearBtn = qs("[data-clear-saved]");

  if (state.loading) {
    countEls.forEach((el) => (el.textContent = "—"));
    valueEl.textContent = "—";
    monthlyEl.textContent = "—";
    shortlistCount.textContent = "—";
    shortlistNoun.textContent = "vehicles";
    compareBtn.disabled = true;
    clearBtn.disabled = true;
    return;
  }

  if (state.error) {
    grid.hidden = true;
    empty.hidden = true;
    errorBox.hidden = false;
    countEls.forEach((el) => (el.textContent = "—"));
    valueEl.textContent = "—";
    monthlyEl.textContent = "—";
    shortlistCount.textContent = "—";
    shortlistNoun.textContent = "vehicles";
    compareBtn.disabled = true;
    clearBtn.disabled = true;
    grid.setAttribute("aria-busy", "false");
    return;
  }

  const saved = savedVehicles();
  const count = saved.length;
  const totalValue = saved.reduce((sum, vehicle) => sum + (Number(vehicle.price) || 0), 0);
  const totalMonthly = saved.reduce(
    (sum, vehicle) => sum + roundPayment(estimateMonthly(vehicle.price)),
    0
  );

  countEls.forEach((el) => (el.textContent = String(count)));
  valueEl.textContent = count ? formatCurrency(totalValue) : "—";
  monthlyEl.textContent = count ? `${formatCurrency(totalMonthly)}/mo` : "—";
  shortlistCount.textContent = String(count);
  shortlistNoun.textContent = count === 1 ? "vehicle" : "vehicles";
  compareBtn.disabled = count < 2;
  compareBtn.title = count < 2 ? "Save at least two vehicles to compare them." : "";
  clearBtn.disabled = !count;

  errorBox.hidden = true;
  grid.hidden = !count;
  empty.hidden = count > 0;
  grid.setAttribute("aria-busy", "false");

  if (count) {
    grid.innerHTML = saved.map((vehicle) => renderVehicleCard(vehicle)).join("");
    initVehicleCards();
  } else {
    grid.innerHTML = "";
  }

  renderSyncNote();
}

async function load() {
  state.loading = true;
  state.error = false;
  const grid = qs("#savedGrid");
  if (grid) {
    grid.hidden = false;
    grid.innerHTML = skeletonHtml();
    grid.setAttribute("aria-busy", "true");
  }
  qs("#savedError").hidden = true;
  qs("#savedEmpty").hidden = true;
  render();
  try {
    state.vehicles = await getAllVehicles();
  } catch (error) {
    console.warn("[AutoSelect] saved vehicles load failed", error);
    state.error = true;
  }
  state.loading = false;
  render();
}

function compareSaved() {
  const saved = savedVehicles();
  if (saved.length < 2) {
    showToast("Save at least two vehicles to compare them.", "info");
    return;
  }
  clearCompare();
  saved.slice(0, MAX_COMPARE).forEach((vehicle) => {
    if (!isCompared(vehicle.id)) toggleCompare(vehicle.id);
  });
  openCompare();
}

function bindEvents() {
  qs("[data-compare-saved]")?.addEventListener("click", compareSaved);

  qs("[data-clear-saved]")?.addEventListener("click", () => openModal("savedClearModal"));

  document.addEventListener("click", async (event) => {
    const confirm = event.target.closest("[data-clear-confirm]");
    if (!confirm) return;
    confirm.disabled = true;
    await clearFavorites();
    confirm.disabled = false;
    closeModal("savedClearModal");
    showToast("Shortlist cleared. Your saved cars were removed.", "info");
  });

  qs("[data-retry-saved]")?.addEventListener("click", () => load());

  subscribeFavorites((ids) => {
    state.favorites = ids;
    if (!state.loading) render();
  });

  watchUser(renderSyncNote);
  window.addEventListener("as:vehicles-changed", () => load());
}

async function boot() {
  await mountShell({ active: "saved" });
  initCompare();
  initVehicleCards();
  bindEvents();
  renderSyncNote();
  load();
}

boot();
