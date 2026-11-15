/**
 * 26.1: the tool refuses a change a page of another site asked for before anything is forwarded,
 * and forwards an accepted one as its own call: no browser `Origin`, `Referer`, `Sec-Fetch-*`,
 * proxy forwarding headers or cookies reach the application, for inspection actions and for
 * route requests from the composer alike.
 */
import { expect, test } from "vitest";
import { Effect, Ref } from "effect";
import type { InspectionConnectionFile } from "relkit/inspector-api/connection";
import { inspectorBackend } from "../src/tool-backend.js";
import { forwardBackend } from "../src/backend-forward.js";
import { crossSiteRefusal, inspectorCallHeaders } from "../src/browser-boundary.js";
import { acquireLiveEvents } from "../src/live-events.js";
import type { InspectorToolState } from "../src/tool-state.types.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";

const connection: InspectionConnectionFile = {
  path: "/private/connection.json",
  descriptor: {
    protocol: 1,
    projectId: `sha256:${"a".repeat(64)}`,
    sessionId: "312b0cb1-81bb-4b99-81b7-5812a720782b",
    endpoint: "http://127.0.0.1:43100",
    token: "a".repeat(43),
    createdAt: "2026-10-23T00:00:00.000Z",
    process: { pid: 1, startedAt: "2026-10-23T00:00:00.000Z" },
  },
};

const connected: InspectorToolState = {
  selection: {
    state: "connected",
    connection,
    rejected: 0,
    handshake: {
      protocol: 1,
      projectId: connection.descriptor.projectId,
      sessionId: connection.descriptor.sessionId,
      generationId: "one",
      capabilities: [],
    },
  },
  history: undefined,
  sessionId: undefined,
  through: 0,
  error: undefined,
  incomplete: false,
  droppedRecords: 0,
};

/** What a browser and the UI server's proxy hop add to a page's request. */
const browser = {
  "content-type": "application/json",
  "idempotency-key": "key-1",
  "x-relkit-generation-id": "one",
  authorization: "Bearer typed-by-the-developer",
  cookie: "better-auth.session_token=app-session; relkit_csrf=c",
  origin: "http://127.0.0.1:3210",
  referer: "http://127.0.0.1:3210/functions",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "x-forwarded-host": "127.0.0.1:3210",
  "x-forwarded-proto": "http",
  "x-forwarded-for": "127.0.0.1",
  forwarded: "host=127.0.0.1:3210",
  "x-relkit-inspector-token": "ui-private",
};

test("a change marked cross-site or same-site is refused; reads and own-origin changes are not", () => {
  const post = (site?: string) =>
    new Request("http://localhost/_relkit/v1/actions/functions/a/invoke", {
      method: "POST",
      headers: site === undefined ? {} : { "sec-fetch-site": site },
    });
  expect(crossSiteRefusal(post("cross-site"))?.status).toBe(403);
  expect(crossSiteRefusal(post("Same-Site"))?.status).toBe(403);
  expect(crossSiteRefusal(post("same-origin"))).toBeUndefined();
  expect(crossSiteRefusal(post("none"))).toBeUndefined();
  expect(crossSiteRefusal(post())).toBeUndefined();
  expect(
    crossSiteRefusal(
      new Request("http://localhost/_relkit/v1/graph", {
        headers: { "sec-fetch-site": "cross-site" },
      }),
    ),
  ).toBeUndefined();
});

test("the Inspector's call carries no browser provenance, forwarding header or cookie", () => {
  const headers = inspectorCallHeaders(new Headers(browser));
  expect([...headers.keys()].sort()).toEqual([
    "authorization",
    "content-type",
    "idempotency-key",
    "x-relkit-generation-id",
  ]);
});

for (const path of ["/_relkit/v1/actions/functions/billing.example/invoke", "/example"])
  test(`${path} is forwarded once as the Inspector's call; a cross-site change never is`, async () => {
    const forwarded: Headers[] = [];
    const remote: InspectorRemoteOperations = {
      request: (_connection, received, options) =>
        Effect.sync(() => {
          expect(received).toBe(path);
          forwarded.push(new Headers(options?.headers));
          return Response.json({ value: "ok" });
        }),
      json: () => Effect.die("must not decode"),
    };
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const handler = inspectorBackend(
            yield* Ref.make(connected),
            remote,
            "ui-private",
            { hostname: "127.0.0.1", port: 3210 },
            yield* acquireLiveEvents,
          );
          const { origin: _origin, referer: _referer, ...proxied } = browser;
          const send = (headers: Record<string, string>) =>
            handler(
              new Request(`http://localhost${path}`, { method: "POST", headers, body: "{}" }),
            );
          const refused = yield* send({ ...proxied, "sec-fetch-site": "cross-site" });
          expect(refused.status).toBe(403);
          expect(yield* Effect.promise(() => refused.json())).toMatchObject({
            error: "request.cross-site",
          });
          expect(forwarded).toHaveLength(0);
          expect((yield* send(proxied)).status).toBe(200);
        }),
      ),
    );
    expect(forwarded).toHaveLength(1);
    for (const name of ["origin", "referer", "cookie", "sec-fetch-site", "x-forwarded-host"])
      expect(forwarded[0]!.has(name), name).toBe(false);
    expect(forwarded[0]!.get("authorization")).toBe("Bearer typed-by-the-developer");
  });

test("forwardBackend alone strips the same headers", async () => {
  let seen: Headers | undefined;
  const remote: InspectorRemoteOperations = {
    request: (_connection, _path, options) =>
      Effect.sync(() => {
        seen = new Headers(options?.headers);
        return new Response(null, { status: 204 });
      }),
    json: () => Effect.die("must not decode"),
  };
  const request = new Request("http://localhost/example", { method: "POST", headers: browser });
  expect((await Effect.runPromise(forwardBackend(remote, connection, request))).status).toBe(204);
  expect(seen?.has("cookie")).toBe(false);
  expect(seen?.has("origin")).toBe(false);
  expect(seen?.has("sec-fetch-mode")).toBe(false);
});
