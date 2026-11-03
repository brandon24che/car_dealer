/**
 * Dealer portal — leads table, filters, status updates, concierge replies and CSV export.
 */
import { getVehicle, replyToLead, updateLeadStatus } from "../data-store.js?v=20261103a";
import { getCurrentUser } from "../auth.js?v=20261103a";
import {
  escapeHtml,
  formatCurrency,
  formatMilesExact,
  initials,
  qs,
  qsa,
  trapFocus,
  truncate,
} from "../utils.js?v=20261103a";
import { showToast } from "../ui.js?v=20261103a";
import { DEALER_NAME, waLink } from "../whatsapp.js?v=20261103a";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  assetPath,
  downloadCsv,
  leadDate,
  leadDateTime,
  leadSummary,
  leadType,
  leadTypeBadge,
  timeValue,
  vehicleName as vehicleLabel,
  vehicleThumb,
} from "./helpers.js?v=20261103a";

let leads = [];
let filters = { query: "", type: "all", status: "all" };
let replyingTo = null;
let detailing = null;
let detailToken = 0;
let lastDetailTrigger = null;

function matches(lead) {
  if (filters.type !== "all" && (lead.type || "whatsapp") !== filters.type) return false;
  if (filters.status !== "all" && (lead.status || "new") !== filters.status) return false;
  if (!filters.query) return true;
  const haystack = [
    lead.name,
    lead.email,
    lead.phone,
    lead.vehicleName,
    lead.vehicleId,
    lead.message,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(filters.query);
}

function filtered() {
  return leads
    .filter(matches)
    .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
}

function row(lead) {
  const name = escapeHtml(lead.name || "Website visitor");
  const email = String(lead.email || "").trim();
  const phone = String(lead.phone || "").trim();
  const status = lead.status || "new";
  const type = lead.type || "whatsapp";
  const summary = escapeHtml(leadSummary(lead));
  const vehicle = escapeHtml(lead.vehicleName || "");
  const id = escapeHtml(lead.id);
  const replies = Array.isArray(lead.replies) ? lead.replies : [];
  const latest = replies[replies.length - 1];
  const replyPreview = latest ? escapeHtml(truncate(latest.message || "", 74)) : "";
  return `
    <tr class="adm-lead-row${latest ? " adm-lead--replied" : ""}" data-lead-open="${id}" tabindex="0" aria-label="View all details for ${name}">
      <td>
        <div class="adm-customer">
          <strong>${name}<span class="material-symbols-outlined adm-customer__chev" aria-hidden="true">chevron_right</span></strong>
          ${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : `<span style="font-size:10.5px;color:var(--slate)">No email</span>`}
          ${phone ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}">${escapeHtml(phone)}</a>` : ""}
          <span class="adm-customer__mobile">
            ${leadTypeBadge(type)}
            ${vehicle ? `<span class="adm-customer__veh">${vehicle}</span>` : ""}
            <span class="adm-customer__msg">${summary}</span>
          </span>
        </div>
      </td>
      <td>
        ${leadTypeBadge(type)}
        ${vehicle ? `<div style="margin-top:4px;font-size:10.5px;color:var(--slate)">${vehicle}</div>` : ""}
      </td>
      <td>
        <div class="adm-lead-msg" title="${summary}">${summary}</div>
        ${latest ? `<div class="adm-lead-reply-preview"><span class="material-symbols-outlined" aria-hidden="true">support_agent</span><span>${replyPreview}</span></div>` : ""}
      </td>
      <td class="adm-table__date adm-hide-sm">${leadDate(lead.createdAt)}</td>
      <td>
        <label class="sr-only" for="leadStatus-${id}">Status for ${name}</label>
        <select class="select adm-lead-status" id="leadStatus-${id}" data-lead-status="${id}">
          ${LEAD_STATUSES.map(
            (value) => `<option value="${value}"${value === status ? " selected" : ""}>${LEAD_STATUS_LABELS[value]}</option>`
          ).join("")}
        </select>
      </td>
      <td class="adm-lead-actions">
        <button class="btn btn--ghost btn--sm adm-lead-reply" type="button" data-lead-reply="${id}" aria-label="Respond to ${name}">
          <span class="material-symbols-outlined" aria-hidden="true">reply</span>${latest ? "Reply again" : "Respond"}
        </button>
        <button class="adm-row-btn" type="button" data-lead-open="${id}" aria-label="Open full details for ${name}">
          <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>
      </td>
    </tr>`;
}

function emptyMarkup() {
  const hasFilters = Boolean(filters.query || filters.type !== "all" || filters.status !== "all");
  if (!leads.length) {
    return `
      <div class="adm-empty">
        <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">inbox</span></div>
        <h3>No leads yet</h3>
        <p>Contact requests, test drives, trade-in valuations and WhatsApp handoffs will appear here as customers submit them.</p>
        <a class="btn btn--ghost btn--sm" href="../contact.html" target="_blank" rel="noopener">
          <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>Open contact page
        </a>
      </div>`;
  }
  return `
    <div class="adm-empty">
      <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">filter_alt_off</span></div>
      <h3>No matching leads</h3>
      <p>No leads match the current search or filters. Try a different name, type or status.</p>
      ${hasFilters ? `<button class="btn btn--ghost btn--sm" type="button" data-clear-lead-filters><span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>Clear filters</button>` : ""}
    </div>`;
}

export function renderLeads(nextLeads = []) {
  leads = Array.isArray(nextLeads) ? nextLeads : [];
  const list = filtered();

  const shown = qs("[data-leads-shown]");
  if (shown) shown.textContent = String(list.length);
  const counter = qs("[data-count-leads]");
  if (counter) counter.textContent = String(leads.length);

  const body = qs("[data-leads-body]");
  if (!body) return;

  if (!list.length) {
    body.innerHTML = emptyMarkup();
    return;
  }

  body.innerHTML = `
    <div class="adm-table-wrap">
      <table class="adm-table adm-table--leads">
        <caption class="sr-only">Customer leads</caption>
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Request</th>
            <th scope="col">Message</th>
            <th scope="col" class="adm-hide-sm">Received</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>${list.map(row).join("")}</tbody>
      </table>
    </div>`;
  markActiveRow(detailing?.id);
}

function syncTableStatus(id, status) {
  qsa("[data-lead-status]").forEach((select) => {
    if (select.dataset.leadStatus === id) select.value = status;
  });
}

async function changeStatus(id, status) {
  if (!id || !LEAD_STATUSES.includes(status)) return;
  const lead = leads.find((item) => item.id === id);
  const previous = lead?.status || "new";
  if (lead) lead.status = status;
  syncTableStatus(id, status);
  if (lead) syncDetailStatus(lead);
  try {
    await updateLeadStatus(id, status);
    showToast(`Lead marked ${LEAD_STATUS_LABELS[status].toLowerCase()}.`, "success");
  } catch (error) {
    console.error("[AutoSelect] lead update failed", error);
    if (lead) lead.status = previous;
    syncTableStatus(id, previous);
    if (lead) syncDetailStatus(lead);
    showToast("Could not update that lead. Try again.", "error");
    renderLeads(leads);
  }
}

function exportCsv() {
  const list = filtered();
  if (!list.length) {
    showToast("No leads to export with the current filters.", "info");
    return;
  }
  const rows = [
    ["Name", "Email", "Phone", "Type", "Status", "Vehicle", "Message", "Received"],
    ...list.map((lead) => [
      lead.name || "",
      lead.email || "",
      lead.phone || "",
      lead.type || "whatsapp",
      lead.status || "new",
      lead.vehicleName || lead.vehicleId || "",
      lead.message || "",
      lead.createdAt?.toDate ? lead.createdAt.toDate().toISOString() : lead.createdAt || "",
    ]),
  ];
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`autoselect-leads-${stamp}.csv`, rows);
  showToast(`Exported ${list.length} leads to CSV.`, "success");
}

function replyTemplate(lead) {
  const meta = lead.meta || {};
  if (lead.type === "testDrive") {
    const when = [meta.preferredDate, meta.locationPreference].filter(Boolean).join(" at ");
    return `Your test drive${lead.vehicleName ? ` for the ${lead.vehicleName}` : ""} is confirmed${when ? ` for ${when}` : ""}. Bring a valid driver's license and we'll have the car ready. Reply here if you need a different time.`;
  }
  if (lead.type === "valuation") {
    return `We've reviewed your trade-in details. A specialist will call to confirm the final offer and arrange the 15-minute inspection. Reply here with any questions.`;
  }
  return `Thanks for reaching out to ${DEALER_NAME}. We're checking availability now and will confirm the next steps within the hour. Reply here if anything changes.`;
}

