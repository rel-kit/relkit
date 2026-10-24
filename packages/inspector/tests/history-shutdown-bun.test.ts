/** Proves a frozen diagnostic worker cannot extend standalone shutdown past its flush budget. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { startLocalWorkerEffect } from "@relkit/observability-local/worker";
import { connectionAttempt } from "@relkit/inspector-api/connection";

test("shutdown discloses incomplete flush and reaps a frozen owned worker within five seconds", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        connectionAttempt("test.root", () => mkdtemp(join(tmpdir(), "relkit-history-shutdown-"))),
        (root) =>
          connectionAttempt("test.root-remove", () =>
            rm(root, { recursive: true, force: true }),
          ).pipe(Effect.orDie),
      );
      const worker = yield* Effect.acquireRelease(startLocalWorkerEffect(), (worker) =>
        worker.close().pipe(Effect.ignore),
      );
      yield* worker.call({ type: "open", root });
      expect(worker.pid).toBeDefined();
      const pid = worker.pid!;
      process.kill(pid, "SIGSTOP");
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          setTimeout(() => {
            try {
              process.kill(pid, "SIGCONT");
            } catch {
              /* Owned child already reaped. */
            }
          }, 8000),
        ),
        (timer) => Effect.sync(() => clearTimeout(timer)),
      );
      const started = performance.now();
      const result = yield* Effect.exit(worker.close());
      expect(performance.now() - started).toBeLessThan(5000);
      expect(Exit.isFailure(result)).toBe(true);
      expect(() => process.kill(pid, 0)).toThrow();
    }).pipe(Effect.scoped),
  );
}, 15_000);
