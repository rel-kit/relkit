/**
 * Builds the Inspector API reference from the routes the router actually registers, so the
 * documented development protocol cannot drift from the code. Clients other than the bundled
 * UI, such as `relkit mcp`, read this reference to call the API.
 */
import { Hono } from "hono";
import { API_BASE_PATH, API_VERSION } from "relkit/contracts";
import { createObservabilityStream, type ObservabilityQuery } from "relkit/observability";
import { INSPECTION_BRIDGE_ENDPOINTS } from "./connection/bridge-paths.js";
import { INSPECTION_PROTOCOL } from "./connection/protocol.schemas.js";
import { OBSERVABILITY_ENDPOINT_PATHS } from "./observability.js";
import { INSPECTOR_API_PATHS } from "./inspector-endpoint-paths.js";
import { disposeInspectorEndpoints, installInspectorEndpoints } from "./router.js";
import type { InspectorEndpointReference } from "./protocol-reference.types.js";
export type {
  InspectorEndpointReference,
  InspectorEndpointServer,
} from "./protocol-reference.types.js";

const APPLICATION_AUTH =
  "Through the bridge: `Authorization: Bearer <session token>` with `x-relkit-project-id` and `x-relkit-session-id`; the bridge forwards the session token to the application. Changes also send `x-relkit-generation-id`.";
const INSPECTOR_AUTH =
  "Served by the Inspector from its local history; the bridge refuses these paths, so only the Inspector's own server can call them.";
const BRIDGE_AUTH =
  "`Authorization: Bearer <session token>` with `x-relkit-project-id` and `x-relkit-session-id`, read from the session's private descriptor under `.relkit/connections`.";

/** Query stub: installation registers routes without calling it, and the router never serves. */
const REFERENCE_QUERY: ObservabilityQuery = {
  requests: unavailable,
  logs: unavailable,
  traces: unavailable,
  request: unavailable,
  log: unavailable,
  trace: unavailable,
};

/** Rejects any call; the reference router never receives a request. */
async function unavailable(): Promise<never> {
  throw new Error("The reference router serves no requests.");
}

/**
 * Lists every Inspector API endpoint with its version, server and authentication.
 * @returns Endpoints sorted by path then method, read from a real router installation.
 * @example const endpoints = await inspectorApiReference(); endpoints[0]?.path;
 */
export async function inspectorApiReference(): Promise<readonly InspectorEndpointReference[]> {
  const app = new Hono();
  const stream = createObservabilityStream({ maxEvents: 1 });
  try {
    installInspectorEndpoints(app, {
      environment: "development",
      enabled: true,
      authorize: () => false,
      observability: { query: REFERENCE_QUERY, stream },
    });
    const history = new Set<string>(OBSERVABILITY_ENDPOINT_PATHS);
    const seen = new Set<string>();
    // Advertised paths another installer registers (the agent inspector) are read-only GETs.
    const registered = new Set(app.routes.map((route) => route.path));
    const advertised = INSPECTOR_API_PATHS.filter((path) => !registered.has(path)).map((path) => ({
      method: "GET",
      path,
    }));
    const application = [...app.routes, ...advertised].flatMap((route) => {
      const key = `${route.method} ${route.path}`;
      if (route.method === "ALL" || seen.has(key)) return [];
      seen.add(key);
      const server = history.has(route.path) ? "inspector" : "application";
      return [
        {
          method: route.method,
          path: route.path,
          version: `v${API_VERSION}`,
          server,
          authentication: server === "inspector" ? INSPECTOR_AUTH : APPLICATION_AUTH,
          summary: summarize(route.method, route.path),
        } satisfies InspectorEndpointReference,
      ];
    });
    const bridge = INSPECTION_BRIDGE_ENDPOINTS.map(
      (endpoint) =>
        ({
          ...endpoint,
          version: `protocol ${INSPECTION_PROTOCOL}`,
          server: "bridge",
          authentication: BRIDGE_AUTH,
        }) satisfies InspectorEndpointReference,
    );
    return [...bridge, ...application].sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
    );
  } finally {
    stream.close();
    await disposeInspectorEndpoints(app);
  }
}

/** Phrasing for endpoints the path rule below would describe poorly, keyed by method and path. */
const SUMMARIES: Readonly<Record<string, string>> = {
  "GET /health/live": "Report whether the application answers",
  "GET /health/ready":
    "Report whether a generation is active, with its generation ID and graph hash",
  "GET /graph": "Read the whole application graph",
  "GET /diagnostics": "Read the active generation's diagnostics",
  "GET /env": "Read environment variable declarations and their status, without values",
  "GET /runtime": "Read the runtime summary",
  "GET /runtime/state": "Read runtime state for every collection",
  "GET /stream": "Stream new logs, requests and spans as server-sent events",
  "GET /agents/:agentId/workflow": "Read an agent's workflow graph",
  "GET /runtime/agents/:agentId/executions": "List an agent's recorded executions",
  "GET /source/:id": "Read the source of a declaration",
  "GET /graph/source/:id": "Read the source of a declaration",
  "POST /jobs/runs/:id/cancel": "Cancel a job run",
  "POST /jobs/runs/:id/retry": "Retry a job run",
  "POST /jobs/schedules": "Create or update a job schedule",
  "DELETE /jobs/schedules/:id": "Delete a job schedule",
  "POST /jobs/schedules/:id/pause": "Pause a job schedule",
  "POST /jobs/schedules/:id/resume": "Resume a job schedule",
  "POST /actions/functions/:id/invoke": "Invoke a function with an input",
  "POST /actions/jobs/:id/trigger": "Start a run of a job with an input",
  "POST /actions/jobs/:id/retry": "Retry a dead-lettered job instance",
  "POST /actions/jobs/:id/cancel": "Cancel a job instance",
  "POST /actions/events/:id/publish": "Publish an event with a payload",
  "POST /actions/events/:id/replay": "Deliver a recorded publication to its consumers again",
  "POST /actions/events/:id/retry": "Retry a dead-lettered event delivery",
  "POST /actions/events/:id/cancel": "Cancel a pending event delivery",
  "POST /actions/tools/:id/approval": "Approve or deny a pending tool call",
  "POST /actions/tools/:id/approve": "Approve a pending tool call",
  "POST /actions/tools/:id/deny": "Deny a pending tool call",
};

/**
 * Describes an endpoint from its path segments.
 * @param method - Registered HTTP method.
 * @param path - Registered route pattern.
 * @returns One short phrase; parameters are named, never invented.
 */
function summarize(method: string, path: string): string {
  const relative = path.slice(API_BASE_PATH.length);
  if (relative === "") return "List the API's capabilities and endpoint paths";
  const known = SUMMARIES[`${method} ${relative}`];
  if (known !== undefined) return known;
  const rest = relative.split("/").filter(Boolean);
  const words = rest.filter((segment) => !segment.startsWith(":")).map(humanize);
  const target = [...rest].reverse().find((segment) => segment.startsWith(":"));
  const noun = words.join(" ");
  if (method !== "GET") return `${method} ${noun}`;
  return target === undefined ? `List ${noun}` : `Read one of ${noun} by \`${target}\``;
}

/** Turns a path segment into words. */
function humanize(segment: string): string {
  return segment.replaceAll("-", " ");
}