function openReplyDialog(lead) {
  const dialog = qs("#leadReplyDialog");
  if (!dialog || !lead) return;
  replyingTo = lead;
  const context = qs("[data-reply-context]");
  if (context) {
    const phone = String(lead.phone || "").trim();
    context.innerHTML = `
      <div>
        <strong>${escapeHtml(lead.name || "Website visitor")}</strong>
        <span>${escapeHtml(lead.vehicleName || leadSummary(lead))}</span>
      </div>
      <div class="adm-reply-context__channels">
        ${lead.email ? `<span><span class="material-symbols-outlined" aria-hidden="true">mail</span>${escapeHtml(lead.email)}</span>` : ""}
        ${phone ? `<span><span class="material-symbols-outlined" aria-hidden="true">call</span>${escapeHtml(phone)}</span>` : ""}
      </div>`;
  }
  const message = qs("#admReplyMessage");
  const status = qs("#admReplyStatus");
  const error = qs("[data-reply-error]");
  if (message) message.value = "";
  if (status) status.value = lead.status || "new";
  if (error) error.hidden = true;
  const waButton = qs('[data-reply-send="whatsapp"]');
  if (waButton) {
    waButton.disabled = !String(lead.phone || "").trim();
    waButton.title = waButton.disabled ? "This customer did not leave a phone number." : "";
  }
  dialog.showModal();
  requestAnimationFrame(() => message?.focus());
}

