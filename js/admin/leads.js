/**
 * Dealer portal — leads table, filters, status updates, concierge replies and CSV export.
 */
import { updateLeadStatus, replyToLead } from "../data-store.js?v=20261102f";
import { getCurrentUser } from "../auth.js?v=20261102f";
import { escapeHtml, qs, qsa, truncate } from "../utils.js?v=20261102f";
import { showToast } from "../ui.js?v=20261102f";
import { DEALER_NAME, waLink } from "../whatsapp.js?v=20261102f";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  downloadCsv,
  leadDate,
  leadSummary,
  leadTypeBadge,
  timeValue,
} from "./helpers.js?v=20261102f";

let leads = [];
let filters = { query: "", type: "all", status: "all" };
let replyingTo = null;

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
    <tr class="${latest ? "adm-lead--replied" : ""}">
      <td>
        <div class="adm-customer">
          <strong>${name}</strong>
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
}

async function changeStatus(id, status) {
  if (!id || !LEAD_STATUSES.includes(status)) return;
  const lead = leads.find((item) => item.id === id);
  const previous = lead?.status || "new";
  if (lead) lead.status = status;
  try {
    await updateLeadStatus(id, status);
    showToast(`Lead marked ${LEAD_STATUS_LABELS[status].toLowerCase()}.`, "success");
  } catch (error) {
    console.error("[AutoSelect] lead update failed", error);
    if (lead) lead.status = previous;
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
}
