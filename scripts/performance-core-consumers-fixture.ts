import { installInspectorEndpoints } from "@relkit/inspector-api";
import {
  createObservabilityStream,
  type ObservabilityQuery,
  type ObservabilityQueryRequest,
  type RequestQueryResponse,
} from "@relkit/observability";
import { Hono } from "hono";
import { createPerformanceGeneration } from "./performance-core-consumers-generation.js";
import type { PerformanceInspector } from "./performance-core-consumers-fixture.types.js";

/**
 * Creates the same bounded request-page fixture through public Inspector exports.
 * @returns One authenticated router with isolated query and forbidden-read counters.
 * @remarks Only request paging is measured. The deliberately minimal request item
 * retains the original benchmark's exact JSON shape; other query methods fail if used.
 * Generation data stays poisoned and sensitive even though request paging needs no graph reads.
 */
export function createPerformanceInspector(): PerformanceInspector {
  const app = new Hono();
  const seen: ObservabilityQueryRequest[] = [];
  const data = createPerformanceGeneration();
  installInspectorEndpoints(app, {
    activeGeneration: data.generation,
    query: createPerformanceQuery(seen),
    stream: createObservabilityStream(),
    mode: "production",
    enabled: true,
    bearerToken: "performance-token",
  });
  return { app, seen, secret: data.secret, getForbiddenReads: data.getForbiddenReads };
}

/**
 * Implements only the query operation consumed by the route benchmark.
 * @param seen - Accepted query inputs, including ten warm-up calls.
 * @returns A public query contract with the baseline request-page payload.
 */
function createPerformanceQuery(seen: ObservabilityQueryRequest[]): ObservabilityQuery {
  return {
    requests: async (query = {}) => {
      seen.push(query);
      // The compatibility baseline used this minimal public payload; retaining it
      // keeps serialization work comparable instead of adding unmeasured fields.
      return {
        protocol: "relkit.observability.query",
        version: 1,
        items: [{ requestId: "request-1", traceId: "trace-1", outcome: "success" }],
      } as unknown as RequestQueryResponse;
    },
    logs: unexpectedQuery,
    traces: unexpectedQuery,
    request: unexpectedQuery,
    log: unexpectedQuery,
    trace: unexpectedQuery,
  };
}

/**
 * Rejects accidental expansion of the measured query workload.
 * @returns A rejection identifying an unmeasured operation.
 */
async function unexpectedQuery(): Promise<never> {
  throw new Error("The performance fixture measures request paging only.");
}
