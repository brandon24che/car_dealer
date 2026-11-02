/**
 * Dealer portal controller: access guard, navigation, dashboard and actions.
 */
import { requireAdmin, signOutUser, userInitials } from "../auth.js?v=20261102d";
import { carsAndBidsVehicles } from "../demo-data.js?v=20261102d";
import {
  getAllVehicles,
  importVehicles,
  listLeads,
  resetDemoInventory,
  seedDemoInventory,
} from "../data-store.js?v=20261102d";
import { showToast } from "../ui.js?v=20261102d";
import {
  escapeHtml,
  formatCurrency,
  initials,
  qs,
  qsa,
  timeAgo,
} from "../utils.js?v=20261102d";
import {
  LEAD_STATUS_LABELS,
  assetPath,
  compactNumber,
  leadSummary,
  leadTypeBadge,
  timeValue,
  vehicleName,
  vehicleThumb,
} from "./helpers.js?v=20261102d";
import { initInventory, renderInventory } from "./inventory.js?v=20261102d";
import { initLeads, renderLeads } from "./leads.js?v=20261102d";
import { initCommandPalette } from "./palette.js?v=20261102d";
import { initTeam, refreshTeam } from "./team.js?v=20261102d";

const VIEW_META = {
  overview: { title: "Overview", subtitle: "Showroom performance at a glance." },
  inventory: { title: "Inventory", subtitle: "Manage listings, pricing and availability." },
  leads: { title: "Leads", subtitle: "Follow up on every concierge request." },
  team: { title: "Team", subtitle: "Portal admins and access control." },
};

const state = { vehicles: [], leads: [], view: "overview", loaded: false };
let currentUser = null;
let confirmResolve = null;

/* ------------------------------------------------------------------ */
/* Confirm dialog                                                      */
/* ------------------------------------------------------------------ */

function confirmAction({
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  danger = true,
} = {}) {
  const dialog = qs("#confirmDialog");
  if (!dialog) return Promise.resolve(false);
  if (dialog.open) dialog.close();

  qs("#confirmTitle").textContent = title;
  qs("#confirmMessage").textContent = message;
  const accept = qs("#confirmAccept");
  accept.textContent = confirmLabel;
  accept.className = danger ? "btn btn--danger" : "btn btn--primary";
  const icon = qs("#confirmIcon");
  if (icon) icon.classList.toggle("adm-confirm__icon--info", !danger);
  qs("#confirmIcon .material-symbols-outlined").textContent = danger ? "warning" : "help";

  return new Promise((resolve) => {
    confirmResolve = resolve;
    dialog.showModal();
    accept.focus({ preventScroll: true });
  });
}

function settleConfirm(value) {
  const dialog = qs("#confirmDialog");
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(value);
  }
  if (dialog?.open) dialog.close();
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

function mostViewedMarkup(list) {
  if (!list.length) {
    return `<div class="adm-empty" style="padding:30px 20px">
      <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">visibility_off</span></div>
      <h3>No view data yet</h3>
      <p>Open a vehicle page while browsing the site to start collecting view counts.</p>
    </div>`;
  }
  return list
    .map(
      (vehicle) => `
      <a class="adm-viewed__row" href="../vehicle.html?id=${encodeURIComponent(vehicle.id)}" target="_blank" rel="noopener" style="text-decoration:none">
        <img class="adm-viewed__img" src="${escapeHtml(assetPath(vehicleThumb(vehicle)))}" alt="" loading="lazy" width="54" height="38">
        <span class="adm-viewed__text">
          <strong>${escapeHtml(vehicleName(vehicle))}</strong>
          <span>${escapeHtml(vehicle.stockNumber || "")} · ${formatCurrency(Number(vehicle.price) || 0)}</span>
        </span>
        <span class="adm-viewed__metric">
          <strong>${compactNumber(vehicle.viewCount || 0)}</strong>
          <span>views</span>
        </span>
      </a>`
    )
    .join("");
}

