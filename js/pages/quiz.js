/**
 * Car match quiz page: six-step wizard, live match preview and persisted
 * recommendations powered by the pure engine in ../quiz-engine.js.
 */
import { initCompare } from "../compare.js?v=20261102d";
import { getAllVehicles, saveQuizResult } from "../data-store.js?v=20261102d";
import { estimateMonthly, roundPayment } from "../finance.js?v=20261102d";
import {
  analyzeMatches,
  BODY_OPTIONS,
  bodyStyleCounts,
  CARGO_OPTIONS,
  defaultAnswers,
  DRIVETRAIN_OPTIONS,
  FUEL_OPTIONS,
  LIFESTYLE_OPTIONS,
  makeCounts,
  MUST_HAVES,
  normalizeAnswers,
  SEAT_OPTIONS,
  TRANSMISSION_OPTIONS,
} from "../quiz-engine.js?v=20261102d";
import { bindRange, mountShell, showToast } from "../ui.js?v=20261102d";
import {
  escapeHtml,
  formatCurrency,
  formatMileage,
  formatNumber,
  qs,
  qsa,
  resolveAsset,
  storageGet,
  storageSet,
} from "../utils.js?v=20261102d";
import {
  initVehicleCards,
  renderVehicleCard,
  shortEngine,
  shortTransmission,
  vehicleHref,
  vehicleTitle,
} from "../vehicles.js?v=20261102d";
import { waLink } from "../whatsapp.js?v=20261102d";

const ANSWERS_KEY = "as_quiz_answers_v1";
const COMPLETED_KEY = "as_quiz_completed_v1";

const STEPS = [
  {
    label: "Budget & Make",
    title: "Let’s start with your budget and favorite makes",
    description:
      "Tell us what you want to spend and which badges you like. Our precision engine keeps every recommendation inside your comfort zone.",
  },
  {
    label: "Passengers",
    title: "How many people ride with you?",
    description:
      "Choose your regular passenger count and what you usually carry. We’ll weight seating and cargo space accordingly.",
  },
  {
    label: "Lifestyle",
    title: "Select your primary lifestyle & driving purpose",
    description:
      "Our precision recommendation engine tailors verified Dallas–Fort Worth inventory to your commute, cargo and passenger preferences.",
  },
  {
    label: "Powertrain & Fuel",
    title: "Choose how you want to be powered",
    description:
      "Fuel type and drivetrain change everything from running costs to winter grip. Pick a favorite — or keep every option open.",
  },
  {
    label: "Body Style",
    title: "What shape should your next car take?",
    description:
      "SUVs and crossovers carry more; sedans sip fuel. Choose up to two body styles, or leave it open and let the engine decide.",
  },
  {
    label: "Must-haves",
    title: "What can’t you live without?",
    description:
      "Tick the features that matter most. We’ll boost cars that include them — and still surface strong alternatives.",
  },
];

const FUEL_COPY = {
  any: "Keep every option open",
  Gasoline: "Easy fill-ups anywhere",
  Hybrid: "Efficiency without charging",
  Electric: "Zero tailpipe emissions",
  PlugInHybrid: "Electric commutes, gas range",
  Diesel: "Torque and highway range",
};

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

const state = {
  vehicles: [],
  answers: normalizeAnswers(storageGet(ANSWERS_KEY, null) || defaultAnswers()),
  step: 0,
  view: "quiz",
  loading: true,
  analysis: null,
  lastPreviewKey: "",
  lastCount: null,
};

const el = {};

function cacheElements() {
  el.wizard = qs("#quizWizard");
  el.results = qs("#quizResults");
  el.stepHost = qs("#quizStep");
  el.title = qs("#quizTitle");
  el.description = qs("#quizDescription");
  el.progressFill = qs("[data-progress-fill]");
  el.progressBar = qs("#quizProgress");
  el.progressPct = qs("[data-progress-pct]");
  el.progressComplete = qs("[data-progress-complete]");
  el.stepLabel = qs("[data-step-label]");
  el.next = qs("#quizNext");
  el.nextLabel = qs("[data-next-label]");
  el.back = qs("#quizBack");
  el.skip = qs("#quizSkip");
  el.topPanel = qs("#topMatchPanel");
  el.criteriaList = qs("#criteriaList");
  el.liveStatus = qs("#quizLiveStatus");
}

/* ------------------------------------------------------------------ */
/* Persistence                                                        */
/* ------------------------------------------------------------------ */

function saveAnswers() {
  state.answers = normalizeAnswers(state.answers);
  storageSet(ANSWERS_KEY, state.answers);
}

function rememberCompletion(analysis) {
  const best = analysis.best;
  storageSet(COMPLETED_KEY, {
    completedAt: new Date().toISOString(),
    count: analysis.count,
    topVehicleId: best?.vehicle?.id || null,
    topScore: best?.score || 0,
  });
  saveQuizResult({
    answers: state.answers,
    results: analysis.matches.map((match) => ({
      id: match.id,
      score: match.score,
      reason: match.reason,
    })),
  }).catch((error) => console.warn("[AutoSelect] quiz result not saved", error));
}

