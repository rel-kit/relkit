/** Verifies configured host operation diagnostics and preservation of native Promise failure identity across owned partial-startup cleanup. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createServerRuntimeHost } from "../../src/server-runtime/server-runtime-host.js";
import type { RedactedLogRecord } from "@relkit/runtime-effect";

it.live("standalone operations use the configured structured logger and annotations", () =>
  Effect.promise(async () => {
    const records: RedactedLogRecord[] = [];
    const host = await createServerRuntimeHost({
      report: () => {},
      annotations: { generationId: "generation.test" },
      logger: {
        component: "runtime.lifecycle",
        minimumLevel: "debug",
        human: {
          write: (_line, record) => {
            records.push(record);
          },
        },
        json: false,
      },
    });
    await host.resource(
      "provider",
      async () => 1,
      () => {},
    );
    await host.shutdown(async () => {});
    expect(records.some((record) => record.fields.operation === "server.resource")).toBe(true);
    expect(records.some((record) => record.fields.operation === "server.shutdown")).toBe(true);
    expect(records.every((record) => record.generationId === "generation.test")).toBe(true);
  }),
);

it.live("Promise edge preserves original failure identity and closes partial startup", () =>
  Effect.promise(async () => {
    const host = await createServerRuntimeHost({ report: () => {} });
    const original = new Error("native failure");
    let released = 0;
    try {
      await expect(
        host.resource(
          "provider",
          async () => 1,
          () => {
            released++;
          },
          () => {
            throw original;
          },
        ),
      ).rejects.toBe(original);
      expect(released).toBe(1);
      expect(host.snapshot().primaryFailures[0]?.cause).toBe(original);
    } finally {
      await host.shutdown(async () => {});
    }
  }),
);