function recentLeadsMarkup(list) {
  if (!list.length) {
    return `<div class="adm-empty" style="padding:30px 20px">
      <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">inbox</span></div>
      <h3>No leads yet</h3>
      <p>Requests from the contact page, vehicle pages and the quiz will land here.</p>
    </div>`;
  }
  return list
    .map((lead) => {
      const status = lead.status || "new";
      return `
      <div class="adm-recent__row">
        <span class="adm-recent__avatar">${escapeHtml(initials(lead.name || lead.email || "VS"))}</span>
        <span class="adm-recent__text">
          <strong>${escapeHtml(lead.name || "Website visitor")}</strong>
          <span>${escapeHtml(leadSummary(lead))}</span>
        </span>
        <span class="adm-recent__meta">
          ${leadTypeBadge(lead.type || "whatsapp")}
          <span style="font-size:10px;color:var(--slate)">${escapeHtml(timeAgo(lead.createdAt) || "")}${status !== "new" ? ` · ${LEAD_STATUS_LABELS[status] || status}` : ""}</span>
        </span>
      </div>`;
    })
    .join("");
}

function renderLeadChart(leads) {
  const host = qs("[data-lead-chart]");
  if (!host) return;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(start);
    date.setDate(date.getDate() - offset);
    days.push({ date, count: 0 });
  }
  leads.forEach((lead) => {
    const time = timeValue(lead.createdAt);
    if (!time) return;
    const day = new Date(time);
    day.setHours(0, 0, 0, 0);
    const entry = days.find((item) => item.date.getTime() === day.getTime());
    if (entry) entry.count += 1;
  });

  const total = days.reduce((sum, day) => sum + day.count, 0);
  const max = Math.max(1, ...days.map((day) => day.count));
  host.innerHTML = days
    .map(({ date, count }) => {
      const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
      const full = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const height = count ? Math.max(12, Math.round((count / max) * 100)) : 3;
      return `<div class="adm-chart__col" title="${full}: ${count} lead${count === 1 ? "" : "s"}">
        <span class="adm-chart__value">${count}</span>
        <span class="adm-chart__bar" style="height:${height}%"></span>
        <span class="adm-chart__label">${weekday}</span>
      </div>`;
    })
    .join("");
  host.setAttribute(
    "aria-label",
    `Leads in the last 7 days: ${days
      .map(({ date, count }) => `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${count}`)
      .join(", ")}`
  );
  const totalNode = qs("[data-chart-total]");
  if (totalNode) totalNode.textContent = compactNumber(total);
}

function renderDashboard() {
  const vehicles = state.vehicles;
  const leads = state.leads;
  const available = vehicles.filter((v) => (v.status || "available") === "available");
  const sold = vehicles.filter((v) => v.status === "sold");
  const featured = vehicles.filter((v) => v.featured);
  const newLeads = leads.filter((lead) => (lead.status || "new") === "new");
  const weekAgo = Date.now() - 7 * 86400000;
  const weekLeads = leads.filter((lead) => timeValue(lead.createdAt) >= weekAgo);
  const won = leads.filter((lead) => lead.status === "won");
  const winRate = leads.length ? Math.round((won.length / leads.length) * 100) : 0;

  const setText = (selector, value) => {
    const node = qs(selector);
    if (node) node.textContent = value;
  };
  setText("[data-stat-available]", compactNumber(available.length));
  setText("[data-stat-featured]", `${featured.length} featured`);
  setText("[data-stat-total]", compactNumber(vehicles.length));
  setText("[data-stat-sold]", `${sold.length} sold`);
  setText("[data-stat-new-leads]", compactNumber(newLeads.length));
  setText("[data-stat-week]", `${weekLeads.length} this week`);
  setText("[data-stat-total-leads]", compactNumber(leads.length));
  setText("[data-stat-winrate]", `${winRate}% won`);
  renderLeadChart(leads);

  const publicCars = vehicles.filter((v) => ["available", "reserved"].includes(v.status || "available"));
  const mostViewed = [...publicCars]
    .filter((v) => Number(v.viewCount) > 0)
    .sort((a, b) => Number(b.viewCount) - Number(a.viewCount))
    .slice(0, 5);
  const viewedHost = qs("[data-most-viewed]");
  if (viewedHost) {
    viewedHost.innerHTML = mostViewed.length
      ? `<div class="adm-viewed">${mostViewedMarkup(mostViewed)}</div>`
      : mostViewedMarkup([]);
  }

  const recent = [...leads].sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt)).slice(0, 5);
  const recentHost = qs("[data-recent-leads]");
  if (recentHost) {
    recentHost.innerHTML = recent.length
      ? `<div class="adm-recent">${recentLeadsMarkup(recent)}</div>`
      : recentLeadsMarkup([]);
  }
}