/* ------------------------------------------------------------------ */
/* Progress / navigation                                              */
/* ------------------------------------------------------------------ */

function renderProgress() {
  const meta = STEPS[state.step];
  const pct = Math.round(((state.step + 1) / STEPS.length) * 100);
  el.stepLabel.textContent = `Step ${state.step + 1} of ${STEPS.length}`;
  el.progressFill.style.width = `${pct}%`;
  el.progressBar.setAttribute("aria-valuenow", String(pct));
  el.progressPct.textContent = `${pct}% Done`;
  el.progressComplete.textContent =
    state.step === 0
      ? `${meta.label} in progress`
      : `${STEPS[state.step - 1].label} complete`;
  el.back.disabled = state.step === 0;
  el.back.setAttribute("aria-disabled", String(state.step === 0));
  el.nextLabel.textContent =
    state.step === STEPS.length - 1 ? "See My Matches" : `Next: ${STEPS[state.step + 1].label}`;
  el.next.disabled = state.loading || state.vehicles.length === 0;
}

function goToStep(index, { scroll = true } = {}) {
  state.step = Math.min(STEPS.length - 1, Math.max(0, index));
  const meta = STEPS[state.step];
  el.title.textContent = meta.title;
  el.description.textContent = meta.description;
  renderProgress();
  renderStep();
  if (scroll) {
    window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    requestAnimationFrame(() => el.title.focus({ preventScroll: true }));
  }
}

/* ------------------------------------------------------------------ */
/* Step rendering                                                     */
/* ------------------------------------------------------------------ */

function optionCheck(selected) {
  return `<span class="material-symbols-outlined choice-card__check" aria-hidden="true">${
    selected ? "check_circle" : "radio_button_unchecked"
  }</span>`;
}

function budgetEstimate(value) {
  const low = roundPayment(estimateMonthly(Math.round(value * 0.82)));
  const high = roundPayment(estimateMonthly(value));
  return `${formatCurrency(low)} – ${formatCurrency(high)}/mo`;
}

function makeOptions() {
  const counts = makeCounts(state.vehicles);
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
}

function renderBudgetStep() {
  const answers = state.answers;
  const counts = makeCounts(state.vehicles);
  const makes = makeOptions();
  return `
    <div class="quiz-panel">
      <div class="quiz-block">
        <div class="quiz-budget">
          <div class="quiz-budget__row">
            <div class="quiz-budget__label"><span>Maximum budget</span><strong>Purchase price</strong></div>
            <output class="quiz-budget__value" id="quizBudgetValue" for="quizBudget">${escapeHtml(formatCurrency(answers.budgetMax))}</output>
          </div>
          <input class="range" id="quizBudget" type="range" min="15000" max="80000" step="1000"
            value="${answers.budgetMax}" aria-label="Maximum vehicle budget" aria-describedby="quizBudgetHelp">
          <div class="range-meta">
            <span>$15,000</span>
            <span class="sweet">Sweet spot: $35k</span>
            <span>$80,000</span>
          </div>
          <div class="quiz-estimate" id="quizBudgetHelp">
            <span><span class="material-symbols-outlined" aria-hidden="true">account_balance</span>Est. monthly · 72 mo</span>
            <strong id="quizMonthly">${escapeHtml(budgetEstimate(answers.budgetMax))}</strong>
          </div>
        </div>
      </div>

      <div class="quiz-block quiz-block--divided">
        <div class="quiz-block__head">
          <div>
            <h2>Favorite makes</h2>
            <p>Choose up to three badges — or leave it open for every brand.</p>
          </div>
          <span class="quiz-block__note">Optional</span>
        </div>
        <div class="quiz-chips" role="group" aria-label="Favorite makes">
          <button type="button" class="quiz-chip quiz-chip--ghost" data-clear="makes"
            aria-pressed="${answers.makes.length === 0}">
            <span class="material-symbols-outlined" aria-hidden="true">apps</span>All makes
          </button>
          ${makes
            .map(
              (make) => `<button type="button" class="quiz-chip" data-toggle="makes" data-value="${escapeHtml(make)}"
                aria-pressed="${answers.makes.includes(make)}">${escapeHtml(make)}
                <small>${formatNumber(counts[make] || 0)}</small></button>`
            )
            .join("")}
        </div>
      </div>

      <div class="quiz-block quiz-block--divided">
        <div class="quiz-block__head">
          <div>
            <h2>Comfort check</h2>
            <p>Fixed pricing means the sticker you see is the price you pay — before taxes and fees.</p>
          </div>
        </div>
        <div class="quiz-estimate">
          <span><span class="material-symbols-outlined" aria-hidden="true">verified_user</span>Every match is 150-point inspected and CARFAX verified.</span>
        </div>
      </div>
    </div>`;
}

