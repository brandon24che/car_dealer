/**
 * Shared UI shell: promo bar, header, mobile nav, footer, location selector,
 * menu sheet, modal engine and toast notifications.
 */
import { authReady, getCachedUser, getCurrentUser, signOutUser, userInitials, watchUser } from "./auth.js?v=20261102a";
import { initFavoritesSync } from "./favorites.js?v=20261102a";
import { waLink } from "./whatsapp.js?v=20261102a";
import {
  escapeHtml,
  getBasePath,
  qs,
  qsa,
  storageGet,
  storageSet,
  trapFocus,
} from "./utils.js?v=20261102a";

const LOCATION_KEY = "as_location_v1";
const LOCATIONS = ["Dallas, TX", "Plano, TX", "Fort Worth, TX", "Arlington, TX", "Irving, TX"];

export const LOGO_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
  <path d="M3.2 15.1 4.9 9.9A2.7 2.7 0 0 1 7.5 8h9a2.7 2.7 0 0 1 2.6 1.9l1.7 5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M3.6 14.6h16.8v3.5a1.1 1.1 0 0 1-1.1 1.1h-1.5a1.1 1.1 0 0 1-1.1-1.1v-.6H7.3v.6a1.1 1.1 0 0 1-1.1 1.1H4.7a1.1 1.1 0 0 1-1.1-1.1v-3.5Z" fill="currentColor"/>
  <path d="M6.6 11.3h10.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>
  <circle cx="7.2" cy="12.1" r=".8" fill="#fff" opacity=".85"/>
  <circle cx="16.8" cy="12.1" r=".8" fill="#fff" opacity=".85"/>
