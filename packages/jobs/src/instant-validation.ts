const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/u;
const MAX_DATE_MILLIS = 8_640_000_000_000_000;

export function isRfc3339Instant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = RFC3339_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return false;
  }
  if (hour > 23 || minute > 59 || second > 59) return false;
  const offset = match[7];
  const offsetMinutes =
    offset === "Z"
      ? 0
      : (offset!.startsWith("-") ? -1 : 1) *
        (Number(offset!.slice(1, 3)) * 60 + Number(offset!.slice(4)));
  if (offset !== "Z" && (Number(offset!.slice(1, 3)) > 23 || Number(offset!.slice(4)) > 59)) {
    return false;
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  const timestamp = date.getTime() - offsetMinutes * 60_000;
  return Number.isFinite(timestamp) && Math.abs(timestamp) <= MAX_DATE_MILLIS;
}

export function assertRfc3339Instant(value: unknown, name = "instant"): asserts value is string {
  if (!isRfc3339Instant(value)) throw new TypeError(`${name} must be a valid RFC 3339 instant`);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
