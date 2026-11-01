/**
 * Vehicle presentation helpers: card markup, labels and card interactions.
 * Used by the home, inventory, saved, quiz and vehicle pages.
 */
import { getCompareIds } from "./compare.js?v=20261102a";
import { isFavorite, toggleFavorite } from "./favorites.js?v=20261102a";
import { estimateMonthly, roundPayment } from "./finance.js?v=20261102a";
import { showToast } from "./ui.js?v=20261102a";
import {
  bodyStyleIcon,
  escapeHtml,
  formatCurrency,
  formatMileage,
  resolveAsset,
  truncate,
} from "./utils.js?v=20261102a";
import { vehicleInquiryMessage, waLink, WHATSAPP_SVG } from "./whatsapp.js?v=20261102a";

let bound = false;

export function vehicleHref(id) {
  return `vehicle.html?id=${encodeURIComponent(id)}`;
}

export function vehicleTitle(vehicle) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

export function vehicleSubtitle(vehicle) {
  return [vehicle.trim, vehicle.exteriorColor, vehicle.bodyStyle].filter(Boolean).join(" • ");
}

export function shortEngine(engine = "") {
  return String(engine)
    .split("•")[0]
    .replace(/\b(I3|I4|I5|I6|V6|V8|V12)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function shortTransmission(transmission = "") {
  const text = String(transmission);
  if (/manual/i.test(text)) return "Manual";
  const speed = text.match(/(\d+)[- ]speed/i);
  if (speed) return `${speed[1]}-Speed Auto`;
  if (/e-cvt/i.test(text)) return "e-CVT";
  if (/cvt/i.test(text)) return "CVT";
  if (/single[- ]speed/i.test(text)) return "1-Speed";
  if (/automatic/i.test(text)) return "Automatic";
  return truncate(text, 13);
}

export function fuelEconomyLabel(vehicle) {
  if (vehicle.fuelType === "Electric") {
    return vehicle.rangeMiles ? `${vehicle.rangeMiles} mi range` : "Electric";
  }
  return vehicle.mpg ? `${vehicle.mpg} MPG` : vehicle.fuelType || "Gas";
}

function priceBlock(vehicle) {
  const monthly = roundPayment(estimateMonthly(vehicle.price));
  const msrp = Number(vehicle.msrp) || 0;
  const showMsrp = msrp > Number(vehicle.price) + 500;
  return `<div class="veh-price">
    <strong>${escapeHtml(formatCurrency(vehicle.price))}</strong>
    <span>Est. ${escapeHtml(formatCurrency(monthly))}/mo</span>
    ${showMsrp ? `<del>${escapeHtml(formatCurrency(msrp))}</del>` : ""}
  </div>`;
}

function dealChip(vehicle) {
  const save = Number(vehicle.belowMarketAmount) || 0;
  if (save > 0) {
    return `<span class="chip chip--green"><span class="material-symbols-outlined">trending_down</span>Save ${escapeHtml(
      formatCurrency(save)
    )}</span>`;
  }
  return `<span class="chip"><span class="material-symbols-outlined">sell</span>${escapeHtml(
    vehicle.dealRating || "Fair Market Price"
  )}</span>`;
}

function badgesFor(vehicle) {
  const badges = [];
  if (vehicle.inspected150) {
    badges.push(
      `<span class="badge badge--glass"><span class="material-symbols-outlined">verified_user</span>150-Pt Inspected</span>`
    );
  }
  if (vehicle.oneOwner) {
    badges.push(`<span class="badge badge--glass">1-Owner CARFAX</span>`);
  } else if (vehicle.carfaxClean) {
    badges.push(`<span class="badge badge--glass">Clean CARFAX</span>`);
  }
  return badges.slice(0, 2).join("");
}

/**
 * Render a listing card.
 * @param {object} vehicle
 * @param {object} [options]
 * @param {"default"|"compact"|"list"} [options.variant]
 * @param {string} [options.reason] quiz match reason
 * @param {number} [options.match] quiz match percentage
 * @param {boolean} [options.actions]
 * @param {boolean} [options.compare]
 */
export function renderVehicleCard(vehicle, options = {}) {
  const variant = options.variant || "default";
  const showActions = options.actions !== false;
  const showCompare = options.compare !== false;
  const id = escapeHtml(vehicle.id);
  const href = escapeHtml(vehicleHref(vehicle.id));
  const images = Array.isArray(vehicle.images) && vehicle.images.length ? vehicle.images : [];
  const photoCount = images.length;
  const saved = isFavorite(vehicle.id);
  const compared = getCompareIds().includes(vehicle.id);
  const title = vehicleTitle(vehicle);
  const subtitle = vehicleSubtitle(vehicle);
  const alt = `${title} — ${subtitle}`;

  const matchBadge =
    Number(options.match) > 0
      ? `<span class="badge badge--blue-soft">${Math.round(Number(options.match))}% match</span>`
      : "";

  return `<article class="veh-card${variant !== "default" ? ` veh-card--${variant}` : ""}" data-vehicle-card="${id}">
    <div class="veh-media">
      <a class="veh-media__link" href="${href}" tabindex="-1" aria-hidden="true">
        <img src="${escapeHtml(resolveAsset(images[0]))}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
      </a>
      <div class="veh-badges">${matchBadge}${badgesFor(vehicle)}</div>
      <button type="button" class="veh-fav${saved ? " is-saved" : ""}" data-fav="${id}"
        aria-pressed="${saved}" aria-label="${saved ? "Remove" : "Save"} ${escapeHtml(title)}">
        <span class="material-symbols-outlined">favorite</span>
      </button>
      <span class="veh-photos"><span class="material-symbols-outlined">photo_camera</span>${photoCount} Photos</span>
    </div>
    <div class="veh-body">
      ${variant !== "compact" && vehicle.tagline ? `<span class="eyebrow">${escapeHtml(vehicle.tagline)}</span>` : ""}
      <div class="veh-head">
        <div class="veh-head__main">
          <a class="veh-title" href="${href}">${escapeHtml(title)} ${vehicle.trim ? `<span class="muted">${escapeHtml(vehicle.trim)}</span>` : ""}</a>
          <p class="veh-sub">
            <span>${escapeHtml(vehicle.exteriorColor || "")}</span>
            <span class="dot" aria-hidden="true"></span>
            <span class="material-symbols-outlined" style="font-size:12px" aria-hidden="true">${bodyStyleIcon(vehicle.bodyStyle)}</span>
            <span>${escapeHtml(vehicle.bodyStyle || "")}</span>
          </p>
        </div>
        ${priceBlock(vehicle)}
      </div>
      <div class="veh-specs" role="list" aria-label="Key specs">
        <div class="veh-specs__item" role="listitem">
          <span class="material-symbols-outlined" aria-hidden="true">speed</span>
          <span>${escapeHtml(formatMileage(vehicle.mileage))}</span>
        </div>
        <div class="veh-specs__item" role="listitem">
          <span class="material-symbols-outlined" aria-hidden="true">tune</span>
          <span>${escapeHtml(shortEngine(vehicle.engine))}</span>
        </div>
        <div class="veh-specs__item" role="listitem">
          <span class="material-symbols-outlined" aria-hidden="true">settings</span>
          <span>${escapeHtml(shortTransmission(vehicle.transmission))}</span>
        </div>
        <div class="veh-specs__item" role="listitem">
          <span class="material-symbols-outlined" aria-hidden="true">local_gas_station</span>
          <span>${escapeHtml(fuelEconomyLabel(vehicle))}</span>
        </div>
      </div>
      ${options.reason ? `<div class="match-reason"><span class="material-symbols-outlined">auto_awesome</span><span>${escapeHtml(options.reason)}</span></div>` : ""}
      <div class="veh-meta">
        <div class="veh-meta__left">${dealChip(vehicle)}</div>
        ${
          showCompare
            ? `<label class="veh-compare"><input type="checkbox" data-compare="${id}"${compared ? " checked" : ""}><span>Compare</span></label>`
            : ""
        }
      </div>
      ${
        showActions
          ? `<div class="veh-actions">
              <a class="btn btn--primary btn--sm" href="${href}"><span>View Details</span><span class="material-symbols-outlined">arrow_forward</span></a>
              <a class="btn btn--wa btn--sm" href="${escapeHtml(waLink(vehicleInquiryMessage(vehicle)))}" target="_blank" rel="noopener noreferrer">
                ${WHATSAPP_SVG}<span>WhatsApp Deal</span>
              </a>
            </div>`
          : ""
      }
    </div>
  </article>`;
}

export function renderVehicleCards(vehicles, options = {}) {
  return vehicles.map((vehicle) => renderVehicleCard(vehicle, options)).join("");
}

export function renderCardSkeletons(count = 6) {
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

function setFavoriteButtons(id, saved) {
  document.querySelectorAll(`[data-fav="${CSS.escape(String(id))}"]`).forEach((button) => {
    button.classList.toggle("is-saved", saved);
    button.setAttribute("aria-pressed", String(saved));
    const title = button.getAttribute("aria-label") || "";
    button.setAttribute(
      "aria-label",
      `${saved ? "Remove" : "Save"} ${title.replace(/^(Save|Remove)\s+/, "")}`
    );
  });
}

/** Bind global favorite toggles + external state changes. Safe to call repeatedly. */
export function initVehicleCards() {
  if (bound) return;
  bound = true;
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-fav]");
    if (!button) return;
    event.preventDefault();
    const id = button.dataset.fav;
    const saved = await toggleFavorite(id);
    setFavoriteButtons(id, saved);
    showToast(saved ? "Saved to your shortlist." : "Removed from saved vehicles.", saved ? "success" : "info");
  });
  window.addEventListener("as:favorites-changed", (event) => {
    const ids = new Set(event.detail || []);
    document.querySelectorAll("[data-fav]").forEach((button) => {
      const saved = ids.has(button.dataset.fav);
      button.classList.toggle("is-saved", saved);
      button.setAttribute("aria-pressed", String(saved));
    });
  });
}