function renderPassengerStep() {
  const answers = state.answers;
  const seatCards = SEAT_OPTIONS.map((seat) => {
    const selected = answers.seats === seat.id;
    return `<button type="button" class="seat-card" data-set="seats" data-value="${seat.id}"
      aria-pressed="${selected}" aria-label="${escapeHtml(seat.title)} — ${escapeHtml(seat.description)}">
      <span class="material-symbols-outlined seat-card__icon" aria-hidden="true">${seat.icon}</span>
      <strong>${escapeHtml(seat.label)}</strong>
      <span class="seat-card__desc">${escapeHtml(seat.description)}</span>
      <span class="material-symbols-outlined seat-card__check" aria-hidden="true">${selected ? "check_circle" : "radio_button_unchecked"}</span>
    </button>`;
  }).join("");

  const cargoPills = CARGO_OPTIONS.map(
    (cargo) => `<button type="button" class="quiz-pill" data-set="cargo" data-value="${cargo.id}"
      aria-pressed="${answers.cargo === cargo.id}">
      <span class="material-symbols-outlined" style="font-size:15px;vertical-align:-3px;margin-right:4px" aria-hidden="true">${cargo.icon}</span>${escapeHtml(
        cargo.label
      )}
    </button>`
  ).join("");

  return `
    <div class="quiz-panel">
      <div class="quiz-block">
        <div class="quiz-block__head">
          <div>
            <h2>Seats required</h2>
            <p>Count everyone who rides regularly, including car seats and the family dog’s spot.</p>
          </div>
          <span class="quiz-block__note">Required</span>
        </div>
        <div class="seat-grid" role="group" aria-label="Seats required">
          ${seatCards}
        </div>
      </div>

      <div class="quiz-block quiz-block--divided">
        <div class="quiz-block__head">
          <div>
            <h2>What do you usually carry?</h2>
            <p>Cargo needs help us choose between a sedan trunk and a three-row cargo hold.</p>
          </div>
        </div>
        <div class="quiz-pill-group" role="group" aria-label="Cargo priority">
          ${cargoPills}
        </div>
      </div>

      <div class="quiz-estimate">
        <span><span class="material-symbols-outlined" aria-hidden="true">lightbulb</span>Need room for six or more? We’ll surface three-row SUVs like the Kia Telluride.</span>
      </div>
    </div>`;
}

function renderLifestyleStep() {
  const answers = state.answers;
  const cards = LIFESTYLE_OPTIONS.map((item) => {
    const selected = answers.lifestyles.includes(item.id);
    return `<button type="button" class="choice-card" data-toggle="lifestyles" data-value="${item.id}" aria-pressed="${selected}">
      <span class="choice-card__icon"><span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span></span>
      <span class="choice-card__body">
        <span class="choice-card__title">${escapeHtml(item.label)}</span>
        <span class="choice-card__desc">${escapeHtml(item.description)}</span>
        <span class="choice-card__tags">${item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</span>
      </span>
      ${optionCheck(selected)}
    </button>`;
  }).join("");

  return `
    <div class="quiz-panel">
      <div class="quiz-block">
        <div class="quiz-block__head">
          <div>
            <h2>Select all that apply</h2>
            <p>How you use the car matters more than any single spec. Pick up to two.</p>
          </div>
          <span class="quiz-block__note">${answers.lifestyles.length}/2 chosen</span>
        </div>
        <div class="choice-grid" role="group" aria-label="Lifestyle and driving purpose">
          ${cards}
        </div>
      </div>
      <div class="quiz-estimate">
        <span><span class="material-symbols-outlined" aria-hidden="true">insights</span>Lifestyle answers re-weight the match score in real time.</span>
      </div>
    </div>`;
}

function renderPowertrainStep() {
  const answers = state.answers;
  const fuelCards = FUEL_OPTIONS.map((fuel) => {
    const selected = answers.fuel === fuel.id;
    return `<button type="button" class="choice-card choice-card--tile" data-set="fuel" data-value="${fuel.id}" aria-pressed="${selected}">
      <span class="choice-card__icon"><span class="material-symbols-outlined" aria-hidden="true">${fuel.icon}</span></span>
      <span class="choice-card__body">
        <span class="choice-card__title">${escapeHtml(fuel.label)}</span>
        <span class="choice-card__desc">${escapeHtml(FUEL_COPY[fuel.id] || "")}</span>
      </span>
      ${optionCheck(selected)}
    </button>`;
  }).join("");

  const drivetrain = DRIVETRAIN_OPTIONS.map(
    (drive) => `<button type="button" class="quiz-pill" data-set="drivetrain" data-value="${drive}"
      aria-pressed="${answers.drivetrain === drive}">${drive === "any" ? "No preference" : escapeHtml(drive)}</button>`
  ).join("");

  const transmission = TRANSMISSION_OPTIONS.map(
    (item) => `<button type="button" class="quiz-pill" data-set="transmission" data-value="${item}"
      aria-pressed="${answers.transmission === item}">${item === "any" ? "No preference" : escapeHtml(item)}</button>`
  ).join("");

  return `
    <div class="quiz-panel">
      <div class="quiz-block">
        <div class="quiz-block__head">
          <div>
            <h2>Fuel &amp; powertrain</h2>
            <p>We’ll prioritize your pick but still show efficient alternatives.</p>
          </div>
          <span class="quiz-block__note">Optional</span>
        </div>
        <div class="choice-grid choice-grid--tiles" role="group" aria-label="Fuel preference">
          ${fuelCards}
        </div>
      </div>

      <div class="quiz-block quiz-block--divided">
        <div class="quiz-control-row">
          <div class="quiz-control">
            <span>Drivetrain</span>
            <div class="quiz-pill-group" role="group" aria-label="Drivetrain preference">${drivetrain}</div>
          </div>
          <div class="quiz-control">
            <span>Transmission</span>
            <div class="quiz-pill-group" role="group" aria-label="Transmission preference">${transmission}</div>
          </div>
        </div>
      </div>

      <div class="quiz-estimate">
        <span><span class="material-symbols-outlined" aria-hidden="true">bolt</span>Hybrids and EVs in our Dallas stock include a complimentary charging or efficiency consult.</span>
      </div>
    </div>`;
}

