/**
 * Review studio: approve suggested reviews, write new ones and attach them to
 * the homepage or a specific vehicle.
 */
import { deleteReview, listReviews, saveReview } from "../data-store.js?v=20261112a";
import { showToast } from "../ui.js?v=20261112a";
import { escapeHtml, formatDate, initials, qs, qsa, storageGet, storageSet } from "../utils.js?v=20261112a";
import { reviewSuggestions } from "./review-suggestions.js?v=20261112a";

const DRAFT_KEY = "as_review_drafts_v1";
const PAGE_SIZE = 6;
const RATING_LABELS = ["", "Needs work", "Fair", "Good", "Great", "Excellent"];
const SUGGESTION_IDS = new Set(reviewSuggestions.map((review) => review.id));

const state = {
  published: [],
  drafts: [],
  vehicles: [],
  rating: 5,
  queueFilter: "all",
  queueVisible: PAGE_SIZE,
  scope: "all",
  editing: null,
  confirmAction: null,
  getVehicles: () => [],
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function carLabel(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateInputValue(value) {
  if (!value) return todayIso();
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? todayIso() : date.toISOString().slice(0, 10);
}

function starsMarkup(rating, className = "") {
  const score = Number(rating) || 0;
  const full = Math.round(score);
  return `<span class="adm-stars-view${className ? ` ${className}` : ""}" aria-label="${score} out of 5 stars">${Array.from(
    { length: 5 },
    (_, index) =>
      `<span class="material-symbols-outlined${index < full ? " icon-fill" : ""}" aria-hidden="true">star</span>`
  ).join("")}</span>`;
}

function resolveVehicle(name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;
  return (
    state.vehicles.find((vehicle) => carLabel(vehicle).toLowerCase() === target) ||
    state.vehicles.find((vehicle) => carLabel(vehicle).toLowerCase().includes(target)) ||
    null
  );
}

function targetLabel(review) {
  return review.vehicle ? review.vehicle : "Whole website";
}

/* ------------------------------------------------------------------ */
/* Draft storage                                                       */
/* ------------------------------------------------------------------ */

function readDrafts() {
  const stored = storageGet(DRAFT_KEY, null);
  if (Array.isArray(stored)) return stored;
  const seeded = reviewSuggestions.map((review) => ({ ...review }));
  storageSet(DRAFT_KEY, seeded);
  return seeded;
}

function writeDrafts(list) {
  state.drafts = list;
  storageSet(DRAFT_KEY, list);
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

function renderStats() {
  const total = state.published.length;
  const average = total
    ? state.published.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total
    : 0;
  const vehicleCount = state.published.filter((review) => review.vehicle).length;
  const siteCount = total - vehicleCount;
  const verified = state.published.filter((review) => review.verified).length;
  const pending = state.drafts.length;
  const remainingSuggestions = state.drafts.filter((draft) => SUGGESTION_IDS.has(draft.id)).length;
  const handled = reviewSuggestions.length - remainingSuggestions;

  const set = (selector, value) => {
    const node = qs(selector);
    if (node) node.textContent = value;
  };
  set("[data-rv-stat-total]", total);
  set("[data-rv-stat-average]", total ? average.toFixed(1) : "—");
  set("[data-rv-stat-badge]", total ? `${RATING_LABELS[Math.round(average)] || "Great"} rating` : "no ratings yet");
  set("[data-rv-stat-pending]", pending);
  set("[data-rv-stat-vehicles]", `${vehicleCount} car review${vehicleCount === 1 ? "" : "s"}`);
  set("[data-rv-stat-site]", `${siteCount} website`);
  set("[data-rv-stat-verified]", verified);
  set("[data-rv-queue-count]", pending);
  set("[data-rv-progress]", Math.max(0, handled));
  set("[data-rv-progress-total]", reviewSuggestions.length);

  const bar = qs("[data-rv-progress-bar]");
  if (bar) bar.style.width = `${Math.round((Math.max(0, handled) / reviewSuggestions.length) * 100)}%`;

  const badge = qs("[data-count-reviews]");
  if (badge) badge.textContent = String(pending);
}

/* ------------------------------------------------------------------ */
/* Suggestion queue                                                    */
/* ------------------------------------------------------------------ */

function suggestionCard(draft) {
  const vehicle = draft.vehicle ? resolveVehicle(draft.vehicle) : null;
  const missing = Boolean(draft.vehicle) && !vehicle;
  return `<article class="adm-sugg" data-rv-draft="${escapeHtml(draft.id)}">
    <div class="adm-sugg__top">
      <span class="adm-sugg__avatar" aria-hidden="true">${escapeHtml(initials(draft.name))}</span>
      <div class="adm-sugg__who">
        <strong>${escapeHtml(draft.name || "New reviewer")}</strong>
        <span>${escapeHtml(draft.city || "Dallas, TX")} · ${escapeHtml(formatDate(draft.createdAt) || "No date")}</span>
      </div>
      ${starsMarkup(draft.rating, "adm-sugg__stars")}
    </div>
    <p class="adm-sugg__text">“${escapeHtml(draft.text)}”</p>
    <div class="adm-sugg__target${missing ? " is-missing" : ""}">
      <span class="material-symbols-outlined" aria-hidden="true">${draft.vehicle ? "directions_car" : "public"}</span>
      <span>${escapeHtml(targetLabel(draft))}</span>
      ${missing ? `<span class="adm-sugg__warn">Not in stock</span>` : ""}
      ${
        draft.verified
          ? `<span class="adm-sugg__verified"><span class="material-symbols-outlined" aria-hidden="true">verified</span>Verified</span>`
          : ""
      }
    </div>
    <div class="adm-sugg__actions">
      <button class="btn btn--primary btn--sm" type="button" data-rv-approve="${escapeHtml(draft.id)}">
        <span class="material-symbols-outlined" aria-hidden="true">cloud_upload</span>Approve
      </button>
      <button class="btn btn--ghost btn--sm" type="button" data-rv-edit="${escapeHtml(draft.id)}">
        <span class="material-symbols-outlined" aria-hidden="true">edit</span>Edit
      </button>
      <button class="adm-sugg__dismiss" type="button" data-rv-dismiss="${escapeHtml(draft.id)}" aria-label="Dismiss suggestion">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>
  </article>`;
}

function filteredDrafts() {
  if (state.queueFilter === "site") return state.drafts.filter((draft) => !draft.vehicle);
  if (state.queueFilter === "vehicle") return state.drafts.filter((draft) => Boolean(draft.vehicle));
  return state.drafts;
}

function renderSuggestions() {
  const host = qs("[data-review-suggestions]");
  if (!host) return;
  const list = filteredDrafts();
  host.innerHTML = list.length
    ? list.slice(0, state.queueVisible).map(suggestionCard).join("")
    : `<div class="adm-empty adm-empty--inline"><div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">task_alt</span></div><h3>Queue cleared</h3><p>Every suggestion has been approved or dismissed. Write a review to keep the stories coming.</p></div>`;

  const more = qs("[data-rv-more]");
  if (more) {
    more.hidden = list.length <= state.queueVisible;
    const left = Math.max(0, list.length - state.queueVisible);
    const label = more.querySelector("[data-rv-more-label]");
    if (label) label.textContent = left ? `Show ${Math.min(PAGE_SIZE, left)} more` : "Show more suggestions";
  }

  qsa("[data-rv-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rvFilter === state.queueFilter);
  });
}

/* ------------------------------------------------------------------ */
/* Published list                                                      */
/* ------------------------------------------------------------------ */

function publishedCard(review) {
  const vehicle = review.vehicle ? resolveVehicle(review.vehicle) : null;
  const href = vehicle ? `../vehicle.html?id=${encodeURIComponent(vehicle.id)}` : "";
  return `<article class="adm-rev-row" data-rv-published="${escapeHtml(review.id)}">
    <span class="adm-rev-row__avatar" aria-hidden="true">${escapeHtml(initials(review.name))}</span>
    <div class="adm-rev-row__body">
      <div class="adm-rev-row__top">
        <div class="adm-rev-row__who">
          <strong>${escapeHtml(review.name)}</strong>
          <span>${escapeHtml(review.city || "Dallas, TX")} · ${escapeHtml(formatDate(review.createdAt))}</span>
        </div>
        ${starsMarkup(review.rating, "adm-rev-row__stars")}
      </div>
      <p class="adm-rev-row__text">“${escapeHtml(review.text)}”</p>
      <div class="adm-rev-row__meta">
        <span class="adm-rev-row__target"><span class="material-symbols-outlined" aria-hidden="true">${review.vehicle ? "directions_car" : "public"}</span>${escapeHtml(targetLabel(review))}</span>
        ${
          review.verified
            ? `<span class="adm-rev-row__verified"><span class="material-symbols-outlined" aria-hidden="true">verified</span>Verified</span>`
            : ""
        }
      </div>
    </div>
    <div class="adm-rev-row__actions">
      ${href ? `<a class="adm-icon-btn" href="${href}" target="_blank" rel="noopener" aria-label="Open the car page"><span class="material-symbols-outlined" aria-hidden="true">open_in_new</span></a>` : ""}
      <button class="adm-icon-btn" type="button" data-rv-published-edit="${escapeHtml(review.id)}" aria-label="Edit review">
        <span class="material-symbols-outlined" aria-hidden="true">edit</span>
      </button>
      <button class="adm-icon-btn adm-icon-btn--danger" type="button" data-rv-published-delete="${escapeHtml(review.id)}" aria-label="Delete review">
        <span class="material-symbols-outlined" aria-hidden="true">delete</span>
      </button>
    </div>
  </article>`;
}

function visiblePublished() {
  const query = String(qs("[data-rv-search]")?.value || "").trim().toLowerCase();
  return state.published.filter((review) => {
    if (state.scope === "site" && review.vehicle) return false;
    if (state.scope === "vehicle" && !review.vehicle) return false;
    if (!query) return true;
    return [review.name, review.city, review.text, review.vehicle].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });
}

function renderPublished() {
  const host = qs("[data-review-list]");
  if (!host) return;
  const list = visiblePublished();
  const shown = qs("[data-rv-shown]");
  if (shown) shown.textContent = String(list.length);

  if (!state.published.length) {
    host.innerHTML = `<div class="adm-empty adm-empty--inline">
      <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">reviews</span></div>
      <h3>No reviews published yet</h3>
      <p>Approve a suggestion above or write your own. Published reviews appear on the homepage instantly.</p>
      <button class="btn btn--primary btn--sm" type="button" data-review-new><span class="material-symbols-outlined" aria-hidden="true">edit_note</span>Write a review</button>
    </div>`;
    return;
  }

  if (!list.length) {
    host.innerHTML = `<div class="adm-empty adm-empty--inline">
      <div class="adm-empty__icon"><span class="material-symbols-outlined" aria-hidden="true">search_off</span></div>
      <h3>No reviews match</h3>
      <p>Try a different search or clear the filter.</p>
    </div>`;
    return;
  }

  host.innerHTML = `<div class="adm-rev-list">${list.map(publishedCard).join("")}</div>`;
}

/* ------------------------------------------------------------------ */
/* Editor dialog                                                       */
/* ------------------------------------------------------------------ */

function isPublishedEdit(source) {
  return Boolean(source && state.published.some((review) => review.id === source.id));
}

function populateTargets(selected) {
  const select = qs("[data-rv-target]");
  if (!select) return;
  const groups = new Map();
  state.vehicles.forEach((vehicle) => {
    const label = carLabel(vehicle);
    if (!label) return;
    const make = String(vehicle.make || "Other");
    if (!groups.has(make)) groups.set(make, []);
    groups.get(make).push({ label, trim: vehicle.trim || "" });
  });
  const options = [`<option value="">Whole website (homepage)</option>`];
  [...groups.keys()].sort((a, b) => a.localeCompare(b)).forEach((make) => {
    const items = groups
      .get(make)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(
        (item) =>
          `<option value="${escapeHtml(item.label)}">${escapeHtml(item.label)}${item.trim ? ` · ${escapeHtml(item.trim)}` : ""}</option>`
      );
    options.push(`<optgroup label="${escapeHtml(make)}">${items.join("")}</optgroup>`);
  });
  if (selected && !state.vehicles.some((vehicle) => carLabel(vehicle) === selected)) {
    options.push(
      `<option value="${escapeHtml(selected)}">${escapeHtml(selected)} (not in current stock)</option>`
    );
  }
  select.innerHTML = options.join("");
  select.value = selected || "";
}

function setRating(rating) {
  state.rating = Math.min(5, Math.max(1, Number(rating) || 5));
  qsa("[data-rv-star]").forEach((button) => {
    const value = Number(button.dataset.rvStar);
    const on = value <= state.rating;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-checked", String(value === state.rating));
    button.tabIndex = value === state.rating ? 0 : -1;
  });
  const label = qs("[data-rv-rating-label]");
  if (label) label.textContent = `${state.rating}.0 · ${RATING_LABELS[state.rating]}`;
  syncPreview();
}

function currentForm() {
  return {
    name: qs("#rvName")?.value || "",
    city: qs("#rvCity")?.value || "",
    text: qs("#rvText")?.value || "",
    vehicle: qs("[data-rv-target]")?.value || "",
    date: qs("#rvDate")?.value || "",
    verified: Boolean(qs("#rvVerified")?.checked),
    rating: state.rating,
  };
}

function previewDate(value) {
  if (!value) return "Today";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Today" : formatDate(date);
}

function syncPreview() {
  const form = currentForm();
  const set = (selector, value) => {
    const node = qs(selector);
    if (node) node.textContent = value;
  };
  set("[data-rv-preview-avatar]", initials(form.name || "New reviewer"));
  set("[data-rv-preview-name]", form.name.trim() || "Reviewer name");
  set(
    "[data-rv-preview-meta]",
    `${form.city.trim() || "Dallas, TX"} · ${previewDate(form.date)}`
  );
  const stars = qs("[data-rv-preview-stars]");
  if (stars) {
    stars.innerHTML = Array.from(
      { length: 5 },
      (_, index) =>
        `<span class="material-symbols-outlined${index < state.rating ? " icon-fill" : ""}" aria-hidden="true">star</span>`
    ).join("");
  }
  const text = qs("[data-rv-preview-text]");
  if (text) {
    text.textContent = form.text.trim() || "Your review text will appear here as you type.";
    text.classList.toggle("is-placeholder", !form.text.trim());
  }
  const target = qs("[data-rv-preview-target]");
  if (target) {
    target.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${form.vehicle ? "directions_car" : "public"}</span>${escapeHtml(form.vehicle || "Website")}`;
  }
  const verified = qs("[data-rv-preview-verified]");
  if (verified) verified.hidden = !form.verified;
}

function clearFormErrors() {
  const banner = qs("[data-review-error]");
  if (banner) {
    banner.hidden = true;
    const copy = banner.querySelector("p");
    if (copy) copy.textContent = "";
  }
  qsa("[data-rv-error]").forEach((node) => {
    node.hidden = true;
    node.textContent = "";
  });
  qsa("[data-rv-field]").forEach((field) => field.classList.remove("is-invalid"));
}

function showFormError(message, field = "") {
  if (field) {
    const node = qs(`[data-rv-error="${field}"]`);
    if (node) {
      node.hidden = false;
      node.textContent = message;
    }
    const wrapper = qs(`[data-rv-field="${field}"]`);
    if (wrapper) wrapper.classList.add("is-invalid");
    const input = qs(`#rv${field.charAt(0).toUpperCase()}${field.slice(1)}`);
    input?.focus({ preventScroll: false });
    return;
  }
  const banner = qs("[data-review-error]");
  if (!banner) return;
  banner.hidden = false;
  const copy = banner.querySelector("p");
  if (copy) copy.textContent = message;
}

function openEditor(source = null) {
  const dialog = qs("#reviewDialog");
  if (!dialog) return;
  clearFormErrors();
  const editingPublished = isPublishedEdit(source);
  const editingDraft = Boolean(source && !editingPublished);
  state.editing = source ? { ...source } : null;

  const title = qs("#reviewDialogTitle");
  const subtitle = qs("#reviewDialogSubtitle");
  if (title) {
    title.textContent = editingPublished
      ? "Edit published review"
      : editingDraft
        ? "Polish this suggested review"
        : "Write a review";
  }
  if (subtitle) {
    subtitle.textContent = editingPublished
      ? "Changes go live as soon as you publish."
      : "Publish to the homepage or attach it to a specific car.";
  }

  const data = source || { rating: 5, verified: true, createdAt: todayIso(), name: "", city: "", text: "", vehicle: "" };
  qs("#rvName").value = data.name || "";
  qs("#rvCity").value = data.city || "";
  qs("#rvText").value = data.text || "";
  qs("#rvDate").value = dateInputValue(data.createdAt);
  qs("#rvVerified").checked = data.verified !== false;
  populateTargets(data.vehicle || "");
  setRating(data.rating || 5);

  const count = qs("[data-rv-count]");
  if (count) count.textContent = String((data.text || "").length);

  const draftButton = qs("[data-review-save-draft]");
  if (draftButton) draftButton.hidden = editingPublished;

  syncPreview();
  dialog.showModal();
  qs("#rvName")?.focus({ preventScroll: true });
}

function closeEditor() {
  const dialog = qs("#reviewDialog");
  if (dialog?.open) dialog.close();
  state.editing = null;
}

function collectForm() {
  const form = currentForm();
  return {
    name: form.name.trim(),
    city: form.city.trim(),
    rating: state.rating,
    text: form.text.trim(),
    vehicle: form.vehicle,
    verified: form.verified,
    createdAt: form.date ? `${form.date}T12:00:00.000Z` : "",
  };
}

function validate(payload) {
  clearFormErrors();
  if (!payload.name) {
    showFormError("Add the reviewer's name.", "name");
    return false;
  }
  if (payload.text.length < 20) {
    showFormError("Write at least a sentence (20 characters or more).", "text");
    return false;
  }
  return true;
}

async function publishFromEditor() {
  const payload = collectForm();
  if (!validate(payload)) return;
  const button = qs("[data-review-submit]");
  if (button) button.disabled = true;
  const editingId = state.editing?.id || "";
  const editingPublished = isPublishedEdit(state.editing);
  try {
    await saveReview({ ...payload, id: editingPublished ? editingId : "" });
    if (editingId && !editingPublished) {
      writeDrafts(state.drafts.filter((draft) => draft.id !== editingId));
    }
    closeEditor();
    showToast(editingPublished ? "Review updated." : "Review published to the website.", "success");
    await refreshReviews();
  } catch (error) {
    console.error("[AutoSelect] publish review failed", error);
    showFormError(error.message || "Could not publish this review.");
  } finally {
    if (button) button.disabled = false;
  }
}

function saveDraftFromEditor() {
  const payload = collectForm();
  if (!validate(payload)) return;
  const id = state.editing?.id || `draft-${Date.now().toString(36)}`;
  const draft = { ...payload, id };
  const exists = state.drafts.some((item) => item.id === id);
  writeDrafts(
    exists ? state.drafts.map((item) => (item.id === id ? { ...item, ...draft } : item)) : [draft, ...state.drafts]
  );
  closeEditor();
  showToast("Draft saved. Approve it when you're ready.", "success");
  renderStats();
  renderSuggestions();
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

async function approveDraft(id, button = null) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  if (button) button.disabled = true;
  try {
    await saveReview({ ...draft, id: "" });
    writeDrafts(state.drafts.filter((item) => item.id !== id));
    showToast("Review published. It is live on the website now.", "success");
    await refreshReviews();
  } catch (error) {
    console.error("[AutoSelect] approve review failed", error);
    showToast(error.message || "Could not publish this review.", "error");
    if (button) button.disabled = false;
  }
}

async function dismissDraft(id) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  const confirmed = state.confirmAction
    ? await state.confirmAction({
        title: "Dismiss this suggestion?",
        message: `“${draft.name}” will be removed from the queue. You can still write a review manually at any time.`,
        confirmLabel: "Dismiss",
        danger: false,
      })
    : true;
  if (!confirmed) return;
  writeDrafts(state.drafts.filter((item) => item.id !== id));
  showToast("Suggestion dismissed.", "info");
  renderStats();
  renderSuggestions();
}

async function deletePublished(id) {
  const review = state.published.find((item) => item.id === id);
  if (!review) return;
  const confirmed = state.confirmAction
    ? await state.confirmAction({
        title: "Delete this review?",
        message: `The review from “${review.name}” will be removed from the website and the car page. This cannot be undone.`,
        confirmLabel: "Delete review",
        danger: true,
      })
    : true;
  if (!confirmed) return;
  try {
    await deleteReview(id);
    showToast("Review deleted.", "success");
    await refreshReviews();
  } catch (error) {
    console.error("[AutoSelect] delete review failed", error);
    showToast(error.message || "Could not delete this review.", "error");
  }
}

/* ------------------------------------------------------------------ */
/* Refresh                                                             */
/* ------------------------------------------------------------------ */

async function refreshReviews(vehicles) {
  state.vehicles = Array.isArray(vehicles) ? vehicles : state.getVehicles();
  state.drafts = readDrafts();
  try {
    state.published = await listReviews({ limit: 500 });
  } catch (error) {
    console.warn("[AutoSelect] reviews list failed", error);
    state.published = [];
  }
  state.queueVisible = Math.max(PAGE_SIZE, Math.min(state.queueVisible, filteredDrafts().length || PAGE_SIZE));
  renderStats();
  renderSuggestions();
  renderPublished();
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function bindEvents() {
  const dialog = qs("#reviewDialog");
  const form = qs("#reviewForm");

  document.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-rv-filter]");
    if (filter) {
      state.queueFilter = filter.dataset.rvFilter;
      state.queueVisible = PAGE_SIZE;
      renderSuggestions();
      return;
    }

    const approve = event.target.closest("[data-rv-approve]");
    if (approve) {
      approveDraft(approve.dataset.rvApprove, approve);
      return;
    }

    const editDraft = event.target.closest("[data-rv-edit]");
    if (editDraft) {
      const draft = state.drafts.find((item) => item.id === editDraft.dataset.rvEdit);
      if (draft) openEditor(draft);
      return;
    }

    const dismiss = event.target.closest("[data-rv-dismiss]");
    if (dismiss) {
      dismissDraft(dismiss.dataset.rvDismiss);
      return;
    }

    const editPublished = event.target.closest("[data-rv-published-edit]");
    if (editPublished) {
      const review = state.published.find((item) => item.id === editPublished.dataset.rvPublishedEdit);
      if (review) openEditor(review);
      return;
    }

    const removePublished = event.target.closest("[data-rv-published-delete]");
    if (removePublished) {
      deletePublished(removePublished.dataset.rvPublishedDelete);
      return;
    }

    if (event.target.closest("[data-review-new]")) {
      openEditor();
      return;
    }

    if (event.target.closest("[data-rv-more]")) {
      state.queueVisible += PAGE_SIZE;
      renderSuggestions();
      return;
    }

    if (event.target.closest("[data-review-cancel]")) {
      closeEditor();
    }
  });

  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) closeEditor();
  });

  form?.addEventListener("input", (event) => {
    if (event.target.id === "rvText") {
      const count = qs("[data-rv-count]");
      if (count) count.textContent = String(event.target.value.length);
    }
    syncPreview();
  });

  form?.addEventListener("change", syncPreview);

  qs("[data-rv-stars]")?.addEventListener("click", (event) => {
    const star = event.target.closest("[data-rv-star]");
    if (star) setRating(star.dataset.rvStar);
  });

  qs("[data-rv-stars]")?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = state.rating + (event.key === "ArrowRight" ? 1 : -1);
    setRating(Math.min(5, Math.max(1, next)));
    qs(`[data-rv-star="${state.rating}"]`)?.focus();
  });

  qs("#rvName")?.addEventListener("blur", () => syncPreview());
  qs("#rvCity")?.addEventListener("blur", () => syncPreview());

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    publishFromEditor();
  });

  qs("[data-review-save-draft]")?.addEventListener("click", saveDraftFromEditor);

  qs("[data-rv-search]")?.addEventListener("input", renderPublished);
  qs("[data-rv-scope]")?.addEventListener("change", (event) => {
    state.scope = event.target.value;
    renderPublished();
  });
}

export function initReviews({ getVehicles, confirmAction } = {}) {
  if (typeof getVehicles === "function") state.getVehicles = getVehicles;
  if (typeof confirmAction === "function") state.confirmAction = confirmAction;
  state.drafts = readDrafts();
  bindEvents();
}

/** Restore the 20 bundled suggestions after a demo-data reset. */
export function resetReviewStudio() {
  writeDrafts(reviewSuggestions.map((review) => ({ ...review })));
  renderStats();
  renderSuggestions();
}

export { refreshReviews };