</svg>`;

const NAV_ITEMS = [
  { page: "home", label: "Home", href: "index.html" },
  { page: "inventory", label: "Inventory", href: "inventory.html" },
  { page: "quiz", label: "Match Quiz", href: "quiz.html" },
  { page: "sell", label: "Sell / Trade", href: "sell.html" },
  { page: "contact", label: "Contact", href: "contact.html" },
];

const BOTTOM_ITEMS = [
  { page: "home", label: "Home", icon: "home", href: "index.html" },
  { page: "inventory", label: "Inventory", icon: "directions_car", href: "inventory.html" },
  { page: "quiz", label: "Match Quiz", icon: "auto_awesome", href: "quiz.html" },
  { page: "saved", label: "Saved", icon: "favorite_border", href: "saved.html" },
  { page: "menu", label: "Menu", icon: "grid_view", action: "menu" },
];

let location = storageGet(LOCATION_KEY, "Dallas, TX");
let shellMounted = false;
let openModalStack = [];
let lastFocused = null;
let toastHost = null;

export function getLocation() {
  return location;
}

function base() {
  return getBasePath();
}

function currentPathForRedirect() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  return `${path}${window.location.search}`;
}

function activePage(explicit) {
  if (explicit) return explicit;
  return document.body.dataset.page || "";
}

/* ------------------------------------------------------------------ */
/* Header / footer rendering                                          */
/* ------------------------------------------------------------------ */

function renderHeader(active) {
  const basePath = base();
  return `
  <header class="site-header">
    <div class="promo-bar">
      <div class="container promo-bar__inner">
        <div class="promo-bar__message">
          <span class="material-symbols-outlined" aria-hidden="true">verified</span>
          <p>Spring Certified Sale: $0 Down &amp; Free 12-Month Powertrain Warranty</p>
        </div>
        <a class="promo-bar__cta" href="${basePath}inventory.html">Shop the sale <span class="material-symbols-outlined">arrow_forward</span></a>
      </div>
    </div>
    <div class="headerbar">
      <div class="container headerbar__inner">
        <div class="brand">
          <a class="brand__mark" href="${basePath}index.html" aria-label="AutoSelect home">${LOGO_MARK}</a>
          <div class="brand__text">
            <a class="brand__name" href="${basePath}index.html">AutoSelect</a>
            <details class="loc-menu" id="locMenu">
              <summary class="brand__loc" aria-label="Change location">
                <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
                <span data-location-label>${escapeHtml(location)}</span>
                <span class="material-symbols-outlined brand__chevron" aria-hidden="true">expand_more</span>
              </summary>
              <div class="loc-menu__panel">
                <p class="loc-menu__title">Choose your hub</p>
                ${LOCATIONS.map(
                  (city) => `<button type="button" class="loc-menu__option${city === location ? " is-active" : ""}" data-city="${escapeHtml(city)}">
                    <span class="material-symbols-outlined">location_on</span>${escapeHtml(city)}
                    ${city === location ? '<span class="material-symbols-outlined loc-menu__check">check</span>' : ""}
                  </button>`
                ).join("")}
              </div>
            </details>
          </div>
        </div>

        <nav class="desktop-nav" aria-label="Primary">
          ${NAV_ITEMS.map(
            (item) =>
              `<a href="${basePath}${item.href}"${item.page === active ? ' class="is-active" aria-current="page"' : ""}>${item.label}</a>`
          ).join("")}
        </nav>

        <div class="header-actions">
          <button type="button" class="icon-btn" aria-label="Notifications" data-notifications>
            <span class="material-symbols-outlined">notifications</span>
            <span class="icon-btn__dot" id="notificationDot"></span>
          </button>
          <div class="auth-slot" id="authSlot"></div>
        </div>
      </div>
    </div>
  </header>`;
}

function renderBottomNav(active) {
  const basePath = base();
  return `
  <nav class="bottom-nav" aria-label="Mobile">
    <div class="bottom-nav__inner">
      ${BOTTOM_ITEMS.map((item) => {
        const isActive = item.page === active;
        if (item.action === "menu") {
          return `<button type="button" class="bottom-nav__item" data-menu-open aria-label="Open menu">
            <span class="material-symbols-outlined">${item.icon}</span><span>${item.label}</span>
          </button>`;
        }
        return `<a class="bottom-nav__item${isActive ? " is-active" : ""}" href="${basePath}${item.href}"${isActive ? ' aria-current="page"' : ""}>
          <span class="material-symbols-outlined">${item.icon}</span><span>${item.label}</span>
        </a>`;
      }).join("")}
    </div>
  </nav>`;
}

function renderFooter() {
  const basePath = base();
  return `
  <footer class="site-footer">
    <div class="container">
      <div class="site-footer__grid">
        <div class="site-footer__brand">
          <div class="brand">
            <span class="brand__mark">${LOGO_MARK}</span>
            <div class="brand__text">
              <span class="brand__name">AutoSelect</span>
              <span class="brand__loc"><span class="material-symbols-outlined">location_on</span>${escapeHtml(location)}</span>
            </div>
          </div>
          <p class="site-footer__tagline">Certified pre-owned vehicles with transparent fixed pricing, a 150-point inspection and a 7-day money-back guarantee.</p>
          <div class="site-footer__trust">
            <span class="site-footer__badge"><span class="material-symbols-outlined">verified_user</span>150-Pt Inspected</span>
            <span class="site-footer__badge"><span class="material-symbols-outlined">history</span>7-Day Returns</span>
          </div>
        </div>
        <div class="site-footer__col">
          <h3>Shop</h3>
          <ul>
            <li><a href="${basePath}inventory.html">All Inventory</a></li>
            <li><a href="${basePath}inventory.html?body=SUV">SUVs</a></li>
            <li><a href="${basePath}inventory.html?body=Sedan">Sedans</a></li>
            <li><a href="${basePath}inventory.html?body=Truck">Trucks</a></li>
            <li><a href="${basePath}inventory.html?fuel=Electric">Electric Vehicles</a></li>
          </ul>
        </div>
        <div class="site-footer__col">
          <h3>Services</h3>
          <ul>
            <li><a href="${basePath}sell.html">Sell or Trade</a></li>
            <li><a href="${basePath}quiz.html">Car Match Quiz</a></li>
            <li><a href="${basePath}saved.html">Saved Vehicles</a></li>
            <li><a href="${basePath}contact.html">Concierge</a></li>
            <li><a href="${basePath}admin/index.html">Dealer Portal</a></li>
          </ul>
        </div>
        <div class="site-footer__col">
          <h3>Company</h3>
          <ul>
            <li><a href="${basePath}privacy.html">Privacy Policy</a></li>
            <li><a href="${basePath}terms.html">Terms of Service</a></li>
            <li><a href="${basePath}contact.html">Contact Us</a></li>
            <li><a href="${basePath}index.html#reviews">Reviews</a></li>
          </ul>
        </div>
      </div>
      <div class="site-footer__bottom">
        <span>© ${new Date().getFullYear()} AutoSelect Automotive Group. All rights reserved. Demo project.</span>
        <nav aria-label="Legal">
          <a href="${basePath}privacy.html">Privacy</a>
          <a href="${basePath}terms.html">Terms</a>
          <a href="${basePath}contact.html">Support</a>
        </nav>
      </div>
    </div>
  </footer>`;
}

function renderMenuSheet() {
  const basePath = base();
  const user = getCurrentUser() || getCachedUser();
  const authLink = user
    ? `<button type="button" class="menu-sheet__link" data-signout><span class="material-symbols-outlined">logout</span><span>Sign Out<small>${escapeHtml(user.email || "")}</small></span></button>`
    : `<a class="menu-sheet__link" href="${basePath}login.html?redirect=${encodeURIComponent(currentPathForRedirect())}"><span class="material-symbols-outlined">account_circle</span><span>Sign In<small>Save cars &amp; sync favorites</small></span></a>`;
  return `
  <div class="modal modal--md" id="menuModal" data-modal hidden>
    <div class="modal__backdrop" data-modal-close></div>
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="menuTitle">
      <div class="modal__head">
        <div><h2 id="menuTitle">Menu</h2><p>Everything AutoSelect, one tap away.</p></div>
        <button type="button" class="modal__close" data-modal-close aria-label="Close menu"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal__body">
        <div class="menu-sheet__list">
          <a class="menu-sheet__link" href="${basePath}index.html"><span class="material-symbols-outlined">home</span><span>Home<small>Browse hand-picked deals</small></span></a>
          <a class="menu-sheet__link" href="${basePath}inventory.html"><span class="material-symbols-outlined">directions_car</span><span>Inventory<small>150-point inspected stock</small></span></a>
          <a class="menu-sheet__link" href="${basePath}quiz.html"><span class="material-symbols-outlined">auto_awesome</span><span>Match Quiz<small>Find your fit in 60 seconds</small></span></a>
          <a class="menu-sheet__link" href="${basePath}saved.html"><span class="material-symbols-outlined">favorite_border</span><span>Saved Vehicles<small>Your shortlist</small></span></a>
          <a class="menu-sheet__link" href="${basePath}sell.html"><span class="material-symbols-outlined">price_change</span><span>Sell or Trade<small>Instant 2-minute offer</small></span></a>
          <a class="menu-sheet__link" href="${basePath}contact.html"><span class="material-symbols-outlined">support_agent</span><span>Contact Concierge<small>Dallas, TX hub</small></span></a>
          ${user?.isAdmin ? `<a class="menu-sheet__link" href="${basePath}admin/index.html"><span class="material-symbols-outlined">admin_panel_settings</span><span>Dealer Portal<small>Inventory, leads &amp; metrics</small></span></a>` : ""}
          ${authLink}
        </div>
      </div>
    </div>
  </div>`;
}

function renderAuthSlot() {
  const slot = qs("#authSlot");
  if (!slot) return;
  const user = getCurrentUser() || getCachedUser();
  if (user) {
    slot.innerHTML = `
      <details class="avatar-menu" id="avatarMenu">
        <summary aria-label="Account menu" title="${escapeHtml(user.name)}">
          <span class="avatar">${escapeHtml(userInitials(user))}</span>
        </summary>
        <div class="avatar-menu__panel">
          <div class="avatar-menu__head">
            <strong>${escapeHtml(user.name)}</strong>
            <span>${escapeHtml(user.email)}</span>
          </div>
          <a class="avatar-menu__item" href="${base()}saved.html"><span class="material-symbols-outlined">favorite</span>Saved vehicles</a>
          ${user.isAdmin ? `<a class="avatar-menu__item" href="${base()}admin/index.html"><span class="material-symbols-outlined">admin_panel_settings</span>Dealer portal</a>` : ""}
          <a class="avatar-menu__item" href="${base()}sell.html"><span class="material-symbols-outlined">price_change</span>Sell or trade</a>
          <button type="button" class="avatar-menu__item avatar-menu__item--danger" data-signout><span class="material-symbols-outlined">logout</span>Sign out</button>
        </div>
      </details>`;
  } else {
    const redirect = encodeURIComponent(currentPathForRedirect());
    slot.innerHTML = `
      <a class="btn-signin" href="${base()}login.html?redirect=${redirect}">
        <span class="material-symbols-outlined">person</span><span>Sign In</span>
      </a>`;
  }
}

function refreshMenuSheet() {
  const existing = qs("#menuModal");
  if (!existing) return;
  const wasOpen = !existing.hidden;
  existing.outerHTML = renderMenuSheet();
  if (wasOpen) {
    const modal = qs("#menuModal");
    if (modal) openModal(modal);
  }
}

/* ------------------------------------------------------------------ */
/* Modals                                                             */
/* ------------------------------------------------------------------ */

export function openModal(modalOrId) {
  const modal = typeof modalOrId === "string" ? qs(`#${modalOrId}`) : modalOrId;
  if (!modal || !modal.hidden) return;
  lastFocused = document.activeElement;
  modal.hidden = false;
  modal.classList.add("is-open");
  openModalStack.push(modal);
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    const panel = qs(".modal__panel", modal);
    const firstFocusable = qs(
      'button:not([data-modal-close]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      panel
    );
    (firstFocusable || panel)?.focus?.({ preventScroll: true });
  });
}

