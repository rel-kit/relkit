import { expect, test } from "vitest";
import { Hono, type Context } from "hono";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { createHttpAuthRuntime } from "../../src/runtime-hono/auth.ts";
import { materializeRoutes, type RuntimeManifest } from "../../src/runtime-hono/materialize-routes";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/routes/account/route.ts", line: 1, column: 1 } as const;

test("auth sessions are lazy, header-bound, and memoized per request", async () => {
  let calls = 0;
  const runtime = createHttpAuthRuntime({
    getSession: async (headers) => ({ token: headers.get("authorization"), call: ++calls }),
  });
  const request = new Request("http://localhost/public", {
    headers: { authorization: "Bearer original" },
  });
  const context = runtime.contextFor(request);
  expect(calls).toBe(0);
  request.headers.set("authorization", "Bearer changed");
  const [first, second] = await Promise.all([context.getSession(), context.getSession()]);
  expect(first).toEqual({ token: "Bearer original", call: 1 });
  expect(second).toBe(first);
  expect(calls).toBe(1);
});

function route(id: string, path: string, auth?: "required") {
  return {
    kind: "trigger" as const,
    id,
    source,
    triggerType: "http" as const,
    targetFunctionId: id,
    config: {
      method: "GET",
      path,
      request: { kind: "input", fields: {} },
      responses: [{ kind: "success", id: "ok", status: 200 }],
      middleware: [],
      transforms: [],
      ...(auth === undefined ? {} : { auth: { kind: auth } }),
    },
  };
}

/** One app with a protected route, a public route, path middleware and a Better Auth mount. */
function app(session: unknown, calls: string[]) {
  let lookups = 0;
  const auth = createHttpAuthRuntime({ getSession: async () => (lookups++, session) });
  const app = new Hono();
  materializeRoutes(app, {
    plan: {
      graphHash: "sha256:auth",
      functions: [],
      httpTriggers: [
        route("account", "/account", "required"),
        route("public", "/public"),
        {
          ...route("auth", "/api/auth/*"),
          config: { ...route("auth", "/api/auth/*").config, method: "ALL", rawHandler: true },
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
      middlewares: [{ kind: "middleware", id: "trace", source, path: "*", order: 0 }],
    } as unknown as RegistrationPlan,
    manifest: {
      ...runtimeCohort("sha256:auth"),
      functions: {},
      middleware: {
        trace: {
          path: "*",
          handler: async (context: Context, next: () => Promise<void>) => {
            calls.push(`middleware:${String(await auth.contextFor(context.req.raw).getSession())}`);
            await next();
          },
        },
      },
      requestTransforms: {},
      routes: { auth: { handler: () => new Response("auth endpoint") } },
    } satisfies RuntimeManifest,
    auth,
    engine: {
      invoke: async ({ functionId, auth: invocation }) => {
        calls.push(`${functionId}:${String(await invocation?.getSession())}`);
        return { ok: true };
      },
    },
  });
  return { app, lookups: () => lookups };
}

test("a signed-out request to a protected route is a 401 before middleware and the target", async () => {
  const calls: string[] = [];
  const signedOut = app(null, calls);
  const response = await signedOut.app.request("/account");
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: "unauthenticated" });
  expect(calls).toEqual([]);
  expect((await signedOut.app.request("/public")).status).toBe(200);
});

test("a signed-in request shares one session lookup across middleware and the function", async () => {
  const calls: string[] = [];
  const signedIn = app("user-1", calls);
  expect((await signedIn.app.request("/account")).status).toBe(200);
  expect(calls).toEqual(["middleware:user-1", "account:user-1"]);
  expect(signedIn.lookups()).toBe(1);
});

test("Better Auth endpoints never require a session", async () => {
  const calls: string[] = [];
  const signedOut = app(null, calls);
  const response = await signedOut.app.request("/api/auth/sign-in/email");
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("auth endpoint");
});
