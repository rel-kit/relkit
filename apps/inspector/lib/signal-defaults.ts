import { EMPTY_SIGNAL_FILTERS, type SignalFilters, type SignalKind } from "./observability-model";

export function defaultSignalFilters(kind: SignalKind, now = Date.now()): SignalFilters {
  if (kind !== "logs") return EMPTY_SIGNAL_FILTERS;
  const value = now - 24 * 60 * 60 * 1_000;
  const date = new Date(value);
  const from = new Date(value - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return { ...EMPTY_SIGNAL_FILTERS, from };
}
