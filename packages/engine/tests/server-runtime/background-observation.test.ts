/** Verifies engine-owned generation lifetime, preserving the existing lifecycle contract. */
import { expect, it } from "@effect/vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { type RedactedLogRecord } from "@relkit/runtime-effect";
import { acquireObservedQueue, checkObservedWorker } from "./background-observation-fixture.js";
import { createServerRuntimeHost } from "../../src/server-runtime/server-runtime-host.js";

it.live(
  "background native SDK callbacks retain metrics, errors and user logs after async nesting",
  () =>
    Effect.promise(async () => {
      const root = await mkdtemp(join(tmpdir(), "relkit-background-observation-"));
      const records: RedactedLogRecord[] = [];
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
        const queue = await acquireObservedQueue(host, root);
        for (let index = 0; index < 5; index++) expect(host.snapshot().stopping).toBe(false);
        await checkObservedWorker(host, queue);
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