function renderBodyStep() {
  const answers = state.answers;
  const counts = bodyStyleCounts(state.vehicles);
  const options = BODY_OPTIONS.filter((body) => (counts[body.id] || 0) > 0);
  const cards = options
    .map((body) => {
      const selected = answers.bodyStyles.includes(body.id);
      return `<button type="button" class="choice-card choice-card--tile" data-toggle="bodyStyles" data-value="${body.id}" aria-pressed="${selected}">
        <span class="choice-card__icon"><span class="material-symbols-outlined" aria-hidden="true">${body.icon}</span></span>
        <span class="choice-card__body">
          <span class="choice-card__title">${escapeHtml(body.label)}</span>
          <span class="choice-card__desc">${escapeHtml(body.description)}</span>
          <span class="choice-card__count"><span class="material-symbols-outlined" aria-hidden="true">inventory_2</span>${formatNumber(
            counts[body.id] || 0
          )} available</span>
        </span>
        ${optionCheck(selected)}
      </button>`;
    })
    .join("");

  return `
    <div class="quiz-panel">
      <div class="quiz-block">
        <div class="quiz-block__head">
          <div>
            <h2>Body styles you’d consider</h2>
            <p>Pick up to two. Leave everything unselected to see every shape.</p>
          </div>
          <span class="quiz-block__note">${answers.bodyStyles.length}/2 chosen</span>
        </div>
        <div class="choice-grid choice-grid--bodies" role="group" aria-label="Body styles">
          ${cards}
        </div>
        <div class="quiz-chips">
          <button type="button" class="quiz-chip quiz-chip--ghost" data-clear="bodyStyles"
            aria-pressed="${answers.bodyStyles.length === 0}">
            <span class="material-symbols-outlined" aria-hidden="true">grid_view</span>Any body style
          </button>
        </div>
      </div>
      <div class="quiz-estimate">
        <span><span class="material-symbols-outlined" aria-hidden="true">directions_car</span>Counts update from live AutoSelect Dallas inventory.</span>
      </div>
    </div>`;
}

function renderMustHaveStep() {
  const answers = state.answers;
  const cards = MUST_HAVES.map((item) => {
    const selected = answers.mustHaves.includes(item.id);
    return `<button type="button" class="must-card" data-toggle="mustHaves" data-value="${item.id}" aria-pressed="${selected}">
      <span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>
      <span>${escapeHtml(item.label)}</span>
      <span class="material-symbols-outlined must-card__check" aria-hidden="true">${selected ? "check_circle" : "add_circle"}</span>
    </button>`;
  }).join("");

  return `
    <div class="quiz-panel">
      <div class="quiz-block">
        <div class="quiz-block__head">
          <div>
            <h2>Choose as many as you need</h2>
            <p>Must-haves boost the score. If nothing hits every box, we’ll still show the closest certified fits.</p>
          </div>
          <span class="quiz-block__note">${answers.mustHaves.length} chosen</span>
        </div>
        <div class="must-grid" role="group" aria-label="Must-have features">
          ${cards}
        </div>
      </div>
      <div class="quiz-estimate">
        <span><span class="material-symbols-outlined" aria-hidden="true">verified</span>Every recommendation includes a 150-point inspection, clean CARFAX and 7-day return window.</span>
      </div>
    </div>`;
}

const STEP_RENDERERS = [
  renderBudgetStep,
  renderPassengerStep,
  renderLifestyleStep,
  renderPowertrainStep,
  renderBodyStep,
  renderMustHaveStep,
];