export function closeModal(modalOrId) {
  const modal = typeof modalOrId === "string" ? qs(`#${modalOrId}`) : modalOrId;
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  modal.classList.remove("is-open");
  openModalStack = openModalStack.filter((item) => item !== modal);
  if (!openModalStack.length) {
    document.body.classList.remove("modal-open");
    lastFocused?.focus?.({ preventScroll: true });
    lastFocused = null;
  }
}

function topModal() {
  return openModalStack[openModalStack.length - 1] || null;
}

function bindGlobalModalEvents() {
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-modal-open]");
    if (opener) {
      event.preventDefault();
      openModal(opener.dataset.modalOpen);
      return;
    }
    const closer = event.target.closest("[data-modal-close]");
    if (closer) {
      const modal = closer.closest("[data-modal]");
      if (modal) {
        event.preventDefault();
        closeModal(modal);
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    const modal = topModal();
    if (!modal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal(modal);
      return;
    }
    if (event.key === "Tab") {
      const panel = qs(".modal__panel", modal);
      if (panel) trapFocus(panel, event);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Toasts                                                            */
/* ------------------------------------------------------------------ */

export function showToast(message, type = "success", duration = 3000) {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toast-host";
    toastHost.setAttribute("role", "status");
    toastHost.setAttribute("aria-live", "polite");
    document.body.appendChild(toastHost);
  }
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " toast--error" : type === "info" ? " toast--info" : ""}`;
  const icon = type === "error" ? "error" : type === "info" ? "info" : "check_circle";
  toast.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span><span>${escapeHtml(message)}</span>`;
  toastHost.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 200);
  }, duration);
}

