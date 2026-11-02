/**
 * Customer dashboard: request history, confirmations and concierge replies.
 */
import { authReady, getCurrentUser, watchUser } from "../auth.js?v=20261102d";
import { listMyLeads } from "../data-store.js?v=20261102d";
import { mountShell } from "../ui.js?v=20261102d";
import { escapeHtml, formatDate, formatCurrency, qs, qsa, timeAgo } from "../utils.js?v=20261102d";
import { DEALER_NAME, waLink } from "../whatsapp.js?v=20261102d";

const TYPE_META = {
  testDrive: { label: "Test drive", icon: "event_available" },
  valuation: { label: "Trade-in appraisal", icon: "price_change" },
  whatsapp: { label: "WhatsApp inquiry", icon: "chat" },
  contact: { label: "Message", icon: "mail" },
};

const STATUS_META = {
  new: { label: "Awaiting review", tone: "pending", note: "Our concierge has your request and will confirm shortly." },
  contacted: { label: "In progress", tone: "progress", note: "A specialist is reviewing the details and will follow up." },
  qualified: { label: "Confirmed", tone: "confirmed", note: "Your request is confirmed. Check the concierge reply for next steps." },
  won: { label: "Completed", tone: "done", note: "This request is complete. Thank you for choosing AutoSelect." },
  lost: { label: "Closed", tone: "closed", note: "This request was closed. Start a new one any time." },
};

let requests = [];
let filter = "all";
let loadedFor = "";
let loading = false;
let highlightTimer = 0;

function toDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function requestDate(value) {
  const date = toDate(value);
  if (!date) return "—";
  return formatDate(date, { month: "short", day: "numeric", year: "numeric" });
}

function requestTime(value) {
  const date = toDate(value);
  if (!date) return 0;
  return date.getTime();
}

function repliesOf(lead) {
  if (Array.isArray(lead.replies)) return lead.replies;
  return lead.response ? [lead.response] : [];
}

function statusMeta(lead) {
  return STATUS_META[lead.status] || STATUS_META.new;
}

function typeMeta(lead) {
  return TYPE_META[lead.type] || TYPE_META.contact;
}

function requestTitle(lead) {
  if (lead.vehicleName) return lead.vehicleName;
  if (lead.type === "valuation") return "Trade-in appraisal";
  if (lead.type === "whatsapp") return "WhatsApp conversation";
  return "Concierge request";
}

function detailLine(lead) {
  const meta = lead.meta || {};
  if (lead.type === "testDrive") {
    return [meta.preferredDate || meta.dateOption, meta.locationPreference].filter(Boolean).join(" • ");
  }
  if (lead.type === "valuation") {
    const car = [meta.year, meta.make, meta.model, meta.trim].filter(Boolean).join(" ");
    const miles = meta.mileage ? `${Number(meta.mileage).toLocaleString()} mi` : "";
    const estimate =
      meta.estimateLow || meta.estimateHigh
        ? `${formatCurrency(meta.estimateLow || 0)} – ${formatCurrency(meta.estimateHigh || 0)}`
        : "";
    return [car, miles, meta.condition, estimate].filter(Boolean).join(" • ");
  }
  return "";
}

function waMessage(lead) {
  const ref = String(lead.id || "").slice(0, 12).toUpperCase();
  const title = requestTitle(lead);
  return `Hi ${DEALER_NAME}! I'm following up on request ${ref}${title ? ` regarding the ${title}` : ""}. Could you confirm the latest status?`;
}

function replyMarkup(reply) {
  if (!reply) return "";
  const channel = reply.channel === "whatsapp" ? "Sent via WhatsApp" : "Sent to your dashboard";
  const when = toDate(reply.at);
  return `
    <article class="dashboard-reply">
      <div class="dashboard-reply__head">
        <span class="dashboard-reply__avatar"><span class="material-symbols-outlined" aria-hidden="true">support_agent</span></span>
        <div>
          <strong>${escapeHtml(reply.by || "AutoSelect concierge")}</strong>
          <span>${channel}${when ? ` • ${escapeHtml(timeAgo(when))}` : ""}</span>
        </div>
      </div>
      <p>${escapeHtml(reply.message || "")}</p>
    </article>`;
}