function closeReplyDialog() {
  const dialog = qs("#leadReplyDialog");
  if (dialog?.open) dialog.close();
  replyingTo = null;
}

async function sendReply(channel) {
  const lead = replyingTo;
  const messageInput = qs("#admReplyMessage");
  const statusInput = qs("#admReplyStatus");
  const errorBox = qs("[data-reply-error]");
  const message = String(messageInput?.value || "").trim();
  if (!lead) return;
  if (message.length < 2) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.querySelector("p").textContent = "Write a short reply before sending.";
    }
    messageInput?.focus();
    return;
  }
  if (errorBox) errorBox.hidden = true;

  const status = statusInput?.value || lead.status || "new";
  const buttons = [...document.querySelectorAll("[data-reply-send]")];
  buttons.forEach((button) => (button.disabled = true));

  try {
    const entry = await replyToLead(lead.id, {
      message,
      channel,
      status,
      actor: getCurrentUser(),
    });
    lead.replies = [...(Array.isArray(lead.replies) ? lead.replies : []), entry].slice(-20);
    lead.response = entry;
    lead.respondedAt = entry.at;
    lead.respondedBy = entry.by;
    if (status) lead.status = status;

    const phone = String(lead.phone || "").trim();
    const reference = String(lead.id || "").slice(0, 12).toUpperCase();
    closeReplyDialog();
    renderLeads(leads);
    if (detailing && detailing.id === lead.id) renderLeadDetail(lead, { keepScroll: true });

    if (channel === "whatsapp" && phone) {
      const text = `Hi ${lead.name || "there"}, this is ${DEALER_NAME} about request ${reference}.\n\n${message}`;
      window.open(waLink(text), "_blank", "noopener,noreferrer");
      showToast("Reply saved to the dashboard and WhatsApp opened.", "success");
    } else {
      showToast("Reply delivered to the customer dashboard.", "success");
    }
  } catch (error) {
    console.error("[AutoSelect] lead reply failed", error);
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.querySelector("p").textContent = error.message || "Could not send that reply. Try again.";
    }
    showToast("Could not send the reply.", "error");
  } finally {
    const waButton = qs('[data-reply-send="whatsapp"]');
    buttons.forEach((button) => (button.disabled = false));
    if (waButton && replyingTo && !String(replyingTo.phone || "").trim()) waButton.disabled = true;
  }
}