/* ------------------------------------------------------------------ */
/* Misc enhancements                                                  */
/* ------------------------------------------------------------------ */

export function setButtonLoading(button, loading, loadingLabel = "Working…") {
  if (!button) return;
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="material-symbols-outlined animate-spin" style="animation: spin 1s linear infinite">progress_activity</span><span>${escapeHtml(loadingLabel)}</span>`;
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    button.disabled = false;
    delete button.dataset.originalHtml;
  }
}

/** Style a range input's filled track. */
export function paintRange(input) {
  if (!input) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || 0);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  input.style.setProperty("--range-pct", `${Math.max(0, Math.min(100, pct))}%`);
}

export function bindRange(input, onInput) {
  if (!input) return;
  paintRange(input);
  input.addEventListener("input", () => {
    paintRange(input);
    onInput?.(Number(input.value));
  });
}

export function renderStars(rating = 5) {
  const full = Math.round(rating);
  return `<span class="rating-stars" aria-label="${rating} out of 5 stars">${Array.from(
    { length: 5 },
    (_, index) => `<span class="material-symbols-outlined${index < full ? " icon-fill" : ""}">star</span>`
  ).join("")}</span>`;
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ------------------------------------------------------------------ */
/* Shell mount                                                        */
/* ------------------------------------------------------------------ */

export async function mountShell(options = {}) {
  const active = activePage(options.active);
  if (shellMounted) return;
  shellMounted = true;

  // Paint the shell immediately. Auth (Firebase SDK + admin lookup) resolves in
  // the background and only swaps the account controls, so the header never
  // blocks first paint.
  const headerHost = qs("#site-header");
  const footerHost = qs("#site-footer");
  if (headerHost) headerHost.innerHTML = renderHeader(active);
  if (footerHost) footerHost.innerHTML = renderFooter();
  else {
    const footer = document.createElement("div");
    footer.id = "site-footer";
    footer.innerHTML = renderFooter();
    document.body.appendChild(footer);
  }

  if (!document.body.classList.contains("no-bottom-nav")) {
    const navHost = document.createElement("div");
    navHost.id = "site-bottom-nav";
    navHost.innerHTML = renderBottomNav(active);
    document.body.appendChild(navHost);
  }

  // Menu sheet + WhatsApp FAB
  const overlay = document.createElement("div");
  overlay.id = "as-overlays";
  overlay.innerHTML = renderMenuSheet();
  if (!document.body.classList.contains("hide-fab")) {
    overlay.insertAdjacentHTML(
      "beforeend",
      `<a class="wa-fab" href="${waLink("Hi AutoSelect! I'd like help finding a certified vehicle.")}" target="_blank" rel="noopener noreferrer" aria-label="Chat with the AutoSelect concierge on WhatsApp">
        <span class="material-symbols-outlined">chat</span>
      </a>`
    );
  }
  document.body.appendChild(overlay);

  renderAuthSlot();
  bindGlobalModalEvents();
  initFavoritesSync();

  // Location selector
  const locMenu = qs("#locMenu");
  locMenu?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-city]");
    if (!option) return;
    location = option.dataset.city;
    storageSet(LOCATION_KEY, location);
    qsa("[data-location-label]").forEach((el) => {
      el.textContent = location;
    });
    locMenu.open = false;
    showToast(`Browsing AutoSelect ${location.replace(", TX", "")} hub`, "success");
    window.dispatchEvent(new CustomEvent("as:location-changed", { detail: location }));
  });
  document.addEventListener("click", (event) => {
    if (locMenu?.open && !locMenu.contains(event.target)) locMenu.open = false;
  });

  // Notifications
  qs("[data-notifications]")?.addEventListener("click", () => {
    const dot = qs("#notificationDot");
    dot?.remove();
    showToast("You're all caught up — 3 new certified arrivals in Dallas.", "info");
  });

  // Menu sheet
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-menu-open]")) {
      event.preventDefault();
      openModal("menuModal");
    }
  });

  // Sign out (delegated)
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-signout]");
    if (!button) return;
    event.preventDefault();
    await signOutUser();
    qs("#avatarMenu")?.removeAttribute("open");
    renderAuthSlot();
    refreshMenuSheet();
    showToast("Signed out. Your saved cars are still on this device.");
    if (window.location.pathname.includes("/admin/")) {
      window.setTimeout(() => {
        window.location.href = `${base()}index.html`;
      }, 500);
    }
  });

  watchUser(() => {
    renderAuthSlot();
    refreshMenuSheet();
  });

  // Auth resolved after the shell painted — reconcile the cached profile.
  authReady
    .then(() => {
      renderAuthSlot();
      refreshMenuSheet();
    })
    .catch(() => {});

  // Dismiss avatar dropdown when clicking away
  document.addEventListener("click", (event) => {
    const menu = qs("#avatarMenu");
    if (menu?.open && !menu.contains(event.target)) menu.open = false;
  });

  // Image fallback
  document.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement && !target.dataset.fallbackApplied) {
        target.dataset.fallbackApplied = "true";
        target.src = `${base()}assets/placeholder-car.svg`;
      }
    },
    true
  );

  // Demo-mode hint after login for admins
  if (getCurrentUser()?.isDemo) {
    document.body.dataset.authMode = "demo";
  }
  watchUser((user) => {
    if (user?.isDemo) document.body.dataset.authMode = "demo";
    else delete document.body.dataset.authMode;
  });

  // Keep page offsets in sync when the promo bar wraps or fonts finish loading.
  syncHeaderOffset();
  const headerEl = qs(".site-header");
  if (headerEl && "ResizeObserver" in window) {
    new ResizeObserver(syncHeaderOffset).observe(headerEl);
  } else {
    window.addEventListener("resize", syncHeaderOffset);
  }
}

function syncHeaderOffset() {
  const header = qs(".site-header");
  if (!header) return;
  const height = Math.ceil(header.getBoundingClientRect().height);
  if (height > 0) document.documentElement.style.setProperty("--header-offset", `${height}px`);
}

export function initStaticModals() {
  qsa("[data-modal]").forEach((modal) => {
    if (modal.hidden) modal.hidden = true;
  });
}
