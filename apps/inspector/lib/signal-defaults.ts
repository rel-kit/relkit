import { EMPTY_SIGNAL_FILTERS, type SignalFilters, type SignalKind } from "./observability-model";

/**
 * A list starts with no time range, so it covers every retained record and a request that
 * arrives while the page is open is never outside the range.
 */
export function defaultSignalFilters(kind: SignalKind): SignalFilters {
  void kind;
  return EMPTY_SIGNAL_FILTERS;
}

/** The value of a `datetime-local` input for an instant, in the viewer's time zone. */
export function localDateTime(value: number): string {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
