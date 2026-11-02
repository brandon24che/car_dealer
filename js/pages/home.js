/**
 * Home marketplace: live inventory counts, search handoff, featured stock and
 * verified reviews.
 */
import { initCompare } from "../compare.js?v=20261102c";
import { getBodyStyleCounts, getFacets, getFeaturedVehicles, getReviews, queryVehicles } from "../data-store.js?v=20261102c";
import { homeSearchUrl } from "../router-params.js?v=20261102c";
import { bindRange, mountShell, renderStars } from "../ui.js?v=20261102c";
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatNumber,
  initials,
  optionsHtml,
  qs,
  qsa,
} from "../utils.js?v=20261102c";
import { initVehicleCards, renderVehicleCards } from "../vehicles.js?v=20261102c";

const state = { body: "" };

function renderBodyTiles(counts) {
  const host = qs("#bodyTiles");
  if (!host) return;
  const tiles = [
    { label: "SUVs", count: counts.SUV || 0, href: "inventory.html?body=SUV", icon: "directions_car" },
    { label: "Sedans", count: counts.Sedan || 0, href: "inventory.html?body=Sedan", icon: "commute" },
    { label: "Trucks", count: counts.Truck || 0, href: "inventory.html?body=Truck", icon: "local_shipping" },
    { label: "EVs", count: counts.electric || 0, href: "inventory.html?fuel=Electric", icon: "bolt" },
  ];
  host.innerHTML = tiles
    .map(
      (tile) => `<a class="body-tile" href="${tile.href}">
        <span class="body-tile__icon"><span class="material-symbols-outlined" aria-hidden="true">${tile.icon}</span></span>
        <span class="body-tile__text"><strong>${escapeHtml(tile.label)}</strong><span>${formatNumber(tile.count)} listed</span></span>
        <span class="body-tile__arrow material-symbols-outlined" aria-hidden="true">arrow_forward</span>
      </a>`
    )
    .join("");
}

function renderFeatured(vehicles) {
  const host = qs("#featuredGrid");
  if (!host) return;
  host.setAttribute("aria-busy", "false");
  if (!vehicles.length) {
    host.innerHTML = `<div class="state" style="grid-column:1/-1">
      <div class="state__icon"><span class="material-symbols-outlined">garage</span></div>
      <h3>Fresh stock arriving shortly</h3>
      <p>Our next certified batch is in inspection. Browse the full inventory in the meantime.</p>
      <div class="state__actions"><a class="btn btn--primary" href="inventory.html">Browse inventory</a></div>
    </div>`;
    return;
  }
  host.innerHTML = renderVehicleCards(vehicles);
}

function renderReviews(reviews) {
  const host = qs("#reviewCards");
  if (!host) return;
  if (!reviews.length) {
    host.innerHTML = `<p class="muted small">Reviews are loading from our Dallas hub.</p>`;
    return;
  }
  const average = reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length;
  const score = qs("[data-review-score]");
  if (score) score.textContent = average.toFixed(1);
  const stars = qs("[data-review-stars]");
  if (stars) stars.innerHTML = renderStars(Math.round(average));

  host.innerHTML = reviews
    .slice(0, 4)
    .map(
      (review) => `<article class="review-card">
        <div class="review-card__head">
          <span class="review-card__avatar" aria-hidden="true">${escapeHtml(initials(review.name))}</span>
          <div>
            <p class="review-card__name">${escapeHtml(review.name)}</p>
            <p class="review-card__meta">${escapeHtml(review.city || "Dallas, TX")} • ${escapeHtml(formatDate(review.createdAt))}</p>
          </div>
          ${renderStars(Number(review.rating) || 5)}
        </div>
        <p class="review-card__text">“${escapeHtml(review.text)}”</p>
        <div class="review-card__foot">
          <span class="review-card__vehicle">${escapeHtml(review.vehicle || "Certified purchase")}</span>
          ${
            review.verified
              ? `<span class="badge badge--verified"><span class="material-symbols-outlined">verified</span>Verified</span>`
              : ""
          }
        </div>
      </article>`
    )
    .join("");
}

function fillYearOptions() {
  const select = qs("#homeYear");
  if (!select) return;
  const current = new Date().getFullYear();
  const years = [];
  for (let year = current + 1; year >= 2015; year -= 1) {
    years.push({ value: year, label: `${year} or newer` });
  }
  select.innerHTML = optionsHtml(years, "2020");
}

function fillMakeOptions(facets) {
  const makeSelect = qs("#homeMake");
  const modelSelect = qs("#homeModel");
  if (!makeSelect || !modelSelect) return;
  makeSelect.innerHTML = optionsHtml(
    facets.makes.map((entry) => ({ value: entry.make, label: `${entry.make} (${entry.count})` })),
    "",
    "Any Make"
  );

  const syncModels = () => {
    const entry = facets.makes.find((item) => item.make === makeSelect.value);
    if (!entry) {
      modelSelect.innerHTML = `<option value="">Any Model</option>`;
      modelSelect.disabled = true;
      return;
    }
    modelSelect.disabled = false;
    modelSelect.innerHTML = optionsHtml(
      entry.models.map((model) => ({ value: model.model, label: `${model.model} (${model.count})` })),
      "",
      "Any Model"
    );
  };
  makeSelect.addEventListener("change", syncModels);
  syncModels();
}

function bindSearch() {
  const form = qs("#heroSearch");
  const budget = qs("#homeBudget");
  const budgetLabel = qs("[data-budget-label]");
  bindRange(budget, (value) => {
    if (budgetLabel) budgetLabel.textContent = formatCurrency(value);
  });

  qsa(".search-tabs [data-body]").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.body = tab.dataset.body;
      qsa(".search-tabs [data-body]").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
    });
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = {
      body: state.body,
      make: qs("#homeMake")?.value || "",
      model: qs("#homeModel")?.value || "",
      priceMax: Number(budget?.value || 45000),
      yearMin: qs("#homeYear")?.value || "",
      transmission: qs("#homeTransmission")?.value || "",
    };
    window.location.href = homeSearchUrl(values);
  });
}

async function init() {
  await mountShell({ active: "home" });
  initVehicleCards();
  initCompare();
  fillYearOptions();
  bindSearch();

  const [counts, facets, featured, reviews] = await Promise.all([
    getBodyStyleCounts().catch(() => ({})),
    getFacets().catch(() => ({ makes: [] })),
    getFeaturedVehicles(4).catch(() => []),
    getReviews(4).catch(() => []),
  ]);

  renderBodyTiles(counts);
  fillMakeOptions(facets);
  renderFeatured(featured.length ? featured : (await queryVehicles({ limit: 4, sort: "featured" })).items);
  renderReviews(reviews);

  const total = Number(counts.total) || 0;
  const searchCount = qs("[data-search-count]");
  if (searchCount) searchCount.textContent = formatNumber(total);
  const liveLabel = qs("[data-live-label]");
  if (liveLabel) liveLabel.textContent = `Live in Dallas, TX · ${formatNumber(total)} available`;
}

init();