function renderStep() {
  el.stepHost.innerHTML = STEP_RENDERERS[state.step]();
  el.stepHost.classList.remove("is-entering");
  void el.stepHost.offsetWidth;
  el.stepHost.classList.add("is-entering");

  if (state.step === 0) {
    const input = qs("#quizBudget");
    bindRange(input, (value) => {
      state.answers.budgetMax = value;
      const valueEl = qs("#quizBudgetValue");
      const monthlyEl = qs("#quizMonthly");
      if (valueEl) valueEl.textContent = formatCurrency(value);
      if (monthlyEl) monthlyEl.textContent = budgetEstimate(value);
      saveAnswers();
      updatePreview();
    });
  }
}

/* ------------------------------------------------------------------ */
/* Answer interactions                                                */
/* ------------------------------------------------------------------ */

function syncButtonCheck(button) {
  const selected = button.getAttribute("aria-pressed") === "true";
  const check = button.querySelector(".choice-card__check, .seat-card__check, .must-card__check");
  if (check) check.textContent = selected ? "check_circle" : button.classList.contains("must-card") ? "add_circle" : "radio_button_unchecked";
}

function refreshClearChips(key) {
  qsa(`[data-clear="${key}"]`, el.stepHost).forEach((chip) => {
    chip.setAttribute("aria-pressed", String(state.answers[key].length === 0));
  });
}

function afterAnswerChange() {
  saveAnswers();
  updatePreview();
}

function handleStepClick(event) {
  if (event.target.closest("[data-retry]")) {
    loadInventory();
    return;
  }
  const button = event.target.closest("button[data-set], button[data-toggle], button[data-clear]");
  if (!button) return;

  const { set, toggle, clear } = button.dataset;

  if (set) {
    state.answers[set] = button.dataset.value;
    qsa(`[data-set="${set}"]`, el.stepHost).forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.value === button.dataset.value));
      syncButtonCheck(item);
    });
    afterAnswerChange();
    return;
  }

  if (clear) {
    state.answers[clear] = [];
    qsa(`[data-toggle="${clear}"]`, el.stepHost).forEach((item) => {
      item.setAttribute("aria-pressed", "false");
      syncButtonCheck(item);
    });
    refreshClearChips(clear);
    afterAnswerChange();
    return;
  }

  if (toggle) {
    const values = state.answers[toggle];
    const index = values.indexOf(button.dataset.value);
    if (index >= 0) {
      values.splice(index, 1);
      button.setAttribute("aria-pressed", "false");
    } else {
      const limit = toggle === "makes" ? 3 : toggle === "mustHaves" ? 12 : 2;
      if (values.length >= limit) {
        const message =
          toggle === "makes"
            ? "Choose up to three makes — deselect one first."
            : toggle === "lifestyles"
              ? "Pick up to two lifestyles — deselect one to change."
              : "Pick up to two body styles — deselect one to change.";
        showToast(message, "info");
        return;
      }
      values.push(button.dataset.value);
      button.setAttribute("aria-pressed", "true");
    }
    syncButtonCheck(button);
    refreshClearChips(toggle);
    afterAnswerChange();
  }
}

/* ------------------------------------------------------------------ */
/* Live preview                                                       */
/* ------------------------------------------------------------------ */

function setLiveCount(count) {
  const changed = state.lastCount !== count;
  state.lastCount = count;
  qsa("[data-match-count]").forEach((node) => {
    node.textContent = formatNumber(count);
    if (changed) {
      const banner = node.closest(".quiz-live");
      if (banner) {
        banner.classList.remove("is-bumping");
        void banner.offsetWidth;
        banner.classList.add("is-bumping");
        window.setTimeout(() => banner.classList.remove("is-bumping"), 340);
      }
    }
  });
  if (el.liveStatus) {
    window.clearTimeout(setLiveCount.timer);
    setLiveCount.timer = window.setTimeout(() => {
      const best = state.analysis?.best;
      el.liveStatus.textContent = best
        ? `${count} exact ${count === 1 ? "match" : "matches"} found. Current top match: ${vehicleTitle(
            best.vehicle
          )} at ${best.score} percent.`
        : `${count} exact ${count === 1 ? "match" : "matches"} found.`;
    }, 550);
  }
}

