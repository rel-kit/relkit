/** Runs actual generated middleware, direct/nested function and tool subject authorization against both source layouts. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { GeneratedHost, generatedHostLayer } from "./generated-host.service.js";
import { createProtectedUser, requestProtectedSubject } from "./generated-protection-user.js";
import { verifyProtectedRealtime } from "./generated-protection-realtime.js";
import { verifyProtectedAgents } from "./generated-protection-agents.js";

for (const grouped of [false, true]) {
  test(
    `native subject authorization preserves ${grouped ? "grouped" : "flat"} user and tenant denial`,
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* GeneratedHost;
          const host = yield* service.startProtected(grouped);
          const alice = yield* createProtectedUser(host, "Alice", "tenant-a.test");
          const bob = yield* createProtectedUser(host, "Bob", "tenant-a.test");
          const carol = yield* createProtectedUser(host, "Carol", "tenant-b.test");
          for (const path of ["read", "directRead", "toolRead"]) {
            expect((yield* requestProtectedSubject(host, path, undefined, alice)).status).toBe(401);
            expect(yield* requestProtectedSubject(host, path, alice, alice)).toEqual({
              status: 200,
              body: '{"allowed":true}',
            });
            expect((yield* requestProtectedSubject(host, path, bob, alice)).status).toBe(403);
            expect((yield* requestProtectedSubject(host, path, carol, alice)).status).toBe(403);
            expect(
              (yield* requestProtectedSubject(host, path, alice, {
                ...alice,
                tenant: "tenant-b.test",
              })).status,
            ).toBe(403);
          }
          expect((yield* requestProtectedSubject(host, "stream", undefined, alice)).status).toBe(
            401,
          );
          const completed = yield* requestProtectedSubject(host, "stream", alice, alice);
          expect(completed).toMatchObject({ status: 200 });
          expect(completed.body.match(/^event: relkit-item$/gm)).toHaveLength(2);
          expect(completed.body).toContain('event: relkit-complete\ndata: {"ok":true}');
          expect(completed.body).toContain('"phase":"complete"');
          yield* verifyProtectedAgents(host, alice, [bob, carol]);
          yield* verifyProtectedRealtime(host, alice, bob);
          expect((yield* host.stop).exitCode).toBe(0);
        }).pipe(Effect.provide(generatedHostLayer)),
      ),
    90_000,
  );
}
