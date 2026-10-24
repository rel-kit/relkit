/** Native development jobs keep their existing admin policy independently of rich inspection. */
import { expect, test } from "bun:test";
import { Hono } from "hono";
import { disposeInspectorEndpoints, installJobsAdministrationEndpoints } from "../src/index.ts";
import type { InspectorJobsPrivilegeRequest } from "../src/jobs/types.js";

test("jobs-only registration preserves admin bearer, native authorization and operation identity", async () => {
  const { app, observed } = nativeJobsFixture();
  try {
    for (const token of [undefined, "wrong", "private-inspector-session"])
      expect(
        (
          await app.request("/_relkit/v1/jobs/services", {
            headers: token ? { authorization: `Bearer ${token}` } : {},
          })
        ).status,
      ).toBe(401);
    expect(observed).toHaveLength(0);
    expect(
      (
        await app.request("/_relkit/v1/jobs/services", {
          headers: { authorization: "Bearer native-admin" },
        })
      ).status,
    ).toBe(200);
    const response = await app.request("/_relkit/v1/jobs/runs/one/retry?service=jobs", {
      method: "POST",
      headers: {
        authorization: "Bearer native-admin",
        "x-relkit-operation-id": "same-operation",
        cookie: "session=original",
      },
    });
    expect(response.status).toBe(403);
    expect(observed).toHaveLength(2);
    expect(observed[1]!.request.headers.get("x-relkit-operation-id")).toBe("same-operation");
    expect(observed[1]!.request.headers.get("cookie")).toBe("session=original");
    for (const path of [
      "/_relkit/v1/runtime",
      "/_relkit/v1/actions/functions/hello/invoke",
      "/_relkit/v1/logs",
    ])
      expect(
        (await app.request(path, { headers: { authorization: "Bearer native-admin" } })).status,
      ).toBe(404);
  } finally {
    await disposeInspectorEndpoints(app);
  }
});

/** Installs one native provider authority while the test owns its disposer. */
function nativeJobsFixture() {
  const app = new Hono();
  const observed: InspectorJobsPrivilegeRequest[] = [];
  installJobsAdministrationEndpoints(app, {
    mode: "development",
    bearerToken: "native-admin",
    activeGeneration: {
      generationId: "jobs-one",
      graphHash: "sha256:jobs",
      graph: { nodes: [], edges: [] },
      jobs: {
        bindings: [],
        authorize: (request) => {
          observed.push(request);
          return request.operation === "read";
        },
      },
    },
  });
  return { app, observed };
}

test("jobs-only administration is absent in production", async () => {
  const app = new Hono();
  installJobsAdministrationEndpoints(app, { mode: "production" });
  try {
    expect((await app.request("/_relkit/v1/jobs/services")).status).toBe(404);
  } finally {
    await disposeInspectorEndpoints(app);
  }
});
