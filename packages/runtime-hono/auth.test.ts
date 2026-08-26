import { expect, test } from "bun:test";
import { Hono } from "hono";
import { createHttpAuthRuntime, registerAuthMiddleware } from "./src/auth.ts";

test("auth sessions are lazy, header-bound, and memoized per request", async () => {
  let calls = 0;
  const runtime = createHttpAuthRuntime({
    protected: ["/account/*"],
    publicPaths: ["/api/auth/*auth?", "/api/auth/:auth{.+}"],
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

test("auth middleware protects matched paths but keeps the Better Auth catch-all public", async () => {
  let calls = 0;
  const runtime = createHttpAuthRuntime({
    protected: ["/*"],
    publicPaths: ["/api/auth/*auth?", "/api/auth/:auth{.+}"],
    getSession: async () => (++calls, null),
  });
  const app = new Hono();
  registerAuthMiddleware(app, runtime);
  app.all("*", (context) => context.text("ok"));

  expect((await app.request("/api/auth")).status).toBe(200);
  expect((await app.request("/api/auth/sign-in/email")).status).toBe(200);
  expect(calls).toBe(0);
  const protectedResponse = await app.request("/account/profile");
  expect(protectedResponse.status).toBe(401);
  expect(await protectedResponse.json()).toEqual({
    error: { id: "UNAUTHORIZED", message: "Authentication required" },
  });
  expect(calls).toBe(1);
});