/* ------------------------------------------------------------------ */
/* Lead detail drawer                                                  */
/* ------------------------------------------------------------------ */

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function customerWhatsApp(lead) {
  const digits = phoneDigits(lead.phone);
  if (digits.length < 7) return "";
  const number = digits.length === 10 ? `1${digits}` : digits;
  const text = `Hi ${lead.name || "there"}, this is ${DEALER_NAME} following up on your ${leadType(lead.type || "whatsapp").label} request${lead.vehicleName ? ` for the ${lead.vehicleName}` : ""}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function markActiveRow(id) {
  qsa("tr[data-lead-open]").forEach((tr) => {
    tr.classList.toggle("is-active", Boolean(id) && tr.dataset.leadOpen === id);
  });
}

function syncDetailStatus(lead) {
  if (!lead || !detailing || detailing.id !== lead.id) return;
  const status = LEAD_STATUSES.includes(lead.status) ? lead.status : "new";
  const chip = qs("[data-lead-detail-status-chip]");
  if (chip) {
    chip.className = `adm-detail__statuschip adm-detail__statuschip--${status}`;
    chip.textContent = LEAD_STATUS_LABELS[status];
  }
  const select = qs("[data-lead-detail-status]");
  if (select && select.value !== status) select.value = status;
}

function detailField(label, value, { wide = false, mono = false } = {}) {
  const content = value === null || value === undefined || value === "" ? "—" : value;
  return `<div class="adm-detail__field${wide ? " adm-detail__field--wide" : ""}"><span>${escapeHtml(label)}</span><strong${mono ? ' class="adm-detail__mono"' : ""}>${content}</strong></div>`;
}

function quickActionsMarkup(lead) {
  const email = String(lead.email || "").trim();
  const digits = phoneDigits(lead.phone);
  const wa = customerWhatsApp(lead);
  const action = (icon, label, attrs) =>
    `<a class="adm-detail__action" ${attrs}><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${label}</a>`;
  const disabled = (icon, label, hint) =>
    `<span class="adm-detail__action is-disabled" aria-disabled="true" title="${escapeHtml(hint)}"><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${label}</span>`;
  return `
    <div class="adm-detail__actions">
      ${digits ? action("call", "Call", `href="tel:${escapeHtml(digits)}"`) : disabled("call", "Call", "No phone number submitted")}
      ${email ? action("mail", "Email", `href="mailto:${escapeHtml(email)}"`) : disabled("mail", "Email", "No email submitted")}
      ${wa ? action("chat", "WhatsApp", `href="${escapeHtml(wa)}" target="_blank" rel="noopener"`) : disabled("chat", "WhatsApp", "No phone number submitted")}
      <button class="adm-detail__action" type="button" data-lead-detail-copy>
        <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>Copy
      </button>
    </div>`;
}

function requestDetailsMarkup(lead) {
  const meta = lead.meta || {};
  const type = lead.type || "whatsapp";
  const rows = [];
  if (type === "testDrive") {
    rows.push(detailField("Preferred date", escapeHtml(meta.preferredDate || "Flexible")));
    rows.push(detailField("Time window", escapeHtml(meta.dateOption || "—")));
    rows.push(detailField("Location", escapeHtml(meta.locationPreference || "Dealership hub"), { wide: true }));
  } else if (type === "valuation") {
    const vehicle = [meta.year, meta.make, meta.model, meta.trim].filter(Boolean).join(" ");
    rows.push(detailField("Vehicle", escapeHtml(vehicle || "—"), { wide: true }));
    rows.push(detailField("Mileage", meta.mileage ? escapeHtml(formatMilesExact(meta.mileage)) : "—"));
    rows.push(detailField("Condition", escapeHtml(meta.condition || "—")));
    rows.push(detailField("VIN", escapeHtml(meta.vin || "—"), { mono: true }));
    rows.push(
      detailField(
        "Estimated value",
        meta.estimateLow || meta.estimateHigh
          ? `${escapeHtml(formatCurrency(meta.estimateLow))} – ${escapeHtml(formatCurrency(meta.estimateHigh))}`
          : "Pending appraisal"
      )
    );
  } else {
    rows.push(detailField("Channel", escapeHtml(leadType(type).label)));
    if (lead.vehicleName) rows.push(detailField("Vehicle interest", escapeHtml(lead.vehicleName), { wide: true }));
  }
  rows.push(detailField("Received", escapeHtml(leadDateTime(lead.createdAt))));
  rows.push(detailField("Reference", escapeHtml(String(lead.id || "").slice(0, 12).toUpperCase()), { mono: true }));
  return `
    <section class="adm-detail__section">
      <div class="adm-detail__section-head">
        <h3><span class="material-symbols-outlined" aria-hidden="true">assignment</span>Request details</h3>
        ${leadTypeBadge(type)}
      </div>
      <div class="adm-detail__grid">${rows.join("")}</div>
    </section>`;
}

function customerMarkup(lead) {
  const email = String(lead.email || "").trim();
  const phone = String(lead.phone || "").trim();
  const uid = String(lead.uid || "").trim();
  return `
    <section class="adm-detail__section">
      <div class="adm-detail__section-head">
        <h3><span class="material-symbols-outlined" aria-hidden="true">person</span>Customer</h3>
        <span class="adm-detail__muted">${uid ? "Registered account" : "Guest request"}</span>
      </div>
      <div class="adm-detail__grid">
        ${detailField("Name", escapeHtml(lead.name || "Website visitor"))}
        ${detailField("Account", escapeHtml(uid ? "Registered customer" : "Guest / email only"))}
        ${detailField("Email", email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : "—")}
        ${detailField("Phone", phone ? `<a href="tel:${escapeHtml(phoneDigits(phone))}">${escapeHtml(phone)}</a>` : "—")}
      </div>
    </section>`;
}

function vehicleSkeletonMarkup() {
  return `
    <section class="adm-detail__section" data-lead-vehicle>
      <div class="adm-detail__section-head">
        <h3><span class="material-symbols-outlined" aria-hidden="true">directions_car</span>Vehicle of interest</h3>
      </div>
      <div class="adm-detail__vehicle adm-detail__vehicle--loading" aria-hidden="true">
        <span class="adm-detail__vehicle-thumb"></span>
        <div class="adm-detail__vehicle-lines"><span></span><span></span><span></span></div>
      </div>
    </section>`;
}

function vehicleFallbackMarkup(lead, note = "") {
  return `
    <section class="adm-detail__section" data-lead-vehicle>
      <div class="adm-detail__section-head">
        <h3><span class="material-symbols-outlined" aria-hidden="true">directions_car</span>Vehicle of interest</h3>
      </div>
      <p class="adm-detail__muted">${escapeHtml(lead.vehicleName || "No vehicle linked to this request")}</p>
      ${note ? `<p class="adm-detail__hint">${escapeHtml(note)}</p>` : ""}
    </section>`;
}

function vehicleMarkup(vehicle, lead) {
  if (!vehicle) return vehicleFallbackMarkup(lead, "That listing is no longer in the showroom.");
  const name = vehicleLabel(vehicle);
  const image = assetPath(vehicleThumb(vehicle), 320);
  const status = String(vehicle.status || "available");
  const tone = status === "available" ? "won" : status === "reserved" ? "contacted" : "lost";
  const bits = [
    formatCurrency(vehicle.price),
    vehicle.mileage ? formatMilesExact(vehicle.mileage) : "",
    vehicle.stockNumber ? `Stock ${vehicle.stockNumber}` : "",
  ].filter(Boolean);
  return `
    <section class="adm-detail__section" data-lead-vehicle>
      <div class="adm-detail__section-head">
        <h3><span class="material-symbols-outlined" aria-hidden="true">directions_car</span>Vehicle of interest</h3>
        <a class="adm-detail__inline-link" href="../vehicle.html?id=${encodeURIComponent(vehicle.id)}" target="_blank" rel="noopener">
          Open listing<span class="material-symbols-outlined" aria-hidden="true">arrow_outward</span>
        </a>
      </div>
      <div class="adm-detail__vehicle">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy">
        <div class="adm-detail__vehicle-body">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(bits.join(" · "))}</span>
          <span class="adm-status adm-status--${tone}">${escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}</span>
        </div>
      </div>
    </section>`;
}

function photosMarkup(photos) {
  return `
    <section class="adm-detail__section">
      <div class="adm-detail__section-head">
        <h3><span class="material-symbols-outlined" aria-hidden="true">photo_library</span>Photos shared</h3>
        <span class="adm-detail__muted">${photos.length}</span>
      </div>
      <div class="adm-detail__photos">
        ${photos
          .map(
            (photo, index) => `
          <a href="${escapeHtml(assetPath(photo, 1600))}" target="_blank" rel="noopener" aria-label="Open photo ${index + 1}">
            <img src="${escapeHtml(assetPath(photo, 320))}" alt="Trade-in photo ${index + 1}" loading="lazy">
          </a>`
          )
          .join("")}
      </div>
    </section>`;
}

function timelineMarkup(lead) {
  const type = lead.type || "whatsapp";
  const replies = Array.isArray(lead.replies) ? lead.replies : [];
  const history = replies.length
    ? replies
    : lead.response?.message
      ? [lead.response]
      : [];
  const received = `
    <li class="adm-detail__event">
      <span class="adm-detail__dot"><span class="material-symbols-outlined" aria-hidden="true">${leadType(type).icon}</span></span>
      <div class="adm-detail__event-meta"><span>Request received</span><span>${escapeHtml(leadDateTime(lead.createdAt))}</span></div>
      <p class="adm-detail__event-copy">${escapeHtml(leadType(type).label)}${lead.vehicleName ? ` · ${escapeHtml(lead.vehicleName)}` : ""}</p>
    </li>`;
  const items = history.map((reply) => {
    const whatsapp = reply.channel === "whatsapp";
    return `
      <li class="adm-detail__event adm-detail__event--${whatsapp ? "wa" : "reply"}">
        <span class="adm-detail__dot"><span class="material-symbols-outlined" aria-hidden="true">${whatsapp ? "chat" : "send"}</span></span>
        <div class="adm-detail__event-meta">
          <span>${escapeHtml(reply.by || "AutoSelect concierge")}</span>
          <span>${whatsapp ? "WhatsApp" : "Dashboard"} · ${escapeHtml(leadDateTime(reply.at))}</span>
        </div>
        <p class="adm-detail__bubble">${escapeHtml(reply.message || "")}</p>
      </li>`;
  });
  return `
    <section class="adm-detail__section">
      <div class="adm-detail__section-head">
        <h3><span class="material-symbols-outlined" aria-hidden="true">forum</span>Conversation</h3>
        <span class="adm-detail__muted">${history.length ? `${history.length} repl${history.length === 1 ? "y" : "ies"}` : "No reply yet"}</span>
      </div>
      <ol class="adm-detail__timeline">${received}${items.join("")}</ol>
      ${history.length ? "" : `<p class="adm-detail__hint">Reply to confirm next steps — the customer sees it instantly in their dashboard.</p>`}
    </section>`;
}

function detailMarkup(lead) {
  const type = lead.type || "whatsapp";
  const meta = leadType(type);
  const status = LEAD_STATUSES.includes(lead.status) ? lead.status : "new";
  const name = lead.name || "Website visitor";
  const reference = String(lead.id || "").slice(0, 12).toUpperCase();
  const message = String(lead.message || "").trim() || leadSummary(lead);
  const photos = Array.isArray(lead.meta?.photos) ? lead.meta.photos.filter(Boolean).slice(0, 8) : [];
  const hasVehicle = Boolean(lead.vehicleId || lead.vehicleName);
  return `
    <header class="adm-detail__hero adm-detail__hero--${meta.tone}">
      <div class="adm-detail__avatar" aria-hidden="true">${escapeHtml(initials(name))}</div>
      <div class="adm-detail__identity">
        <div class="adm-detail__chips">
          ${leadTypeBadge(type)}
          <span class="adm-detail__statuschip adm-detail__statuschip--${status}" data-lead-detail-status-chip>${LEAD_STATUS_LABELS[status]}</span>
        </div>
        <h2 id="leadDetailName">${escapeHtml(name)}</h2>
        <p>${escapeHtml(meta.label)} request · Ref ${escapeHtml(reference)} · ${escapeHtml(leadDateTime(lead.createdAt))}</p>
      </div>
      <button class="adm-detail__close" type="button" data-lead-detail-close aria-label="Close request details">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </header>
    ${quickActionsMarkup(lead)}
    <div class="adm-detail__body">
      <section class="adm-detail__section adm-detail__section--message">
        <div class="adm-detail__section-head">
          <h3><span class="material-symbols-outlined" aria-hidden="true">format_quote</span>What they sent</h3>
          <span class="adm-detail__muted">${escapeHtml(meta.label)}</span>
        </div>
        <p class="adm-detail__message">${escapeHtml(message)}</p>
      </section>
      ${requestDetailsMarkup(lead)}
      ${customerMarkup(lead)}
      ${hasVehicle ? (lead.vehicleId ? vehicleSkeletonMarkup() : vehicleFallbackMarkup(lead)) : ""}
      ${photos.length ? photosMarkup(photos) : ""}
      ${timelineMarkup(lead)}
    </div>
    <footer class="adm-detail__foot">
      <div class="adm-detail__status">
        <label for="leadDetailStatus">Status</label>
        <select class="select" id="leadDetailStatus" data-lead-detail-status>
          ${LEAD_STATUSES.map(
            (value) => `<option value="${value}"${value === status ? " selected" : ""}>${LEAD_STATUS_LABELS[value]}</option>`
          ).join("")}
        </select>
      </div>
      <button class="btn btn--ghost btn--sm" type="button" data-lead-detail-close>Close</button>
      <button class="btn btn--primary btn--sm" type="button" data-lead-detail-reply>
        <span class="material-symbols-outlined" aria-hidden="true">reply</span>Reply
      </button>
    </footer>`;
}

async function loadDetailVehicle(lead) {
  if (!lead.vehicleId) return;
  const token = detailToken;
  let vehicle = null;
  try {
    vehicle = await getVehicle(lead.vehicleId);
  } catch (error) {
    console.warn("[AutoSelect] lead vehicle lookup failed", error);
  }
  if (token !== detailToken || detailing?.id !== lead.id) return;
  const slot = qs("[data-lead-vehicle]", qs("#leadDetailDrawer"));
  if (slot) slot.outerHTML = vehicleMarkup(vehicle, lead);
}

function renderLeadDetail(lead, { keepScroll = false } = {}) {
  const host = qs("[data-lead-detail]");
  if (!host || !lead) return;
  const previousBody = qs(".adm-detail__body", host);
  const scroll = keepScroll ? previousBody?.scrollTop || 0 : 0;
  host.innerHTML = detailMarkup(lead);
  const body = qs(".adm-detail__body", host);
  if (body && scroll) body.scrollTop = scroll;
  loadDetailVehicle(lead);
}

function openLeadDetail(id, trigger = null) {
  const lead = leads.find((item) => item.id === id);
  const drawer = qs("#leadDetailDrawer");
  if (!lead || !drawer) return;
  detailing = lead;
  lastDetailTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
  detailToken += 1;
  renderLeadDetail(lead);
  drawer.hidden = false;
  document.body.classList.add("adm-has-drawer");
  markActiveRow(lead.id);
  requestAnimationFrame(() => {
    drawer.classList.add("is-open");
    qs(".adm-drawer__panel", drawer)?.focus({ preventScroll: true });
  });
}

function closeLeadDetail() {
  const drawer = qs("#leadDetailDrawer");
  if (!drawer || drawer.hidden) return;
  drawer.classList.remove("is-open");
  document.body.classList.remove("adm-has-drawer");
  markActiveRow(null);
  detailing = null;
  detailToken += 1;
  window.setTimeout(() => {
    if (!drawer.classList.contains("is-open")) drawer.hidden = true;
  }, 280);
  if (lastDetailTrigger instanceof HTMLElement && document.contains(lastDetailTrigger)) {
    lastDetailTrigger.focus({ preventScroll: true });
  }
  lastDetailTrigger = null;
}

async function copyLeadSummary(lead) {
  const status = LEAD_STATUSES.includes(lead.status) ? lead.status : "new";
  const lines = [
    `${lead.name || "Website visitor"} — ${leadType(lead.type || "whatsapp").label} request (${LEAD_STATUS_LABELS[status]})`,
    `Reference: ${String(lead.id || "").slice(0, 12).toUpperCase()}`,
    lead.email ? `Email: ${lead.email}` : "",
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.vehicleName ? `Vehicle: ${lead.vehicleName}` : "",
    lead.message ? `Message: ${lead.message}` : "",
    `Received: ${leadDateTime(lead.createdAt)}`,
  ].filter(Boolean);
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    showToast("Request summary copied.", "success");
  } catch (error) {
    console.warn("[AutoSelect] clipboard unavailable", error);
    showToast("Could not copy — select the details manually.", "error");
  }
}

export function initLeads() {
  const search = qs("#admLeadSearch");
  const type = qs("#admLeadType");
  const status = qs("#admLeadStatus");
  if (!search) return;

  let timer = null;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      filters.query = search.value.trim().toLowerCase();
      renderLeads(leads);
    }, 180);
  });
  type.addEventListener("change", () => {
    filters.type = type.value;
    renderLeads(leads);
  });
  status.addEventListener("change", () => {
    filters.status = status.value;
    renderLeads(leads);
  });

  qs("[data-export-leads]")?.addEventListener("click", exportCsv);

  document.addEventListener("change", (event) => {
    const select = event.target.closest("[data-lead-status]");
    if (select) changeStatus(select.dataset.leadStatus, select.value);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-clear-lead-filters]")) return;
    filters = { query: "", type: "all", status: "all" };
    if (search) search.value = "";
    if (type) type.value = "all";
    if (status) status.value = "all";
    renderLeads(leads);
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-lead-reply]");
    if (!trigger) return;
    const lead = leads.find((item) => item.id === trigger.dataset.leadReply);
    if (lead) openReplyDialog(lead);
  });

  qs("[data-reply-cancel]")?.addEventListener("click", closeReplyDialog);
  qsa("[data-reply-send]").forEach((button) =>
    button.addEventListener("click", () => sendReply(button.dataset.replySend))
  );
  qsa("[data-reply-template]").forEach((button) =>
    button.addEventListener("click", () => {
      const message = qs("#admReplyMessage");
      if (!message || !replyingTo) return;
      message.value = replyTemplate(replyingTo);
      message.focus();
    })
  );
  const replyDialog = qs("#leadReplyDialog");
  replyDialog?.addEventListener("click", (event) => {
    if (event.target === replyDialog) closeReplyDialog();
  });
  replyDialog?.addEventListener("close", () => {
    replyingTo = null;
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-lead-detail-close]")) {
      closeLeadDetail();
      return;
    }
    if (event.target.closest("[data-lead-detail-copy]")) {
      if (detailing) copyLeadSummary(detailing);
      return;
    }
    if (event.target.closest("[data-lead-detail-reply]")) {
      if (detailing) openReplyDialog(detailing);
      return;
    }
    const opener = event.target.closest("[data-lead-open]");
    if (!opener) return;
    if (event.target.closest("a, select, input, textarea, label, [data-lead-reply]")) return;
    openLeadDetail(opener.dataset.leadOpen, opener);
  });

  document.addEventListener("change", (event) => {
    const select = event.target.closest("[data-lead-detail-status]");
    if (!select || !detailing) return;
    changeStatus(detailing.id, select.value);
  });

  document.addEventListener("keydown", (event) => {
    const drawer = qs("#leadDetailDrawer");
    const drawerOpen = drawer && !drawer.hidden;
    const dialogOpen = Boolean(document.querySelector("dialog[open]"));

    if (drawerOpen && !dialogOpen && event.key === "Escape") {
      event.preventDefault();
      closeLeadDetail();
      return;
    }
    if (drawerOpen && !dialogOpen && event.key === "Tab") {
      const panel = qs(".adm-drawer__panel", drawer);
      if (panel) trapFocus(panel, event);
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest?.("tr[data-lead-open]");
    if (!row || event.target !== row) return;
    event.preventDefault();
    openLeadDetail(row.dataset.leadOpen, row);
  });
}
