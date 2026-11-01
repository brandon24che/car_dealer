/**
 * Vehicle detail page: gallery, finance estimate, WhatsApp concierge,
 * inspection report, test-drive reservation and similar vehicles.
 */
import {
  getSimilarVehicles,
  getVehicle,
  incrementViewCount,
  saveLead,
  saveTestDrive,
} from "../data-store.js?v=20261102b";
import { isFavorite, subscribeFavorites, toggleFavorite } from "../favorites.js?v=20261102b";
import { FINANCE_DEFAULTS, monthlyPayment, roundPayment } from "../finance.js?v=20261102b";
import { bindRange, mountShell, openModal, setButtonLoading, showToast } from "../ui.js?v=20261102b";
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatMilesExact,
  getParam,
  isValidEmail,
  isValidPhone,
  qs,
  qsa,
  resolveAsset,
} from "../utils.js?v=20261102b";
import {
  initVehicleCards,
  renderVehicleCards,
  shortEngine,
  shortTransmission,
  vehicleTitle,
} from "../vehicles.js?v=20261102b";
import {
  DEALER_NAME,
  DEALER_PHONE_DISPLAY,
  vehicleCheckoutMessage,
  waLink,
  WHATSAPP_SVG,
} from "../whatsapp.js?v=20261102b";

const root = qs("#vehicleRoot");
let currentVehicle = null;
let images = [];
let photoIndex = 0;
let finance = {
  downPayment: FINANCE_DEFAULTS.downPayment,
  term: FINANCE_DEFAULTS.term,
  apr: FINANCE_DEFAULTS.apr,
};
let selectedDateOption = "Tomorrow";
let selectedLocation = "Dealership Hub";
let successVisible = false;

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

const PHOTO_LABELS = [
  "Front three-quarter view",
  "Interior cabin",
  "Dashboard & cockpit",
  "Interior detail",
  "Rear three-quarter view",
  "Engine bay",
];

function photoLabel(index) {
  return PHOTO_LABELS[index] || `Photo ${index + 1}`;
}

function photoAlt(vehicle, index) {
  return `${vehicleTitle(vehicle)} — ${photoLabel(index)} at ${DEALER_NAME}`;
}

function monthlyFor(price = 0, state = finance) {
  const principal = Math.max(0, Number(price) - Number(state.downPayment || 0));
  return roundPayment(monthlyPayment(principal, state.apr, state.term));
}

function economySpec(vehicle) {
  if (vehicle.fuelType === "Electric") {
    return vehicle.rangeMiles ? `${vehicle.rangeMiles} mi range` : "Electric";
  }
  if (vehicle.mpgCity && vehicle.mpgHwy) {
    return `${vehicle.mpgCity} / ${vehicle.mpgHwy} MPG`;
  }
  return vehicle.mpg ? `${vehicle.mpg} MPG` : "—";
}

function vehicleLabel(vehicle) {
  return `${vehicleTitle(vehicle)}${vehicle.trim ? ` ${vehicle.trim}` : ""}`;
}

function featureIcon(name = "") {
  const text = name.toLowerCase();
  if (/sunroof|moonroof|panoram/.test(text)) return "wb_sunny";
  if (/audio|sound|speaker|harman|bose|burmester|jbl/.test(text)) return "speaker";
  if (/carplay|android|wireless|wifi|bluetooth/.test(text)) return "phonelink";
  if (/heated|ventilated|cooled|climate|seat/.test(text)) return "heat_pump";
  if (/blind|lane|adaptive|assist|cruise|safety|collision/.test(text)) return "radar";
  if (/park|360|camera/.test(text)) return "local_parking";
  if (/charg/.test(text)) return "battery_charging_full";
  if (/tow|trailer|hitch/.test(text)) return "rv_hookup";
  if (/rack|roof rail/.test(text)) return "roofing";
  if (/navigation|nav\b/.test(text)) return "explore";
  if (/keyless|remote start/.test(text)) return "key";
  if (/hil|descent|terrain|drive mode/.test(text)) return "terrain";
  return "check_circle";
}

/* ------------------------------------------------------------------ */
/* Page render                                                         */
/* ------------------------------------------------------------------ */

function renderGallery(vehicle) {
  const main = resolveAsset(images[0]);
  const badges = [];
  if (vehicle.inspected150) {
    badges.push(
      `<span class="badge badge--glass-green"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1">verified</span>Verified</span>`
    );
  }
  const saved = isFavorite(vehicle.id);

  return `<section class="veh-gallery" aria-label="Vehicle photos">
    <div class="veh-gallery__main" data-gallery-main>
      <img id="vehMainImage" src="${escapeHtml(main)}" alt="${escapeHtml(photoAlt(vehicle, 0))}" fetchpriority="high" decoding="async">
      <div class="veh-gallery__shade" aria-hidden="true"></div>
      <div class="veh-gallery__badges">
        <span class="badge badge--glass"><span class="material-symbols-outlined">photo_camera</span><span data-photo-count>1 / ${images.length}</span></span>
        ${badges.join("")}
      </div>
      <div class="veh-gallery__actions">
        <button type="button" class="veh-gallery__icon${saved ? " is-saved" : ""}" data-save-vehicle aria-pressed="${saved}" aria-label="${saved ? "Remove from" : "Save to"} your shortlist">
          <span class="material-symbols-outlined">${saved ? "favorite" : "favorite_border"}</span>
        </button>
        <button type="button" class="veh-gallery__icon" data-gallery-expand aria-label="Open full-screen photo gallery">
          <span class="material-symbols-outlined">fullscreen</span>
        </button>
      </div>
      <button type="button" class="veh-gallery__360" data-360>
        <span class="material-symbols-outlined">360</span>
        <span>Interactive 360° View</span>
      </button>
      <button type="button" class="veh-gallery__arrow veh-gallery__arrow--prev" data-gallery-prev aria-label="Previous photo">
        <span class="material-symbols-outlined">chevron_left</span>
      </button>
      <button type="button" class="veh-gallery__arrow veh-gallery__arrow--next" data-gallery-next aria-label="Next photo">
        <span class="material-symbols-outlined">chevron_right</span>
      </button>
    </div>
    <div class="veh-gallery__thumbs" data-thumbs role="group" aria-label="Choose a photo">
      ${images
        .map(
          (src, index) => `<button type="button" class="veh-thumb${index === 0 ? " is-active" : ""}" data-photo="${index}" aria-label="View photo ${index + 1}: ${escapeHtml(
            photoLabel(index)
          )}"${index === 0 ? ' aria-current="true"' : ""}>
            <img src="${escapeHtml(resolveAsset(src))}" alt="" loading="lazy" decoding="async">
          </button>`
        )
        .join("")}
    </div>
    <div class="veh-trust">
      <div class="veh-trust__item">
        <span class="material-symbols-outlined">fact_check</span>
        <div><strong>150-point inspection</strong>Master-tech certified</div>
      </div>
      <div class="veh-trust__item">
        <span class="material-symbols-outlined">assignment_return</span>
        <div><strong>7-day money-back</strong>250-mile return window</div>
      </div>
      <div class="veh-trust__item">
        <span class="material-symbols-outlined">local_shipping</span>
        <div><strong>Home delivery</strong>From $299 or free pickup</div>
      </div>
    </div>
  </section>`;
}

