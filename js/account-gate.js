/**
 * Account gate for reservations and trade-ins.
 *
 * Requests that need dealer follow-up require a customer account so the
 * confirmation and concierge replies can be delivered to their dashboard.
 * WhatsApp handoff stays open to everyone.
 */
import { authReady, getCurrentUser } from "./auth.js?v=20261103a";
import { closeModal, openModal } from "./ui.js?v=20261103a";
import { waLink } from "./whatsapp.js?v=20261103a";

let gate = null;

function buildGate() {
  if (gate) return gate;
  gate = document.createElement("div");
  gate.className = "modal modal--sm";
  gate.id = "accountGateModal";
  gate.setAttribute("data-modal", "");
  gate.hidden = true;
  gate.innerHTML = `
    <div class="modal__backdrop" data-modal-close></div>
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="accountGateTitle" aria-describedby="accountGateCopy">
      <div class="modal__head">
        <div>
          <h2 id="accountGateTitle" data-gate-title>Create an account to continue</h2>
          <p data-gate-copy>Your request, confirmation and concierge replies live in one dashboard.</p>
        </div>
        <button type="button" class="modal__close" data-modal-close aria-label="Close dialog"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal__body">
        <div class="account-gate__badge"><span class="material-symbols-outlined" aria-hidden="true">shield_person</span></div>
        <ul class="account-gate__list">
          <li><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>Track your test drive, reservation or trade-in in real time.</li>
          <li><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>Get a written confirmation and direct replies from our concierge.</li>
          <li><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>Keep your saved vehicles and requests together on any device.</li>
        </ul>
        <div class="account-gate__actions">
          <a class="btn btn--primary btn--block" data-gate-signup href="signup.html">
            <span class="material-symbols-outlined" aria-hidden="true">person_add</span>Create free account
          </a>
          <a class="btn btn--ghost btn--block" data-gate-signin href="login.html">
            <span class="material-symbols-outlined" aria-hidden="true">login</span>I already have an account
          </a>
          <a class="btn btn--wa btn--block" data-gate-wa href="#" target="_blank" rel="noopener noreferrer">
            <span class="material-symbols-outlined" aria-hidden="true">chat</span>Continue on WhatsApp instead
          </a>
          <p class="account-gate__fine">No account is needed to buy or request anything through WhatsApp.</p>
        </div>
      </div>
    </div>`;
  document.body.appendChild(gate);

  gate.addEventListener("click", (event) => {
    if (event.target.closest("[data-modal-close]")) closeModal(gate);
  });
  return gate;
}

/** Open the gate with page-specific copy. */
export function showAccountGate({
  title = "Create an account to continue",
  copy = "Your request, confirmation and concierge replies live in one dashboard.",
  whatsappMessage = "Hi AutoSelect! I'd like to continue with a request via WhatsApp.",
  redirect = "",
} = {}) {
  const modal = buildGate();
  const target = redirect || `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search}`;
  const suffix = `?redirect=${encodeURIComponent(target)}`;

  const titleEl = modal.querySelector("[data-gate-title]");
  const copyEl = modal.querySelector("[data-gate-copy]");
  if (titleEl) titleEl.textContent = title;
  if (copyEl) copyEl.textContent = copy;

  const signup = modal.querySelector("[data-gate-signup]");
  const signin = modal.querySelector("[data-gate-signin]");
  const wa = modal.querySelector("[data-gate-wa]");
  if (signup) signup.href = `signup.html${suffix}`;
  if (signin) signin.href = `login.html${suffix}`;
  if (wa) {
    wa.href = waLink(whatsappMessage);
    wa.setAttribute("aria-label", `Continue on WhatsApp — ${whatsappMessage}`);
  }

  openModal(modal);
  return modal;
}

/**
 * Returns the signed-in customer or opens the gate and returns null.
 * Waits for auth so a page loaded with a warm session never flashes the gate.
 */
export async function requireAccount(options = {}) {
  await authReady;
  const user = getCurrentUser();
  if (user) return user;
  showAccountGate(options);
  return null;
}
