/** A function's access rule answers HTTP callers with 401 or 403 Problem Details. */
import { expect, test } from "vitest";
import { Hono } from "hono";
import { defineFunction } from "../../src/app/index.js";
import {
  invokeFunction,
  sessionPrincipalSource,
  type InvocationTarget,
} from "../../src/engine/index.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { z } from "../../src/schema/index.js";
import { createHttpAuthRuntime } from "../../src/runtime-hono/auth.ts";
import { materializeRoutes, type RuntimeManifest } from "../../src/runtime-hono/materialize-routes";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/routes/admin/route.ts", line: 1, column: 1 } as const;
const stats = defineFunction({
  id: "admin.stats",
  input: z.object({}),
  output: z.object({ orders: z.number() }),
  access: { roles: ["admin"] },
  handler: async () => ({ orders: 3 }),
});

function app(session: unknown) {
  const auth = createHttpAuthRuntime({
    getSession: async () => session,
    resolveAccess: async (value) => ({
      roles: (value as { readonly roles: readonly string[] }).roles,
      hasPermission: () => false,
    }),
  });
  const app = new Hono();
  materializeRoutes(app, {
    plan: {
      graphHash: "sha256:access",
      functions: [],
      httpTriggers: [
        {
          kind: "trigger",
          id: "admin.stats",
          source,
          triggerType: "http",
          targetFunctionId: "admin.stats",
          config: {
            method: "GET",
            path: "/admin/stats",
            request: { kind: "input", fields: {} },
            responses: [{ kind: "success", id: "ok", status: 200 }],
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
    } as unknown as RegistrationPlan,
    manifest: {
      ...runtimeCohort("sha256:access"),
      functions: {},
      middleware: {},
      requestTransforms: {},
      routes: {},
    } satisfies RuntimeManifest,
    auth,
    engine: {
      // What the generated server does: the caller is the request's memoized session.
      invoke: async (options) =>
        invokeFunction(stats as unknown as InvocationTarget, options.input, {
          source: "http",
          principal: sessionPrincipalSource(
            async () => (await options.auth?.getSession()) ?? null,
            auth.resolveAccess,
          ),
        }),
    },
  });
  return app;
}

test("a caller with the role gets the function's result", async () => {
  const response = await app({ roles: ["admin"] }).request("/admin/stats");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ orders: 3 });
});

test("a signed-in caller without the role gets 403 access-denied", async () => {
  const response = await app({ roles: ["member"] }).request("/admin/stats");
  expect(response.status).toBe(403);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  expect(await response.json()).toMatchObject({ status: 403, code: "access-denied" });
});

test("a signed-out caller gets 401 unauthenticated", async () => {
  const response = await app(null).request("/admin/stats");
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ status: 401, code: "unauthenticated" });
});
