/**
 * Contact page: validation, lead capture and success state.
 */
import { saveLead } from "../data-store.js?v=20261102e";
import { setButtonLoading, mountShell, showToast } from "../ui.js?v=20261102e";
import { getParam, isValidEmail, isValidPhone, qs, qsa } from "../utils.js?v=20261102e";
import { waLink } from "../whatsapp.js?v=20261102e";

const form = qs("#contactForm");
const success = qs("[data-contact-success]");
const errorBox = qs("[data-contact-error]");
const submit = qs("#contactSubmit");

function setError(name, message) {
  const field = qs(`[data-field="${name}"]`);
  const node = qs(`[data-error-for="${name}"]`);
  if (node) {
    node.textContent = message || "";
    node.style.display = message ? "block" : "none";
  }
  if (field) {
    field.classList.toggle("has-error", Boolean(message));
    const input = qs(".input, .select, .textarea", field);
    if (input) {
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }
  return field;
}

function clearErrors() {
  if (errorBox) {
    errorBox.hidden = true;
    qs("p", errorBox).textContent = "";
  }
  qsa("[data-error-for]").forEach((node) => {
    node.textContent = "";
    node.style.display = "none";
  });
  qsa("[data-field]").forEach((field) => {
    field.classList.remove("has-error");
    const input = qs(".input, .select, .textarea", field);
    if (input) input.removeAttribute("aria-invalid");
  });
}

function showFormError(message) {
  if (!errorBox) return;
  errorBox.hidden = false;
  qs("p", errorBox).textContent = message;
  errorBox.scrollIntoView({ block: "center", behavior: "smooth" });
}

function collect() {
  return {
    name: qs("#contactName").value.trim(),
    email: qs("#contactEmail").value.trim(),
    phone: qs("#contactPhone").value.trim(),
    topic: qs("#contactTopic").value,
    vehicle: qs("#contactVehicle").value.trim(),
    message: qs("#contactMessage").value.trim(),
    consent: qs("#contactConsent").checked,
  };
}

function validate(data) {
  clearErrors();
  let firstInvalid = null;
  const fail = (name, message) => {
    const field = setError(name, message);
    if (!firstInvalid) firstInvalid = field;
  };

  if (data.name.length < 2) fail("name", "Enter your full name.");
  if (!isValidEmail(data.email)) fail("email", "Enter a valid email address.");
  if (data.phone && !isValidPhone(data.phone)) fail("phone", "Enter a valid phone number, or leave it blank.");
  if (!data.topic) fail("topic", "Choose a topic.");
  if (data.message.length < 10) fail("message", "Tell us a little more (at least 10 characters).");
  if (!data.consent) {
    setError("consent", "Please accept the Privacy Policy to continue.");
    if (!firstInvalid) firstInvalid = qs("#contactConsent");
  }

  if (firstInvalid) {
    const target = qs(".input, .select, .textarea", firstInvalid) || firstInvalid;
    target.focus({ preventScroll: true });
    firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  return !firstInvalid;
}

function showSuccess(lead, data) {
  const emailSlot = qs("[data-success-email]");
  if (emailSlot) emailSlot.textContent = data.email;

  const ref = (lead?.id || "").replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() || "CONTACT";
  const refSlot = qs("[data-success-ref]");
  if (refSlot) refSlot.textContent = ref;

  const waButton = qs("[data-success-wa]");
  if (waButton) {
    waButton.href = waLink(
      `Hi AutoSelect Dallas! I just sent a contact request from your website (ref ${ref}). Topic: ${data.topic}.`
    );
  }

  form.hidden = true;
  success.hidden = false;
  success.setAttribute("tabindex", "-1");
  success.focus({ preventScroll: true });
  success.scrollIntoView({ block: "center", behavior: "smooth" });
}

function resetForm() {
  form.reset();
  clearErrors();
  success.hidden = true;
  form.hidden = false;
  qs("#contactName").focus();
}

function bindForm() {
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = collect();
    if (!validate(data)) return;

    setButtonLoading(submit, true, "Sending…");
    try {
      const lead = await saveLead({
        type: "contact",
        name: data.name,
        email: data.email,
        phone: data.phone,
        message: `${data.topic}${data.vehicle ? ` · ${data.vehicle}` : ""}\n\n${data.message}`,
        meta: { topic: data.topic, vehicle: data.vehicle, source: "contact-page" },
      });
      showSuccess(lead, data);
    } catch (error) {
      console.error("[AutoSelect] contact form failed", error);
      showFormError("We couldn't send your message. Please try again, or reach us on WhatsApp.");
    } finally {
      setButtonLoading(submit, false);
    }
  });

  form.addEventListener("input", (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;
    const name = field.dataset.field;
    if (qs(`[data-error-for="${name}"]`)) setError(name, "");
    if (event.target.id === "contactConsent") setError("consent", "");
  });

  qs("[data-contact-again]")?.addEventListener("click", resetForm);
}

function bindWaLinks() {
  const message = "Hi AutoSelect Dallas! I'd like to speak with a concierge about a vehicle.";
  qsa("[data-contact-wa]").forEach((link) => {
    link.href = waLink(message);
  });
}

function highlightToday() {
  const today = String(new Date().getDay());
  qsa("[data-hub-hours] li").forEach((row) => {
    const days = (row.dataset.days || row.dataset.day || "").split(",");
    if (!days.includes(today)) return;
    row.classList.add("is-today");
    row.title = "Open today";
  });
}

function applyQueryPrefill() {
  const topic = getParam("topic");
  const select = qs("#contactTopic");
  if (topic && select) {
    const match = Array.from(select.options).find((option) => option.value === topic);
    if (match) select.value = topic;
  }
  const vehicle = getParam("vehicle");
  if (vehicle) qs("#contactVehicle").value = vehicle;
}

async function boot() {
  await mountShell({ active: "contact" });
  applyQueryPrefill();
  bindWaLinks();
  highlightToday();
  bindForm();
}

boot();
