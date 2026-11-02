/**
 * Sell / trade-in page: live valuation, photo uploads and offer submission.
 */
import { isDemoConfigured, saveValuation, uploadValuationImage } from "../data-store.js?v=20261102d";
import { requireAccount } from "../account-gate.js?v=20261102d";
import { getCurrentUser, watchUser } from "../auth.js?v=20261102d";
import { mountShell, setButtonLoading, showToast } from "../ui.js?v=20261102d";
import { waLink } from "../whatsapp.js?v=20261102d";
import {
  clamp,
  formatCurrency,
  formatNumber,
  isValidEmail,
  isValidPhone,
  qs,
} from "../utils.js?v=20261102d";

const CURRENT_YEAR = new Date().getFullYear();
const MAX_PHOTOS = 4;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const LUXURY_MAKES = /bmw|mercedes|audi|lexus|tesla|porsche|volvo|cadillac|genesis|acura|infiniti|land rover/i;

const photos = [];
let submitting = false;

const FIELD_INPUTS = {
  year: "sellYear",
  make: "sellMake",
  model: "sellModel",
  mileage: "sellMileage",
  name: "sellName",
  phone: "sellPhone",
  email: "sellEmail",
};

function populateYears() {
  const select = qs("#sellYear");
  if (!select) return;
  const years = [];
  for (let year = CURRENT_YEAR; year >= 1990; year -= 1) years.push(year);
  select.innerHTML = '<option value="">Select year</option>';
  select.insertAdjacentHTML(
    "beforeend",
    years.map((year) => `<option value="${year}">${year}</option>`).join("")
  );
}

function readForm() {
  return {
    year: Number(qs("#sellYear").value) || 0,
    make: qs("#sellMake").value.trim(),
    model: qs("#sellModel").value.trim(),
    trim: qs("#sellTrim").value.trim(),
    mileage: qs("#sellMileage").value === "" ? null : Number(qs("#sellMileage").value),
    vin: qs("#sellVin").value.trim(),
    condition: qs('input[name="condition"]:checked')?.value || "Good",
    name: qs("#sellName").value.trim(),
    phone: qs("#sellPhone").value.trim(),
    email: qs("#sellEmail").value.trim(),
  };
}

export function estimateTradeIn({ year, mileage, make = "", condition = "Good" }) {
  if (!year || mileage === null || mileage === undefined || Number.isNaN(Number(mileage))) return null;
  const miles = Math.max(0, Number(mileage));
  const age = Math.max(0, CURRENT_YEAR - year);
  const base = 42000 * Math.pow(0.868, age);
  const mileageFactor = clamp(1 - miles / 190000, 0.42, 1.04);
  const conditionFactor = { Excellent: 1.09, Good: 1, Fair: 0.88, Rough: 0.7 }[condition] ?? 1;
  const makeFactor = LUXURY_MAKES.test(make) ? 1.14 : 1;
  const mid = base * mileageFactor * conditionFactor * makeFactor;
  const low = Math.max(500, Math.round((mid * 0.93) / 250) * 250);
  const high = Math.max(low + 250, Math.round((mid * 1.06) / 250) * 250);
  return { low, high, age, miles, condition };
}

function estimateHint(data, estimate) {
  if (estimate) {
    return `${formatNumber(estimate.miles)} miles · ${estimate.condition} condition · Dallas market`;
  }
  const hasYear = Boolean(data.year);
  const hasMileage = data.mileage !== null && Number.isFinite(data.mileage);
  if (!hasYear && !hasMileage) return "Choose your year and mileage to see a live range.";
  if (!hasYear) return "Add your vehicle year to unlock the range.";
  if (!hasMileage) return "Add mileage to unlock your range.";
  return "Enter mileage between 0 and 400,000 for a live range.";
}

function waEstimateMessage(data, estimate) {
  const name = [data.year, data.make, data.model, data.trim].filter(Boolean).join(" ");
  const range = `${formatCurrency(estimate.low)}–${formatCurrency(estimate.high)}`;
  return `Hi AutoSelect! I'd like a trade-in valuation for my ${name || "vehicle"} with ${formatNumber(
    estimate.miles
  )} miles in ${estimate.condition} condition. My instant estimate was ${range}. Can you confirm the next steps?`;
}

