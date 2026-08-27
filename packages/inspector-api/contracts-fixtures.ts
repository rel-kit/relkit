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
} from "./src/index.ts";
import { graph, identity, poison, secret } from "./contracts-data.ts";
export { getForbiddenReads, graph, identity, secret } from "./contracts-data.ts";

const runtimeItem = (id: string, state = "available"): Record<string, unknown> =>
  poison({ id, status: "ready", state, password: secret });

export function queryFixture(seen: ObservabilityQueryRequest[] = []): ObservabilityQuery {
  const page = (items: readonly unknown[] = []) => ({
    protocol: "relkit.observability.query" as const,
    version: 1 as const,
    items,
  });
  return {
    requests: async (query = {}) => {
      seen.push(query);
      return page([{ requestId: "request-1", traceId: "trace-1", outcome: "success" }]) as never;
    },
    logs: async (query = {}) => {
      seen.push(query);
      return page([{ cursor: "1", message: "safe log" }]) as never;
    },
    traces: async (query = {}) => {
      seen.push(query);
      return page([{ traceId: "trace-1", outcome: "success" }]) as never;
    },
    request: async (requestId) =>
      requestId === "request-1"
        ? ({ ...page(), request: { requestId }, records: [] } as never)
        : undefined,
    log: async () => undefined,
    trace: async (traceId) =>
      traceId === "trace-1" ? ({ ...page(), spans: [], records: [] } as never) : undefined,
  };
}

function actionServices(): InspectorActionServices {
  const approvals = new Set(["call-1", "call-2", "call-3"]);
  let jobState = "dead-lettered";
  let eventState = "dead-lettered";
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

export function makeApp(
  options: {
    readonly mode?: "development" | "test" | "production";
    readonly bearerToken?: string;
  } = {},
): {
  readonly app: Hono;
  readonly stream: ReturnType<typeof createObservabilityStream>;
  readonly seen: ObservabilityQueryRequest[];
} {
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

export async function json(app: Hono, path: string, status = 200): Promise<Record<string, any>> {
  const response = await app.request(path);
  expectResponse(response, status);
  return (await response.json()) as Record<string, any>;
}

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

export function expectResponse(response: Response, status: number): void {
  if (response.status !== status)
    throw new Error("Expected " + status + ", received " + response.status);
}
