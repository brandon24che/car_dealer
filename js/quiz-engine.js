/**
 * AutoSelect recommendation engine.
 *
 * Pure JavaScript — no DOM, no network. The quiz page feeds it the inventory
 * snapshot and the visitor's answers; it returns weighted match scores, short
 * human-readable reasons and a count of exact inventory matches.
 */

export const LIFESTYLE_OPTIONS = Object.freeze([
  {
    id: "commute",
    label: "Daily Commuting",
    icon: "location_city",
    description: "Smooth city navigation, responsive stop-and-go handling and effortless parking.",
    tags: ["Efficient", "Easy parking", "Low upkeep"],
  },
  {
    id: "family",
    label: "Family Road Trips & Cargo",
    icon: "family_restroom",
    description: "Spacious seating, top safety ratings and a trunk that swallows the luggage.",
    tags: ["3-row ready", "Max safety", "Cargo space"],
  },
  {
    id: "luxury",
    label: "Personal Luxury & Style",
    icon: "diamond",
    description: "Executive cabins, premium audio and a rewarding drive when the road opens up.",
    tags: ["Nappa leather", "Premium audio", "Sport tuning"],
  },
  {
    id: "work",
    label: "Work & Heavy Hauling",
    icon: "handyman",
    description: "Payload capability, serious tow ratings and a bed that earns its keep.",
    tags: ["Tow rated", "4x4 rugged", "Job-site ready"],
  },
  {
    id: "outdoor",
    label: "Weekend Outdoor Adventures",
    icon: "terrain",
    description: "Trail-rated clearance, confident all-wheel drive and room for the gear.",
    tags: ["AWD grip", "Trail ready", "Roof rack"],
  },
  {
    id: "rideshare",
    label: "Ride-Hailing & Business",
    icon: "local_taxi",
    description: "Durable interiors, low cost per mile and the resale strength drivers need.",
    tags: ["UberXL eligible", "Low cost/mile", "High resale"],
  },
]);

export const FUEL_OPTIONS = Object.freeze([
  { id: "any", label: "No preference", icon: "eco", short: "Any fuel" },
  { id: "Gasoline", label: "Gasoline", icon: "local_gas_station", short: "Gasoline" },
  { id: "Hybrid", label: "Hybrid", icon: "energy_savings_leaf", short: "Hybrid" },
  { id: "Electric", label: "All-electric", icon: "bolt", short: "Electric" },
  { id: "PlugInHybrid", label: "Plug-in hybrid", icon: "ev_station", short: "Plug-in hybrid" },
  { id: "Diesel", label: "Diesel", icon: "local_shipping", short: "Diesel" },
]);

export const DRIVETRAIN_OPTIONS = Object.freeze(["any", "AWD", "FWD", "RWD", "4WD"]);
export const TRANSMISSION_OPTIONS = Object.freeze(["any", "Automatic", "Manual"]);

export const BODY_OPTIONS = Object.freeze([
  { id: "SUV", label: "SUV", icon: "directions_car", description: "Room for people and gear" },
  { id: "Crossover", label: "Crossover", icon: "electric_car", description: "City-friendly utility" },
  { id: "Sedan", label: "Sedan", icon: "commute", description: "Comfortable and efficient" },
  { id: "Truck", label: "Truck", icon: "local_shipping", description: "Payload and towing" },
  { id: "Coupe", label: "Coupe", icon: "sports_score", description: "Style-first performance" },
  { id: "Minivan", label: "Minivan", icon: "airport_shuttle", description: "Maximum family space" },
]);

export const SEAT_OPTIONS = Object.freeze([
  { id: "1-2", label: "1–2", title: "1–2 seats", description: "Just me or a plus-one", icon: "person" },
  { id: "3-5", label: "3–5", title: "3–5 seats", description: "A small crew", icon: "group" },
  { id: "6+", label: "6+", title: "6+ seats", description: "The whole family", icon: "groups" },
]);

