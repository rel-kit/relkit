/** Native corruption, permission denial and worker death preserve data and independent app responses. */
import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { InspectorHistory } from "../src/history.service.js";
import {
  InspectorHistoryNative,
  InspectorHistoryNativeLive,
} from "../src/history-native.service.js";

const projectId = `sha256:${"a".repeat(64)}`;
const entry = {
  key: "session:1",
  origin: "application" as const,
  record: {
    version: 2 as const,
    signal: "log" as const,
    timestamp: new Date().toISOString(),
    level: "info" as const,
    component: "app",
    message: "committed-before-crash",
    fields: {},
  },
};

test.each(["corrupt", "readonly"] as const)(
  "%s history fails without rewriting existing bytes",
  async (fault) => {
    const root = await mkdtemp(join(tmpdir(), "relkit-history-fault-"));
    const path = join(root, "observability.duckdb");
    const original = "existing database bytes must survive a failed open";
    const app = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("business-result"),
    });
    try {
      await writeFile(path, original);
      if (fault === "readonly") await chmod(root, 0o500);
      const exit = await Effect.runPromise(
        Effect.exit(
          Effect.scoped(InspectorHistory.make(root, projectId)).pipe(
            Effect.provide(InspectorHistoryNativeLive),
          ),
        ),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(await readFile(path, "utf8")).toBe(original);
      expect(await (await fetch(`http://127.0.0.1:${app.port}`)).text()).toBe("business-result");
    } finally {
      await app.stop(true);
      await chmod(root, 0o700);
      await rm(root, { recursive: true, force: true });
    }
  },
  20_000,
);

test("a crashed writer fails pending work and reopens its committed WAL without deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-history-crash-"));
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const native = yield* InspectorHistoryNative;
          const worker = yield* native.acquire(root, projectId);
          yield* worker.call({ type: "append", records: [entry] });
          expect(worker.pid).toBeDefined();
          process.kill(worker.pid!, "SIGKILL");
          const started = performance.now();
          expect(Exit.isFailure(yield* Effect.exit(worker.call({ type: "flush" })))).toBe(true);
          expect(performance.now() - started).toBeLessThan(5000);
        }),
      ).pipe(Effect.provide(InspectorHistoryNativeLive)),
    );
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const history = yield* InspectorHistory.make(root, projectId);
          expect(yield* history.call({ type: "query", kind: "logs", query: {} })).toMatchObject({
            items: [{ message: "committed-before-crash" }],
          });
        }),
      ).pipe(Effect.provide(InspectorHistoryNativeLive)),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