/* ------------------------------------------------------------------ */
/* Data loading                                                        */
/* ------------------------------------------------------------------ */

function renderFatal(error) {
  console.error("[AutoSelect] admin load failed", error);
  const markup = `
    <div class="adm-empty">
      <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">cloud_off</span></div>
      <h3>Could not load the portal</h3>
      <p>Check your connection and try again. If Firebase is configured, confirm your admin role and security rules.</p>
      <button class="btn btn--ghost btn--sm" type="button" data-retry-admin><span class="material-symbols-outlined" aria-hidden="true">refresh</span>Retry</button>
    </div>`;
  ["[data-inventory-body]", "[data-leads-body]", "[data-most-viewed]", "[data-recent-leads]"].forEach(
    (selector) => {
      const node = qs(selector);
      if (node) node.innerHTML = markup;
    }
  );
}

async function loadData({ silent = false } = {}) {
  if (!silent) state.loaded = false;
  try {
    const [vehicles, leads] = await Promise.all([
      getAllVehicles({ admin: true }),
      listLeads({ limit: 500 }),
    ]);
    state.vehicles = vehicles;
    state.leads = leads;
    state.loaded = true;
    renderInventory(vehicles);
    renderLeads(leads);
    renderDashboard();
  } catch (error) {
    renderFatal(error);
    showToast("Could not refresh portal data.", "error");
  }
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

function closeSidebar() {
  qs("#adminSide")?.classList.remove("is-open");
  const scrim = qs("[data-side-close]");
  if (scrim) scrim.hidden = true;
  qs("[data-side-open]")?.setAttribute("aria-expanded", "false");
}

function openSidebar() {
  qs("#adminSide")?.classList.add("is-open");
  const scrim = qs("[data-side-close]");
  if (scrim) scrim.hidden = false;
  qs("[data-side-open]")?.setAttribute("aria-expanded", "true");
}

function showView(name, { updateHash = true } = {}) {
  const requested = VIEW_META[name] ? name : "overview";
  const view = requested === "team" && !currentUser?.isSuperAdmin ? "overview" : requested;
  state.view = view;
  qsa("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
  qsa("[data-view]").forEach((item) => {
    const active = item.dataset.view === view;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  const title = qs("[data-admin-title]");
  const subtitle = qs("[data-admin-subtitle]");
  if (title) title.textContent = VIEW_META[view].title;
  if (subtitle) subtitle.textContent = VIEW_META[view].subtitle;
  if (updateHash && window.location.hash !== `#${view}`) {
    history.replaceState(null, "", `#${view}`);
  }
  closeSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

async function seedInventory() {
  const confirmed = await confirmAction({
    title: "Seed the demo catalogue?",
    message:
      "This loads the full 49-vehicle catalogue. In demo mode it replaces the locally edited inventory; when connected to Firestore it writes the demo records to your vehicles collection.",
    confirmLabel: "Seed vehicles",
    danger: false,
  });
  if (!confirmed) return;
  try {
    const count = await seedDemoInventory();
    showToast(`${count} demo vehicles loaded.`, "success");
    await loadData({ silent: true });
    showView("inventory");
  } catch (error) {
    console.error("[AutoSelect] seed failed", error);
    showToast(error.message || "Could not seed demo inventory.", "error");
  }
}

async function importAuctionInventory() {
  const confirmed = await confirmAction({
    title: "Add the 25 Cars & Bids listings?",
    message:
      "The 25 Cars & Bids auctions bundled in the code (recent cars plus trucks and SUVs) will be added to inventory. Existing vehicles are untouched, and each imported vehicle can be edited or deleted here afterwards.",
    confirmLabel: "Add listings",
    danger: false,
  });
  if (!confirmed) return;
  try {
    const count = await importVehicles(carsAndBidsVehicles);
    showToast(`${count} Cars & Bids listings added.`, "success");
    await loadData({ silent: true });
    showView("inventory");
  } catch (error) {
    console.error("[AutoSelect] auction import failed", error);
    showToast(error.message || "Could not import the auction listings.", "error");
  }
}

async function resetInventory() {
  const confirmed = await confirmAction({
    title: "Reset local demo data?",
    message:
      "This discards vehicle and review edits stored in this browser and restores the original demo catalogue. Leads are kept. It only works while the site is running in demo mode without Firebase.",
    confirmLabel: "Reset demo data",
    danger: true,
  });
  if (!confirmed) return;
  try {
    const reset = await resetDemoInventory();
    if (!reset) {
      showToast("Reset is only available in demo mode with Firebase disconnected.", "info");
      return;
    }
    showToast("Demo inventory and reviews restored.", "success");
    await loadData({ silent: true });
    showView("overview");
  } catch (error) {
    console.error("[AutoSelect] reset failed", error);
    showToast("Could not reset demo data.", "error");
  }
}

async function signOut() {
  await signOutUser();
  window.location.replace("../login.html");
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function applyRole(user) {
  const superAdmin = Boolean(user?.isSuperAdmin);
  qsa("[data-super-only]").forEach((node) => {
    node.hidden = !superAdmin;
  });
  const role = qs("[data-admin-role]");
  if (role) {
    role.hidden = false;
    role.textContent = superAdmin ? "Super admin" : "Admin";
    role.classList.toggle("is-super", superAdmin);
  }
}

function fillUser(user) {
  const avatar = qs("[data-admin-avatar]");
  const name = qs("[data-admin-name]");
  const email = qs("[data-admin-email]");
  if (avatar) avatar.textContent = userInitials(user);
  if (name) name.textContent = user.name || "Dealer admin";
  if (email) email.textContent = user.email || "";
}

function bindShell() {
  qsa("[data-view]").forEach((item) => {
    item.addEventListener("click", () => showView(item.dataset.view));
  });
  qsa("[data-view-link]").forEach((item) => {
    item.addEventListener("click", () => showView(item.dataset.viewLink));
  });
  qs("[data-side-open]")?.addEventListener("click", openSidebar);
  qs("[data-side-close]")?.addEventListener("click", closeSidebar);
  qs("[data-admin-signout]")?.addEventListener("click", signOut);
  qsa("[data-import-auction]").forEach((button) =>
    button.addEventListener("click", importAuctionInventory)
  );
  qsa("[data-seed-inventory]").forEach((button) => button.addEventListener("click", seedInventory));
  qsa("[data-reset-inventory]").forEach((button) => button.addEventListener("click", resetInventory));

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry-admin]")) loadData();
  });

  const confirmDialog = qs("#confirmDialog");
  qs("[data-confirm-accept]")?.addEventListener("click", () => settleConfirm(true));
  qs("[data-confirm-cancel]")?.addEventListener("click", () => settleConfirm(false));
  confirmDialog?.addEventListener("close", () => {
    if (confirmResolve) {
      const resolve = confirmResolve;
      confirmResolve = null;
      resolve(false);
    }
  });
  confirmDialog?.addEventListener("click", (event) => {
    if (event.target === confirmDialog) settleConfirm(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });

  window.addEventListener("hashchange", () => {
    showView(window.location.hash.replace("#", ""), { updateHash: false });
  });
}

async function boot() {
  const user = await requireAdmin();
  if (!user) return;

  currentUser = user;
  document.body.classList.remove("is-loading");
  qs("#adminBoot")?.remove();
  fillUser(user);
  applyRole(user);
  bindShell();

  initInventory({
    reload: () => loadData({ silent: true }),
    confirmAction,
    onSaved: () => showView("inventory"),
  });
  initLeads();
  initCommandPalette({
    getVehicles: () => state.vehicles,
    showView,
    isSuperAdmin: () => Boolean(currentUser?.isSuperAdmin),
  });

  if (user.isSuperAdmin) {
    initTeam({ confirmAction });
    refreshTeam();
  }

  const initial = window.location.hash.replace("#", "");
  showView(VIEW_META[initial] ? initial : "overview", { updateHash: false });

  await loadData();
}

boot().catch((error) => {
  console.error("[AutoSelect] portal boot failed", error);
  document.body.classList.remove("is-loading");
  qs("#adminBoot")?.remove();
  showToast("The portal could not start. Reload the page.", "error");
});
