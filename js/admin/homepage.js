/**
 * Home page picks — curate the “Hand-Picked Vehicles” section by toggling the
 * featured flag on inventory records (the homepage shows the four newest).
 */

import { bulkUpdateVehicles } from "../data-store.js?v=20261112a";
import { showToast } from "../ui.js?v=20261112a";
import { escapeHtml, formatCurrency, formatMileage, qs } from "../utils.js?v=20261112a";
import { assetPath, timeValue, vehicleName, vehicleThumb } from "./helpers.js?v=20261112a";
import { openVehicleEditor } from "./inventory.js?v=20261112a";

const MAX_PICKS = 4;
const PUBLIC_STATUSES = new Set(["available", "reserved"]);

let vehicles = [];
let context = {};
let search = "";
let busy = false;

const byNewest = (a, b) => timeValue(b.createdAt) - timeValue(a.createdAt);
const isPublic = (vehicle) => PUBLIC_STATUSES.has(vehicle?.status || "available");

function featuredPicks() {
  return vehicles.filter((vehicle) => vehicle.featured && isPublic(vehicle)).sort(byNewest);
}

function candidates() {
  const needle = search.trim().toLowerCase();
  return vehicles
    .filter((vehicle) => isPublic(vehicle) && !vehicle.featured)
    .filter((vehicle) => {
      if (!needle) return true;
      return [vehicleName(vehicle), vehicle.stockNumber, vehicle.vin, vehicle.exteriorColor, vehicle.bodyStyle]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort(byNewest)
    .slice(0, 8);
}

/* ------------------------------------------------------------------ */
/* Markup                                                              */
/* ------------------------------------------------------------------ */

function pickCard(vehicle, index) {
  const name = vehicleName(vehicle);
  const extra = index >= MAX_PICKS;
  return `<article class="adm-pick${extra ? " is-extra" : ""}">
    <div class="adm-pick__top">
      <span class="adm-pick__spot">${extra ? "Not shown" : `Spot ${index + 1}`}</span>
      <span class="adm-pick__price">${formatCurrency(Number(vehicle.price) || 0)}</span>
    </div>
    <img class="adm-pick__thumb" src="${escapeHtml(assetPath(vehicleThumb(vehicle), 320))}" alt="" loading="lazy" width="320" height="200">
    <div class="adm-pick__body">
      <strong>${escapeHtml(name)}</strong>
      <span class="adm-pick__meta">${escapeHtml(vehicle.stockNumber || "No stock #")} · ${formatMileage(Number(vehicle.mileage) || 0)}</span>
      <span class="adm-pick__meta">${escapeHtml(vehicle.tagline || vehicle.dealRating || "")}</span>
    </div>
    <div class="adm-pick__actions">
      <a class="adm-icon-btn" href="../vehicle.html?id=${encodeURIComponent(vehicle.id)}" target="_blank" rel="noopener" aria-label="View ${escapeHtml(name)} on the site">
        <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
      </a>
      <button class="adm-icon-btn" type="button" data-home-edit="${escapeHtml(vehicle.id)}" aria-label="Edit ${escapeHtml(name)}">
        <span class="material-symbols-outlined" aria-hidden="true">edit</span>
      </button>
      <button class="adm-icon-btn adm-icon-btn--danger" type="button" data-home-remove="${escapeHtml(vehicle.id)}" aria-label="Remove ${escapeHtml(name)} from the homepage">
        <span class="material-symbols-outlined" aria-hidden="true">star</span>
      </button>
    </div>
  </article>`;
}

function emptySlot(index) {
  return `<article class="adm-pick adm-pick--empty">
    <span class="adm-pick__spot">Spot ${index + 1}</span>
    <span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span>
    <p><strong>Open spot</strong><span>Pick a car below to fill it.</span></p>
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function renderPicks() {
  const list = featuredPicks();
  const host = qs("[data-home-picks]");
  if (host) {
    const slots = [];
    for (let index = 0; index < Math.max(MAX_PICKS, list.length); index += 1) {
      slots.push(list[index] ? pickCard(list[index], index) : emptySlot(index));
    }
    host.innerHTML = slots.join("");
  }

  const counter = qs("[data-home-count]");
  if (counter) counter.textContent = `${Math.min(list.length, MAX_PICKS)} / ${MAX_PICKS}`;
  const nav = qs("[data-count-home]");
  if (nav) nav.textContent = String(list.length);

  const hint = qs("[data-home-hint]");
  if (hint) {
    hint.textContent =
      list.length > MAX_PICKS
        ? `${list.length} cars are featured, but the homepage only shows the four newest. Remove the extras marked “Not shown”.`
        : list.length >= MAX_PICKS
          ? "All four spots are filled. Remove a pick to swap in another car."
          : list.length
            ? "Newest featured cars appear first. Empty spots stay hidden on the homepage."
            : "Nothing is featured yet, so the homepage falls back to the four newest listings.";
  }
}

function renderCandidates() {
  const host = qs("[data-home-candidates]");
  const full = featuredPicks().length >= MAX_PICKS;
  const list = candidates();
  const shown = qs("[data-home-shown]");
  if (shown) shown.textContent = String(list.length);
  if (!host) return;

  if (!list.length) {
    host.innerHTML = `<div class="adm-empty adm-empty--inline">
      <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">search_off</span></div>
      <h3>No cars to add</h3>
      <p>${search ? "No available car matches that search." : "Every available car is already featured."}</p>
    </div>`;
    return;
  }

  host.innerHTML = list
    .map(
      (vehicle) => `<article class="adm-cand">
        <img class="adm-cand__thumb" src="${escapeHtml(assetPath(vehicleThumb(vehicle), 160))}" alt="" loading="lazy" width="64" height="46">
        <div class="adm-cand__body">
          <strong>${escapeHtml(vehicleName(vehicle))}</strong>
          <span>${escapeHtml(vehicle.stockNumber || "No stock #")} · ${formatCurrency(Number(vehicle.price) || 0)} · ${formatMileage(Number(vehicle.mileage) || 0)}</span>
        </div>
        <button class="btn btn--ghost btn--sm" type="button" data-home-add="${escapeHtml(vehicle.id)}"${full ? " disabled" : ""}>
          <span class="material-symbols-outlined" aria-hidden="true">star</span>Add to homepage
        </button>
      </article>`
    )
    .join("");
}

function render() {
  renderPicks();
  renderCandidates();
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

async function setFeatured(id, value) {
  if (busy) return;
  const vehicle = vehicles.find((item) => item.id === id);
  if (!vehicle) return;
  if (value && featuredPicks().length >= MAX_PICKS) {
    showToast("All four homepage spots are filled. Remove a pick first.", "info");
    return;
  }
  busy = true;
  try {
    await bulkUpdateVehicles([{ ...vehicle, featured: value }]);
    showToast(
      value
        ? `${vehicleName(vehicle)} added to the homepage.`
        : `${vehicleName(vehicle)} removed from the homepage.`,
      "success"
    );
    await context.reload?.();
  } catch (error) {
    console.error("[AutoSelect] homepage pick update failed", error);
    showToast(error.message || "Could not update the homepage picks.", "error");
  } finally {
    busy = false;
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

export function refreshHomepage(list = []) {
  vehicles = Array.isArray(list) ? list : [];
  render();
}

export function initHomepage(options = {}) {
  context = { ...context, ...options };

  document.addEventListener("click", (event) => {
    const add = event.target.closest("[data-home-add]");
    if (add) {
      setFeatured(add.dataset.homeAdd, true);
      return;
    }
    const remove = event.target.closest("[data-home-remove]");
    if (remove) {
      setFeatured(remove.dataset.homeRemove, false);
      return;
    }
    const edit = event.target.closest("[data-home-edit]");
    if (edit) {
      const vehicle = vehicles.find((item) => item.id === edit.dataset.homeEdit);
      if (vehicle) openVehicleEditor(vehicle);
    }
  });

  document.addEventListener("input", (event) => {
    const input = event.target.closest("[data-home-search]");
    if (!input) return;
    search = input.value;
    renderCandidates();
  });

  vehicles = context.getVehicles?.() || [];
  render();
}
