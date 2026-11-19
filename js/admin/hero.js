/**
 * Homepage hero editor (super admin): copy, proof points and background photo
 * with a live preview. Content is stored in `settings/homepage`.
 */
import {
  DEFAULT_HERO,
  getSiteSettings,
  saveSiteSettings,
  uploadHeroImage,
} from "../data-store.js?v=20261112a";
import { showToast } from "../ui.js?v=20261112a";
import { qs, qsa } from "../utils.js?v=20261112a";
import { assetPath } from "./helpers.js?v=20261112a";

const HERO_POSITIONS = { left: "18% 50%", center: "50% 50%", right: "82% 50%" };

const state = {
  position: DEFAULT_HERO.imagePosition,
  dirty: false,
  saving: false,
  uploading: false,
  updatedAt: null,
};

const field = (name) => qs(`[data-hero-field="${name}"]`);

function readForm() {
  return {
    badge: field("badge")?.value.trim() || "",
    headline: field("headline")?.value.trim() || "",
    subheadline: field("subheadline")?.value.trim() || "",
    image: field("image")?.value.trim() || "",
    imagePosition: state.position,
    imageOpacity: Number(field("imageOpacity")?.value || 0) / 100,
    stats: qsa("[data-hero-stat-row]").map((row) => ({
      value: row.querySelector("[data-hero-stat-value]")?.value.trim() || "",
      label: row.querySelector("[data-hero-stat-label]")?.value.trim() || "",
    })),
  };
}

function previewUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return assetPath(raw, 800).replace(/[()"'\\]/g, "");
}

function fillForm(hero) {
  const target = hero || DEFAULT_HERO;
  if (field("badge")) field("badge").value = target.badge;
  if (field("headline")) field("headline").value = target.headline;
  if (field("subheadline")) field("subheadline").value = target.subheadline;
  if (field("image")) field("image").value = target.image;
  if (field("imageOpacity")) {
    field("imageOpacity").value = String(Math.round(Number(target.imageOpacity) * 100));
  }
  state.position = target.imagePosition || DEFAULT_HERO.imagePosition;
  syncPositionButtons();
  qsa("[data-hero-stat-row]").forEach((row, index) => {
    const stat = target.stats[index] || { value: "", label: "" };
    const value = row.querySelector("[data-hero-stat-value]");
    const label = row.querySelector("[data-hero-stat-label]");
    if (value) value.value = stat.value;
    if (label) label.value = stat.label;
  });
  renderCounts();
  renderPreview();
}

function renderCounts() {
  const limits = { badge: 80, headline: 160, subheadline: 400 };
  Object.entries(limits).forEach(([name, max]) => {
    const node = qs(`[data-hero-count="${name}"]`);
    if (node) node.textContent = `${field(name)?.value.length || 0} / ${max}`;
  });
}

function renderPreview() {
  const data = readForm();
  const badge = qs("[data-hero-preview-badge]");
  const headline = qs("[data-hero-preview-headline]");
  const subheadline = qs("[data-hero-preview-subheadline]");
  if (badge) badge.textContent = data.badge || DEFAULT_HERO.badge;
  if (headline) headline.textContent = data.headline || DEFAULT_HERO.headline;
  if (subheadline) subheadline.textContent = data.subheadline || DEFAULT_HERO.subheadline;

  const values = qsa("[data-hero-preview-stat-value]");
  const labels = qsa("[data-hero-preview-stat-label]");
  values.forEach((node, index) => {
    node.textContent = data.stats[index]?.value || DEFAULT_HERO.stats[index].value;
  });
  labels.forEach((node, index) => {
    node.textContent = data.stats[index]?.label || DEFAULT_HERO.stats[index].label;
  });

  const media = qs("[data-hero-preview-media]");
  if (media) {
    const image = previewUrl(data.image);
    media.style.backgroundImage = image ? `url("${image}")` : "none";
    media.style.backgroundPosition = HERO_POSITIONS[data.imagePosition] || HERO_POSITIONS.right;
    media.style.opacity = String(data.imageOpacity);
  }

  const thumb = qs("[data-hero-photo-thumb]");
  if (thumb) {
    const image = previewUrl(data.image);
    thumb.style.backgroundImage = image ? `url("${image}")` : "none";
    thumb.classList.toggle("is-empty", !image);
  }

  const opacity = qs("[data-hero-opacity]");
  if (opacity) opacity.textContent = `${Math.round(data.imageOpacity * 100)}%`;
}

function syncPositionButtons() {
  qsa("[data-hero-position]").forEach((button) => {
    const active = button.dataset.heroPosition === state.position;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setStatus(dirty) {
  state.dirty = dirty;
  const chip = qs("[data-hero-status]");
  const text = qs("[data-hero-status-text]");
  const icon = chip?.querySelector(".material-symbols-outlined");
  chip?.classList.toggle("is-dirty", dirty);
  if (text) text.textContent = dirty ? "Unsaved changes" : "Saved";
  if (icon) icon.textContent = dirty ? "edit" : "check_circle";
}

function renderMeta() {
  const meta = qs("[data-hero-meta]");
  if (!meta) return;
  const date = state.updatedAt?.toDate ? state.updatedAt.toDate() : state.updatedAt ? new Date(state.updatedAt) : null;
  if (!date || Number.isNaN(date.getTime())) {
    meta.textContent = "Changes appear on the homepage after saving.";
    return;
  }
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  meta.textContent = `Last saved ${formatted}.`;
}

function setSaveBusy(busy) {
  const button = qs("[data-hero-save]");
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-loading", busy);
  const text = qs("[data-hero-save-text]");
  if (text) text.textContent = busy ? "Saving…" : "Save hero";
}

function bind() {
  const form = qs("#heroForm");
  if (!form) return;

  form.addEventListener("input", () => {
    renderCounts();
    renderPreview();
    setStatus(true);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.saving || state.uploading) return;
    const data = readForm();
    if (!data.badge) {
      showToast("Add the hero badge text before saving.", "error");
      field("badge")?.focus();
      return;
    }
    if (!data.headline) {
      showToast("Add a headline before saving.", "error");
      field("headline")?.focus();
      return;
    }
    state.saving = true;
    setSaveBusy(true);
    try {
      const saved = await saveSiteSettings(data);
      state.updatedAt = saved.updatedAt;
      setStatus(false);
      renderMeta();
      showToast("Homepage hero updated.", "success");
    } catch (error) {
      console.error("[AutoSelect] hero save failed", error);
      showToast(error.message || "Could not save the hero section.", "error");
    } finally {
      state.saving = false;
      setSaveBusy(false);
    }
  });

  qsa("[data-hero-position]").forEach((button) => {
    button.addEventListener("click", () => {
      state.position = button.dataset.heroPosition;
      syncPositionButtons();
      renderPreview();
      setStatus(true);
    });
  });

  qs("[data-hero-upload]")?.addEventListener("click", () => qs("[data-hero-file]")?.click());

  qs("[data-hero-file]")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file || state.uploading) return;
    const button = qs("[data-hero-upload]");
    state.uploading = true;
    if (button) {
      button.disabled = true;
      button.classList.add("is-loading");
    }
    try {
      const url = await uploadHeroImage(file);
      if (field("image")) field("image").value = url;
      renderPreview();
      setStatus(true);
      showToast("Photo uploaded. Save the hero to publish it.", "success");
    } catch (error) {
      console.error("[AutoSelect] hero upload failed", error);
      showToast(error.message || "That photo could not be uploaded.", "error");
    } finally {
      state.uploading = false;
      if (button) {
        button.disabled = false;
        button.classList.remove("is-loading");
      }
      event.target.value = "";
    }
  });

  qs("[data-hero-default-image]")?.addEventListener("click", () => {
    if (field("image")) field("image").value = DEFAULT_HERO.image;
    renderPreview();
    setStatus(true);
    showToast("Site default photo selected. Save to publish.", "info");
  });

  qs("[data-hero-restore]")?.addEventListener("click", () => {
    fillForm(DEFAULT_HERO);
    setStatus(true);
    showToast("Default hero copy loaded. Save to publish.", "info");
  });
}

export async function initHeroEditor() {
  bind();
  try {
    const settings = await getSiteSettings();
    state.updatedAt = settings.updatedAt;
    fillForm(settings.hero);
    renderMeta();
    setStatus(false);
  } catch (error) {
    console.warn("[AutoSelect] hero settings unavailable", error);
    fillForm(DEFAULT_HERO);
    renderMeta();
    setStatus(false);
  }
}
