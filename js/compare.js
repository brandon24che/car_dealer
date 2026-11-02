/**
 * Compare tray: keeps up to three vehicles in a shortlist, rendered as a
 * floating tray and a side-by-side comparison sheet.
 */
import { getAllVehicles } from "./data-store.js?v=20261102d";
import { estimateMonthly, roundPayment } from "./finance.js?v=20261102d";
import { openModal, showToast } from "./ui.js?v=20261102d";
import {
  escapeHtml,
  formatCurrency,
  formatMileage,
  humanFuel,
  resolveAsset,
  storageGet,
  storageSet,
} from "./utils.js?v=20261102d";
import { shortEngine, shortTransmission, vehicleHref, vehicleTitle } from "./vehicles.js?v=20261102d";

const KEY = "as_compare_v1";
export const MAX_COMPARE = 3;

let ids = (storageGet(KEY, []) || []).filter((id) => typeof id === "string").slice(0, MAX_COMPARE);
let bound = false;
let vehicleMap = null;
let loading = null;

function persist() {
  storageSet(KEY, ids);
  window.dispatchEvent(new CustomEvent("as:compare-changed", { detail: [...ids] }));
}

function syncInputs() {
  document.querySelectorAll("[data-compare]").forEach((input) => {
    input.checked = ids.includes(input.dataset.compare);
  });
}

