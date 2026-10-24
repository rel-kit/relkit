/**
 * Exercises bridge access and mutation fences through real Request bodies and
 * generation changes. The forwarding seam returns application data; denied
 * requests must never reach it or disclose the session credential.
 */
import { expect, test } from "vitest";
import { Effect } from "effect";
import { createInspectionHandler } from "../src/connection/bridge-handler.js";
import type { InspectionDescriptor } from "../src/connection/protocol.types.js";

const descriptor: InspectionDescriptor = {
  protocol: 1,
  projectId: `sha256:${"a".repeat(64)}`,
  sessionId: "312b0cb1-81bb-4b99-81b7-5812a720782b",
  endpoint: "http://127.0.0.1:42100",
  process: { pid: 1, startedAt: "2026-10-23T00:00:00.000Z" },
  createdAt: "2026-10-23T00:00:00.000Z",
  token: "a".repeat(43),
};

/** Constructs server-side authenticated requests without credential URLs. */
function request(path: string, options: RequestInit = {}) {
  return new Request(`${descriptor.endpoint}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${descriptor.token}`,
      "x-relkit-project-id": descriptor.projectId,
      "x-relkit-session-id": descriptor.sessionId,
      ...Object.fromEntries(new Headers(options.headers)),
    },
  });
}

test.each([
  ["authorization", "", 401],
  ["authorization", "Bearer wrong", 401],
  ["origin", "http://foreign.invalid", 403],
  ["host", "foreign.invalid", 403],
  ["x-relkit-project-id", `sha256:${"b".repeat(64)}`, 409],
  ["x-relkit-session-id", "old-session", 409],
] as const)("rejects invalid %s before disclosure", async (header, value, status) => {
  const handler = createInspectionHandler(descriptor, {
    active: () => undefined,
    forward: () => Effect.die("must not forward"),
  });
  const response = await Effect.runPromise(
    handler(request("/v1/handshake", { headers: { [header]: value } })),
  );
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain(descriptor.token);
});

test("handshake proves live identity and reports agentless capabilities without SDK imports", async () => {
  const handler = createInspectionHandler(descriptor, {
    active: () => ({
      generationId: "generation-1",
      endpoint: "http://127.0.0.1:43000",
      capabilities: ["graph", "functions"],
    }),
    forward: () => Effect.die("must not forward"),
  });
  const response = await Effect.runPromise(handler(request("/v1/handshake")));
  expect(await response.json()).toEqual({
    protocol: 1,
    projectId: descriptor.projectId,
    sessionId: descriptor.sessionId,
    generationId: "generation-1",
    capabilities: ["graph", "functions"],
  });
});

test("stale controls fail and lost mutation responses are not retried", async () => {
  let generationId = "generation-1";
  let forwarded = 0;
  const handler = createInspectionHandler(descriptor, {
    active: () => ({ generationId, endpoint: "http://127.0.0.1:43000", capabilities: [] }),
    forward: () =>
      Effect.sync(() => {
        forwarded++;
        return Response.json({ accepted: true });
      }),
  });
  const options = {
    method: "POST",
    headers: { "content-type": "application/json", "x-relkit-generation-id": "generation-1" },
    body: '{"operationId":"one"}',
  };
  expect(
    (await Effect.runPromise(handler(request("/_relkit/v1/actions/functions/invoke", options))))
      .status,
  ).toBe(200);
  generationId = "generation-2";
  expect(
    (await Effect.runPromise(handler(request("/_relkit/v1/actions/functions/invoke", options))))
      .status,
  ).toBe(409);
  expect(forwarded).toBe(1);
});

test.each(["{", '"' + "x".repeat(1_048_576) + '"'])(
  "rejects malformed/oversized bodies without application mutation",
  async (body) => {
    const handler = createInspectionHandler(descriptor, {
      active: () => ({ generationId: "one", endpoint: "http://127.0.0.1:43000", capabilities: [] }),
      forward: () => Effect.die("must not forward"),
    });
    const response = await Effect.runPromise(
      handler(
        request("/_relkit/v1/actions/functions/invoke", {
          method: "POST",
          body,
          headers: { "content-type": "application/json", "x-relkit-generation-id": "one" },
        }),
      ),
    );
    expect([400, 413]).toContain(response.status);
  },
);

test("history and unknown private protocol paths are not forwarded", async () => {
  const handler = createInspectionHandler(descriptor, {
    active: () => undefined,
    forward: () => Effect.die("must not forward"),
  });
  for (const path of ["/_relkit/v1/logs", "/_relkit/v1/traces", "/v1/unknown", "//foreign.invalid"])
    expect((await Effect.runPromise(handler(request(path)))).status).toBe(404);
});

test("route console preserves application paths, text bodies and generation fences", async () => {
  let calls = 0;
  const handler = createInspectionHandler(descriptor, {
    active: () => ({ generationId: "one", endpoint: "http://127.0.0.1:43000", capabilities: [] }),
    forward: (_target, request) =>
      Effect.promise(async () => {
        calls++;
        expect(new URL(request.url).pathname).toBe("/orders");
        expect(request.headers.get("authorization")).toBe("Bearer app-user");
        expect(request.headers.get("x-relkit-inspector-session-token")).toBeNull();
        expect(await request.text()).toBe("order=one");
        return new Response("created", { status: 201 });
      }),
  });
  const options = {
    method: "POST",
    body: "order=one",
    headers: {
      "content-type": "text/plain",
      "x-relkit-generation-id": "one",
      "x-relkit-user-authorization": "Bearer app-user",
      "x-relkit-inspector-session-token": "browser-supplied-copy",
    },
  };
  expect((await Effect.runPromise(handler(request("/orders", options)))).status).toBe(201);
  expect(
    (
      await Effect.runPromise(
        handler(
          request("/orders", {
            ...options,
            headers: { ...options.headers, "x-relkit-generation-id": "old" },
          }),
        ),
      )
    ).status,
  ).toBe(409);
  expect(calls).toBe(1);
});

test("bridge credentials do not replace native user authorization or operation identity", async () => {
  const handler = createInspectionHandler(descriptor, {
    active: () => ({ generationId: "one", endpoint: "http://127.0.0.1:43000", capabilities: [] }),
    forward: (_target, request) =>
      Effect.sync(() => {
        expect(request.headers.get("authorization")).toBe("Bearer native-user-credential");
        expect(request.headers.get("cookie")).toBe("app-session=opaque");
        expect(request.headers.get("x-relkit-inspector-session-token")).toBe(descriptor.token);
        expect(request.headers.get("x-relkit-user-authorization")).toBeNull();
        expect(request.headers.get("idempotency-key")).toBe("original-operation");
        return Response.json({ authorized: true });
      }),
  });
  const response = await Effect.runPromise(
    handler(
      request("/_relkit/v1/actions/functions/one/invoke", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-relkit-generation-id": "one",
          "x-relkit-user-authorization": "Bearer native-user-credential",
          cookie: "app-session=opaque",
          "idempotency-key": "original-operation",
        },
        body: '{"generationId":"one"}',
      }),
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("x-relkit-generation-id")).toBe("one");
});
