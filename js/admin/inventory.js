/**
 * Dealer portal — inventory table and the full vehicle editor.
 */
import {
  bulkDeleteVehicles,
  bulkUpdateVehicles,
  deleteVehicle,
  saveVehicle,
  uploadVehicleImage,
} from "../data-store.js?v=20261102a";
import { setButtonLoading, showToast } from "../ui.js?v=20261102a";
import { escapeHtml, formatCurrency, formatMileage, qs, qsa } from "../utils.js?v=20261102a";
import {
  assetPath,
  downloadCsv,
  leadDate,
  vehicleName,
  vehicleStatusBadge,
  vehicleThumb,
} from "./helpers.js?v=20261102a";

const MAX_IMAGES = 24;
const MAX_EMBEDDED = 4;
const EMBEDDED_BUDGET = 700000;
const CURRENT_YEAR = new Date().getFullYear();

let vehicles = [];
let filters = { query: "", status: "all" };
let visibleIds = [];
const selected = new Set();
let editing = null;
let images = [];
let uploading = false;
let warnedEmbedded = false;
let context = { reload: async () => {}, confirmAction: async () => false, onSaved: () => {} };

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

function matches(vehicle) {
  if (filters.status === "featured" && !vehicle.featured) return false;
  if (
    filters.status !== "all" &&
    filters.status !== "featured" &&
    (vehicle.status || "available") !== filters.status
  ) {
    return false;
  }
  if (!filters.query) return true;
  const haystack = [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.trim,
    vehicle.stockNumber,
    vehicle.vin,
    vehicle.bodyStyle,
    vehicle.exteriorColor,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(filters.query);
}

function visibleVehicles() {
  return vehicles
    .filter(matches)
    .sort((a, b) => vehicleName(a).localeCompare(vehicleName(b), undefined, { numeric: true }));
}

function row(vehicle) {
  const id = escapeHtml(vehicle.id);
  const name = escapeHtml(vehicleName(vehicle));
  const stock = escapeHtml(vehicle.stockNumber || "No stock #");
  const vin = vehicle.vin ? ` · VIN ${escapeHtml(String(vehicle.vin).slice(-6))}` : "";
  const status = vehicle.status || "available";
  return `
    <tr>
      <td>
        <div class="adm-table__vehicle">
          <label class="adm-select" title="Select ${name}">
            <input type="checkbox" data-select-vehicle="${id}"${selected.has(vehicle.id) ? " checked" : ""} aria-label="Select ${name}">
          </label>
          <img class="adm-table__thumb" src="${escapeHtml(assetPath(vehicleThumb(vehicle)))}" alt="" loading="lazy" width="58" height="42">
          <div class="adm-table__vtext">
            <strong>${name}</strong>
            <span>${stock}${vin}</span>
            <span class="adm-table__mobile">${formatCurrency(Number(vehicle.price) || 0)} · ${formatMileage(Number(vehicle.mileage) || 0)} mi · ${status.charAt(0).toUpperCase() + status.slice(1)}${vehicle.featured ? " · Featured" : ""}</span>
          </div>
        </div>
      </td>
      <td class="adm-table__num">${formatCurrency(Number(vehicle.price) || 0)}</td>
      <td class="adm-table__num">${formatMileage(Number(vehicle.mileage) || 0)}</td>
      <td>${vehicleStatusBadge(vehicle.status || "available")}</td>
      <td>${vehicle.featured ? `<span class="adm-table__featured" title="Featured"><span class="material-symbols-outlined" aria-hidden="true">star</span></span>` : `<span style="color:var(--slate)">—</span>`}</td>
      <td class="adm-table__date adm-hide-sm">${leadDate(vehicle.updatedAt || vehicle.createdAt)}</td>
      <td class="adm-table__actions">
        <span class="adm-row-actions">
          <a class="adm-row-btn" href="../vehicle.html?id=${encodeURIComponent(vehicle.id)}" target="_blank" rel="noopener" aria-label="View ${name} on the site">
            <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
          </a>
          <button class="adm-row-btn" type="button" data-edit-vehicle="${id}" aria-label="Edit ${name}">
            <span class="material-symbols-outlined" aria-hidden="true">edit</span>
          </button>
          <button class="adm-row-btn adm-row-btn--danger" type="button" data-delete-vehicle="${id}" aria-label="Delete ${name}">
            <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          </button>
        </span>
      </td>
    </tr>`;
}

function emptyMarkup() {
  const hasFilters = Boolean(filters.query || filters.status !== "all");
  if (!vehicles.length) {
    return `
      <div class="adm-empty">
        <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">directions_car</span></div>
        <h3>No vehicles in stock</h3>
        <p>Add a vehicle manually or seed the showcase catalogue to explore the portal.</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn--primary btn--sm" type="button" data-add-vehicle><span class="material-symbols-outlined" aria-hidden="true">add</span>Add vehicle</button>
          <button class="btn btn--ghost btn--sm" type="button" data-seed-inventory><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>Seed demo stock</button>
        </div>
      </div>`;
  }
  return `
    <div class="adm-empty">
      <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">search_off</span></div>
      <h3>No matching vehicles</h3>
      <p>No stock records match this search and status filter.</p>
      ${hasFilters ? `<button class="btn btn--ghost btn--sm" type="button" data-clear-inventory-filters><span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>Clear filters</button>` : ""}
    </div>`;
}

export function renderInventory(list = []) {
  vehicles = Array.isArray(list) ? list : [];
  const known = new Set(vehicles.map((vehicle) => vehicle.id));
  selected.forEach((id) => {
    if (!known.has(id)) selected.delete(id);
  });

  const counter = qs("[data-count-inventory]");
  if (counter) counter.textContent = String(vehicles.length);
  const total = qs("[data-inventory-count]");
  if (total) total.textContent = String(vehicles.length);

  const body = qs("[data-inventory-body]");
  if (!body) return;

  const listToShow = visibleVehicles();
  visibleIds = listToShow.map((vehicle) => vehicle.id);
  selected.forEach((id) => {
    if (!visibleIds.includes(id)) selected.delete(id);
  });
  const shown = qs("[data-inv-shown]");
  if (shown) shown.textContent = String(listToShow.length);

  if (!listToShow.length) {
    body.innerHTML = emptyMarkup();
    updateBulkBar();
    return;
  }

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  body.innerHTML = `
    <div class="adm-table-wrap">
      <table class="adm-table adm-table--inventory">
        <caption class="sr-only">Vehicle inventory</caption>
        <thead>
          <tr>
            <th scope="col">
              <span class="adm-th-vehicle">
                <label class="adm-select" title="Select all visible vehicles">
                  <input type="checkbox" data-select-all aria-label="Select all visible vehicles"${allSelected ? " checked" : ""}>
                </label>
                Vehicle
              </span>
            </th>
            <th scope="col" class="adm-table__num">Price</th>
            <th scope="col" class="adm-table__num">Mileage</th>
            <th scope="col">Status</th>
            <th scope="col">Featured</th>
            <th scope="col" class="adm-hide-sm">Updated</th>
            <th scope="col" class="adm-table__actions">Actions</th>
          </tr>
        </thead>
        <tbody>${listToShow.map(row).join("")}</tbody>
      </table>
    </div>`;
  updateBulkBar();
}

function updateBulkBar() {
  const bar = qs("[data-bulk-bar]");
  if (bar) bar.hidden = selected.size === 0;
  const count = qs("[data-bulk-count]");
  if (count) count.textContent = String(selected.size);
  const all = qs("[data-select-all]");
  if (!all) return;
  const visibleSelected = visibleIds.filter((id) => selected.has(id)).length;
  all.checked = visibleIds.length > 0 && visibleSelected === visibleIds.length;
  all.indeterminate = visibleSelected > 0 && visibleSelected < visibleIds.length;
}

function toggleSelectAll(checked) {
  visibleIds.forEach((id) => {
    if (checked) selected.add(id);
    else selected.delete(id);
  });
  renderInventory(vehicles);
}

async function applyBulk(action) {
  const chosen = vehicles.filter((vehicle) => selected.has(vehicle.id));
  if (!chosen.length) return;

  if (action === "delete") {
    const confirmed = await context.confirmAction({
      title: "Delete selected vehicles?",
      message: `${chosen.length} vehicle${chosen.length === 1 ? "" : "s"} will be removed from inventory and the public site. This cannot be undone.`,
      confirmLabel: `Delete ${chosen.length} vehicle${chosen.length === 1 ? "" : "s"}`,
      danger: true,
    });
    if (!confirmed) return;
    try {
      await bulkDeleteVehicles(chosen.map((vehicle) => vehicle.id));
      selected.clear();
      showToast(`${chosen.length} vehicle${chosen.length === 1 ? "" : "s"} deleted.`, "success");
      await context.reload();
    } catch (error) {
      console.error("[AutoSelect] bulk delete failed", error);
      showToast(error.message || "Could not delete the selected vehicles.", "error");
    }
    return;
  }

  const patch =
    action === "feature"
      ? { featured: true }
      : action === "unfeature"
        ? { featured: false }
        : action === "sold"
          ? { status: "sold" }
          : { status: "available" };
  const verb =
    action === "feature"
      ? "featured"
      : action === "unfeature"
        ? "removed from featured"
        : action === "sold"
          ? "marked sold"
          : "marked available";

  try {
    await bulkUpdateVehicles(chosen.map((vehicle) => ({ ...vehicle, ...patch })));
    selected.clear();
    showToast(`${chosen.length} vehicle${chosen.length === 1 ? "" : "s"} ${verb}.`, "success");
    await context.reload();
  } catch (error) {
    console.error("[AutoSelect] bulk update failed", error);
    showToast(error.message || "Could not update the selected vehicles.", "error");
  }
}

function exportInventory() {
  const list = visibleVehicles();
  if (!list.length) {
    showToast("No vehicles to export with the current filters.", "info");
    return;
  }
  const rows = [
    [
      "Stock", "Year", "Make", "Model", "Trim", "VIN", "Price", "Mileage",
      "Status", "Featured", "Body style", "Fuel type", "Transmission",
      "Drivetrain", "Location", "Views", "Created",
    ],
    ...list.map((vehicle) => [
      vehicle.stockNumber || "",
      vehicle.year || "",
      vehicle.make || "",
      vehicle.model || "",
      vehicle.trim || "",
      vehicle.vin || "",
      Number(vehicle.price) || 0,
      Number(vehicle.mileage) || 0,
      vehicle.status || "available",
      vehicle.featured ? "yes" : "no",
      vehicle.bodyStyle || "",
      vehicle.fuelType || "",
      vehicle.transmission || "",
      vehicle.drivetrain || "",
      vehicle.location || "",
      Number(vehicle.viewCount) || 0,
      vehicle.createdAt?.toDate ? vehicle.createdAt.toDate().toISOString() : vehicle.createdAt || "",
    ]),
  ];
  downloadCsv(`autoselect-inventory-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  showToast(`Exported ${list.length} vehicles to CSV.`, "success");
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

function setValue(id, value) {
  const input = qs(`#${id}`);
  if (!input) return;
  if (input.type === "checkbox") input.checked = Boolean(value);
  else input.value = value ?? "";
}

function getValue(id) {
  const input = qs(`#${id}`);
  if (!input) return "";
  return input.type === "checkbox" ? input.checked : input.value.trim();
}

function clearEditorErrors() {
  const summary = qs("[data-vehicle-error]");
  if (summary) summary.hidden = true;
  qsa("[data-af-field]").forEach((field) => {
    field.classList.remove("is-invalid");
    const input = field.querySelector(".input, .select, .textarea");
    if (input) input.removeAttribute("aria-invalid");
  });
  qsa("[data-af-error]").forEach((node) => {
    node.hidden = true;
    node.textContent = "";
  });
}

function fieldError(name, message) {
  const field = qs(`[data-af-field="${name}"]`);
  const node = qs(`[data-af-error="${name}"]`);
  if (node) {
    node.textContent = message;
    node.hidden = false;
  }
  if (field) {
    field.classList.add("is-invalid");
    const input = field.querySelector(".input, .select, .textarea");
    if (input) input.setAttribute("aria-invalid", "true");
  }
  return field;
}

function showEditorError(message) {
  const box = qs("[data-vehicle-error]");
  if (!box) return;
  box.hidden = false;
  box.querySelector("p").textContent = message;
}

function openEditor(vehicle = null) {
  const dialog = qs("#vehicleDialog");
  if (!dialog) return;
  editing = vehicle;
  images = Array.isArray(vehicle?.images) ? [...vehicle.images] : [];
  clearEditorErrors();

  const title = qs("#vehicleDialogTitle");
  const subtitle = qs("#vehicleDialogSubtitle");
  if (title) title.textContent = vehicle ? "Edit vehicle" : "Add vehicle";
  if (subtitle) {
    subtitle.textContent = vehicle
      ? `${vehicleName(vehicle)} · ${vehicle.stockNumber || "no stock number"}`
      : "Create a listing with photos, specs and pricing.";
  }

  setValue("vfYear", vehicle?.year || CURRENT_YEAR);
  setValue("vfMake", vehicle?.make || "");
  setValue("vfModel", vehicle?.model || "");
  setValue("vfTrim", vehicle?.trim || "");
  setValue("vfStock", vehicle?.stockNumber || `AS-${Math.floor(1000 + Math.random() * 9000)}`);
  setValue("vfVin", vehicle?.vin || "");
  setValue("vfPrice", vehicle?.price ?? "");
  setValue("vfMsrp", vehicle?.msrp ?? "");
  setValue("vfBelowMarket", vehicle?.belowMarketAmount ?? 0);
  setValue("vfDealRating", vehicle?.dealRating || "Fair Market Price");
  setValue("vfMileage", vehicle?.mileage ?? "");
  setValue("vfBodyStyle", vehicle?.bodyStyle || "SUV");
  setValue("vfFuelType", vehicle?.fuelType || "Gasoline");
  setValue("vfTransmission", vehicle?.transmission || "Automatic");
  setValue("vfDrivetrain", vehicle?.drivetrain || "AWD");
  setValue("vfEngine", vehicle?.engine || "");
  setValue("vfSeats", vehicle?.seats ?? 5);
  setValue("vfMpgCity", vehicle?.mpgCity ?? "");
  setValue("vfMpgHwy", vehicle?.mpgHwy ?? "");
  setValue("vfExterior", vehicle?.exteriorColor || "");
  setValue("vfInterior", vehicle?.interiorColor || "");
  setValue("vfLocation", vehicle?.location || "Dallas, TX");
  setValue("vfStatus", vehicle?.status || "available");
  setValue("vfViewCount", vehicle?.viewCount ?? 0);
  setValue("vfFeatured", Boolean(vehicle?.featured));
  setValue("vfCertified", vehicle ? Boolean(vehicle.certified) : true);
  setValue("vfInspected", vehicle ? Boolean(vehicle.inspected150) : true);
  setValue("vfCarfax", vehicle ? Boolean(vehicle.carfaxClean) : true);
  setValue("vfOneOwner", Boolean(vehicle?.oneOwner));
  setValue(
    "vfFeatures",
    Array.isArray(vehicle?.features) ? vehicle.features.join("\n") : ""
  );
  setValue("vfBrakeLife", vehicle?.inspection?.brakeLife ?? 85);
  setValue("vfTireTread", vehicle?.inspection?.tireTread ?? 8);
  setValue("vfBattery", vehicle?.inspection?.battery || "100% Pass");
  setValue("vfFluids", vehicle?.inspection?.fluids || "Fresh Service A");

  renderImages();
  const note = qs("#afImageNote");
  if (note) {
    note.textContent = images.length
      ? `${images.length} photo${images.length === 1 ? "" : "s"} attached. First image is the cover; drag to reorder.`
      : "First image is the cover. Drag to reorder or use the arrow buttons.";
  }
  document.body.classList.add("modal-open");
  dialog.showModal();
  const body = qs(".adm-dialog__body", dialog);
  if (body) body.scrollTop = 0;
  requestAnimationFrame(() => qs("#vfMake")?.focus({ preventScroll: true }));
}

function closeEditor() {
  const dialog = qs("#vehicleDialog");
  if (!dialog || !dialog.open) return;
  dialog.close();
}

function renderImages() {
  const grid = qs("#afImageGrid");
  const empty = qs("#afImageEmpty");
  if (!grid) return;

  if (empty) empty.hidden = images.length > 0;
  grid.innerHTML = images
    .map(
      (src, index) => `
      <div class="af-image" draggable="true" data-img-index="${index}">
        <img src="${escapeHtml(assetPath(src))}" alt="Vehicle photo ${index + 1}" loading="lazy">
        ${index === 0 ? `<span class="af-image__cover">Cover</span>` : ""}
        <span class="af-image__drag" title="Drag to reorder"><span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span></span>
        <div class="af-image__tools">
          <button type="button" data-img-left="${index}" aria-label="Move photo ${index + 1} earlier"${index === 0 ? " disabled" : ""}>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
          <button type="button" data-img-cover="${index}" aria-label="Make photo ${index + 1} the cover"${index === 0 ? " disabled" : ""}>
            <span class="material-symbols-outlined" aria-hidden="true">star</span>
          </button>
          <button type="button" data-img-remove="${index}" aria-label="Remove photo ${index + 1}">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
      </div>`
    )
    .join("");
}

function moveImage(from, to) {
  if (to < 0 || to >= images.length || from === to) return;
  const [item] = images.splice(from, 1);
  images.splice(to, 0, item);
  renderImages();
}

async function addImages(fileList) {
  const files = Array.from(fileList || []).filter((file) => /^image\//.test(file.type));
  if (!files.length) {
    showToast("Choose JPG, PNG or WebP images.", "error");
    return;
  }
  if (uploading) return;
  const room = MAX_IMAGES - images.length;
  if (room <= 0) {
    showToast(`A listing can have up to ${MAX_IMAGES} photos.`, "error");
    return;
  }

  const batch = files.slice(0, room);
  const note = qs("#afImageNote");
  uploading = true;
  if (note) {
    note.classList.add("is-busy");
    note.textContent = `Uploading 0 of ${batch.length} photos…`;
  }

  for (let index = 0; index < batch.length; index += 1) {
    try {
      const url = await uploadVehicleImage(batch[index], editing?.id || "new-vehicle");
      if (url.startsWith("data:image/")) {
        const embedded = images.filter((src) => src.startsWith("data:image/"));
        const chars = embedded.reduce((sum, src) => sum + src.length, 0);
        if (embedded.length >= MAX_EMBEDDED || chars + url.length > EMBEDDED_BUDGET) {
          showToast(
            "Firebase Storage is not enabled, so photos are embedded in the listing. This listing already holds the maximum embedded photos — use Add by URL or enable Storage for more.",
            "info"
          );
          continue;
        }
        if (!warnedEmbedded) {
          warnedEmbedded = true;
          showToast(
            "Firebase Storage is not enabled — the photo was compressed and saved inside the listing.",
            "info"
          );
        }
      }
      images.push(url);
      renderImages();
    } catch (error) {
      console.error("[AutoSelect] image upload failed", error);
      showToast(error.message || "That photo could not be uploaded.", "error");
    }
    if (note) note.textContent = `Uploading ${index + 1} of ${batch.length} photos…`;
  }

  uploading = false;
  if (note) {
    note.classList.remove("is-busy");
    const embeddedCount = images.filter((src) => src.startsWith("data:image/")).length;
    note.textContent = `${images.length} photo${images.length === 1 ? "" : "s"} attached. First image is the cover; drag to reorder.${
      embeddedCount ? ` ${embeddedCount} embedded at reduced resolution because Storage is not enabled.` : ""
    }`;
  }
  if (files.length > room) {
    showToast(`Only ${room} more photo${room === 1 ? "" : "s"} could be added.`, "info");
  }
}

function addImageUrl() {
  const field = qs("#afImageUrl");
  const value = (field?.value || "").trim();
  if (!value) {
    showToast("Paste an image URL first.", "error");
    field?.focus();
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    showToast("That does not look like a valid image URL.", "error");
    field?.focus();
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    showToast("Use an http(s) image link.", "error");
    return;
  }
  if (images.length >= MAX_IMAGES) {
    showToast(`A listing can have up to ${MAX_IMAGES} photos.`, "error");
    return;
  }
  if (images.includes(url.href)) {
    showToast("That photo is already attached.", "info");
    return;
  }
  images.push(url.href);
  if (field) field.value = "";
  renderImages();
  const note = qs("#afImageNote");
  if (note) {
    note.textContent = `${images.length} photo${images.length === 1 ? "" : "s"} attached. First image is the cover; drag to reorder.`;
  }
}

function collectVehicle() {
  return {
    id: editing?.id,
    year: Number(getValue("vfYear")) || 0,
    make: getValue("vfMake"),
    model: getValue("vfModel"),
    trim: getValue("vfTrim"),
    stockNumber: getValue("vfStock"),
    vin: getValue("vfVin").toUpperCase(),
    price: Number(getValue("vfPrice")) || 0,
    msrp: Number(getValue("vfMsrp")) || 0,
    belowMarketAmount: Number(getValue("vfBelowMarket")) || 0,
    dealRating: getValue("vfDealRating"),
    mileage: Number(getValue("vfMileage")) || 0,
    bodyStyle: getValue("vfBodyStyle"),
    fuelType: getValue("vfFuelType"),
    transmission: getValue("vfTransmission"),
    drivetrain: getValue("vfDrivetrain"),
    engine: getValue("vfEngine"),
    seats: Number(getValue("vfSeats")) || 5,
    mpgCity: Number(getValue("vfMpgCity")) || 0,
    mpgHwy: Number(getValue("vfMpgHwy")) || 0,
    mpg: Number(getValue("vfMpgHwy")) || 0,
    exteriorColor: getValue("vfExterior"),
    interiorColor: getValue("vfInterior"),
    location: getValue("vfLocation"),
    status: getValue("vfStatus"),
    viewCount: Number(getValue("vfViewCount")) || 0,
    featured: getValue("vfFeatured"),
    certified: getValue("vfCertified"),
    inspected150: getValue("vfInspected"),
    carfaxClean: getValue("vfCarfax"),
    oneOwner: getValue("vfOneOwner"),
    features: getValue("vfFeatures")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    images: [...images],
    inspection: {
      brakeLife: Number(getValue("vfBrakeLife")) || 0,
      tireTread: Number(getValue("vfTireTread")) || 0,
      battery: getValue("vfBattery") || "100% Pass",
      fluids: getValue("vfFluids") || "Fresh Service A",
    },
  };
}

function validateVehicle(data) {
  clearEditorErrors();
  let firstInvalid = null;
  const fail = (name, message) => {
    const field = fieldError(name, message);
    if (!firstInvalid) firstInvalid = field;
  };

  if (!Number.isFinite(data.year) || data.year < 1990 || data.year > CURRENT_YEAR + 1) {
    fail("year", `Enter a model year between 1990 and ${CURRENT_YEAR + 1}.`);
  }
  if (data.make.length < 2) fail("make", "Enter the manufacturer.");
  if (data.model.length < 1) fail("model", "Enter the model name.");
  if (!data.stockNumber) fail("stockNumber", "A stock number is required.");
  if (data.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(data.vin)) {
    fail("vin", "A VIN must be exactly 17 valid characters.");
  }
  if (!Number.isFinite(data.price) || data.price < 500) fail("price", "Enter a price of $500 or more.");
  if (!Number.isFinite(data.mileage) || data.mileage < 0) fail("mileage", "Enter the odometer reading.");

  if (firstInvalid) {
    const target = firstInvalid.querySelector(".input, .select, .textarea");
    target?.focus({ preventScroll: true });
    firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
    showEditorError("Check the highlighted fields before saving.");
    return false;
  }
  return true;
}

async function submitVehicle(event) {
  event.preventDefault();
  if (uploading) {
    showToast("Wait for the photos to finish uploading.", "info");
    return;
  }
  const data = collectVehicle();
  if (!validateVehicle(data)) return;

  const saveButton = qs("#vfSave");
  setButtonLoading(saveButton, true, "Saving…");
  try {
    await saveVehicle(data);
    showToast(editing ? "Vehicle updated." : "Vehicle added to inventory.", "success");
    closeEditor();
    await context.reload();
    context.onSaved();
  } catch (error) {
    console.error("[AutoSelect] save vehicle failed", error);
    showEditorError(error.message || "Could not save this vehicle. Please try again.");
  } finally {
    setButtonLoading(saveButton, false);
  }
}

async function removeVehicle(id) {
  const vehicle = vehicles.find((item) => item.id === id);
  if (!vehicle) return;
  const name = vehicleName(vehicle);
  const confirmed = await context.confirmAction({
    title: "Delete this vehicle?",
    message: `${name} (${vehicle.stockNumber || "no stock"}) will be removed from inventory and the public site. This cannot be undone.`,
    confirmLabel: "Delete vehicle",
    danger: true,
  });
  if (!confirmed) return;
  try {
    await deleteVehicle(id);
    showToast("Vehicle deleted.", "success");
    await context.reload();
  } catch (error) {
    console.error("[AutoSelect] delete failed", error);
    showToast(error.message || "Could not delete that vehicle.", "error");
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

export function initInventory(options = {}) {
  context = { ...context, ...options };

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-add-vehicle]")) {
      event.preventDefault();
      openEditor(null);
      return;
    }
    const edit = event.target.closest("[data-edit-vehicle]");
    if (edit) {
      const vehicle = vehicles.find((item) => item.id === edit.dataset.editVehicle);
      if (vehicle) openEditor(vehicle);
      return;
    }
    const remove = event.target.closest("[data-delete-vehicle]");
    if (remove) removeVehicle(remove.dataset.deleteVehicle);

    const bulk = event.target.closest("[data-bulk-action]");
    if (bulk) {
      applyBulk(bulk.dataset.bulkAction);
      return;
    }
    if (event.target.closest("[data-bulk-clear]")) {
      selected.clear();
      renderInventory(vehicles);
      return;
    }
    if (event.target.closest("[data-export-inventory]")) {
      exportInventory();
      return;
    }

    const clear = event.target.closest("[data-clear-inventory-filters]");
    if (clear) {
      filters = { query: "", status: "all" };
      const search = qs("#admInvSearch");
      const status = qs("#admInvStatus");
      if (search) search.value = "";
      if (status) status.value = "all";
      renderInventory(vehicles);
    }
  });

  const search = qs("#admInvSearch");
  const status = qs("#admInvStatus");
  if (search) {
    let timer = null;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        filters.query = search.value.trim().toLowerCase();
        renderInventory(vehicles);
      }, 160);
    });
  }
  if (status) {
    status.addEventListener("change", () => {
      filters.status = status.value;
      renderInventory(vehicles);
    });
  }

  document.addEventListener("change", (event) => {
    const single = event.target.closest("[data-select-vehicle]");
    if (single) {
      if (single.checked) selected.add(single.dataset.selectVehicle);
      else selected.delete(single.dataset.selectVehicle);
      updateBulkBar();
      return;
    }
    const all = event.target.closest("[data-select-all]");
    if (all) toggleSelectAll(all.checked);
  });

  const form = qs("#vehicleForm");
  form?.addEventListener("submit", submitVehicle);

  qsa("[data-vehicle-cancel]").forEach((button) => {
    button.addEventListener("click", closeEditor);
  });

  const dialog = qs("#vehicleDialog");
  if (dialog) {
    dialog.addEventListener("close", () => {
      document.body.classList.remove("modal-open");
      editing = null;
      images = [];
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeEditor();
    });
  }

  const drop = qs("#afDrop");
  const input = qs("#afImages");
  if (drop && input) {
    drop.addEventListener("click", () => input.click());
    drop.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => {
      addImages(input.files);
      input.value = "";
    });
    ["dragenter", "dragover"].forEach((type) =>
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add("is-dragging");
      })
    );
    ["dragleave", "drop"].forEach((type) =>
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.remove("is-dragging");
      })
    );
    drop.addEventListener("drop", (event) => {
      if (event.dataTransfer?.files?.length) addImages(event.dataTransfer.files);
    });
  }

  const urlField = qs("#afImageUrl");
  qs("#afImageUrlAdd")?.addEventListener("click", addImageUrl);
  urlField?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addImageUrl();
    }
  });

  const grid = qs("#afImageGrid");
  let dragIndex = null;
  if (grid) {
    grid.addEventListener("click", (event) => {
      const left = event.target.closest("[data-img-left]");
      if (left) return moveImage(Number(left.dataset.imgLeft), Number(left.dataset.imgLeft) - 1);
      const cover = event.target.closest("[data-img-cover]");
      if (cover) return moveImage(Number(cover.dataset.imgCover), 0);
      const remove = event.target.closest("[data-img-remove]");
      if (remove) {
        images.splice(Number(remove.dataset.imgRemove), 1);
        renderImages();
        const note = qs("#afImageNote");
        if (note) note.textContent = `${images.length} photo${images.length === 1 ? "" : "s"} attached. First image is the cover.`;
      }
    });
    grid.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-img-index]");
      if (!card) return;
      dragIndex = Number(card.dataset.imgIndex);
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(dragIndex));
    });
    grid.addEventListener("dragend", () => {
      dragIndex = null;
      qsa(".af-image", grid).forEach((card) => card.classList.remove("is-dragging", "is-target"));
    });
    grid.addEventListener("dragover", (event) => {
      const card = event.target.closest("[data-img-index]");
      if (!card || dragIndex === null) return;
      event.preventDefault();
      qsa(".af-image", grid).forEach((item) => item.classList.toggle("is-target", item === card));
    });
    grid.addEventListener("drop", (event) => {
      const card = event.target.closest("[data-img-index]");
      if (!card || dragIndex === null) return;
      event.preventDefault();
      moveImage(dragIndex, Number(card.dataset.imgIndex));
      dragIndex = null;
    });
  }
}
