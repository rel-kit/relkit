import { API_BASE_PATH, PROTOCOL_VERSION } from "@relkit/contracts";
import {
  createObservabilityStream,
  type ObservabilityQuery,
  type ObservabilityQueryRequest,
} from "@relkit/observability";
import { Hono } from "hono";
import {
  installInspectorEndpoints,
  type InspectorActionServices,
  type InspectorActiveGeneration,
} from "../../src/index.ts";
import { graph, identity, poison, secret } from "./contracts-data.ts";
import type { ContractFixtureOptions, ContractFixture } from "./contracts-fixtures.types.js";
import { nativeFixture, responseJson } from "../fixtures/json.js";
import type { NativeQueryFixtureResponse } from "../fixtures/json.types.js";
export { getForbiddenReads, graph, identity, secret } from "./contracts-data.ts";

/**
 * Creates stored runtime metadata with private accessor traps and a sensitive value.
 * @param id - Existing declaration identity.
 * @param state - Native lifecycle state selected by the assertion.
 * @returns The original stored runtime fixture record.
 */
const runtimeItem = (id: string, state = "available"): Record<string, unknown> =>
  poison({ id, status: "ready", state, password: secret });

/**
 * Provides intentionally minimal native query values used by legacy response assertions.
 * @param seen - Accepted bounded query inputs retained for assertions.
 * @returns A native query authority preserving the original response fields exactly.
 */
export function queryFixture(seen: ObservabilityQueryRequest[] = []): ObservabilityQuery {
  /**
   * Builds the existing versioned page without fabricating full native item metadata.
   * @param items - Original assertion-bearing fixture records.
   * @returns The unchanged query envelope and items.
   */
  const page = (items: readonly unknown[] = []) => ({
    protocol: "relkit.observability.query" as const,
    version: 1 as const,
    items,
  });
  return {
    requests: async (query = {}) => {
      seen.push(query);
      return nativeFixture<NativeQueryFixtureResponse<"requests">>(
        page([{ requestId: "request-1", traceId: "trace-1", outcome: "success" }]),
      );
    },
    logs: async (query = {}) => {
      seen.push(query);
      return nativeFixture<NativeQueryFixtureResponse<"logs">>(
        page([{ cursor: "1", message: "safe log" }]),
      );
    },
    traces: async (query = {}) => {
      seen.push(query);
      return nativeFixture<NativeQueryFixtureResponse<"traces">>(
        page([{ traceId: "trace-1", outcome: "success" }]),
      );
    },
    request: async (requestId) =>
      requestId === "request-1"
        ? nativeFixture<NativeQueryFixtureResponse<"request">>({
            ...page(),
            request: { requestId },
            records: [],
          })
        : undefined,
    log: async () => undefined,
    trace: async (traceId) =>
      traceId === "trace-1"
        ? nativeFixture<NativeQueryFixtureResponse<"trace">>({ ...page(), spans: [], records: [] })
        : undefined,
  };
}