function updateEstimate() {
  const data = readForm();
  const estimate = estimateTradeIn(data);

  const card = qs("[data-offer-card]");
  card?.classList.toggle("is-empty", !estimate);

  qs("[data-estimate-low]").textContent = estimate ? formatCurrency(estimate.low) : "—";
  qs("[data-estimate-high]").textContent = estimate ? formatCurrency(estimate.high) : "—";
  qs("[data-estimate-hint]").textContent = estimateHint(data, estimate);

  qs("[data-est-age]").textContent = estimate
    ? estimate.age < 1
      ? "Under 1 year"
      : `${estimate.age} year${estimate.age === 1 ? "" : "s"}`
    : "—";
  qs("[data-est-mileage]").textContent =
    data.mileage !== null && Number.isFinite(data.mileage) ? `${formatNumber(data.mileage)} mi` : "—";
  qs("[data-est-condition]").textContent = data.condition;

  const wa = qs("[data-estimate-wa]");
  if (wa) {
    if (estimate) {
      wa.href = waLink(waEstimateMessage(data, estimate));
      wa.setAttribute("aria-disabled", "false");
    } else {
      wa.href = "#";
      wa.setAttribute("aria-disabled", "true");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Photos                                                              */
/* ------------------------------------------------------------------ */

function photoNote() {
  const note = qs("[data-photo-note]");
  if (!note) return;
  note.textContent = photos.length
    ? `${photos.length} of ${MAX_PHOTOS} photos added. The first photo is your cover shot.`
    : "Photos are optional — add up to 4 angles for a sharper appraisal.";
}

function renderPhotos() {
  const grid = qs("[data-photo-grid]");
  if (!grid) return;
  grid.innerHTML = photos
    .map(
      (photo, index) => `<li class="sell-photo">
        <img src="${photo.url}" alt="Your vehicle photo ${index + 1}">
        ${index === 0 ? '<span class="sell-photo__tag">Cover</span>' : ""}
        <button type="button" class="sell-photo__remove" data-remove-photo="${index}" aria-label="Remove photo ${index + 1}">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </li>`
    )
    .join("");
  photoNote();
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const remaining = MAX_PHOTOS - photos.length;
  if (remaining <= 0) {
    showToast(`You can add up to ${MAX_PHOTOS} photos.`, "info");
    return;
  }
  let added = 0;
  for (const file of files) {
    if (added >= remaining) {
      showToast(`You can add up to ${MAX_PHOTOS} photos.`, "info");
      break;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      showToast(`${file.name} isn't a JPG, PNG or WebP image.`, "error");
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast(`${file.name} is larger than 8 MB.`, "error");
      continue;
    }
    photos.push({ file, url: URL.createObjectURL(file) });
    added += 1;
  }
  const input = qs("#sellPhotos");
  if (input) input.value = "";
  renderPhotos();
}

function removePhoto(index) {
  const photo = photos[index];
  if (!photo) return;
  URL.revokeObjectURL(photo.url);
  photos.splice(index, 1);
  renderPhotos();
}

function bindPhotos() {
  const input = qs("#sellPhotos");
  const drop = qs(".sell-drop");
  if (!input || !drop) return;

  input.addEventListener("change", () => addFiles(input.files));

  ["dragenter", "dragover"].forEach((type) => {
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add("is-dragging");
    });
  });
  ["dragleave", "dragend"].forEach((type) => {
    drop.addEventListener(type, () => drop.classList.remove("is-dragging"));
  });
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("is-dragging");
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  });

  qs("[data-photo-grid]")?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-photo]");
    if (remove) removePhoto(Number(remove.dataset.removePhoto));
  });
}

