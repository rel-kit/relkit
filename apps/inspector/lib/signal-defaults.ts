import { EMPTY_SIGNAL_FILTERS, type SignalFilters, type SignalKind } from "./observability-model";

export function defaultSignalFilters(kind: SignalKind, now = Date.now()): SignalFilters {
  void kind;
  return {
    ...EMPTY_SIGNAL_FILTERS,
    from: localDateTime(now - 24 * 60 * 60 * 1_000),
    to: localDateTime(now),
  };
}

function localDateTime(value: number): string {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
