/**
 * Vehicle presentation helpers: card markup, labels and card interactions.
 * Used by the home, inventory, saved, quiz and vehicle pages.
 */
import { isFavorite, toggleFavorite } from "./favorites.js?v=20261103a";
import { estimateMonthly, roundPayment } from "./finance.js?v=20261103a";
import { openModal, showToast } from "./ui.js?v=20261103a";
import {
  bodyStyleIcon,
  escapeHtml,
  formatCurrency,
  formatMileage,
  resolveAsset,
  truncate,
} from "./utils.js?v=20261103a";
import { vehicleInquiryMessage, waLink, WHATSAPP_SVG } from "./whatsapp.js?v=20261103a";

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
  const rating = String(vehicle.dealRating || "");
  if (/auction|no reserve/i.test(rating)) {
    return `<button type="button" class="chip chip--action" data-check-availability="${escapeHtml(vehicle.id)}" data-avail-name="${escapeHtml(
      vehicleTitle(vehicle)
    )}"><span class="material-symbols-outlined" aria-hidden="true">fact_check</span>Check Availability</button>`;
  }
  return `<span class="chip"><span class="material-symbols-outlined">sell</span>${escapeHtml(
    rating || "Fair Market Price"
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
 * @param {boolean} [options.reserve]
 */
export function renderVehicleCard(vehicle, options = {}) {
  const variant = options.variant || "default";
  const showActions = options.actions !== false;
  const showReserve = options.reserve !== false;
  const id = escapeHtml(vehicle.id);
  const href = escapeHtml(vehicleHref(vehicle.id));
  const images = Array.isArray(vehicle.images) && vehicle.images.length ? vehicle.images : [];
  const photoCount = images.length;
  const saved = isFavorite(vehicle.id);
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
        <img src="${escapeHtml(resolveAsset(images[0], 800))}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
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
          showReserve
            ? `<a class="veh-reserve" href="${escapeHtml(
                `${vehicleHref(vehicle.id)}&open=test-drive`
              )}"><span class="material-symbols-outlined" aria-hidden="true">event_available</span><span>Reserve This Car</span></a>`
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

