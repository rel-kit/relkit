/** Exercises the unchanged archived destination guard and both native transport branches using exclusively owned listeners. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  archivedProbe,
  probeDirectory,
  projectRecordedProbe,
  readProbeResult,
  runProbe,
  serveProbe,
} from "./origin-probe-fixture.js";
import type { OriginProbeRequest } from "./origin-probe.types.js";

test("origin evidence probe rejects unapproved destinations before making requests", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let requests = 0;
        const server = yield* serveProbe(() => {
          requests++;
          return Response.json({ graph: { nodes: [{ id: "hello.greet" }] } });
        });
        const evidence = yield* probeDirectory();
        yield* Effect.forEach(
          [
            server.url.origin,
            undefined,
            "http://example.com",
            "http://127.0.0.1:3000@evil.example",
            "http://127.0.0.1:3000.evil.example",
            "http://127.0.0.1:3000/redirect",
            "http://127.0.0.1:3000?target=evil.example",
            "http://127.0.0.1:3000#evil.example",
            "https://127.0.0.1:3000",
          ],
          (base) =>
            Effect.scoped(
              Effect.gen(function* () {
                const result = yield* runProbe(archivedProbe, base, evidence);
                expect(result.exitCode).not.toBe(0);
                expect(result.stderr).toContain(
                  "RELKIT_ORIGIN_PROBE_URL must select a recorded local origin",
                );
              }),
            ),
          { concurrency: 1, discard: true },
        );
        expect(requests).toBe(0);
      }),
    ),
  ));

test("origin evidence probe preserves both recorded branches at owned HTTP and WebSocket origins", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const evidence = yield* probeDirectory();
        yield* Effect.forEach(
          [
            [3000, "hello.greet"],
            [3330, "hello.hello"],
          ] as const,
          ([port, functionId]) =>
            Effect.scoped(
              Effect.gen(function* () {
                const requests: OriginProbeRequest[] = [];
                const server = yield* serveProbe((request) => {
                  const path = new URL(request.url).pathname;
                  requests.push({
                    path,
                    method: request.method,
                    origin: request.headers.get("origin"),
                  });
                  if (path === "/_relkit/v1/graph")
                    return Response.json({
                      graph: { nodes: [{ id: functionId }] },
                      generationId: "test-generation",
                      graphHash: "test-hash",
                    });
                  return Response.json({ error: { id: "ORIGIN_DENIED" } }, { status: 403 });
                });
                const script = yield* projectRecordedProbe(evidence, port, server.port);
                const result = yield* runProbe(script, server.url.origin, evidence);
                expect(result.stderr).toBe("");
                expect(result.exitCode).toBe(0);
                expect(requests).toEqual([
                  { path: "/_relkit/v1/graph", method: "GET", origin: null },
                  {
                    path: `/_relkit/v1/actions/functions/${functionId}/invoke`,
                    method: "POST",
                    origin: "https://foreign.example",
                  },
                  { path: "/rpc", method: "GET", origin: "https://foreign.example" },
                ]);
                const saved = yield* readProbeResult(evidence);
                expect(saved.base).toBe(server.url.origin);
                expect(saved.http).toEqual({ status: 403, id: "ORIGIN_DENIED" });
                expect(saved.websocket.opened).toBe(false);
              }),
            ),
          { concurrency: 1, discard: true },
        );
      }),
    ),
  ));

test("origin evidence probe never follows HTTP or WebSocket redirects", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let redirectedRequests = 0;
        const target = yield* serveProbe(() => {
          redirectedRequests++;
          return Response.json({ graph: { nodes: [] }, error: { id: "ORIGIN_DENIED" } });
        });
        const evidence = yield* probeDirectory();
        yield* Effect.forEach(
          ["graph", "invocation", "websocket"],
          (redirectFrom) =>
            Effect.scoped(
              Effect.gen(function* () {
                const server = yield* serveProbe((request) => {
                  const path = new URL(request.url).pathname;
                  if (redirectFrom !== "graph" && path === "/_relkit/v1/graph")
                    return Response.json({ graph: { nodes: [] } });
                  if (redirectFrom === "websocket" && path !== "/rpc")
                    return Response.json({ error: { id: "ORIGIN_DENIED" } }, { status: 403 });
                  return Response.redirect(target.url.href, 307);
                });
                const script = yield* projectRecordedProbe(evidence, 3330, server.port);
                const result = yield* runProbe(script, server.url.origin, evidence);
                if (redirectFrom === "websocket") expect(result.exitCode).toBe(0);
                else expect(result.exitCode).not.toBe(0);
                expect(redirectedRequests).toBe(0);
              }),
            ),
          { concurrency: 1, discard: true },
        );
      }),
    ),
  ));
