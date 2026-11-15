/** Authentication and input-free access rules are decided before input validation is reported. */
import { expect, test } from "vitest";
import { Hono } from "hono";
import { defineFunction } from "../../src/app/index.js";
import type { AccessRule } from "../../src/contracts/index.js";
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

const source = { file: "src/routes/fleet/route.ts", line: 1, column: 1 } as const;

function target(access: AccessRule<{ plate: string }, unknown>) {
  return defineFunction({
    id: "fleet.register",
    input: z.object({ plate: z.string() }),
    output: z.object({ plate: z.string() }),
    access,
    handler: async (input) => ({ plate: input.plate }),
  });
}

function app(session: unknown, access: AccessRule<{ plate: string }, unknown>) {
  const register = target(access);
  const auth = createHttpAuthRuntime({
    getSession: async () => session,
    resolveAccess: async (value) => ({
      roles: (value as { readonly roles: readonly string[] }).roles,
      hasPermission: () => false,
    }),
  });
  const app = new Hono();
  materializeRoutes(app, {
    plan: plan(),
    manifest: {
      ...runtimeCohort("sha256:access-order"),
      functions: {},
      middleware: {},
      requestTransforms: {},
      routes: {},
      targets: { "fleet.register": register },
    } satisfies RuntimeManifest,
    auth,
    engine: {
      invoke: async (options) =>
        invokeFunction(register as unknown as InvocationTarget, options.input, {
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

/** Posts a body that misses the required `plate` field. */
async function postInvalid(session: unknown, access: AccessRule<{ plate: string }, unknown>) {
  const response = await app(session, access).request("/fleet/vehicles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  return { response, text: await response.text() };
}

test("an anonymous caller with an invalid body gets 401 naming no field", async () => {
  const { response, text } = await postInvalid(null, { roles: ["dispatcher"] });
  expect(response.status).toBe(401);
  expect(JSON.parse(text)).toMatchObject({ code: "unauthenticated" });
  expect(text).not.toContain("plate");
});

test("a signed-in caller without the permission gets 403 naming no field", async () => {
  const { response, text } = await postInvalid(
    { roles: ["dispatcher"] },
    { permissions: ["fleet:write"] },
  );
  expect(response.status).toBe(403);
  expect(JSON.parse(text)).toMatchObject({ code: "access-denied" });
  expect(text).not.toContain("plate");
});

test("a caller with the role still gets the validation error", async () => {
  const { response } = await postInvalid({ roles: ["dispatcher"] }, { roles: ["dispatcher"] });
  expect(response.status).toBe(422);
});

test("a rule that reads input runs after validation", async () => {
  const access: AccessRule<{ plate: string }, unknown> = {
    allow: ({ input }) => input.plate !== "BLOCKED",
  };
  const invalid = await postInvalid(null, access);
  expect(invalid.response.status).toBe(422);

  const blocked = await app(null, access).request("/fleet/vehicles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plate: "BLOCKED" }),
  });
  expect(blocked.status).toBe(401);
});

function plan(): RegistrationPlan {
  return {
    graphHash: "sha256:access-order",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "fleet.register",
        source,
        triggerType: "http",
        targetFunctionId: "fleet.register",
        config: {
          method: "POST",
          path: "/fleet/vehicles",
          request: { kind: "input", fields: { plate: { kind: "body", name: "plate" } } },
          responses: [{ kind: "success", id: "ok", status: 201 }],
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
  } as unknown as RegistrationPlan;
}