function ensureAvailabilityModal() {
  let modal = document.getElementById("availabilityModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.className = "modal modal--sm";
  modal.id = "availabilityModal";
  modal.dataset.modal = "";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal__backdrop" data-modal-close></div>
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="availabilityModalTitle">
      <div class="modal__head">
        <div>
          <h2 id="availabilityModalTitle">Availability check</h2>
          <p data-avail-subtitle>Live status from dealer inventory.</p>
        </div>
        <button type="button" class="modal__close" data-modal-close aria-label="Close availability check">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="modal__body" data-avail-body aria-live="polite"></div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function availabilityResult(vehicle) {
  const status = vehicle.status || "available";
  const title = escapeHtml(vehicleTitle(vehicle));
  const location = escapeHtml(vehicle.location || "Dallas, TX");
  const stock = escapeHtml(vehicle.stockNumber || vehicle.id);
  const detailsHref = escapeHtml(`${vehicleHref(vehicle.id)}#availability`);
  const reserveHref = escapeHtml(`${vehicleHref(vehicle.id)}&open=test-drive`);
  const detailsLink = `<a class="avail-check__link" href="${detailsHref}">See full availability details<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>`;

  const copy =
    status === "available"
      ? {
          tone: "ok",
          icon: "verified",
          heading: "Available now",
          description: `This ${title} is on the showroom lot in ${location} and ready for you to reserve.`,
          action: `<a class="btn btn--primary" href="${reserveHref}"><span class="material-symbols-outlined" aria-hidden="true">event_available</span>Reserve this car</a>`,
        }
      : status === "reserved"
        ? {
            tone: "wait",
            icon: "schedule",
            heading: "Currently reserved",
            description: `Another buyer is holding this ${title}. Join the waitlist and our concierge will call you first if it becomes available.`,
            action: `<a class="btn btn--wa" href="${escapeHtml(
              waLink(
                `Hi AutoSelect! Please add me to the waitlist for the ${vehicleTitle(vehicle)} (Stock ${
                  vehicle.stockNumber || vehicle.id
                }).`
              )
            )}" target="_blank" rel="noopener noreferrer">${WHATSAPP_SVG}<span>Join the waitlist</span></a>`,
          }
        : {
            tone: "sold",
            icon: "sell",
            heading: "Recently sold",
            description: `This ${title} has found a new home. Our concierge can match you with similar certified stock available today.`,
            action: `<a class="btn btn--primary" href="inventory.html"><span class="material-symbols-outlined" aria-hidden="true">directions_car</span>Browse available cars</a>`,
          };

  return `<div class="avail-check avail-check--${copy.tone}">
      <span class="avail-check__icon material-symbols-outlined" aria-hidden="true">${copy.icon}</span>
      <div class="avail-check__copy">
        <h3>${copy.heading}</h3>
        <p>${copy.description}</p>
        <ul class="avail-check__facts">
          <li><span class="material-symbols-outlined" aria-hidden="true">schedule</span>Checked against live inventory just now</li>
          <li><span class="material-symbols-outlined" aria-hidden="true">pin_drop</span>${location} · Stock ${stock}</li>
          <li><span class="material-symbols-outlined" aria-hidden="true">sell</span>${escapeHtml(formatCurrency(vehicle.price))} · ${escapeHtml(
            vehicle.status === "reserved" ? "Waitlist open" : vehicle.status === "sold" ? "No longer listed" : "No dealer add-ons"
          )}</li>
        </ul>
      </div>
    </div>
    <div class="avail-check__actions">
      ${copy.action}
      ${
        status === "reserved"
          ? ""
          : `<a class="btn btn--ghost" href="${escapeHtml(waLink(vehicleInquiryMessage(vehicle)))}" target="_blank" rel="noopener noreferrer">${WHATSAPP_SVG}<span>WhatsApp concierge</span></a>`
      }
    </div>
    ${detailsLink}`;
}

async function checkAvailability(id, title = "this vehicle") {
  if (!id) return;
  const modal = ensureAvailabilityModal();
  const body = modal.querySelector("[data-avail-body]");
  const subtitle = modal.querySelector("[data-avail-subtitle]");
  if (subtitle) subtitle.textContent = `Live status for the ${title}`;
  if (body) {
    body.innerHTML = `<div class="avail-check__loading" role="status">
      <span class="avail-check__spinner" aria-hidden="true"></span>
      <div><strong>Confirming availability…</strong><p>Checking the dealership's live inventory.</p></div>
    </div>`;
  }
  openModal(modal);

  try {
    const { getVehicle } = await import("./data-store.js?v=20261103a");
    const vehicle = await getVehicle(id);
    if (!vehicle) {
      if (body) {
        body.innerHTML = `<div class="avail-check avail-check--sold">
          <span class="avail-check__icon material-symbols-outlined" aria-hidden="true">search_off</span>
          <div class="avail-check__copy">
            <h3>Listing not found</h3>
            <p>This vehicle is no longer in our inventory. Browse the latest certified stock instead.</p>
          </div>
        </div>
        <div class="avail-check__actions"><a class="btn btn--primary" href="inventory.html">Browse inventory</a></div>`;
      }
      return;
    }
    if (body) body.innerHTML = availabilityResult(vehicle);
  } catch (error) {
    console.error("[AutoSelect] availability check failed", error);
    if (body) {
      body.innerHTML = `<div class="avail-check avail-check--wait">
        <span class="avail-check__icon material-symbols-outlined" aria-hidden="true">wifi_off</span>
        <div class="avail-check__copy">
          <h3>Couldn't confirm right now</h3>
          <p>Live inventory is temporarily unreachable. Message the concierge and we'll confirm this vehicle within minutes.</p>
        </div>
      </div>
      <div class="avail-check__actions">
        <a class="btn btn--wa" href="${escapeHtml(
          waLink(`Hi AutoSelect! Is the ${title} still available?`)
        )}" target="_blank" rel="noopener noreferrer">${WHATSAPP_SVG}<span>Ask on WhatsApp</span></a>
      </div>`;
    }
  }
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
    const check = event.target.closest("[data-check-availability]");
    if (check) {
      event.preventDefault();
      checkAvailability(check.dataset.checkAvailability, check.dataset.availName);
      return;
    }
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
