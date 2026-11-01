/**
 * Dealer WhatsApp configuration + message builders.
 *
 * ─────────────────────────────────────────────────────────────
 *  CHANGE THE DEALER WHATSAPP NUMBER HERE (single constant).
 *  Use the full international format, digits only — no + or spaces.
 *  Example: US 1 (800) 555-0199 → "18005550199"
 * ─────────────────────────────────────────────────────────────
 */
export const DEALER_WHATSAPP_NUMBER = "18005550199";
export const DEALER_NAME = "AutoSelect Dallas";
export const DEALER_PHONE_DISPLAY = "+1 (800) 555-0199";

/** Build a wa.me deep link. Falls back to the generic composer if no number is set. */
export function waLink(message = "") {
  const base = DEALER_WHATSAPP_NUMBER
    ? `https://wa.me/${DEALER_WHATSAPP_NUMBER}`
    : "https://wa.me/";
  const text = String(message || "").trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Short inquiry used on listing cards. */
export function vehicleInquiryMessage(vehicle) {
  return `Hi ${DEALER_NAME}! I'm interested in the ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ""} (Stock ${vehicle.stockNumber}) listed at $${Number(vehicle.price).toLocaleString()}. Is it still available?`;
}

/** Full concierge checkout message — includes finance selections. */
export function vehicleCheckoutMessage(vehicle, finance = {}) {
  const lines = [
    `Hello ${DEALER_NAME} Team!`,
    "",
    `I am interested in purchasing the ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ""} listed at $${Number(vehicle.price).toLocaleString()} (Stock ID: ${vehicle.stockNumber}).`,
  ];
  if (finance.downPayment !== undefined) {
    lines.push(
      `My estimated terms: ${finance.downPayment ? `$${Number(finance.downPayment).toLocaleString()} down` : "no down payment"} • ${finance.term || 72} months • ${finance.apr || "5.9"}% APR.`
    );
  }
  lines.push("Please confirm vehicle availability and send the next payment/financing steps.");
  return lines.join("\n");
}

export function tradeInMessage(vehicleInfo = {}) {
  return `Hi ${DEALER_NAME}! I'd like a trade-in valuation for my ${vehicleInfo.year || ""} ${vehicleInfo.make || ""} ${vehicleInfo.model || ""} with ${vehicleInfo.mileage || ""} miles.`;
}

export const WHATSAPP_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.969.587 1.961.897 3.201.897 3.179 0 5.767-2.587 5.767-5.766.001-3.187-2.575-5.784-6.172-6.084zm0-2.172c4.418 0 8 3.582 8 8 0 1.545-.44 2.99-1.2 4.223l1.169 4.269-4.372-1.147c-1.189.704-2.574 1.115-4.053 1.115-4.418 0-8-3.582-8-8s3.582-8 8-8zm3.434 11.233c-.193.54-1.127.99-1.554 1.026-.407.034-.943.149-3.057-.732-2.551-1.063-4.179-3.66-4.306-3.83-.127-.17-1.03-1.371-1.03-2.616s.646-1.859.877-2.113c.23-.254.502-.317.67-.317.168 0 .335.002.482.01.155.008.362-.059.567.433.21.503.717 1.748.779 1.875.063.127.105.275.021.443-.084.17-.127.275-.252.422-.127.148-.266.33-.38.443-.127.127-.26.265-.112.519.148.254.657 1.082 1.408 1.751.966.861 1.781 1.127 2.034 1.254.254.127.402.106.55-.064.148-.17.634-.74.803-.994.17-.254.339-.211.571-.127.232.084 1.468.692 1.722.819.254.127.423.19.486.296.063.106.063.614-.13 1.154z"/></svg>`;
