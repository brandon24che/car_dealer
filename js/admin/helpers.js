/**
 * Shared formatting and CSV helpers for the dealer portal.
 */
import { formatDate, formatNumber, truncate } from "../utils.js?v=20261101a";

export const LEAD_TYPES = {
  whatsapp: { label: "WhatsApp", icon: "chat", tone: "wa" },
  testDrive: { label: "Test drive", icon: "event_available", tone: "blue" },
  valuation: { label: "Trade-in", icon: "price_change", tone: "orange" },
  contact: { label: "Contact", icon: "mail", tone: "neutral" },
};

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"];

export const LEAD_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export function leadType(type) {
  return LEAD_TYPES[type] || { label: type || "Lead", icon: "inbox", tone: "neutral" };
}

export function leadTypeBadge(type) {
  const meta = leadType(type);
  return `<span class="adm-type adm-type--${meta.tone}"><span class="material-symbols-outlined" aria-hidden="true">${meta.icon}</span>${meta.label}</span>`;
}

export function vehicleStatusBadge(status) {
  const value = ["available", "reserved", "sold"].includes(status) ? status : "available";
  const label = value.charAt(0).toUpperCase() + value.slice(1);
  return `<span class="adm-status adm-status--car-${value}">${label}</span>`;
}

export function leadDate(value) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDate(date, { month: "short", day: "numeric", year: "numeric" }) || "—";
}

export function leadDateTime(value) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function leadSummary(lead) {
  const message = String(lead.message || "").trim();
  if (message) return truncate(message, 92);
  if (lead.vehicleName) return truncate(`Interested in ${lead.vehicleName}`, 92);
  return "No message provided";
}

export function csvCell(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename, rows) {
  const content = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function compactNumber(value) {
  const number = Number(value) || 0;
  return number >= 1000 ? formatNumber(number) : String(number);
}

export function vehicleName(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
}

export function vehicleThumb(vehicle) {
  const image = Array.isArray(vehicle.images) ? vehicle.images[0] : "";
  return image || "assets/cars/sedan-blue.jpg";
}

/** Assets are stored root-relative; the portal lives one directory deeper. */
export function assetPath(path) {
  const value = String(path || "").trim();
  if (!value) return "../assets/cars/sedan-blue.jpg";
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("../")) return value;
  return `../${value.replace(/^\.?\//, "")}`;
}

export function timeValue(value) {
  if (!value) return 0;
  if (value?.toDate) return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
