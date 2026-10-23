/** Verifies the legacy development CLI explicitly acquires the concrete local store. */
import { expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { CliTelemetryNative } from "../src/commands/dev-telemetry-native.service.js";

test("legacy_cli_explicit_store", async () => {
  const root = await mkdtemp("/tmp/relkit-cli-store-owner-");
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const native = yield* CliTelemetryNative.make;
          const worker = yield* Effect.acquireRelease(
            native.worker(() => undefined),
            (value) => native.closeWorker(value),
          );
          yield* worker.call({ type: "open", root });
          yield* worker.call({
            type: "append",
            records: [
              {
                key: "legacy-cli:1",
                origin: "relkit",
                record: {
                  version: 2,
                  signal: "log",
                  timestamp: new Date().toISOString(),
                  level: "info",
                  component: "cli",
                  message: "explicit native store",
                  fields: {},
                },
              },
            ],
          });
          expect(yield* worker.call({ type: "query", kind: "logs", query: {} })).toMatchObject({
            items: [{ message: "explicit native store" }],
          });
        }),
      ),
    );
    expect(existsSync(join(root, "observability.duckdb"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