export const CARGO_OPTIONS = Object.freeze([
  { id: "light", label: "Everyday errands", icon: "shopping_bag" },
  { id: "medium", label: "Road-trip luggage", icon: "luggage" },
  { id: "heavy", label: "Work gear & towing", icon: "construction" },
]);

export const MUST_HAVES = Object.freeze([
  { id: "thirdRow", label: "3rd-row seating", icon: "airline_seat_recline_extra" },
  { id: "awd", label: "AWD / 4WD", icon: "landscape" },
  { id: "inspected", label: "150-pt inspected", icon: "fact_check" },
  { id: "carfax", label: "Clean CARFAX", icon: "history_edu" },
  { id: "oneOwner", label: "1-owner history", icon: "person_check" },
  { id: "sunroof", label: "Sunroof / moonroof", icon: "wb_sunny" },
  { id: "camera360", label: "360° camera", icon: "videocam" },
  { id: "towing", label: "Towing package", icon: "rv_hookup" },
  { id: "leather", label: "Leather interior", icon: "chair" },
  { id: "lowMiles", label: "Under 40k miles", icon: "speed" },
  { id: "heatedSeats", label: "Heated seats", icon: "mode_heat" },
  { id: "adaptiveCruise", label: "Adaptive cruise", icon: "smart_cruise" },
]);

const LUXURY_MAKES = new Set([
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Lexus",
  "Porsche",
  "Volvo",
  "Tesla",
  "Cadillac",
  "Genesis",
  "Jaguar",
  "Land Rover",
  "Maserati",
]);

const SEATS = new Set(SEAT_OPTIONS.map((item) => item.id));
const CARGOS = new Set(CARGO_OPTIONS.map((item) => item.id));
const LIFESTYLES = new Set(LIFESTYLE_OPTIONS.map((item) => item.id));
const MUST_IDS = new Set(MUST_HAVES.map((item) => item.id));
const FUELS = new Set(FUEL_OPTIONS.map((item) => item.id));
const DRIVETRAINS = new Set(DRIVETRAIN_OPTIONS);
const TRANSMISSIONS = new Set(TRANSMISSION_OPTIONS);
const BODIES = new Set(BODY_OPTIONS.map((item) => item.id));