function renderIdentity(vehicle) {
  const pills = [];
  if (vehicle.oneOwner) {
    pills.push(`<span class="veh-pill veh-pill--green"><span class="material-symbols-outlined">verified_user</span>CARFAX 1-Owner</span>`);
  }
  if (vehicle.carfaxClean) {
    pills.push(`<span class="veh-pill veh-pill--green"><span class="material-symbols-outlined">health_and_safety</span>Clean Title • 0 Accidents</span>`);
  }
  if (vehicle.inspected150) {
    pills.push(`<span class="veh-pill"><span class="material-symbols-outlined">fact_check</span>150-Pt Inspected</span>`);
  }
  pills.push(`<span class="veh-pill veh-pill--muted">Stock #${escapeHtml(vehicle.stockNumber || vehicle.id)}</span>`);

  const subParts = [vehicle.trim, vehicle.drivetrain, vehicle.bodyStyle].filter(Boolean);

  return `<div class="veh-identity">
    <div class="veh-identity__badges">${pills.join("")}</div>
    <div class="veh-identity__head">
      <div>
        <h1>${escapeHtml(vehicleTitle(vehicle))}</h1>
        <p class="veh-identity__sub">
          ${subParts
            .map((part) => `<span>${escapeHtml(part)}</span>`)
            .join('<span class="dot" aria-hidden="true"></span>')}
        </p>
        <p class="veh-identity__vin">VIN: ${escapeHtml(vehicle.vin || "Available on request")}</p>
      </div>
      <div class="veh-identity__actions">
        <button type="button" class="icon-btn" data-share-vehicle aria-label="Share this vehicle">
          <span class="material-symbols-outlined">share</span>
        </button>
        <button type="button" class="icon-btn${isFavorite(vehicle.id) ? " is-saved" : ""}" data-save-vehicle aria-pressed="${isFavorite(vehicle.id)}" aria-label="${isFavorite(vehicle.id) ? "Remove from" : "Save to"} your shortlist">
          <span class="material-symbols-outlined">${isFavorite(vehicle.id) ? "favorite" : "favorite_border"}</span>
        </button>
      </div>
    </div>
  </div>`;
}

function renderBuyCard(vehicle) {
  const price = Number(vehicle.price) || 0;
  const msrp = Number(vehicle.msrp) || 0;
  const marketSave = Number(vehicle.belowMarketAmount) || 0;
  const save = msrp > price + 500 ? msrp - price : marketSave;
  const monthly = monthlyFor(price);
  const down = finance.downPayment;
  const monthlyText = formatCurrency(monthly);
  const financeLine = `${formatCurrency(down)} down • ${finance.apr}% APR • ${finance.term} mo`;

  return `<div class="veh-buy">
    <div class="veh-buy__price">
      <span class="veh-buy__amount">${escapeHtml(formatCurrency(price))}</span>
      <div class="veh-buy__msrp">
        ${msrp > price + 500 ? `<del>MSRP ${escapeHtml(formatCurrency(msrp))}</del>` : ""}
        ${save > 0 ? `<span class="veh-buy__save"><span class="material-symbols-outlined">trending_down</span>Save ${escapeHtml(formatCurrency(save))}</span>` : ""}
      </div>
    </div>
    <p class="veh-buy__note">Price excludes taxes, title &amp; license. <span class="veh-no-fees"><span class="material-symbols-outlined">price_check</span>No dealer add-ons.</span></p>

    <div class="finance-box">
      <button type="button" class="finance-box__toggle" data-finance-toggle aria-expanded="false" aria-controls="financePanel">
        <span class="finance-box__icon"><span class="material-symbols-outlined">payments</span></span>
        <span class="finance-box__copy">
          <strong data-monthly>Est. ${escapeHtml(monthlyText)} / mo</strong>
          <small data-finance-terms>${escapeHtml(financeLine)}</small>
        </span>
        <span class="finance-box__customize">Customize<span class="material-symbols-outlined">expand_more</span></span>
      </button>
      <div class="finance-box__panel" id="financePanel" hidden>
        <div>
          <div class="finance-row"><span>Down payment</span><strong data-down-label>${escapeHtml(formatCurrency(down))}</strong></div>
          <input class="range" type="range" id="financeDown" min="0" max="${Math.min(FINANCE_DEFAULTS.maxDown, Math.max(1000, price - 1000))}" step="500" value="${down}" aria-label="Down payment">
        </div>
        <div>
          <div class="finance-row"><span>Loan term</span><strong data-term-label>${finance.term} months</strong></div>
          <div class="segmented term-seg" role="group" aria-label="Loan term">
            ${FINANCE_DEFAULTS.terms
              .map(
                (term) => `<button type="button" class="segmented__btn${term === finance.term ? " is-active" : ""}" data-term="${term}" aria-pressed="${term === finance.term}">${term}m</button>`
              )
              .join("")}
          </div>
        </div>
        <div class="finance-apr">
          <label for="financeApr">APR</label>
          <input class="input" id="financeApr" type="number" inputmode="decimal" min="0" max="24" step="0.1" value="${finance.apr}">
          <span class="finance-apr__hint">% annual percentage rate</span>
        </div>
        <div class="finance-summary">
          <div><span>Financed</span><strong data-financed>—</strong></div>
          <div><span>Interest</span><strong data-interest>—</strong></div>
          <div><span>Total cost</span><strong data-total>—</strong></div>
        </div>
        <p class="finance-disclaimer">Estimate only — not a credit offer. Final terms depend on lender approval, taxes and fees.</p>
      </div>
    </div>

    <div class="veh-concierge">
      <div class="veh-concierge__head">
        <span class="veh-concierge__avatar" aria-hidden="true">${WHATSAPP_SVG}</span>
        <div class="veh-concierge__title">
          <h2>AutoSelect Concierge</h2>
          <span class="veh-concierge__online">Online now</span>
        </div>
      </div>
      <p class="veh-concierge__desc">Skip the paperwork queue. Lock pricing and get your digital invoice over WhatsApp in under 5 minutes.</p>
      <div class="wa-draft">
        <span class="wa-draft__label"><span class="material-symbols-outlined">forum</span>Direct WhatsApp draft</span>
        <p data-wa-draft></p>
      </div>
      <a class="btn btn--wa btn--lg btn--block" data-wa-checkout href="#" target="_blank" rel="noopener noreferrer">
        ${WHATSAPP_SVG}<span>Start WhatsApp Checkout</span>
      </a>
      <button type="button" class="btn btn--ghost btn--lg btn--block" data-test-drive>
        <span class="material-symbols-outlined">directions_car</span>
        <span>Schedule a Test Drive</span>
      </button>
      <p class="veh-concierge__foot"><span class="material-symbols-outlined">verified_user</span>150-point certified • 7-day money-back guarantee</p>
    </div>
  </div>`;
}