function renderTopMatchPreview(best) {
  if (!el.topPanel) return;
  if (!best) {
    el.topPanel.innerHTML = `<div class="quiz-topmatch__head">
        <span class="material-symbols-outlined" aria-hidden="true">insights</span>
        <h2>Current Top Match</h2>
      </div>
      <p class="quiz-topmatch__empty">We need a little more inventory to surface a match. Browse certified stock in the meantime.</p>`;
    return;
  }
  const vehicle = best.vehicle;
  const href = vehicleHref(vehicle.id);
  el.topPanel.innerHTML = `<div class="quiz-topmatch__head">
      <span class="material-symbols-outlined" aria-hidden="true">insights</span>
      <h2>Current Top Match</h2>
      <span class="badge badge--verified">${best.score}% match</span>
    </div>
    <div class="quiz-topmatch__vehicle">
      <a href="${escapeHtml(href)}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(
        resolveAsset(vehicle.images?.[0])
      )}" alt="${escapeHtml(vehicleTitle(vehicle))}" loading="lazy" decoding="async"></a>
      <div class="quiz-topmatch__copy">
        <span class="eyebrow">Recommended</span>
        <a href="${escapeHtml(href)}"><h3>${escapeHtml(vehicleTitle(vehicle))}</h3></a>
        <p>${escapeHtml([vehicle.trim, vehicle.bodyStyle, vehicle.fuelType].filter(Boolean).join(" • "))}</p>
        <strong>${escapeHtml(formatCurrency(vehicle.price))}</strong>
      </div>
    </div>
    <div class="quiz-topmatch__reason">
      <span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
      <span>${escapeHtml(best.highlights?.[0] || best.reason || "A strong fit for your answers")}</span>
    </div>
    <div class="quiz-topmatch__foot">
      <span>Est. ${escapeHtml(formatCurrency(roundPayment(estimateMonthly(vehicle.price))))}/mo</span>
      <a href="${escapeHtml(href)}">View details <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>
    </div>`;
}

const seatLabel = (value) => {
  if (value === "6+") return "6+ seats";
  if (value === "1-2") return "1–2 seats";
  return "3–5 seats";
};

const cargoLabel = (value) => CARGO_OPTIONS.find((item) => item.id === value)?.label || "Everyday cargo";

const fuelLabel = (value) => FUEL_OPTIONS.find((item) => item.id === value)?.label || "Any fuel";

const lifestyleLabels = (ids) =>
  ids.map((id) => LIFESTYLE_OPTIONS.find((item) => item.id === id)?.label).filter(Boolean);

const bodyLabels = (ids) => ids.map((id) => BODY_OPTIONS.find((item) => item.id === id)?.label).filter(Boolean);

function criteriaRows() {
  const a = state.answers;
  const lifestyle = lifestyleLabels(a.lifestyles);
  const bodies = bodyLabels(a.bodyStyles);
  const power = [a.fuel !== "any" ? fuelLabel(a.fuel) : null, a.drivetrain !== "any" ? a.drivetrain : null, a.transmission !== "any" ? a.transmission : null].filter(
    Boolean
  );
  return [
    { step: 0, label: "Budget", value: `Up to ${formatCurrency(a.budgetMax)}${a.makes.length ? ` · ${a.makes.join(", ")}` : ""}` },
    { step: 1, label: "Seats", value: `${seatLabel(a.seats)} · ${cargoLabel(a.cargo)}` },
    { step: 2, label: "Lifestyle", value: lifestyle.length ? lifestyle.join(" + ") : "Any lifestyle" },
    { step: 3, label: "Power", value: power.length ? power.join(" · ") : "Any fuel · any drive" },
    { step: 4, label: "Body", value: bodies.length ? bodies.join(" + ") : "Any style" },
    { step: 5, label: "Must-haves", value: a.mustHaves.length ? `${a.mustHaves.length} selected` : "No requirements" },
  ];
}

function renderCriteria() {
  if (!el.criteriaList) return;
  el.criteriaList.innerHTML = criteriaRows()
    .map(
      (row) => `<button type="button" class="criteria-row" data-jump-step="${row.step}">
        <span class="criteria-row__label">${escapeHtml(row.label)}</span>
        <span class="criteria-row__value">${escapeHtml(row.value)}</span>
        <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
      </button>`
    )
    .join("");
}

function updatePreview() {
  if (!state.vehicles.length) return;
  const analysis = analyzeMatches(state.vehicles, state.answers, { limit: 6 });
  state.analysis = analysis;
  setLiveCount(analysis.count);
  renderCriteria();
  const key = analysis.best ? `${analysis.best.id}:${analysis.best.score}` : "none";
  if (key !== state.lastPreviewKey) {
    state.lastPreviewKey = key;
    renderTopMatchPreview(analysis.best);
  }
}

/* ------------------------------------------------------------------ */
/* Results                                                            */
/* ------------------------------------------------------------------ */

function resultChips() {
  const a = state.answers;
  const chips = [{ icon: "payments", text: `≤ ${formatCurrency(a.budgetMax)}` }, { icon: "group", text: seatLabel(a.seats) }];
  const lifestyle = lifestyleLabels(a.lifestyles);
  if (lifestyle.length) chips.push({ icon: "tune", text: lifestyle.join(" + ") });
  const power = [a.fuel !== "any" ? fuelLabel(a.fuel) : null, a.drivetrain !== "any" ? a.drivetrain : null].filter(Boolean);
  if (power.length) chips.push({ icon: "bolt", text: power.join(" · ") });
  const bodies = bodyLabels(a.bodyStyles);
  if (bodies.length) chips.push({ icon: "directions_car", text: bodies.join(" + ") });
  if (a.makes.length) chips.push({ icon: "sell", text: a.makes.join(", ") });
  if (a.mustHaves.length) chips.push({ icon: "checklist", text: `${a.mustHaves.length} must-haves` });
  return chips;
}

