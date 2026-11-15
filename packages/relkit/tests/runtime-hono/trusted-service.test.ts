/**
 * A state-changing request is a trusted service call only when nothing on it says a browser sent
 * it: no `Origin`, no `Referer` and no `Sec-Fetch-Site` other than `none` or `same-origin`.
 * Anything else answers to the origin rules, whatever the application's `trustedService` says.
 */
import { expect, test } from "vitest";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { createApp } from "../../src/runtime-hono/index.ts";
import { runtimeCohort } from "./test-cohort.ts";

const url = "https://app.example/write";

/** The same callback the generated server passes in development: any request without `Origin`. */
const trustedService = (request: Request) => request.headers.get("origin") === null;

function app() {
  const plan = rawPlan();
  return createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
      routes: { "write.raw": { handler: () => Response.json({ ok: true }) } },
    },
    engine: { invoke: async () => undefined },
    transportSecurity: {
      allowedOrigins: ["https://admin.example"],
      trustedService,
      validateCsrf: (_request, token) => token === "valid",
    },
  });
}

async function post(headers: Record<string, string> = {}): Promise<number> {
  return (await app().request(url, { method: "POST", headers })).status;
}

test("a request without browser headers stays a trusted service call", async () => {
  expect(await post()).toBe(200);
  expect(await post({ authorization: "Bearer service-token", "user-agent": "curl/8" })).toBe(200);
  expect(await post({ "sec-fetch-site": "none" })).toBe(200);
  expect(await post({ "sec-fetch-site": "same-origin" })).toBe(200);
});

test("a foreign Referer without Origin is not a service call", async () => {
  expect(await post({ referer: "https://evil.example/page" })).toBe(403);
  expect(await post({ referer: "not a url" })).toBe(403);
});

test("a same-origin Referer without Origin is admitted by the origin rules", async () => {
  expect(await post({ referer: "https://app.example/page?x=1" })).toBe(200);
});

test("an admitted foreign Referer still needs the CSRF token", async () => {
  const referer = "https://admin.example/page";
  expect(await post({ referer })).toBe(403);
  expect(await post({ referer, "x-relkit-csrf": "invalid" })).toBe(403);
  expect(await post({ referer, "x-relkit-csrf": "valid" })).toBe(200);
});

test("a cross-site or same-site fetch is not a service call", async () => {
  expect(await post({ "sec-fetch-site": "cross-site" })).toBe(403);
  expect(await post({ "sec-fetch-site": "same-site" })).toBe(403);
  expect(await post({ "sec-fetch-site": "cross-site", cookie: "relkit_visitor=1" })).toBe(403);
});

test("an Origin keeps answering to the origin rules", async () => {
  expect(await post({ origin: "https://evil.example" })).toBe(403);
  expect(await post({ origin: "https://app.example" })).toBe(200);
});

function rawPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:trusted-service",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "write.raw",
        source: { file: "route.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "write.raw",
        config: {
          method: "POST",
          path: "/write",
          rawHandler: true,
          request: {},
          responses: [],
          middleware: [],
          transforms: [],
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
  };
}