function renderSpecs(vehicle) {
  const specs = [
    ["speed", "Mileage", formatMilesExact(vehicle.mileage)],
    ["swipe_left_alt", "Drivetrain", vehicle.drivetrain || "—"],
    ["settings_input_component", "Transmission", shortTransmission(vehicle.transmission)],
    ["electric_bolt", "Engine", shortEngine(vehicle.engine) || "—"],
    ["local_gas_station", "Fuel economy", economySpec(vehicle)],
    ["palette", "Exterior", vehicle.exteriorColor || "—"],
    ["airline_seat_recline_extra", "Interior", vehicle.interiorColor || "—"],
    ["tag", "Inventory ID", vehicle.stockNumber || vehicle.id],
  ];

  return `<section class="panel veh-lower--full" aria-labelledby="specsTitle">
    <div class="veh-lower__head">
      <h2 id="specsTitle">Vehicle Specifications</h2>
      <span class="veh-lower__aside">Standard ${escapeHtml(vehicle.drivetrain || "Certified")} Package</span>
    </div>
    <div class="veh-lower__body">
      <div class="spec-grid">
        ${specs
          .map(
            ([icon, label, value]) => `<div class="spec">
              <span class="spec__icon"><span class="material-symbols-outlined">${icon}</span></span>
              <span class="spec__copy">
                <span class="spec__label">${escapeHtml(label)}</span>
                <strong class="spec__value" title="${escapeHtml(value)}">${escapeHtml(value)}</strong>
              </span>
            </div>`
          )
          .join("")}
      </div>
    </div>
  </section>`;
}

function renderInspection(vehicle) {
  const report = vehicle.inspection || {};
  const brake = Math.max(0, Math.min(100, Number(report.brakeLife) || 85));
  const tread = Math.max(0, Math.min(12, Number(report.tireTread) || 8));
  const treadPct = Math.max(8, Math.round((tread / 12) * 100));
  const reportDate = formatDate(vehicle.inspectedAt || vehicle.createdAt);

  return `<section class="panel" aria-labelledby="inspectionTitle">
    <div class="veh-lower__head">
      <div class="insp-head">
        <span class="insp-head__icon"><span class="material-symbols-outlined">check_circle</span></span>
        <div>
          <h2 id="inspectionTitle">150-Point Inspection</h2>
          <p>${reportDate ? `Completed ${escapeHtml(reportDate)}` : "Completed"} by an AutoSelect Master Technician</p>
        </div>
      </div>
    </div>
    <div class="veh-lower__body">
      <div class="insp-metrics">
        <div class="insp-metric">
          <div class="insp-metric__top"><span>Brake lining life</span><strong>${brake}% remaining</strong></div>
          <div class="insp-bar" style="--bar:${brake}%"></div>
        </div>
        <div class="insp-metric">
          <div class="insp-metric__top"><span>Tire tread depth</span><strong>${tread}/32" ${tread >= 6 ? "Excellent" : "Good"}</strong></div>
          <div class="insp-bar" style="--bar:${treadPct}%"></div>
        </div>
        <div class="insp-metric insp-metric--pass">
          <span>12V battery health</span>
          <span class="insp-pass"><span class="material-symbols-outlined">verified</span>${escapeHtml(report.battery || "100% Pass")}</span>
        </div>
        <div class="insp-metric insp-metric--pass">
          <span>Fluids &amp; filters</span>
          <span class="insp-pass"><span class="material-symbols-outlined">autorenew</span>${escapeHtml(report.fluids || "Fresh Service A")}</span>
        </div>
      </div>
      <div class="insp-foot">
        <p><span class="material-symbols-outlined">security</span>Full dealer warranty included</p>
        <button type="button" class="insp-download" data-inspection-pdf>
          <span class="material-symbols-outlined">file_download</span>Download PDF
        </button>
      </div>
    </div>
  </section>`;
}

