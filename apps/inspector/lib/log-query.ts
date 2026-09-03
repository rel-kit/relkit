import type { InspectorQuery } from "./api-types";

export const logFilterKeys = [
  "search",
  "severity",
  "source",
  "serviceId",
  "functionId",
  "requestId",
  "traceId",
  "range",
  "from",
  "to",
] as const;
const windows: Record<string, number> = {
  "15m": 900_000,
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
};

export function logQuery(params: URLSearchParams, now = Date.now()): InspectorQuery {
  const filters: Record<string, string> = {};
  for (const key of logFilterKeys.slice(0, 7)) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  const range = params.get("range") ?? "24h";
  if (!params.has("source")) filters.source = "application";
  if (filters.source === "all") delete filters.source;
  if (range === "custom") {
    for (const key of ["from", "to"]) {
      const value = params.get(key);
      if (value && Number.isFinite(Date.parse(value))) filters[key] = new Date(value).toISOString();
    }
  } else filters.from = new Date(now - (windows[range] ?? windows["24h"]!)).toISOString();
  const cursor = params.get("cursor");
  return { ...filters, order: "desc", limit: 50, ...(cursor ? { cursor } : {}) };
}

export function logQueryKey(params: URLSearchParams): string {
  const query = new URLSearchParams();
  for (const key of [...logFilterKeys, "cursor"]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  return query.toString();
}