function renderTopMatchCard(match) {
  const vehicle = match.vehicle;
  const href = vehicleHref(vehicle.id);
  const msrp = Number(vehicle.msrp) || 0;
  const showMsrp = msrp > Number(vehicle.price) + 500;
  return `<article class="top-match">
    <div class="top-match__media">
      <img src="${escapeHtml(resolveAsset(vehicle.images?.[0]))}" alt="${escapeHtml(vehicleTitle(vehicle))}" loading="eager" decoding="async">
      <div class="top-match__flags">
        <span class="badge badge--accent"><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>Top pick</span>
        <span class="match-ring" style="--score:${match.score}" role="img" aria-label="${match.score} percent match">
          <span><strong>${match.score}%</strong><small>match</small></span>
        </span>
      </div>
      <span class="top-match__stock"><span class="material-symbols-outlined" aria-hidden="true">verified</span>Stock ${escapeHtml(
        vehicle.stockNumber || vehicle.id
      )}</span>
    </div>
    <div class="top-match__body">
      <span class="top-match__eyebrow"><span class="material-symbols-outlined" aria-hidden="true">insights</span>Best match for you</span>
      <h2><a href="${escapeHtml(href)}">${escapeHtml(vehicleTitle(vehicle))}</a></h2>
      <p class="top-match__sub">${escapeHtml([vehicle.trim, vehicle.bodyStyle, fuelLabel(vehicle.fuelType)].filter(Boolean).join(" • "))}</p>
      <div class="top-match__price">
        <strong>${escapeHtml(formatCurrency(vehicle.price))}</strong>
        <span>Est. ${escapeHtml(formatCurrency(roundPayment(estimateMonthly(vehicle.price))))}/mo</span>
        ${showMsrp ? `<del>${escapeHtml(formatCurrency(msrp))}</del>` : ""}
      </div>
      <div class="top-match__specs">
        <span class="chip">${escapeHtml(formatMileage(vehicle.mileage))}</span>
        <span class="chip">${escapeHtml(shortEngine(vehicle.engine))}</span>
        <span class="chip">${escapeHtml(shortTransmission(vehicle.transmission))}</span>
        <span class="chip">${escapeHtml(String(vehicle.seats || 5))} seats</span>
      </div>
      <div class="top-match__points">
        ${(match.highlights?.length ? match.highlights : [match.reason])
          .slice(0, 3)
          .map(
            (point) =>
              `<span class="top-match__point"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>${escapeHtml(
                point
              )}</span>`
          )
          .join("")}
      </div>
      <div class="top-match__actions">
        <a class="btn btn--primary" href="${escapeHtml(href)}">View this vehicle <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>
        <a class="btn btn--wa" href="${escapeHtml(
          waLink(
            `Hi AutoSelect! The match quiz picked the ${vehicleTitle(vehicle)} for me (${match.score}% match). Is it still available?`
          )
        )}" target="_blank" rel="noopener noreferrer"><span class="material-symbols-outlined" aria-hidden="true">chat</span>WhatsApp</a>
      </div>
    </div>
  </article>`;
}

function renderResults(analysis) {
  const { matches, count, totalPool } = analysis;
  const best = matches[0];

  qs("#resultCriteria").innerHTML = [
    ...resultChips().map(
      (chip) =>
        `<span class="result-chip"><span class="material-symbols-outlined" aria-hidden="true">${chip.icon}</span>${escapeHtml(
          chip.text
        )}</span>`
    ),
    `<span class="result-chip result-chip--match"><span class="material-symbols-outlined" aria-hidden="true">verified</span>${
      count === 1 ? "1 exact match" : `${formatNumber(count)} exact matches`
    }</span>`,
  ].join("");

  qs("[data-result-count]").textContent =
    count > 0
      ? `${formatNumber(count)} exact ${count === 1 ? "match" : "matches"} in live inventory · ${formatNumber(
          totalPool
        )} certified vehicles scored`
      : `No exact matches — showing the closest fits from ${formatNumber(totalPool)} certified vehicles`;

  const intro = qs("#resultsIntro");
  if (intro) {
    intro.textContent = best
      ? `We scored every certified vehicle against your answers. Here are the six closest fits from live Dallas inventory, led by the ${vehicleTitle(
          best.vehicle
        )}.`
      : "We scored every certified vehicle against your answers. Browse the inventory to keep exploring certified stock.";
  }

  const topWrap = qs("#topMatchWrap");
  const grid = qs("#resultsGrid");
  const subhead = qs(".results-subhead");

  if (!best) {
    topWrap.innerHTML = `<div class="state">
        <div class="state__icon"><span class="material-symbols-outlined">garage</span></div>
        <h2>No matches to score yet</h2>
        <p>Our Dallas team is adding certified stock. Browse the current inventory while we refresh.</p>
        <div class="state__actions"><a class="btn btn--primary" href="inventory.html">Browse inventory</a></div>
      </div>`;
    grid.innerHTML = "";
    if (subhead) subhead.hidden = true;
  } else {
    topWrap.innerHTML = renderTopMatchCard(best);
    const rest = matches.slice(1);
    grid.innerHTML = rest
      .map((match) =>
        renderVehicleCard(match.vehicle, {
          match: match.score,
          reason: match.reason,
        })
      )
      .join("");
    if (subhead) subhead.hidden = rest.length === 0;
  }

  const whatsapp = qs("#quizWhatsapp");
  if (whatsapp) {
    const message = best
      ? `Hi AutoSelect! I completed the match quiz. My top match is the ${vehicleTitle(best.vehicle)} (${best.score}% match). Could you share availability and next steps?`
      : "Hi AutoSelect! I completed the match quiz and would like help choosing a certified vehicle.";
    whatsapp.href = waLink(message);
  }

  initVehicleCards();
  initCompare();
}