function renderFeatures(vehicle) {
  const features = Array.isArray(vehicle.features) ? vehicle.features.filter(Boolean) : [];
  return `<section class="panel" aria-labelledby="featuresTitle">
    <div class="veh-lower__head">
      <h2 id="featuresTitle">Equipped Premium Features</h2>
      <span class="veh-lower__aside">${features.length} factory options</span>
    </div>
    <div class="veh-lower__body">
      ${
        features.length
          ? `<div class="feature-grid">
              ${features
                .map(
                  (feature) => `<div class="feature"><span class="material-symbols-outlined">${featureIcon(
                    feature
                  )}</span><span>${escapeHtml(feature)}</span></div>`
                )
                .join("")}
            </div>`
          : `<p class="veh-concierge__desc">Ask the concierge for this vehicle's complete factory equipment list.</p>`
      }
    </div>
  </section>`;
}

function renderAvailability(vehicle) {
  const location = vehicle.location || "Dallas, TX";
  const city = String(location).replace(/,\s*TX$/i, "");
  const onLot = (vehicle.status || "available") === "available";
  const statusLabel = onLot ? "On Showroom Lot" : vehicle.status === "reserved" ? "Reserved — join waitlist" : "Recently sold";
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `AutoSelect ${city} dealership`
  )}`;

  return `<section class="panel veh-lower--full" aria-labelledby="availabilityTitle">
    <div class="veh-lower__head">
      <h2 id="availabilityTitle">Vehicle Availability</h2>
      <span class="veh-availability__status">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="veh-lower__body">
      <div class="veh-availability__grid">
        <div class="veh-map" role="img" aria-label="Map showing the AutoSelect ${escapeHtml(city)} showroom">
          <div class="veh-map__pin">
            <span class="material-symbols-outlined">directions_car</span>
            <em>AutoSelect ${escapeHtml(city)} Hub</em>
          </div>
          <span class="veh-map__label"><span class="material-symbols-outlined">pin_drop</span>${escapeHtml(location)} • Lot #4</span>
          <a class="veh-map__link" href="${escapeHtml(directions)}" target="_blank" rel="noopener noreferrer">
            <span class="material-symbols-outlined">open_in_new</span>Directions
          </a>
        </div>
        <div class="veh-availability__policies">
          <div class="veh-policy">
            <span class="material-symbols-outlined">local_shipping</span>
            <div><strong>Nationwide delivery</strong><span>From $299, or free pickup at the hub.</span></div>
          </div>
          <div class="veh-policy">
            <span class="material-symbols-outlined">event_available</span>
            <div><strong>Money-back guarantee</strong><span>7 days / 250 miles, no questions asked.</span></div>
          </div>
          <div class="veh-policy">
            <span class="material-symbols-outlined">support_agent</span>
            <div><strong>Concierge support</strong><span>${escapeHtml(DEALER_PHONE_DISPLAY)} · replies in under 5 min.</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function renderSticky(vehicle) {
  const monthly = monthlyFor(vehicle.price);
  return `<div class="veh-sticky" data-sticky-buy>
    <div class="veh-sticky__price">
      <strong>${escapeHtml(formatCurrency(vehicle.price))}</strong>
      <small data-sticky-monthly>${escapeHtml(formatCurrency(monthly))}/mo est.</small>
    </div>
    <button type="button" class="btn btn--ghost" data-test-drive>
      <span class="material-symbols-outlined">directions_car</span>
      <span>Test Drive</span>
    </button>
    <a class="btn btn--wa" data-wa-checkout href="#" target="_blank" rel="noopener noreferrer">
      ${WHATSAPP_SVG}<span>WhatsApp</span>
    </a>
  </div>`;
}

function renderVehicle(vehicle) {
  return `<article class="veh-grid">
    ${renderGallery(vehicle)}
    <aside class="veh-side">
      ${renderIdentity(vehicle)}
      ${renderBuyCard(vehicle)}
    </aside>
  </article>

  <div class="veh-lower">
    ${renderSpecs(vehicle)}
    ${renderInspection(vehicle)}
    ${renderFeatures(vehicle)}
    ${renderAvailability(vehicle)}
  </div>

  ${renderSticky(vehicle)}`;
}

/* ------------------------------------------------------------------ */
/* Gallery                                                             */
/* ------------------------------------------------------------------ */

function setPhoto(index) {
  if (!images.length) return;
  photoIndex = (index + images.length) % images.length;
  const main = qs("#vehMainImage");
  if (main) {
    main.src = resolveAsset(images[photoIndex]);
    main.alt = photoAlt(currentVehicle, photoIndex);
  }
  qsa("[data-photo-count]").forEach((el) => {
    el.textContent = `${photoIndex + 1} / ${images.length}`;
  });
  qsa("[data-photo]").forEach((thumb) => {
    const active = Number(thumb.dataset.photo) === photoIndex;
    thumb.classList.toggle("is-active", active);
    if (active) thumb.setAttribute("aria-current", "true");
    else thumb.removeAttribute("aria-current");
  });
}

function renderLightboxThumbs() {
  const host = qs("[data-lightbox-thumbs]");
  if (!host) return;
  host.innerHTML = images
    .map(
      (src, index) => `<button type="button" data-lightbox-thumb="${index}" aria-label="View photo ${index + 1}"${
        index === photoIndex ? ' class="is-active" aria-current="true"' : ""
      }>
        <img src="${escapeHtml(resolveAsset(src))}" alt="" loading="lazy">
      </button>`
    )
    .join("");
}

function setLightboxPhoto(index) {
  if (!images.length) return;
  photoIndex = (index + images.length) % images.length;
  const image = qs("#lightboxImage");
  if (image) {
    image.src = resolveAsset(images[photoIndex]);
    image.alt = photoAlt(currentVehicle, photoIndex);
  }
  qs("[data-lightbox-count]").textContent = `${photoIndex + 1} / ${images.length}`;
  qs("[data-lightbox-caption]").textContent = `${vehicleLabel(currentVehicle)} — ${photoLabel(photoIndex)}`;
  qsa("[data-lightbox-thumb]").forEach((thumb) => {
    const active = Number(thumb.dataset.lightboxThumb) === photoIndex;
    thumb.classList.toggle("is-active", active);
    if (active) {
      thumb.setAttribute("aria-current", "true");
      thumb.scrollIntoView({ inline: "nearest", block: "nearest" });
    } else {
      thumb.removeAttribute("aria-current");
    }
  });
  setPhoto(photoIndex);
}

function openLightbox(index = photoIndex) {
  renderLightboxThumbs();
  setLightboxPhoto(index);
  openModal("galleryModal");
}

/* ------------------------------------------------------------------ */
/* Finance estimator                                                   */
/* ------------------------------------------------------------------ */

function updateFinance() {
  if (!currentVehicle) return;
  const price = Number(currentVehicle.price) || 0;
  const principal = Math.max(0, price - Number(finance.downPayment || 0));
  const rawMonthly = monthlyPayment(principal, finance.apr, finance.term);
  const monthly = roundPayment(rawMonthly);
  const totalPaid = rawMonthly * finance.term;
  const interest = Math.max(0, totalPaid - principal);

  const monthlyEl = qs("[data-monthly]");
  if (monthlyEl) monthlyEl.textContent = `Est. ${formatCurrency(monthly)} / mo`;
  const stickyMonthly = qs("[data-sticky-monthly]");
  if (stickyMonthly) stickyMonthly.textContent = `${formatCurrency(monthly)}/mo est.`;

  const termsLine = qs("[data-finance-terms]");
  if (termsLine) {
    termsLine.textContent = `${formatCurrency(finance.downPayment)} down • ${finance.apr}% APR • ${finance.term} mo`;
  }
  const downLabel = qs("[data-down-label]");
  if (downLabel) downLabel.textContent = formatCurrency(finance.downPayment);
  const termLabel = qs("[data-term-label]");
  if (termLabel) termLabel.textContent = `${finance.term} months`;

  const financed = qs("[data-financed]");
  if (financed) financed.textContent = formatCurrency(principal);
  const interestEl = qs("[data-interest]");
  if (interestEl) interestEl.textContent = formatCurrency(interest);
  const totalEl = qs("[data-total]");
  if (totalEl) totalEl.textContent = formatCurrency(finance.downPayment + totalPaid);

  const message = vehicleCheckoutMessage(currentVehicle, finance);
  const draft = qs("[data-wa-draft]");
  if (draft) draft.textContent = message;
  qsa("[data-wa-checkout]").forEach((link) => {
    link.href = waLink(message);
  });
}

function bindFinance(vehicle) {
  const toggle = qs("[data-finance-toggle]");
  const panel = qs("#financePanel");
  toggle?.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    panel.hidden = expanded;
  });

  const downInput = qs("#financeDown");
  if (downInput) {
    bindRange(downInput, (value) => {
      finance.downPayment = Math.max(0, Number(value) || 0);
      updateFinance();
    });
  }

  qsa("[data-term]").forEach((button) => {
    button.addEventListener("click", () => {
      finance.term = Number(button.dataset.term) || FINANCE_DEFAULTS.term;
      qsa("[data-term]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      updateFinance();
    });
  });

  const aprInput = qs("#financeApr");
  aprInput?.addEventListener("input", () => {
    const value = Number(aprInput.value);
    if (!Number.isNaN(value)) {
      finance.apr = Math.max(0, Math.min(24, value));
      updateFinance();
    }
  });
  aprInput?.addEventListener("blur", () => {
    if (aprInput.value === "" || Number.isNaN(Number(aprInput.value))) {
      finance.apr = FINANCE_DEFAULTS.apr;
      aprInput.value = String(finance.apr);
      updateFinance();
    }
  });

  updateFinance();
}

/* ------------------------------------------------------------------ */
/* Save / share / gallery actions                                      */
/* ------------------------------------------------------------------ */

function syncSaveButtons() {
  if (!currentVehicle) return;
  const saved = isFavorite(currentVehicle.id);
  qsa("[data-save-vehicle]").forEach((button) => {
    button.classList.toggle("is-saved", saved);
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute("aria-label", `${saved ? "Remove from" : "Save to"} your shortlist`);
    const icon = button.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = saved ? "favorite" : "favorite_border";
  });
}

async function toggleSaved() {
  if (!currentVehicle) return;
  const saved = await toggleFavorite(currentVehicle.id);
  syncSaveButtons();
  showToast(saved ? "Saved to your shortlist." : "Removed from saved vehicles.", saved ? "success" : "info");
}

async function shareVehicle() {
  if (!currentVehicle) return;
  const data = {
    title: `${vehicleLabel(currentVehicle)} — ${DEALER_NAME}`,
    text: `Check out this ${vehicleLabel(currentVehicle)} at ${formatCurrency(currentVehicle.price)}.`,
    url: window.location.href,
  };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast("Vehicle link copied to your clipboard.", "success");
  } catch {
    window.prompt("Copy this vehicle link:", window.location.href);
  }
}

function bindGallery(vehicle) {
  setPhoto(0);
  qsa("[data-photo]").forEach((thumb) => {
    thumb.addEventListener("click", () => setPhoto(Number(thumb.dataset.photo)));
  });
  qs("[data-gallery-prev]")?.addEventListener("click", () => setPhoto(photoIndex - 1));
  qs("[data-gallery-next]")?.addEventListener("click", () => setPhoto(photoIndex + 1));
  qs("[data-gallery-expand]")?.addEventListener("click", () => openLightbox(photoIndex));
  qs("#vehMainImage")?.addEventListener("click", () => openLightbox(photoIndex));
  qs("[data-360]")?.addEventListener("click", () => {
    showToast("The 360° walkaround is being captured for this vehicle — showing the photo gallery instead.", "info", 4200);
    openLightbox(0);
  });

  // Touch swipe between photos.
  const main = qs("[data-gallery-main]");
  let startX = null;
  main?.addEventListener(
    "touchstart",
    (event) => {
      startX = event.touches[0]?.clientX ?? null;
    },
    { passive: true }
  );
  main?.addEventListener(
    "touchend",
    (event) => {
      if (startX === null) return;
      const endX = event.changedTouches[0]?.clientX ?? startX;
      const delta = endX - startX;
      startX = null;
      if (Math.abs(delta) > 40) setPhoto(photoIndex + (delta < 0 ? 1 : -1));
    },
    { passive: true }
  );

  qs("[data-lightbox-prev]")?.addEventListener("click", () => setLightboxPhoto(photoIndex - 1));
  qs("[data-lightbox-next]")?.addEventListener("click", () => setLightboxPhoto(photoIndex + 1));
  qs("[data-lightbox-thumbs]")?.addEventListener("click", (event) => {
    const thumb = event.target.closest("[data-lightbox-thumb]");
    if (thumb) setLightboxPhoto(Number(thumb.dataset.lightboxThumb));
  });

  document.addEventListener("keydown", (event) => {
    const modal = qs("#galleryModal");
    if (!modal || modal.hidden) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setLightboxPhoto(photoIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setLightboxPhoto(photoIndex - 1);
    }
  });

  subscribeFavorites(syncSaveButtons);
}

/* ------------------------------------------------------------------ */
/* Inspection PDF (print-ready)                                        */
/* ------------------------------------------------------------------ */

function downloadInspectionReport(vehicle) {
  if (!vehicle) return;
  const title = escapeHtml(vehicleLabel(vehicle));
  const rows = [
    ["Structure & undercarriage", "No frame damage, corrosion or prior structural repair detected."],
    ["Engine & drivetrain", "Cold-start, idle, acceleration and fluid condition all within factory spec."],
    ["Transmission", "Smooth engagement through all gears; no fault codes stored."],
    ["Brakes", `${(vehicle.inspection?.brakeLife ?? 85)}% lining life remaining; rotors within spec.`],
    ["Tires & alignment", `${(vehicle.inspection?.tireTread ?? 8)}/32" tread; even wear pattern across all four.`],
    ["Electrical & battery", `${vehicle.inspection?.battery || "100% pass"}; charging system verified.`],
    ["Cabin & safety systems", "Airbags, seatbelts, ADAS sensors and cameras verified operational."],
    ["Cosmetic condition", "Paint depth within factory range; interior free of damage or odors."],
  ];
  const reportDate = formatDate(vehicle.inspectedAt || vehicle.createdAt) || new Date().toLocaleDateString("en-US");
  const win = window.open("", "_blank", "width=880,height=980");
  if (!win) {
    showToast("Allow pop-ups to open the print-ready inspection report.", "error");
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Inspection Report — ${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Inter", Arial, sans-serif; color: #0b132b; margin: 0; padding: 40px; line-height: 1.5; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0b132b; padding-bottom: 18px; }
  .brand { font-family: Georgia, serif; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
  .brand span { color: #2563eb; }
  .meta { text-align: right; font-size: 11px; color: #475569; }
  h1 { font-size: 22px; margin: 24px 0 4px; }
  .sub { font-size: 12px; color: #475569; margin: 0 0 22px; }
  .pill { display: inline-block; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 99px; padding: 3px 10px; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 22px 0; }
  .cell { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  .cell b { display: block; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
  .cell span { font-size: 13px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 11.5px; }
  th { text-align: left; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  td { border: 1px solid #e2e8f0; padding: 9px 8px; vertical-align: top; }
  td:first-child { width: 30%; font-weight: 600; }
  .sign { margin-top: 28px; display: flex; justify-content: space-between; font-size: 11px; color: #475569; }
  .note { margin-top: 22px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 10px; color: #64748b; }
  @media print { body { padding: 18mm; } }
</style></head>
<body>
  <div class="head">
    <div class="brand">Auto<span>Select</span><div style="font-size:10px;font-family:Inter,Arial;font-weight:500;color:#64748b;letter-spacing:.12em;text-transform:uppercase;margin-top:2px">Certified Pre-Owned</div></div>
    <div class="meta">150-Point Inspection<br>Report date: ${escapeHtml(reportDate)}<br>${escapeHtml(DEALER_PHONE_DISPLAY)}</div>
  </div>
  <h1>${title}</h1>
  <p class="sub">Stock ${escapeHtml(vehicle.stockNumber || vehicle.id)} · VIN ${escapeHtml(vehicle.vin || "—")} · ${escapeHtml(formatMilesExact(vehicle.mileage))}</p>
  <span class="pill">Passed — Certified</span>
  <div class="grid">
    <div class="cell"><b>Brake life</b><span>${Number(vehicle.inspection?.brakeLife) || 85}%</span></div>
    <div class="cell"><b>Tire tread</b><span>${Number(vehicle.inspection?.tireTread) || 8}/32"</span></div>
    <div class="cell"><b>Battery</b><span>${escapeHtml(vehicle.inspection?.battery || "100% Pass")}</span></div>
    <div class="cell"><b>Fluids</b><span>${escapeHtml(vehicle.inspection?.fluids || "Fresh Service A")}</span></div>
  </div>
  <table>
    <thead><tr><th>Inspection area</th><th>Findings</th><th style="width:90px">Result</th></tr></thead>
    <tbody>
      ${rows
        .map(
          ([area, finding]) =>
            `<tr><td>${escapeHtml(area)}</td><td>${escapeHtml(finding)}</td><td style="color:#059669;font-weight:700">Pass</td></tr>`
        )
        .join("")}
    </tbody>
  </table>
  <div class="sign"><span>Inspected by: AutoSelect Master Technician</span><span>Authorized signature: ______________________</span></div>
  <p class="note">This report summarizes the 150-point mechanical and cosmetic inspection performed before listing. It is provided for transparency and does not replace the manufacturer warranty. Full dealer warranty and 7-day / 250-mile money-back guarantee included. © AutoSelect Dallas.</p>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };<\/script>
</body></html>`);
  win.document.close();
  showToast("Print-ready report opened — choose “Save as PDF”.", "info", 4600);
}

/* ------------------------------------------------------------------ */
/* Test drive                                                          */
/* ------------------------------------------------------------------ */

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromOption(option) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (option === "Today") return today;
  if (option === "Weekend") {
    const day = today.getDay();
    const diff = day === 6 ? 0 : (6 - day + 7) % 7;
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + diff);
    return saturday;
  }
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return tomorrow;
}

function longDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function setActiveChoice(selector, activeButton) {
  qsa(selector).forEach((button) => {
    const active = button === activeButton;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function clearFieldError(input) {
  const field = input?.closest(".field");
  if (!field) return;
  field.classList.remove("has-error");
  input.removeAttribute("aria-invalid");
}

function markFieldError(input) {
  const field = input?.closest(".field");
  if (!field) return;
  field.classList.add("has-error");
  input.setAttribute("aria-invalid", "true");
}

function prepareTestDriveModal(vehicle) {
  const form = qs("#testDriveForm");
  const success = qs("#tdSuccess");
  if (!form || !success) return;
  successVisible = false;
  success.hidden = true;
  form.hidden = false;

  const image = resolveAsset(images[0]);
  const summary = qs("[data-td-vehicle]");
  if (summary) {
    summary.innerHTML = `<img src="${escapeHtml(image)}" alt="">
      <div><strong>${escapeHtml(vehicleLabel(vehicle))}</strong>${escapeHtml(formatCurrency(vehicle.price))} · Stock ${escapeHtml(
      vehicle.stockNumber || vehicle.id
    )}</div>`;
  }
  const subtitle = qs("[data-td-subtitle]");
  if (subtitle) {
    subtitle.textContent = `Drive the ${vehicleTitle(vehicle)} at our ${vehicle.location || "Dallas, TX"} hub — or we can bring it to you.`;
  }

  const dateInput = qs("#tdDate");
  if (dateInput && !dateInput.value) {
    dateInput.value = isoDate(dateFromOption(selectedDateOption));
  }
  if (dateInput) dateInput.min = isoDate(new Date());

  // Re-apply the active chips in case the modal was reopened.
  setActiveChoice("[data-date-option]", qs(`[data-date-option="${selectedDateOption}"]`) || qs('[data-date-option="Tomorrow"]'));
  setActiveChoice("[data-loc]", qs(`[data-loc="${selectedLocation}"]`) || qs('[data-loc="Dealership Hub"]'));
}

function openTestDrive() {
  if (!currentVehicle) return;
  prepareTestDriveModal(currentVehicle);
  openModal("testDriveModal");
}

function bindTestDriveModal() {
  qsa("[data-date-option]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDateOption = button.dataset.dateOption || "Tomorrow";
      setActiveChoice("[data-date-option]", button);
      const dateInput = qs("#tdDate");
      if (dateInput) {
        dateInput.value = isoDate(dateFromOption(selectedDateOption));
        clearFieldError(dateInput);
      }
    });
  });

  qsa("[data-loc]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedLocation = button.dataset.loc || "Dealership Hub";
      setActiveChoice("[data-loc]", button);
    });
  });

  qs("#tdDate")?.addEventListener("change", (event) => {
    const value = event.target.value;
    const matching = ["Today", "Tomorrow", "Weekend"].find(
      (option) => isoDate(dateFromOption(option)) === value
    );
    selectedDateOption = matching || "Custom";
    qsa("[data-date-option]").forEach((button) => {
      const active = button.dataset.dateOption === matching;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    clearFieldError(event.target);
  });

  ["#tdName", "#tdPhone", "#tdEmail"].forEach((selector) => {
    qs(selector)?.addEventListener("input", (event) => clearFieldError(event.target));
  });

  qs("#testDriveForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentVehicle) return;
    const form = event.currentTarget;
    const name = qs("#tdName");
    const phone = qs("#tdPhone");
    const email = qs("#tdEmail");
    const date = qs("#tdDate");
    const time = qs("#tdTime");

    let firstInvalid = null;
    const checks = [
      [name, name.value.trim().length >= 2],
      [phone, isValidPhone(phone.value)],
      [email, isValidEmail(email.value)],
      [date, Boolean(date.value) && new Date(`${date.value}T00:00:00`) >= new Date(new Date().setHours(0, 0, 0, 0))],
    ];
    checks.forEach(([input, valid]) => {
      if (valid) clearFieldError(input);
      else {
        markFieldError(input);
        if (!firstInvalid) firstInvalid = input;
      }
    });
    if (firstInvalid) {
      firstInvalid.focus();
      showToast("Check the highlighted fields to reserve your test drive.", "error");
      return;
    }

    const submit = qs("#tdSubmit");
    setButtonLoading(submit, true, "Reserving…");
    const preferredDate = `${date.value} · ${time.value}`;
    try {
      await saveTestDrive({
        vehicleId: currentVehicle.id,
        vehicleName: vehicleLabel(currentVehicle),
        name: name.value.trim(),
        phone: phone.value.trim(),
        email: email.value.trim(),
        preferredDate,
        dateOption: selectedDateOption,
        locationPreference: selectedLocation,
      });
      const copy = qs("[data-td-success-copy]");
      if (copy) {
        copy.textContent = `Your ${vehicleTitle(currentVehicle)} is reserved. Our concierge will text ${phone.value.trim()} shortly to confirm your ${selectedLocation.toLowerCase()} appointment.`;
      }
      const meta = qs("[data-td-success-meta]");
      if (meta) {
        meta.innerHTML = `<strong>${escapeHtml(longDate(date.value))} · ${escapeHtml(time.value)}</strong><span>${escapeHtml(
          selectedLocation
        )} · ${escapeHtml(vehicleLabel(currentVehicle))}</span>`;
      }
      const wa = qs("[data-td-wa]");
      if (wa) {
        wa.href = waLink(
          `Hi ${DEALER_NAME}! I just reserved a test drive for the ${vehicleLabel(currentVehicle)} (Stock ${
            currentVehicle.stockNumber || currentVehicle.id
          }) on ${longDate(date.value)} at ${time.value}, ${selectedLocation}. Please confirm the appointment.`
        );
      }
      form.hidden = true;
      qs("#tdSuccess").hidden = false;
      successVisible = true;
      showToast("Reservation confirmed — the concierge will be in touch.", "success", 4200);
    } catch (error) {
      console.error(error);
      showToast("We couldn't save the reservation. Please try again or message us on WhatsApp.", "error");
    } finally {
      setButtonLoading(submit, false);
    }
  });

  // Reset to the form when the modal is closed after a successful booking.
  const modal = qs("#testDriveModal");
  modal?.addEventListener("transitionend", () => {});
  document.addEventListener("click", (event) => {
    if (!event.target.closest('[data-modal-close]')) return;
    const closing = event.target.closest("#testDriveModal");
    if (closing && successVisible) {
      window.setTimeout(() => {
        successVisible = false;
        const form = qs("#testDriveForm");
        const success = qs("#tdSuccess");
        if (form) form.hidden = false;
        if (success) success.hidden = true;
        qs("#testDriveForm")?.reset();
        const dateInput = qs("#tdDate");
        if (dateInput) dateInput.value = isoDate(dateFromOption("Tomorrow"));
        selectedDateOption = "Tomorrow";
        selectedLocation = "Dealership Hub";
        setActiveChoice("[data-date-option]", qs('[data-date-option="Tomorrow"]'));
        setActiveChoice("[data-loc]", qs('[data-loc="Dealership Hub"]'));
      }, 240);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Similar vehicles                                                    */
/* ------------------------------------------------------------------ */

async function renderSimilar(vehicle) {
  const host = qs("#similarSection");
  if (!host) return;
  try {
    const similar = await getSimilarVehicles(vehicle, 4);
    if (!similar.length) return;
    const bodyParam = vehicle.bodyStyle ? `?body=${encodeURIComponent(vehicle.bodyStyle)}` : "";
    host.innerHTML = `<div class="section-head">
      <div>
        <span class="section-head__eyebrow">More like this</span>
        <h2>Similar certified vehicles</h2>
      </div>
      <a class="section-head__link" href="inventory.html${bodyParam}">View all<span class="material-symbols-outlined" style="font-size:16px">arrow_forward</span></a>
    </div>
    <div class="cards-grid">${renderVehicleCards(similar)}</div>`;
    host.hidden = false;
    initVehicleCards();
  } catch (error) {
    console.warn("[AutoSelect] similar vehicles", error);
  }
}

/* ------------------------------------------------------------------ */
/* SEO                                                                 */
/* ------------------------------------------------------------------ */

function absolute(path) {
  try {
    return new URL(path, window.location.href).href;
  } catch {
    return path;
  }
}

function applySeo(vehicle) {
  const title = `${vehicleLabel(vehicle)} for sale — AutoSelect Dallas`;
  const description = `${vehicleLabel(vehicle)} with ${formatMilesExact(vehicle.mileage)} for ${formatCurrency(
    vehicle.price
  )}. 150-point inspected, CARFAX verified. Estimate ${formatCurrency(
    monthlyFor(vehicle.price)
  )}/mo and check out instantly on WhatsApp.`;
  document.title = title;
  qs('meta[name="description"]')?.setAttribute("content", description);
  qs("#ogTitle")?.setAttribute("content", title);
  qs("#ogDescription")?.setAttribute("content", description);
  const shareableImages = images.filter((src) => !/^(data|blob):/i.test(src));
  const ogImage = qs("#ogImage");
  if (ogImage) {
    ogImage.setAttribute("content", absolute(resolveAsset(shareableImages[0] || images[0])));
  }
  qs("[data-crumb]").textContent = vehicleTitle(vehicle);

  const canonical = qs("#canonicalLink");
  if (canonical) canonical.href = window.location.href;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: vehicleLabel(vehicle),
    description,
    image: shareableImages.length
      ? shareableImages.map((src) => absolute(resolveAsset(src)))
      : undefined,
    brand: { "@type": "Brand", name: vehicle.make },
    model: vehicle.model,
    vehicleModelDate: String(vehicle.year),
    vehicleIdentificationNumber: vehicle.vin || undefined,
    color: vehicle.exteriorColor || undefined,
    bodyType: vehicle.bodyStyle || undefined,
    fuelType: vehicle.fuelType || undefined,
    vehicleTransmission: vehicle.transmission || undefined,
    mileageFromOdometer: vehicle.mileage
      ? { "@type": "QuantitativeValue", value: Number(vehicle.mileage), unitCode: "SMI" }
      : undefined,
    numberOfDoors: undefined,
    offers: {
      "@type": "Offer",
      price: Number(vehicle.price) || 0,
      priceCurrency: "USD",
      availability: (vehicle.status || "available") === "available" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      url: window.location.href,
      seller: {
        "@type": "AutoDealer",
        name: DEALER_NAME,
        telephone: DEALER_PHONE_DISPLAY,
      },
    },
  };
  const script = qs("#vehicleJsonLd");
  if (script) script.textContent = JSON.stringify(schema);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function showError(title, copy) {
  document.body.classList.remove("has-sticky-buy");
  const state = qs("#vehicleError");
  if (!state) return;
  state.hidden = false;
  state.querySelector("h1").textContent = title;
  state.querySelector("p").textContent = copy;
  state.querySelector(".state__actions").innerHTML = `
    <button type="button" class="btn btn--primary" data-retry><span class="material-symbols-outlined">refresh</span>Try again</button>
    <a class="btn btn--ghost" href="inventory.html">Browse inventory</a>`;
}

function bindLeadLogging() {
  qsa("[data-wa-checkout]").forEach((link) => {
    link.addEventListener("click", () => {
      if (!currentVehicle) return;
      const message = vehicleCheckoutMessage(currentVehicle, finance);
      saveLead({
        type: "whatsapp",
        vehicleId: currentVehicle.id,
        vehicleName: vehicleLabel(currentVehicle),
        message,
        meta: {
          price: Number(currentVehicle.price) || 0,
          stockNumber: currentVehicle.stockNumber || currentVehicle.id,
          downPayment: finance.downPayment,
          term: finance.term,
          apr: finance.apr,
        },
      });
    });
  });
}

function bindVehicleActions(vehicle) {
  qsa("[data-save-vehicle]").forEach((button) => button.addEventListener("click", toggleSaved));
  qsa("[data-share-vehicle]").forEach((button) => button.addEventListener("click", shareVehicle));
  qsa("[data-test-drive]").forEach((button) => button.addEventListener("click", openTestDrive));
  qsa("[data-inspection-pdf]").forEach((button) =>
    button.addEventListener("click", () => downloadInspectionReport(vehicle))
  );

  bindGallery(vehicle);
  bindFinance(vehicle);
  bindLeadLogging();
  syncSaveButtons();

  const sticky = qs("[data-sticky-buy]");
  requestAnimationFrame(() => sticky?.classList.add("is-visible"));
}

async function loadVehicle() {
  const id = getParam("id");
  if (!id) {
    qs("[data-veh-skeleton]")?.remove();
    showError(
      "No vehicle selected",
      "This link is missing a vehicle ID. Pick a certified car from inventory and we'll pull up the full report."
    );
    return;
  }

  try {
    const vehicle = await getVehicle(id);
    if (!vehicle) {
      qs("[data-veh-skeleton]")?.remove();
      showError(
        "Vehicle not found",
        "This listing may have sold or the link is incomplete. Browse our certified inventory to find your next car."
      );
      document.title = "Vehicle not found — AutoSelect Dallas";
      return;
    }

    currentVehicle = vehicle;
    images = (Array.isArray(vehicle.images) && vehicle.images.filter(Boolean)) || [];
    if (!images.length) images = ["assets/placeholder-car.svg"];
    photoIndex = 0;

    root.innerHTML = renderVehicle(vehicle);
    applySeo(vehicle);
    bindVehicleActions(vehicle);

    qs("#similarSection")?.remove();
    root.insertAdjacentHTML("beforeend", '<div class="veh-similar" id="similarSection" hidden></div>');

    const viewKey = `as_viewed_${vehicle.id}`;
    try {
      if (!sessionStorage.getItem(viewKey)) {
        sessionStorage.setItem(viewKey, "1");
        incrementViewCount(vehicle.id);
      }
    } catch {
      /* storage unavailable */
    }

    await renderSimilar(vehicle);
  } catch (error) {
    console.error("[AutoSelect] vehicle page", error);
    qs("[data-veh-skeleton]")?.remove();
    showError("We couldn't load this vehicle", "Something went wrong while fetching the listing. Try again in a moment.");
  }
}

async function boot() {
  await mountShell({ active: "inventory" });
  bindTestDriveModal();
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry]")) window.location.reload();
  });
  await loadVehicle();
}

boot();
