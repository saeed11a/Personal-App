// The factory's timezone. The top bar always shows factory time, whatever timezone
// the device or the person looking at it happens to be in.
export const APP_TIME_ZONE = "Asia/Karachi";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const secondsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

// Databases hand back timestamps as ISO strings, screens hand them back as Date
// objects or epoch numbers. Intl's format() only accepts the last two — a string
// threw `RangeError: Invalid time value`, which took the whole page down with it.
// Everything therefore goes through here first, and a value that cannot be read as
// a date is rendered as empty rather than crashing the screen.
const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "Mon, 12 Oct" */
export const formatAppDate = (value = new Date()) => dateFormat.format(toDate(value) ?? new Date());

/** "05:11 am", or "05:11:09 am" with `seconds`. */
export const formatAppTime = (value = new Date(), { seconds = false } = {}) =>
  (seconds ? secondsFormat : timeFormat).format(toDate(value) ?? new Date());

/** "Mon, 12 Oct · 05:11:09 am" — used for "last checked" hints. */
export const formatAppStamp = (value) => {
  const date = toDate(value);
  return date ? `${formatAppDate(date)} · ${formatAppTime(date, { seconds: true })}` : "";
};