/** @returns Native action authorities with the existing mutable job/event and approval states. */
function actionServices(): InspectorActionServices {
  const approvals = new Set(["call-1", "call-2", "call-3"]);
  let jobState = "dead-lettered";
  let eventState = "dead-lettered";
  /**
   * Projects the existing administration receipt.
   * @param id - Native instance or delivery identifier.
   * @param state - Resulting native lifecycle state.
   * @returns The unchanged status and record envelope.
   */
  const admin = (id: string, state: string) => ({
    action: "admin",
    status: { instanceId: id, deliveryId: id, state },
    record: { action: "admin", instanceId: id, deliveryId: id },
  });
  return {
    functions: {
      exists: async (id) => id === "orders.create",
      invoke: async () => poison({ ok: true, password: secret }),
    },
    jobs: {
      protocol: "relkit.jobs.admin",
      version: PROTOCOL_VERSION,
      status: async () => ({ state: jobState }),
      retry: async ({ instanceId }) => {
        jobState = "available";
        return admin(instanceId, jobState);
      },
      cancel: async ({ instanceId }) => {
        jobState = "cancelled";
        return admin(instanceId, jobState);
      },
    },
    events: {
      protocol: "relkit.events.admin",
      version: PROTOCOL_VERSION,
      status: async () => ({ state: eventState }),
      retry: async ({ deliveryId }) => {
        eventState = "available";
        return admin(deliveryId, eventState);
      },
      cancel: async ({ deliveryId }) => {
        eventState = "cancelled";
        return admin(deliveryId, eventState);
      },
    },
    approvals: {
      get: async ({ toolCallId }) =>
        approvals.has(toolCallId)
          ? { invocationId: "invocation-1", toolCallId, toolId: "orders.tool", state: "pending" }
          : undefined,
      approve: async ({ toolCallId }) => ({
        invocationId: "invocation-1",
        toolCallId,
        toolId: "orders.tool",
        state: "approved",
      }),
      deny: async ({ toolCallId }) => ({
        invocationId: "invocation-1",
        toolCallId,
        toolId: "orders.tool",
        state: "denied",
      }),
    },
  };
}

/** @returns The stored active generation with poisoned graph/runtime metadata and native actions. */
export function makeGeneration(): InspectorActiveGeneration {
  return {
    ...identity,
    graph,
    runtime: {
      functions: [runtimeItem("orders.create")],
      jobs: [runtimeItem("orders.job")],
      events: [runtimeItem("orders.created")],
      buckets: [runtimeItem("orders.bucket")],
      cache: [runtimeItem("orders.cache")],
      tools: [runtimeItem("orders.tool")],
      agents: [runtimeItem("orders.agent")],
    },
    diagnostics: [{ code: "RELKIT_TEST", severity: "warning", message: "safe diagnostic" }],
    actions: actionServices(),
    environment: () => ({ DATABASE_URL: secret }),
  };
}

/**
 * Installs the original contract fixture on one native router.
 * @param options - Optional legacy environment and bearer protection settings.
 * @returns The router, native stream and bounded query input ledger.
 */
export function makeApp(options: ContractFixtureOptions = {}): ContractFixture {
  const app = new Hono();
  const seen: ObservabilityQueryRequest[] = [];
  const stream = createObservabilityStream();
  const routerOptions = {
    activeGeneration: makeGeneration(),
    query: queryFixture(seen),
    stream,
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.bearerToken === undefined ? {} : { bearerToken: options.bearerToken }),
    ...(options.mode === "production" ? { enabled: true } : {}),
  };
  installInspectorEndpoints(app, routerOptions);
  return { app, stream, seen };
}

/**
 * Reads the same native JSON object after checking the legacy expected status.
 * @typeParam A - Fields selected by the caller's existing response assertions.
 * @param app - Installed native fixture router.
 * @param path - Existing absolute Inspector route path.
 * @param status - Expected legacy HTTP status.
 * @returns The original object, with no fabricated fields or fallback response.
 */
export async function json<A extends object = Record<string, unknown>>(
  app: Hono,
  path: string,
  status = 200,
): Promise<A> {
  const response = await app.request(path);
  expectResponse(response, status);
  return responseJson<A>(response);
}

/**
 * Sends the existing native JSON action request through Hono.
 * @param app - Installed fixture router.
 * @param path - Action route suffix below the Inspector API path.
 * @param body - Original JSON action body.
 * @param headers - Optional response-independent identity or bearer request headers.
 * @returns The unchanged native action response.
 */
export async function post(
  app: Hono,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(API_BASE_PATH + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/**
 * Checks the legacy expected HTTP status before selected JSON assertions.
 * @param response - Native response from the installed fixture.
 * @param status - Existing expected HTTP status.
 * @returns No value; a mismatch retains the existing fixture error message.
 */
export function expectResponse(response: Response, status: number): void {
  if (response.status !== status)
    throw new Error("Expected " + status + ", received " + response.status);
}