function cardMarkup(lead) {
  const status = statusMeta(lead);
  const type = typeMeta(lead);
  const replies = repliesOf(lead);
  const detail = detailLine(lead);
  const ref = String(lead.id || "").slice(0, 12).toUpperCase();
  const vehicleLink = lead.vehicleId
    ? `<a class="dashboard-card__vehicle-link" href="vehicle.html?id=${encodeURIComponent(lead.vehicleId)}">View vehicle <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>`
    : "";

  return `
    <article class="dashboard-card" id="request-${escapeHtml(lead.id)}" data-request-type="${escapeHtml(lead.type || "contact")}">
      <div class="dashboard-card__top">
        <span class="dashboard-card__type"><span class="material-symbols-outlined" aria-hidden="true">${type.icon}</span>${type.label}</span>
        <span class="dashboard-status dashboard-status--${status.tone}"><span></span>${status.label}</span>
      </div>
      <h2>${escapeHtml(requestTitle(lead))}</h2>
      ${detail ? `<p class="dashboard-card__detail">${escapeHtml(detail)}</p>` : ""}
      ${lead.message ? `<p class="dashboard-card__message">${escapeHtml(lead.message)}</p>` : ""}
      <div class="dashboard-card__meta">
        <span><span class="material-symbols-outlined" aria-hidden="true">schedule</span>Submitted ${escapeHtml(requestDate(lead.createdAt))}</span>
        <span><span class="material-symbols-outlined" aria-hidden="true">confirmation_number</span>Ref ${escapeHtml(ref || "—")}</span>
      </div>
      <div class="dashboard-card__status-note">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        <p>${status.note}</p>
      </div>
      ${replies.length ? `<div class="dashboard-card__replies"><h3>Concierge repl${replies.length > 1 ? "ies" : "y"}</h3>${replies.map(replyMarkup).join("")}</div>` : ""}
      <div class="dashboard-card__actions">
        ${vehicleLink}
        <a class="btn btn--wa btn--sm" href="${waLink(waMessage(lead))}" target="_blank" rel="noopener noreferrer">
          <span class="material-symbols-outlined" aria-hidden="true">chat</span>Reply on WhatsApp
        </a>
      </div>
    </article>`;
}

function filteredRequests() {
  if (filter === "all") return requests;
  return requests.filter((lead) => (lead.type || "contact") === filter);
}

function renderSummary() {
  const open = requests.filter((lead) => ["new", "contacted"].includes(lead.status || "new")).length;
  const confirmed = requests.filter((lead) => ["qualified", "won"].includes(lead.status || "new")).length;
  const replies = requests.reduce((total, lead) => total + repliesOf(lead).length, 0);
  const set = (selector, value) => {
    const el = qs(selector);
    if (el) el.textContent = String(value);
  };
  set("[data-stat-open]", open);
  set("[data-stat-confirmed]", confirmed);
  set("[data-stat-replies]", replies);
}

function render() {
  renderSummary();
  const list = filteredRequests();
  const feed = qs("#dashboardFeed");
  const empty = qs("#dashboardEmpty");
  const error = qs("#dashboardError");
  const total = qs("[data-dashboard-total]");
  const shown = qs("[data-dashboard-shown]");
  if (total) total.textContent = String(requests.length);
  if (shown) shown.textContent = String(list.length);
  if (error) error.hidden = true;

  if (feed) {
    feed.setAttribute("aria-busy", "false");
    feed.hidden = !list.length;
    feed.innerHTML = list.map(cardMarkup).join("");
  }
  if (empty) {
    empty.hidden = Boolean(list.length);
    if (!list.length) {
      const title = qs("[data-empty-title]");
      const copy = qs("[data-empty-copy]");
      if (filter === "all") {
        if (title) title.textContent = "No requests yet";
        if (copy) copy.textContent = "Book a test drive on any vehicle or request a trade-in appraisal — your confirmation and concierge replies will appear here.";
      } else {
        if (title) title.textContent = "Nothing in this filter";
        if (copy) copy.textContent = "Try another filter or start a new request. Our concierge is ready on WhatsApp any time.";
      }
    }
  }
}

