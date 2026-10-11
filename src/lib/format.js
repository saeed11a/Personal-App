export const CURRENCY_SYMBOLS = {
  PKR: "Rs",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "AED",
  SAR: "SAR",
  INR: "₹",
};

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartISO() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

export function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value, symbol = "Rs") {
  return `${symbol} ${num(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function pairs(value) {
  return `${num(value).toLocaleString("en-US")} prs`;
}

export function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

export function isSet(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}
