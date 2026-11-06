/** Query adapters wait for the runtime's owned writes before reading retained state. */
import type { ObservabilityQuery } from "./query-types.js";

/** @param query - Selected storage query API. @param flush - Owned flush barrier. @returns Queries that preserve write-before-read behavior. */
export function runtimeQuery(
  query: ObservabilityQuery,
  flush: () => Promise<void>,
): ObservabilityQuery {
  return Object.freeze({
    requests: async (value) => {
      await flush();
      return query.requests(value);
    },
    request: async (id) => {
      await flush();
      return query.request(id);
    },
    logs: async (value) => {
      await flush();
      return query.logs(value);
    },
    log: async (cursor) => {
      await flush();
      return query.log(cursor);
    },
    traces: async (value) => {
      await flush();
      return query.traces(value);
    },
    trace: async (id) => {
      await flush();
      return query.trace(id);
    },
  } satisfies ObservabilityQuery);
}
