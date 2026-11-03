/**
 * Sign-in / sign-up pages: email, Google, password reset and signed-in state.
 */
import {
  getCurrentUser,
  resetPassword,
  safeRedirect,
  signIn,
  signInWithGoogle,
  signOutUser,
  signUp,
  userInitials,
  watchUser,
} from "../auth.js?v=20261103a";
import { isFirebaseConfigured } from "../firebase-config.js?v=20261103a";
import { closeModal, mountShell, openModal, setButtonLoading, showToast } from "../ui.js?v=20261103a";
import { isValidEmail, qs, qsa } from "../utils.js?v=20261103a";

const page = document.body.dataset.auth;
const redirectTarget = safeRedirect(
  new URLSearchParams(window.location.search).get("redirect"),
  "index.html"
);

function showError(message) {
  const box = qs("[data-auth-error]");
  if (!box) return;
  box.hidden = false;
  box.querySelector("p").textContent = message;
}

function clearError() {
  const box = qs("[data-auth-error]");
  if (box) box.hidden = true;
}

function bindPasswordToggles() {
  qsa("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = qs(`#${button.dataset.togglePassword}`);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      const icon = button.querySelector(".material-symbols-outlined");
      if (icon) icon.textContent = show ? "visibility_off" : "visibility";
    });
  });
}

function bindGoogle() {
  qsa("[data-google]").forEach((button) => {
    button.addEventListener("click", async () => {
      clearError();
      setButtonLoading(button, true, "Connecting…");
      try {
        await signInWithGoogle();
        window.location.assign(redirectTarget);
      } catch (error) {
        showError(error.message);
        setButtonLoading(button, false);
      }
    });
  });
}

function bindLogin() {
  const form = qs("#loginForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    const email = qs("#authEmail").value.trim();
    const password = qs("#authPassword").value;

    if (!isValidEmail(email)) {
      showError("Enter a valid email address.");
      qs("#authEmail").focus();
      return;
    }
    if (!password) {
      showError("Enter your password.");
      qs("#authPassword").focus();
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    setButtonLoading(submit, true, "Signing in…");
    try {
      await signIn(email, password);
      window.location.assign(redirectTarget);
    } catch (error) {
      showError(error.message);
      setButtonLoading(submit, false);
    }
  });

  qs("[data-demo-fill]")?.addEventListener("click", () => {
    qs("#authEmail").value = "admin@autoselect.demo";
    qs("#authPassword").value = "autoselect";
    showToast("Demo admin credentials filled. Select Sign in to open the portal.", "info");
    qs("#authPassword").focus();
  });
}

function bindReset() {
  const open = qs("[data-open-reset]");
  const form = qs("#resetForm");
  if (!open || !form) return;

  open.addEventListener("click", () => {
    const email = qs("#authEmail").value.trim();
    qs("#resetEmail").value = isValidEmail(email) ? email : "";
    qs("[data-reset-error]").hidden = true;
    openModal("resetModal");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const box = qs("[data-reset-error]");
    box.hidden = true;
    const email = qs("#resetEmail").value.trim();
    if (!isValidEmail(email)) {
      box.hidden = false;
      box.querySelector("p").textContent = "Enter a valid email address.";
      qs("#resetEmail").focus();
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    setButtonLoading(submit, true, "Sending…");
    try {
      await resetPassword(email);
      closeModal("resetModal");
      showToast("Password reset link sent. Check your inbox.", "success");
    } catch (error) {
      box.hidden = false;
      box.querySelector("p").textContent = error.message;
      setButtonLoading(submit, false);
    }
  });
}

function bindSignup() {
  const form = qs("#signupForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    const name = qs("#authName").value.trim();
    const email = qs("#authEmail").value.trim();
    const phone = qs("#authPhone").value.trim();
    const password = qs("#authPassword").value;
    const policy = qs("#authPolicy").checked;

    if (!name) {
      showError("Please enter your full name.");
      qs("#authName").focus();
      return;
    }
    if (!isValidEmail(email)) {
      showError("Enter a valid email address.");
      qs("#authEmail").focus();
      return;
    }
    if (phone && phone.replace(/\D/g, "").length < 7) {
      showError("That phone number looks too short.");
      qs("#authPhone").focus();
      return;
    }
    if (password.length < 8) {
      showError("Use a password with at least 8 characters.");
      qs("#authPassword").focus();
      return;
    }
    if (!policy) {
      showError("Please accept the Terms and Privacy Policy to continue.");
      qs("#authPolicy").focus();
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    setButtonLoading(submit, true, "Creating account…");
    try {
      await signUp({ name, email, password, phone });
      window.location.assign(redirectTarget);
    } catch (error) {
      showError(error.message);
      setButtonLoading(submit, false);
    }
  });
}

function bindSignedIn() {
  qs("[data-signed-signout]")?.addEventListener("click", async () => {
    await signOutUser();
    showToast("Signed out. Your saved cars are still on this device.", "info");
  });
}

function renderSignedIn(user) {
  const signed = qs("[data-auth-signed]");
  const forms = qs("[data-auth-forms]");
  if (!signed || !forms) return;

  signed.hidden = !user;
  forms.hidden = Boolean(user);
  if (!user) return;

  const firstName = (user.name || "there").split(/\s+/)[0];
  qs("[data-signed-name]").textContent = firstName;
  qs("[data-signed-name-card]").textContent = user.name || firstName;
  qs("[data-signed-email]").textContent = user.email || "";
  qs("[data-signed-email-card]").textContent = user.email || "";
  qs("[data-signed-avatar]").textContent = userInitials(user);
  qs("[data-signed-continue]").href = redirectTarget;
  qs("[data-signed-admin-badge]").hidden = !user.isAdmin;
  qsa("[data-signed-admin-link]").forEach((link) => {
    link.hidden = !user.isAdmin;
  });
}

function boot() {
  // Bind before the shell resolves so a fast submit never falls through to a native GET.
  if (isFirebaseConfigured) {
    qsa("[data-demo-hint]").forEach((hint) => {
      hint.hidden = true;
    });
  }

  const switchTarget = page === "login" ? "signup.html" : "login.html";
  qsa("[data-auth-switch]").forEach((link) => {
    link.href = `${switchTarget}?redirect=${encodeURIComponent(redirectTarget)}`;
  });

  bindPasswordToggles();
  bindGoogle();
  bindSignedIn();
  if (page === "login") {
    bindLogin();
    bindReset();
  } else {
    bindSignup();
  }

  watchUser(renderSignedIn);
  renderSignedIn(getCurrentUser());

  mountShell({ active: page === "login" ? "login" : "signup" });
}

boot();
