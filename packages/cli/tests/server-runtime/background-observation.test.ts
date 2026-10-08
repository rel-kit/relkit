import { expect, it } from "@effect/vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Metric } from "effect";
import { createJobQueue, createJobStore } from "@relkit/providers-local";
import { currentNativeEffectContext, type RedactedLogRecord } from "@relkit/runtime-effect";
import { ExecutionSuccessLogs } from "@relkit/contracts/operation";
import { createServerRuntimeHost } from "../../src/server-runtime/server-runtime-host.js";

it.live(
  "background native SDK callbacks retain metrics, errors and user logs after async nesting",
  () =>
    Effect.promise(async () => {
      const root = await mkdtemp(join(tmpdir(), "relkit-background-observation-"));
      const records: RedactedLogRecord[] = [];
      const complete = Promise.withResolvers<void>();
      const host = await createServerRuntimeHost({
        report: () => {},
        logger: {
          minimumLevel: "all",
          human: {
            write: (_line, record) => {
              records.push(record);
            },
          },
          json: false,
        },
      });
      try {
        const queue = await host.resource(
          "provider",
          async () => {
            await Promise.resolve();
            const context = currentNativeEffectContext();
            if (context === undefined) throw new Error("Acquisition lost its native context.");
            expect(Context.get(context, ExecutionSuccessLogs)).toBe(false);
            const store = await createJobStore(root);
            return { store, queue: createJobQueue(store) };
          },
          ({ store }) => store.close(),
          undefined,
          "application",
          false,
        );
        for (let index = 0; index < 5; index++) expect(host.snapshot().stopping).toBe(false);
        await host.worker("job-worker", async () => {
          try {
            await Promise.resolve();
            const context = currentNativeEffectContext();
            if (context === undefined) throw new Error("Worker lost its native context.");
            expect(Context.get(context, ExecutionSuccessLogs)).toBe(false);
            await host.each(["absent"], async (id) => {
              await Promise.resolve();
              expect(queue.queue.get(id)).toBeUndefined();
            });
            expect(() => queue.queue.get("")).toThrow();
            await Effect.runPromiseWith(context)(Effect.logInfo("application worker message"));
            const registry = Context.get(context, Metric.MetricRegistry);
            expect(
              [...registry.values()].some(
                (entry) =>
                  entry.id === "relkit_execution_outcomes_total" &&
                  entry.attributes?.operation === "JobQueue.get" &&
                  entry.attributes?.outcome === "success",
              ),
            ).toBe(true);
            expect(
              [...registry.values()].some(
                (entry) =>
                  entry.id === "relkit_execution_outcomes_total" &&
                  entry.attributes?.operation === "server.snapshot" &&
                  entry.attributes?.outcome === "success",
              ),
            ).toBe(true);
            complete.resolve();
          } catch (failure) {
            complete.reject(failure);
            throw failure;
          }
        });
        await complete.promise;
      } finally {
        await host.shutdown(async () => {});
        await rm(root, { recursive: true, force: true });
      }
      expect(records.some((record) => record.message === "application worker message")).toBe(true);
      expect(
        records.some(
          (record) => record.level === "error" && record.fields.operation === "JobQueue.get",
        ),
      ).toBe(true);
      expect(
        records.some(
          (record) =>
            record.message === "Execution operation completed" &&
            ["JobQueue.get", "server.batch", "server.snapshot"].includes(
              String(record.fields.operation),
            ),
        ),
      ).toBe(false);
    }),
);
