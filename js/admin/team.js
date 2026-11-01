/**
 * Dealer portal — team management. Super admins can create and remove admins;
 * every other admin sees that the view is unavailable and gets no controls.
 */
import {
  createAdminAccount,
  deleteAdminAccount,
  getCurrentUser,
  listAdminAccounts,
} from "../auth.js?v=20261102b";
import { setButtonLoading, showToast } from "../ui.js?v=20261102b";
import { escapeHtml, initials, qs } from "../utils.js?v=20261102b";
import { leadDate } from "./helpers.js?v=20261102b";

let admins = [];
let context = { confirmAction: async () => false };
let loaded = false;

function rowMarkup(admin, viewer) {
  const role = admin.role === "super" ? "super" : "admin";
  const isSelf = admin.uid === viewer?.uid;
  const name = admin.name || admin.email || "Dealer admin";
  return `
    <div class="adm-team__row">
      <span class="adm-team__avatar adm-team__avatar--${role}">${escapeHtml(initials(name))}</span>
      <div class="adm-team__who">
        <strong>${escapeHtml(name)}${isSelf ? ' <span class="adm-team__you">You</span>' : ""}</strong>
        <span>${escapeHtml(admin.email || "No email on record")}</span>
      </div>
      <span class="adm-team__role adm-team__role--${role}">
        <span class="material-symbols-outlined" aria-hidden="true">${role === "super" ? "shield_person" : "badge"}</span>
        ${role === "super" ? "Super admin" : "Admin"}
      </span>
      <span class="adm-team__since">${admin.createdAt ? `Since ${escapeHtml(leadDate(admin.createdAt))}` : "—"}</span>
      ${
        role === "admin" && !isSelf
          ? `<button class="adm-row-btn adm-row-btn--danger" type="button" data-remove-admin="${escapeHtml(admin.uid)}" aria-label="Remove ${escapeHtml(name)}">
              <span class="material-symbols-outlined" aria-hidden="true">person_remove</span>
            </button>`
          : `<span class="adm-team__locked" title="${role === "super" ? "Super admins cannot be removed" : "You cannot remove yourself"}">
              <span class="material-symbols-outlined" aria-hidden="true">lock</span>
            </span>`
      }
    </div>`;
}

export function renderTeam(list = null) {
  if (list) admins = Array.isArray(list) ? list : [];
  const counter = qs("[data-count-admins]");
  if (counter) counter.textContent = String(admins.length);
  const host = qs("[data-team-body]");
  if (!host) return;
  const viewer = getCurrentUser();

  if (!admins.length) {
    host.innerHTML = `<div class="adm-empty" style="padding:30px 20px">
      <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">group</span></div>
      <h3>No admins yet</h3>
      <p>Add the first dealer admin so the team can manage inventory and leads.</p>
    </div>`;
    return;
  }

  host.innerHTML = `<div class="adm-team">${admins
    .map((admin) => rowMarkup(admin, viewer))
    .join("")}</div>`;
}

export async function refreshTeam() {
  const host = qs("[data-team-body]");
  if (host && !loaded) {
    host.innerHTML = `<div class="adm-skeleton" aria-hidden="true"><span style="width:70%"></span><span style="width:55%"></span><span style="width:64%"></span></div>`;
  }
  try {
    admins = await listAdminAccounts();
    loaded = true;
    renderTeam();
  } catch (error) {
    console.error("[AutoSelect] team load failed", error);
    if (host) {
      host.innerHTML = `<div class="adm-empty" style="padding:30px 20px">
        <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">cloud_off</span></div>
        <h3>Could not load the team</h3>
        <p>Deploy the latest firestore.rules and check your connection, then retry.</p>
        <button class="btn btn--ghost btn--sm" type="button" data-retry-team>
          <span class="material-symbols-outlined" aria-hidden="true">refresh</span>Retry
        </button>
      </div>`;
    }
  }
}

function showError(message) {
  const box = qs("[data-admin-error]");
  if (!box) return;
  box.hidden = false;
  const text = box.querySelector("p");
  if (text) text.textContent = message;
}

function clearError() {
  const box = qs("[data-admin-error]");
  if (box) box.hidden = true;
}

function openDialog() {
  if (!getCurrentUser()?.isSuperAdmin) {
    showToast("Only the super admin can add dealer admins.", "error");
    return;
  }
  const dialog = qs("#adminDialog");
  if (!dialog) return;
  qs("#adminForm")?.reset();
  clearError();
  dialog.showModal();
  requestAnimationFrame(() => qs("#admAdminName")?.focus({ preventScroll: true }));
}

function closeDialog() {
  const dialog = qs("#adminDialog");
  if (dialog?.open) dialog.close();
}

async function submitAdmin(event) {
  event.preventDefault();
  clearError();

  const name = qs("#admAdminName")?.value.trim() || "";
  const email = qs("#admAdminEmail")?.value.trim() || "";
  const password = qs("#admAdminPassword")?.value || "";
  const confirm = qs("#admAdminConfirm")?.value || "";

  if (name.length < 2) return showError("Enter the admin's full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Enter a valid email address.");
  if (password.length < 8) return showError("Use a password with at least 8 characters.");
  if (password !== confirm) return showError("The two passwords do not match.");

  const button = qs("#admAdminSave");
  setButtonLoading(button, true, "Creating…");
  try {
    await createAdminAccount({ name, email, password });
    closeDialog();
    await refreshTeam();
    showToast(`${email} can now sign in to the dealer portal. Only you can add more admins.`, "success", 5000);
  } catch (error) {
    console.error("[AutoSelect] create admin failed", error);
    showError(error.message || "Could not create that admin.");
  } finally {
    setButtonLoading(button, false);
  }
}

async function removeAdmin(uid) {
  const admin = admins.find((item) => item.uid === uid);
  if (!admin) return;
  const confirmed = await context.confirmAction({
    title: "Remove this admin?",
    message: `${admin.name || admin.email} will lose access to the dealer portal immediately. The Firebase sign-in account itself is not deleted.`,
    confirmLabel: "Remove admin",
    danger: true,
  });
  if (!confirmed) return;
  try {
    await deleteAdminAccount(uid);
    await refreshTeam();
    showToast("Admin access removed.", "success");
  } catch (error) {
    console.error("[AutoSelect] remove admin failed", error);
    showToast(error.message || "Could not remove that admin.", "error");
  }
}

export function initTeam(options = {}) {
  context = { ...context, ...options };

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-add-admin]")) {
      event.preventDefault();
      openDialog();
      return;
    }
    if (event.target.closest("[data-retry-team]")) {
      refreshTeam();
      return;
    }
    const remove = event.target.closest("[data-remove-admin]");
    if (remove) removeAdmin(remove.dataset.removeAdmin);
  });

  qs("#adminForm")?.addEventListener("submit", submitAdmin);
  document.querySelectorAll("[data-admin-cancel]").forEach((button) => {
    button.addEventListener("click", closeDialog);
  });

  const dialog = qs("#adminDialog");
  dialog?.addEventListener("close", clearError);
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
}
