/**
 * A served application that answers early, before reading the body, for each reason the runtime
 * has (origin denial, body limit, unknown route, wrong method, route-level authentication and a
 * not-ready shell), wrapped in `instrumentHttpRequest` the way the generated server wraps it.
 */
import type { RegistrationPlan } from "../../src/graph/index.js";
import { instrumentHttpRequest } from "../../src/runtime-hono/http-span.js";
import { createApp } from "../../src/runtime-hono/index.js";
import { problemResponse } from "../../src/runtime-hono/problem-details.js";
import { runtimeCohort } from "./test-cohort.ts";

/** Body limit of the served application, in bytes. */
export const EARLY_RESPONSE_LIMIT = 1024;

/**
 * Builds the native fetch handler of the served application.
 * @returns A handler answering `GET /ok` with 200 and the early answers on the other paths.
 */
export function earlyResponseHandler(): (request: Request) => Promise<Response> {
  const graphHash = "sha256:early-response";
  const plan: RegistrationPlan = {
    graphHash,
    functions: [],
    httpTriggers: [
      trigger("ok.read", "GET", "/ok"),
      trigger("write.raw", "POST", "/write"),
      {
        ...trigger("private.raw", "POST", "/private"),
        config: {
          ...trigger("private.raw", "POST", "/private").config,
          auth: { kind: "required" },
        },
      },
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    channels: [],
    middlewares: [],
  } as RegistrationPlan;
  const ok = () => Response.json({ ok: true });
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
      routes: {
        "ok.read": { handler: ok },
        "write.raw": { handler: ok },
        "private.raw": { handler: ok },
      },
    },
    engine: { invoke: async () => undefined },
    middleware: { maxBodyBytes: EARLY_RESPONSE_LIMIT },
    auth: { contextFor: () => ({ getSession: async () => null }) },
    transportSecurity: { allowedOrigins: [] },
  });
  const options = { maxBodyBytes: EARLY_RESPONSE_LIMIT };
  return (request) =>
    instrumentHttpRequest(request, options, (inner) =>
      new URL(inner.url).pathname === "/not-ready"
        ? problemResponse({
            status: 503,
            code: "not-ready",
            detail: "The server is not ready yet.",
          })
        : app.fetch(inner),
    );
}

/**
 * Declares one raw route.
 * @param id - Route and target identifier.
 * @param method - HTTP method of the route.
 * @param path - Route path.
 * @returns The compiled trigger registration.
 */
function trigger(id: string, method: string, path: string) {
  return {
    kind: "trigger",
    id,
    source: { file: "route.ts", line: 1, column: 1 },
    triggerType: "http",
    targetFunctionId: id,
    config: {
      method,
      path,
      rawHandler: true,
      request: {},
      responses: [],
      middleware: [],
      transforms: [],
    },
  } as RegistrationPlan["httpTriggers"][number];
}
