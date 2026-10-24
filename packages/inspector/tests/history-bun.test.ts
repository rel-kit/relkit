/** Exercises actual standalone native history, single-writer locking and restart preservation. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit, Scope } from "effect";
import { InspectorHistory } from "../src/history.service.js";
import { InspectorHistoryNativeLive } from "../src/history-native.service.js";

const projectId = `sha256:${"a".repeat(64)}`;
const entry = {
  key: "312b0cb1-81bb-4b99-81b7-5812a720782b:1",
  origin: "application" as const,
  record: {
    version: 2 as const,
    signal: "log" as const,
    timestamp: "2026-10-23T00:00:00.000Z",
    level: "info" as const,
    component: "app",
    message: "preserve",
    fields: {},
  },
};

test("lost-ACK replay deduplicates transactionally and restart preserves history", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-tool-history-"));
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
          Scope.close(scope, Exit.void),
        );
        const history = yield* InspectorHistory.make(root, projectId).pipe(Scope.provide(scope));
        yield* history.call({ type: "append", records: [entry] });
        yield* history.call({ type: "append", records: [entry] });
        const data = yield* history.call({ type: "query", kind: "logs", query: { limit: 10 } });
        expect(data).toMatchObject({ items: [{ message: "preserve" }] });
        expect(
          Exit.isFailure(yield* Effect.exit(Effect.scoped(InspectorHistory.make(root, projectId)))),
        ).toBe(true);
        yield* Scope.close(scope, Exit.void);
        yield* Effect.scoped(
          Effect.gen(function* () {
            const reopened = yield* InspectorHistory.make(root, projectId);
            expect(yield* reopened.call({ type: "query", kind: "logs", query: {} })).toMatchObject({
              items: [{ message: "preserve" }],
            });
          }),
        );
        expect(
          Exit.isFailure(
            yield* Effect.exit(
              Effect.scoped(InspectorHistory.make(root, `sha256:${"b".repeat(64)}`)),
            ),
          ),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(InspectorHistoryNativeLive)),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
