/**
 * Auto finance helpers.
 * Standard amortizing loan formula: M = P * r / (1 - (1 + r)^-n)
 */

export const FINANCE_DEFAULTS = Object.freeze({
  apr: 5.9,
  term: 72,
  downPayment: 3000,
  minDown: 0,
  maxDown: 15000,
  terms: [36, 48, 60, 72],
});

/**
 * Monthly payment for an amortizing loan.
 * @param {number} principal amount financed
 * @param {number} apr annual percentage rate, e.g. 5.9
 * @param {number} months loan term in months
 */
export function monthlyPayment(principal, apr, months) {
  const P = Math.max(0, Number(principal) || 0);
  const n = Math.max(1, Number(months) || 1);
  const r = Math.max(0, Number(apr) || 0) / 100 / 12;
  if (r === 0) return P / n;
  return (P * r) / (1 - Math.pow(1 + r, -n));
}

/** Estimated monthly for a sticker price with default 10% down (min $2,000). */
export function estimateMonthly(price, options = {}) {
  const sticker = Number(price) || 0;
  const down = options.downPayment ?? Math.min(Math.max(Math.round((sticker * 0.1) / 500) * 500, 0), 8000);
  return Math.round(monthlyPayment(sticker - down, options.apr ?? 6.49, options.term ?? 72));
}

/** Round to nearest $5 for friendlier estimates. */
export function roundPayment(value) {
  return Math.round(value / 5) * 5;
}

export function termLabel(months) {
  return `${months} mo`;
}