function finishQuiz() {
  if (state.loading) return;
  if (!state.vehicles.length) {
    showToast("Inventory is still loading. Please try again.", "error");
    return;
  }
  const analysis = analyzeMatches(state.vehicles, state.answers, { limit: 6 });
  state.analysis = analysis;
  state.view = "results";
  renderResults(analysis);
  rememberCompletion(analysis);

  el.wizard.hidden = true;
  el.results.hidden = false;
  el.results.querySelector("#resultsTitle")?.setAttribute("tabindex", "-1");
  window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  requestAnimationFrame(() => qs("#resultsTitle")?.focus({ preventScroll: true }));
}

function showWizard({ reset = false } = {}) {
  if (reset) {
    state.answers = defaultAnswers();
    storageSet(ANSWERS_KEY, state.answers);
    state.step = 0;
  }
  state.view = "quiz";
  state.lastPreviewKey = "";
  el.results.hidden = true;
  el.wizard.hidden = false;
  goToStep(reset ? 0 : state.step);
  updatePreview();
}

/* ------------------------------------------------------------------ */
/* Inventory load / error                                             */
/* ------------------------------------------------------------------ */

function renderInventoryError() {
  el.stepHost.innerHTML = `<div class="quiz-panel"><div class="state">
      <div class="state__icon"><span class="material-symbols-outlined">cloud_off</span></div>
      <h2>Inventory is taking a moment</h2>
      <p>We couldn’t load live certified stock. Check your connection and try again — or browse the inventory directly.</p>
      <div class="state__actions">
        <button type="button" class="btn btn--primary" data-retry>Try again</button>
        <a class="btn btn--ghost" href="inventory.html">Browse inventory</a>
      </div>
    </div></div>`;
  setLiveCount(0);
  qsa("[data-match-count]").forEach((node) => {
    node.textContent = "—";
  });
  if (el.topPanel) {
    el.topPanel.innerHTML = `<div class="quiz-topmatch__head">
        <span class="material-symbols-outlined" aria-hidden="true">insights</span>
        <h2>Current Top Match</h2>
      </div>
      <p class="quiz-topmatch__empty">Top match will appear as soon as inventory loads.</p>`;
  }
  el.next.disabled = true;
  el.skip.disabled = true;
}

async function loadInventory() {
  state.loading = true;
  el.next.disabled = true;
  el.skip.disabled = false;
  try {
    state.vehicles = await getAllVehicles();
  } catch (error) {
    console.error("[AutoSelect] quiz inventory load failed", error);
    state.vehicles = [];
  }
  state.loading = false;

  if (!state.vehicles.length) {
    renderInventoryError();
    return;
  }

  el.skip.disabled = false;
  renderProgress();
  renderStep();
  updatePreview();
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

async function boot() {
  cacheElements();
  await mountShell({ active: "quiz" });
  initVehicleCards();
  initCompare();

  el.stepHost.addEventListener("click", handleStepClick);
  qs("#criteriaPanel")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-jump-step]");
    if (!row || state.view !== "quiz") return;
    goToStep(Number(row.dataset.jumpStep));
  });

  el.next.addEventListener("click", () => {
    if (state.loading) return;
    if (state.step === STEPS.length - 1) {
      finishQuiz();
      return;
    }
    goToStep(state.step + 1);
  });

  el.back.addEventListener("click", () => {
    if (state.step === 0) return;
    goToStep(state.step - 1);
  });

  el.skip.addEventListener("click", () => {
    if (state.loading) {
      showToast("Inventory is still loading. One moment.", "info");
      return;
    }
    finishQuiz();
  });

  qs("#quizAdjust")?.addEventListener("click", () => {
    state.step = 0;
    showWizard();
  });
  qs("#quizRetake")?.addEventListener("click", () => {
    showWizard({ reset: true });
    showToast("Quiz reset. Your fresh answers are ready to go.", "info");
  });

  renderProgress();
  await loadInventory();
}

boot().catch((error) => {
  console.error("[AutoSelect] quiz failed to start", error);
  showToast("The quiz couldn’t start. Please refresh the page.", "error");
});