function setFilter(next) {
  filter = next;
  qsa("[data-dashboard-filter]").forEach((button) => {
    const active = button.dataset.dashboardFilter === next;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  render();
}

/** Scroll to and flash the request referenced by #request-<id>. */
function focusFromHash() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#request-") || !requests.length) return;
  let id = "";
  try {
    id = decodeURIComponent(hash.slice("#request-".length));
  } catch {
    id = hash.slice("#request-".length);
  }
  const lead = requests.find((item) => String(item.id) === id);
  if (!lead) return;
  if (filter !== "all" && filter !== (lead.type || "contact")) setFilter("all");
  const card = document.getElementById(`request-${id}`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("is-highlighted");
  window.clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => card.classList.remove("is-highlighted"), 2600);
}

function fillWhatsApp(user) {
  const first = (user?.name || "").split(/\s+/)[0] || "";
  const intro = first ? ` This is ${first}${user?.email ? ` (${user.email})` : ""}.` : "";
  const message = `Hi ${DEALER_NAME}!${intro} I'd like an update on my AutoSelect requests.`;
  qsa("[data-dashboard-wa], [data-dashboard-wa-generic], [data-guest-wa]").forEach((link) => {
    link.href = waLink(message);
  });
}

async function loadFor(user) {
  if (!user || loading) return;
  loading = true;
  const feed = qs("#dashboardFeed");
  const empty = qs("#dashboardEmpty");
  const error = qs("#dashboardError");
  if (feed) {
    feed.hidden = false;
    feed.setAttribute("aria-busy", "true");
    feed.innerHTML = `
      <div class="dashboard-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="dashboard-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>`;
  }
  if (empty) empty.hidden = true;
  if (error) error.hidden = true;

  try {
    requests = await listMyLeads(user);
    loadedFor = user.uid || user.email || "";
    render();
    focusFromHash();
  } catch (err) {
    console.error("[AutoSelect] dashboard load failed", err);
    if (feed) feed.hidden = true;
    if (error) error.hidden = false;
  } finally {
    loading = false;
  }
}

function showGuest() {
  requests = [];
  const guest = qs("#dashboardGuest");
  const app = qs("#dashboardApp");
  if (guest) guest.hidden = false;
  if (app) app.hidden = true;
}

async function showUser(user) {
  const guest = qs("#dashboardGuest");
  const app = qs("#dashboardApp");
  if (guest) guest.hidden = true;
  if (app) app.hidden = false;
  const name = qs("[data-dashboard-name]");
  if (name) name.textContent = (user.name || "there").split(/\s+/)[0];
  fillWhatsApp(user);
  const key = user.uid || user.email || "";
  if (key !== loadedFor) await loadFor(user);
  else focusFromHash();
}

async function boot() {
  await mountShell({ active: "dashboard" });
  await authReady;
  fillWhatsApp(getCurrentUser());

  qsa("[data-dashboard-filter]").forEach((button) =>
    button.addEventListener("click", () => setFilter(button.dataset.dashboardFilter))
  );
  qs("[data-dashboard-retry]")?.addEventListener("click", () => {
    const user = getCurrentUser();
    if (user) loadFor(user);
  });

  watchUser((user) => {
    if (user) showUser(user);
    else showGuest();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const user = getCurrentUser();
    if (user) loadFor(user);
  });

  window.addEventListener("hashchange", focusFromHash);
}

boot();