const BODY_RELATIONS = {
  SUV: { SUV: 1, Crossover: 0.82, Truck: 0.5, Minivan: 0.75, Sedan: 0.2, Coupe: 0.12 },
  Crossover: { Crossover: 1, SUV: 0.82, Sedan: 0.55, Minivan: 0.6, Truck: 0.3, Coupe: 0.2 },
  Sedan: { Sedan: 1, Coupe: 0.6, Crossover: 0.55, SUV: 0.3, Truck: 0.12, Minivan: 0.35 },
  Truck: { Truck: 1, SUV: 0.5, Crossover: 0.3, Minivan: 0.2, Sedan: 0.12, Coupe: 0.1 },
  Coupe: { Coupe: 1, Sedan: 0.6, SUV: 0.12, Crossover: 0.2, Truck: 0.1, Minivan: 0.1 },
  Minivan: { Minivan: 1, SUV: 0.75, Crossover: 0.6, Sedan: 0.35, Truck: 0.2, Coupe: 0.1 },
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const list = (value) => (Array.isArray(value) ? value : []);

function moneyK(value) {
  const amount = Number(value) || 0;
  if (amount % 1000 === 0) return `$${amount / 1000}K`;
  return `$${amount.toLocaleString("en-US")}`;
}

export function defaultAnswers() {
  return {
    budgetMax: 45000,
    makes: [],
    seats: "3-5",
    cargo: "medium",
    lifestyles: ["commute", "family"],
    fuel: "any",
    drivetrain: "any",
    transmission: "any",
    bodyStyles: [],
    mustHaves: [],
  };
}

/** Coerce stored or partial answers into a safe, predictable shape. */
export function normalizeAnswers(input = {}) {
  const base = defaultAnswers();
  const budget = Number(input.budgetMax);
  const seats = SEATS.has(input.seats) ? input.seats : base.seats;
  const fuel = FUELS.has(input.fuel) ? input.fuel : "any";
  const drivetrain = DRIVETRAINS.has(input.drivetrain) ? input.drivetrain : "any";
  const transmission = TRANSMISSIONS.has(input.transmission) ? input.transmission : "any";

  return {
    budgetMax: Number.isFinite(budget) ? Math.min(80000, Math.max(15000, Math.round(budget / 1000) * 1000)) : base.budgetMax,
    makes: list(input.makes)
      .filter((make) => typeof make === "string" && make.trim())
      .map((make) => make.trim().slice(0, 40))
      .slice(0, 3),
    seats,
    cargo: CARGOS.has(input.cargo) ? input.cargo : base.cargo,
    lifestyles: list(input.lifestyles).filter((id) => LIFESTYLES.has(id)).slice(0, 2),
    fuel,
    drivetrain,
    transmission,
    bodyStyles: list(input.bodyStyles).filter((id) => BODIES.has(id)).slice(0, 2),
    mustHaves: list(input.mustHaves).filter((id) => MUST_IDS.has(id)).slice(0, 12),
  };
}

const available = (vehicle) => !vehicle.status || vehicle.status === "available" || vehicle.status === "reserved";

function featureText(vehicle) {
  return `${list(vehicle.features).join(" ")} ${vehicle.interiorColor || ""}`.toLowerCase();
}

function fuelScore(vehicle, fuel) {
  if (fuel === "any") return 1;
  const actual = vehicle.fuelType || "Gasoline";
  if (actual === fuel) return 1;
  const matrix = {
    Gasoline: { Gasoline: 1, Hybrid: 0.8, Diesel: 0.62, PlugInHybrid: 0.55, Electric: 0.08 },
    Hybrid: { Hybrid: 1, PlugInHybrid: 0.9, Electric: 0.5, Gasoline: 0.42, Diesel: 0.28 },
    Electric: { Electric: 1, PlugInHybrid: 0.68, Hybrid: 0.48, Gasoline: 0.05, Diesel: 0.02 },
    PlugInHybrid: { PlugInHybrid: 1, Hybrid: 0.85, Electric: 0.65, Gasoline: 0.4, Diesel: 0.2 },
    Diesel: { Diesel: 1, Gasoline: 0.58, Hybrid: 0.42, PlugInHybrid: 0.38, Electric: 0.05 },
  };
  return matrix[fuel]?.[actual] ?? 0.15;
}

function seatsScore(vehicle, preference) {
  const seats = Number(vehicle.seats) || 5;
  if (preference === "1-2") return 1;
  if (preference === "6+") return seats >= 7 ? 1 : seats >= 6 ? 0.85 : seats >= 5 ? 0.18 : 0;
  return seats >= 5 ? 1 : seats >= 4 ? 0.72 : 0.2;
}

function cargoScore(vehicle, cargo) {
  const body = vehicle.bodyStyle;
  if (cargo === "light") {
    return { Sedan: 1, Crossover: 1, Coupe: 1, SUV: 0.9, Minivan: 0.9, Truck: 0.72 }[body] ?? 0.8;
  }
  if (cargo === "heavy") {
    return { Truck: 1, SUV: 0.76, Crossover: 0.3, Minivan: 0.45, Sedan: 0.08, Coupe: 0.05 }[body] ?? 0.2;
  }
  return { SUV: 1, Crossover: 1, Minivan: 1, Truck: 0.9, Sedan: 0.55, Coupe: 0.38 }[body] ?? 0.6;
}

function efficiency(vehicle) {
  if (vehicle.fuelType === "Electric") return 1;
  const mpg = Number(vehicle.mpg) || 22;
  if (mpg >= 36) return 1;
  if (mpg >= 30) return 0.88;
  if (mpg >= 25) return 0.7;
  if (mpg >= 21) return 0.48;
  return 0.28;
}

function lifestyleScore(id, vehicle) {
  const body = vehicle.bodyStyle;
  const text = featureText(vehicle);
  const awd = vehicle.drivetrain === "AWD" || vehicle.drivetrain === "4WD";
  const seats = Number(vehicle.seats) || 5;
  switch (id) {
    case "commute": {
      const agility = body === "Sedan" || body === "Crossover" || body === "Coupe" ? 0.12 : 0;
      return clamp01(efficiency(vehicle) * 0.9 + agility);
    }
    case "family": {
      const seatFit = seats >= 7 ? 1 : seats >= 5 ? 0.86 : 0.35;
      const safety = /blind spot|adaptive cruise|lane keeping/.test(text) ? 0.1 : 0;
      return clamp01(seatFit + safety);
    }
    case "luxury": {
      const makeFit = LUXURY_MAKES.has(vehicle.make) ? 0.75 : 0.25;
      const cabin = /leather|harman|burmester|nappa|panoramic|premium/.test(text) ? 0.25 : 0;
      return clamp01(makeFit + cabin);
    }
    case "work": {
      const bodyFit = body === "Truck" ? 0.9 : body === "SUV" ? 0.5 : 0.15;
      const tow = /tow|hitch|payload|bed/.test(text) ? 0.15 : 0;
      return clamp01(bodyFit + tow);
    }
    case "outdoor": {
      const bodyFit = body === "SUV" || body === "Crossover" || body === "Truck" ? 0.55 : 0.15;
      return clamp01(bodyFit + (awd ? 0.45 : 0));
    }
    case "rideshare": {
      const bodyFit = body === "Sedan" || body === "Crossover" || body === "SUV" ? 0.18 : 0.02;
      const durability = /honda|toyota|hyundai|kia|mazda|subaru/i.test(vehicle.make) ? 0.12 : 0;
      return clamp01(efficiency(vehicle) * 0.72 + bodyFit + durability);
    }
    default:
      return 0.5;
  }
}

function bodyScore(vehicle, selected) {
  if (!selected.length) return 0.88;
  return Math.max(...selected.map((body) => BODY_RELATIONS[body]?.[vehicle.bodyStyle] ?? 0.15));
}

function drivetrainScore(vehicle, preference) {
  if (preference === "any") return 1;
  const actual = vehicle.drivetrain || "";
  if (actual === preference) return 1;
  if (preference === "AWD" && actual === "4WD") return 0.92;
  if (preference === "4WD" && actual === "AWD") return 0.85;
  if (preference === "AWD" && actual === "RWD") return 0.35;
  if (preference === "RWD" && actual === "AWD") return 0.3;
  if (preference === "AWD" && actual === "FWD") return 0.22;
  return 0.08;
}

function transmissionScore(vehicle, preference) {
  if (preference === "any") return 1;
  const actual = vehicle.transmissionCategory || (/manual/i.test(vehicle.transmission || "") ? "Manual" : "Automatic");
  return actual === preference ? 1 : 0.05;
}

function mustHaveMatches(vehicle, selected) {
  if (!selected.length) return [];
  const text = featureText(vehicle);
  const seats = Number(vehicle.seats) || 5;
  const matched = [];
  for (const id of selected) {
    let ok = false;
    switch (id) {
      case "thirdRow": ok = seats >= 6; break;
      case "awd": ok = vehicle.drivetrain === "AWD" || vehicle.drivetrain === "4WD"; break;
      case "inspected": ok = Boolean(vehicle.inspected150); break;
      case "carfax": ok = Boolean(vehicle.carfaxClean); break;
      case "oneOwner": ok = Boolean(vehicle.oneOwner); break;
      case "sunroof": ok = /moonroof|sunroof|panoramic/.test(text); break;
      case "camera360": ok = /360/.test(text); break;
      case "towing": ok = vehicle.bodyStyle === "Truck" || /tow|hitch|payload/.test(text); break;
      case "leather": ok = /leather|nappa/.test(text); break;
      case "lowMiles": ok = Number(vehicle.mileage) > 0 && Number(vehicle.mileage) < 40000; break;
      case "heatedSeats": ok = /heated/.test(text); break;
      case "adaptiveCruise": ok = /adaptive cruise/.test(text); break;
      default: ok = false;
    }
    if (ok) matched.push(id);
  }
  return matched;
}

const LIFESTYLE_LINE = {
  commute: "Sips fuel on your daily commute",
  family: "Built for family trips and cargo",
  luxury: "Premium cabin and rewarding drive",
  work: "Ready for heavy-duty hauling",
  outdoor: "Trail-ready for weekend escapes",
  rideshare: "Low cost per mile for long shifts",
};

const FUEL_LINE = {
  Gasoline: "Gas powertrain as requested",
  Hybrid: "Hybrid efficiency as requested",
  Electric: "All-electric as requested",
  PlugInHybrid: "Plug-in hybrid as requested",
  Diesel: "Diesel torque as requested",
};

function reasonFor(vehicle, answers, scores) {
  const parts = [];

  if (answers.bodyStyles.length && scores.body >= 0.98) {
    parts.push(`${vehicle.bodyStyle} body style you asked for`);
  }

  if (answers.makes.length && vehicle.make && answers.makes.includes(vehicle.make)) {
    parts.push("One of your favorite makes");
  }

  if (answers.lifestyles.length) {
    let best = { id: "", score: -1 };
    for (const id of answers.lifestyles) {
      const value = lifestyleScore(id, vehicle);
      if (value > best.score) best = { id, score: value };
    }
    if (best.score >= 0.68) parts.push(LIFESTYLE_LINE[best.id]);
  }

  if (answers.fuel !== "any" && scores.fuel >= 0.98) {
    parts.push(FUEL_LINE[answers.fuel] || "Matches your fuel preference");
  } else if (answers.fuel === "any" && (vehicle.fuelType === "Electric" || vehicle.fuelType === "Hybrid")) {
    parts.push(vehicle.fuelType === "Electric" ? "All-electric running costs" : "Hybrid efficiency, no plug needed");
  }

  if (answers.mustHaves.length && scores.mustMatched.length) {
    const labels = scores.mustMatched
      .slice(0, 2)
      .map((id) => MUST_HAVES.find((item) => item.id === id)?.label || "")
      .filter(Boolean);
    if (labels.length) {
      parts.push(`Includes ${labels.join(" + ")}`);
    }
  }

  if (answers.seats !== "1-2" && scores.seats >= 0.85) {
    const seats = Number(vehicle.seats) || 5;
    parts.push(seats >= 7 ? `Room for ${seats} passengers` : `${seats} seats for the whole crew`);
  }

  if (answers.drivetrain !== "any" && scores.drivetrain >= 0.9) {
    parts.push(`${vehicle.drivetrain} traction as requested`);
  }

  if (!parts.length || parts.length < 2) {
    parts.push(`Inside your ${moneyK(answers.budgetMax)} budget`);
  }
  if (parts.length < 2) {
    parts.push("150-point certified and CARFAX verified");
  }

  const line = [];
  let length = 0;
  for (const part of parts) {
    if (line.length >= 3) break;
    if (line.length && length + part.length > 96) break;
    line.push(part);
    length += part.length + 3;
  }
  return line.slice(0, 3);
}

function scoreWith(vehicle, answers) {
  const price = Number(vehicle.price) || 0;
  let total = 0;

  if (price > 0 && price <= answers.budgetMax) {
    total += 24;
  } else if (price > 0) {
    total += 24 * clamp01(1 - (price - answers.budgetMax) / answers.budgetMax / 0.18);
  } else {
    total += 11;
  }

  const seatFit = seatsScore(vehicle, answers.seats);
  const cargoFit = cargoScore(vehicle, answers.cargo);
  const bodyFit = bodyScore(vehicle, answers.bodyStyles);
  const fuelFit = fuelScore(vehicle, answers.fuel);
  const driveFit = drivetrainScore(vehicle, answers.drivetrain);
  const transFit = transmissionScore(vehicle, answers.transmission);
  const mustMatched = mustHaveMatches(vehicle, answers.mustHaves);
  const seatWeight = answers.seats === "1-2" ? 8 : 11;

  const lifestyleFit = answers.lifestyles.length
    ? answers.lifestyles.reduce((sum, id) => sum + lifestyleScore(id, vehicle), 0) / answers.lifestyles.length
    : 0.72;

  const makeFit = answers.makes.length ? (answers.makes.includes(vehicle.make) ? 1 : 0.02) : 0.78;

  total += seatFit * seatWeight;
  total += cargoFit * 4;
  total += bodyFit * 9;
  total += fuelFit * 9;
  total += driveFit * 5;
  total += transFit * 3;
  total += lifestyleFit * 15;
  total += makeFit * 10;
  total += (answers.mustHaves.length ? mustMatched.length / answers.mustHaves.length : 0.75) * 10;

  const raw = Math.round(total * 10) / 10;
  const display = Math.max(40, Math.min(99, Math.round(35 + raw * 0.64)));
  const reasons = reasonFor(vehicle, answers, {
    body: bodyFit,
    seats: seatFit,
    fuel: fuelFit,
    drivetrain: driveFit,
    mustMatched,
  });

  return {
    id: vehicle.id,
    score: display,
    raw,
    reason: reasons.join(" · "),
    highlights: reasons,
    vehicle,
  };
}

/** Core filters that make a vehicle an "exact" inventory match. */
export function isInventoryMatch(vehicle, rawAnswers) {
  const answers = normalizeAnswers(rawAnswers);
  const price = Number(vehicle.price) || 0;
  if (price > answers.budgetMax) return false;

  const seats = Number(vehicle.seats) || 5;
  if (answers.seats === "6+" && seats < 6) return false;
  if (answers.seats === "3-5" && seats < 4) return false;

  if (answers.fuel !== "any" && vehicle.fuelType !== answers.fuel) return false;
  if (answers.bodyStyles.length && !answers.bodyStyles.includes(vehicle.bodyStyle)) return false;
  if (answers.makes.length && !answers.makes.includes(vehicle.make)) return false;

  return true;
}

export function countMatchingVehicles(vehicles, rawAnswers) {
  const answers = normalizeAnswers(rawAnswers);
  return list(vehicles).filter((vehicle) => available(vehicle) && isInventoryMatch(vehicle, answers)).length;
}

/**
 * Score the inventory and return the best `limit` matches.
 * @param {object[]} vehicles
 * @param {object} rawAnswers
 * @param {{limit?: number}} [options]
 */
export function analyzeMatches(vehicles, rawAnswers, options = {}) {
  const answers = normalizeAnswers(rawAnswers);
  const limit = Math.max(1, Number(options.limit) || 6);
  const pool = list(vehicles).filter(available);

  const scored = pool
    .filter((vehicle) => Number(vehicle.price) > 0)
    .map((vehicle) => scoreWith(vehicle, answers))
    .sort(
      (a, b) =>
        b.raw - a.raw ||
        Number(b.vehicle.viewCount || 0) - Number(a.vehicle.viewCount || 0) ||
        Number(Boolean(b.vehicle.featured)) - Number(Boolean(a.vehicle.featured))
    );

  const matches = scored.slice(0, limit);
  const count = pool.filter((vehicle) => isInventoryMatch(vehicle, answers)).length;

  return {
    answers,
    count,
    totalPool: pool.length,
    matches,
    best: matches[0] || null,
  };
}

export function bodyStyleCounts(vehicles) {
  return list(vehicles).reduce((counts, vehicle) => {
    if (!available(vehicle)) return counts;
    const body = vehicle.bodyStyle || "Other";
    counts[body] = (counts[body] || 0) + 1;
    return counts;
  }, {});
}

export function makeCounts(vehicles) {
  return list(vehicles).reduce((counts, vehicle) => {
    if (!available(vehicle) || !vehicle.make) return counts;
    counts[vehicle.make] = (counts[vehicle.make] || 0) + 1;
    return counts;
  }, {});
}