async function loadVehicles(force = false) {
  if (vehicleMap && !force) return vehicleMap;
  if (loading) return loading;
  loading = getAllVehicles()
    .then((all) => {
      vehicleMap = new Map(all.map((vehicle) => [vehicle.id, vehicle]));
      return vehicleMap;
    })
    .catch(() => {
      vehicleMap = new Map();
      return vehicleMap;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function getCompareIds() {
  return [...ids];
}

export function isCompared(id) {
  return ids.includes(id);
}

export function toggleCompare(id) {
  if (!id) return { ok: false, reason: "invalid" };
  if (ids.includes(id)) {
    ids = ids.filter((item) => item !== id);
    persist();
    syncInputs();
    return { ok: true, active: false };
  }
  if (ids.length >= MAX_COMPARE) {
    return { ok: false, reason: "full" };
  }
  ids = [...ids, id];
  persist();
  syncInputs();
  return { ok: true, active: true };
}

export function removeCompare(id) {
  if (!ids.includes(id)) return;
  ids = ids.filter((item) => item !== id);
  persist();
  syncInputs();
}

export function clearCompare() {
  if (!ids.length) return;
  ids = [];
  persist();
  syncInputs();
}

function ensureTray() {
  let tray = document.getElementById("compareTray");
  if (tray) return tray;
  tray = document.createElement("aside");
  tray.id = "compareTray";
  tray.className = "compare-tray";
  tray.setAttribute("aria-label", "Vehicle comparison");
  tray.innerHTML = `
    <div class="compare-tray__count"><strong data-compare-count>0</strong>of ${MAX_COMPARE}</div>
    <div class="compare-tray__items" data-compare-items></div>
    <button type="button" class="btn btn--accent btn--sm" data-compare-open>Compare</button>
    <button type="button" class="btn btn--soft btn--sm btn--icon" data-compare-clear aria-label="Clear comparison">
      <span class="material-symbols-outlined">delete</span>
    </button>`;
  document.body.appendChild(tray);
  return tray;
}

async function renderTray() {
  const tray = ensureTray();
  const countEl = tray.querySelector("[data-compare-count]");
  const itemsEl = tray.querySelector("[data-compare-items]");
  const openBtn = tray.querySelector("[data-compare-open]");
  const clearBtn = tray.querySelector("[data-compare-clear]");

  tray.classList.toggle("is-open", ids.length > 0);
  countEl.textContent = String(ids.length);
  openBtn.disabled = ids.length < 2;
  openBtn.textContent = ids.length >= 2 ? "Compare Now" : "Compare";
  clearBtn.hidden = ids.length === 0;

  if (!ids.length) {
    itemsEl.innerHTML = "";
    return;
  }

  await loadVehicles();
  itemsEl.innerHTML = ids
    .map((id) => {
      const vehicle = vehicleMap.get(id);
      if (!vehicle) return "";
      return `<div class="compare-thumb" title="${escapeHtml(vehicleTitle(vehicle))}">
        <img src="${escapeHtml(resolveAsset(vehicle.images?.[0]))}" alt="${escapeHtml(vehicleTitle(vehicle))}">
        <button type="button" data-compare-remove="${escapeHtml(id)}" aria-label="Remove ${escapeHtml(vehicleTitle(vehicle))} from comparison">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>`;
    })
    .join("");
}

function ensureModal() {
  let modal = document.getElementById("compareModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.className = "modal modal--wide";
  modal.id = "compareModal";
  modal.dataset.modal = "";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal__backdrop" data-modal-close></div>
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="compareTitle">
      <div class="modal__head">
        <div>
          <h2 id="compareTitle">Compare vehicles</h2>
          <p>Specs and certification side by side.</p>
        </div>
        <button type="button" class="modal__close" data-modal-close aria-label="Close comparison">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="modal__body" data-compare-body></div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

const yesNo = (value) =>
  value
    ? '<span class="material-symbols-outlined yes icon-fill" aria-label="Yes">check_circle</span>'
    : '<span class="material-symbols-outlined no" aria-label="No">remove</span>';

function renderCompareTable(vehicles) {
  if (vehicles.length < 2) {
    return `<div class="state" style="padding:32px 20px">
      <div class="state__icon"><span class="material-symbols-outlined">compare_arrows</span></div>
      <h3>Choose at least two vehicles</h3>
      <p>Add another vehicle from inventory to see them side by side.</p>
      <div class="state__actions"><a class="btn btn--primary btn--sm" href="inventory.html" data-modal-close>Browse inventory</a></div>
    </div>`;
  }

  const rows = [
    ["Price", (v) => `<strong>${escapeHtml(formatCurrency(v.price))}</strong>`],
    ["Est. payment", (v) => `${escapeHtml(formatCurrency(roundPayment(estimateMonthly(v.price))))}/mo`],
    ["Year", (v) => escapeHtml(String(v.year))],
    ["Mileage", (v) => escapeHtml(formatMileage(v.mileage))],
    ["Body style", (v) => escapeHtml(v.bodyStyle)],
    ["Fuel", (v) => escapeHtml(humanFuel(v.fuelType))],
    ["Powertrain", (v) => escapeHtml(shortEngine(v.engine) || v.drivetrain || "—")],
    ["Transmission", (v) => escapeHtml(shortTransmission(v.transmission))],
    ["Drivetrain", (v) => escapeHtml(v.drivetrain || "—")],
    ["Efficiency", (v) =>
      escapeHtml(v.fuelType === "Electric" ? `${v.rangeMiles || "—"} mi range` : `${v.mpg || "—"} MPG combined`)],
    ["Seats", (v) => escapeHtml(String(v.seats || 5))],
    ["150-pt inspected", (v) => yesNo(v.inspected150)],
    ["Clean CARFAX", (v) => yesNo(v.carfaxClean)],
    ["1 owner", (v) => yesNo(v.oneOwner)],
  ];

  return `<div class="compare-table-wrap">
    <table class="compare-table">
      <thead>
        <tr>
          <th scope="col"><span class="sr-only">Specification</span></th>
          ${vehicles
            .map(
              (v) => `<th scope="col">
                <img src="${escapeHtml(resolveAsset(v.images?.[0]))}" alt="${escapeHtml(vehicleTitle(v))}">
                <strong>${escapeHtml(vehicleTitle(v))}</strong>
                <span>${escapeHtml(v.trim || v.bodyStyle)}</span>
                <a class="link-arrow" style="justify-content:center;margin-top:6px;font-size:11px" href="${escapeHtml(vehicleHref(v.id))}">View details <span class="material-symbols-outlined">arrow_forward</span></a>
              </th>`
            )
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            ([label, render]) =>
              `<tr><th scope="row">${label}</th>${vehicles.map((v) => `<td>${render(v)}</td>`).join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

async function renderCompareModal() {
  const modal = ensureModal();
  const body = modal.querySelector("[data-compare-body]");
  await loadVehicles();
  const vehicles = ids.map((id) => vehicleMap.get(id)).filter(Boolean);
  body.innerHTML = renderCompareTable(vehicles);
}

async function openCompareModal() {
  if (ids.length < 2) {
    showToast("Select at least two vehicles to compare.", "info");
    return;
  }
  await renderCompareModal();
  openModal("compareModal");
}

export function openCompare() {
  return openCompareModal();
}

export function initCompare() {
  if (bound) return;
  bound = true;

  const tray = ensureTray();
  const modal = ensureModal();

  tray.addEventListener("click", (event) => {
    if (event.target.closest("[data-compare-open]")) openCompareModal();
    if (event.target.closest("[data-compare-clear]")) {
      clearCompare();
      showToast("Comparison cleared.", "info");
    }
    const remove = event.target.closest("[data-compare-remove]");
    if (remove) removeCompare(remove.dataset.compareRemove);
  });

  document.addEventListener("change", (event) => {
    const input = event.target.closest("[data-compare]");
    if (!input) return;
    const result = toggleCompare(input.dataset.compare);
    if (!result.ok) {
      input.checked = false;
      showToast(`You can compare up to ${MAX_COMPARE} vehicles.`, "error");
    }
  });

  window.addEventListener("as:compare-changed", () => {
    renderTray();
    if (!modal.hidden) renderCompareModal();
  });

  window.addEventListener("as:vehicles-changed", () => {
    vehicleMap = null;
    if (ids.length) renderTray();
  });

  syncInputs();
  renderTray();
}