/** Demo mode keeps a small data URL; Firebase mode uploads to Storage. */
function downscalePhoto(file, maxWidth = 720, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not decode that photo."));
      image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function encodePhoto(file) {
  if (isDemoConfigured()) return downscalePhoto(file);
  return uploadValuationImage(file);
}

/* ------------------------------------------------------------------ */
/* Validation + submit                                                 */
/* ------------------------------------------------------------------ */

function setFieldError(field, invalid) {
  const error = qs(`[data-error-for="${field}"]`);
  if (error) error.hidden = !invalid;
  const input = qs(`#${FIELD_INPUTS[field]}`);
  if (input) {
    if (invalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
}

function validateForm() {
  const data = readForm();
  const invalid = [];

  if (!data.year) invalid.push("year");
  if (!data.make) invalid.push("make");
  if (!data.model) invalid.push("model");
  if (data.mileage === null || !Number.isFinite(data.mileage) || data.mileage < 0 || data.mileage > 400000) {
    invalid.push("mileage");
  }
  if (!data.name) invalid.push("name");
  if (!isValidPhone(data.phone)) invalid.push("phone");
  if (!isValidEmail(data.email)) invalid.push("email");

  Object.keys(FIELD_INPUTS).forEach((field) => setFieldError(field, invalid.includes(field)));

  if (invalid.length) {
    const first = qs(`#${FIELD_INPUTS[invalid[0]]}`);
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("Please fix the highlighted details.", "error");
    return null;
  }
  return data;
}

function showSuccess(record, estimate, data) {
  const card = qs("#sellSuccess");
  const name = data.name.split(/\s+/)[0] || "neighbor";
  qs("[data-success-name]").textContent = name;
  qs("[data-success-range]").textContent = estimate
    ? `${formatCurrency(estimate.low)} – ${formatCurrency(estimate.high)}`
    : "Pending review";
  qs("[data-success-vehicle]").textContent = [data.year, data.make, data.model, data.trim]
    .filter(Boolean)
    .join(" ")
    .concat(estimate ? ` · ${formatNumber(estimate.miles)} mi · ${data.condition}` : "");
  qs("[data-success-ref]").textContent = String(record.id || "").toUpperCase();

  const message = [
    `Hi AutoSelect! I just requested a trade-in appraisal for my ${data.year} ${data.make} ${data.model} ${data.trim}`.trim() + ".",
    estimate ? `My instant range was ${formatCurrency(estimate.low)}–${formatCurrency(estimate.high)} for ${formatNumber(estimate.miles)} miles in ${data.condition} condition.` : "",
    `Reference ${record.id}. Can we book the 15-minute inspection?`,
  ]
    .filter(Boolean)
    .join(" ");
  qs("[data-success-wa]").href = waLink(message);

  qs(".sell-hero").hidden = true;
  qs("#sellLayout").hidden = true;
  qs(".sell-how").hidden = true;
  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleSubmit(event) {
  event.preventDefault();
  if (submitting) return;
  const data = validateForm();
  if (!data) return;

  const account = await requireAccount({
    title: "Sign in to submit your trade-in",
    copy: "Create a free account so your appraisal, offer confirmation and specialist replies stay together in your dashboard.",
    whatsappMessage: `Hi AutoSelect! I'd like a trade-in valuation for my ${[data.year, data.make, data.model]
      .filter(Boolean)
      .join(" ")} with ${formatNumber(data.mileage)} miles.`,
    redirect: "sell.html",
  });
  if (!account) return;

  const estimate = estimateTradeIn(data);
  const button = qs("#sellSubmit");
  submitting = true;
  setButtonLoading(button, true, "Sending details…");

  const uploaded = [];
  for (const photo of photos) {
    try {
      uploaded.push(await encodePhoto(photo.file));
    } catch (error) {
      console.warn("[AutoSelect] valuation photo failed", error);
    }
  }

  try {
    const record = await saveValuation({
      ...data,
      estimateLow: estimate?.low || 0,
      estimateHigh: estimate?.high || 0,
      photos: uploaded,
    });
    showSuccess(record, estimate, data);
    showToast("Trade-in request received. A specialist will text you shortly.", "success");
  } catch (error) {
    console.error("[AutoSelect] valuation failed", error);
    showToast("We couldn't send your request. Please try again.", "error");
  } finally {
    submitting = false;
    setButtonLoading(button, false);
  }
}

function syncAccount(user) {
  const notice = qs("[data-sell-account-note]");
  if (notice) notice.hidden = Boolean(user);
  if (!user) return;
  [
    ["#sellName", user.name],
    ["#sellPhone", user.phone],
    ["#sellEmail", user.email],
  ].forEach(([selector, value]) => {
    const input = qs(selector);
    if (input && !input.value.trim() && value) input.value = value;
  });
}

async function boot() {
  await mountShell({ active: "sell" });
  populateYears();
  bindPhotos();

  watchUser(syncAccount);
  syncAccount(getCurrentUser());
  qs("[data-sell-wa]")?.setAttribute(
    "href",
    waLink("Hi AutoSelect! I'd like to sell or trade my vehicle and continue on WhatsApp.")
  );

  const form = qs("#sellForm");
  form?.addEventListener("input", updateEstimate);
  form?.addEventListener("change", updateEstimate);
  form?.addEventListener("submit", handleSubmit);

  qs("[data-estimate-wa]")?.addEventListener("click", (event) => {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") event.preventDefault();
  });

  renderPhotos();
  updateEstimate();

  window.addEventListener("beforeunload", () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
  });
}

boot();
