import { Effect } from "effect";
import { expect, test } from "bun:test";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";
import {
  createOutputReport,
  createPreviewReport,
  createUpdateReport,
  formatPulumiSummary,
  serializePulumiReport,
  toPulumiEffectLog,
  toPulumiLog,
} from "./src/events.ts";
import type { EngineEvent } from "@pulumi/pulumi/automation";

const secret = "pulumi-event-synthetic-secret";
const diagnostic: EngineEvent = {
  sequence: 1,
  timestamp: 1_700_000_000,
  diagnosticEvent: { message: `password=${secret}`, color: "", severity: "error" },
};
const summary: EngineEvent = {
  sequence: 2,
  timestamp: 1_700_000_001,
  summaryEvent: {
    maybeCorrupt: false,
    durationSeconds: 3,
    resourceChanges: { create: 1, same: 2 },
    policyPacks: {},
  },
};

test("maps Pulumi events to redacted Effect logs and deterministic reports", async () => {
  const records: LogRecord[] = [];
  await Effect.runPromise(
    toPulumiEffectLog(diagnostic).pipe(
      Effect.provide(
        createLoggerLayer({
          minimumLevel: "trace",
          human: { write: (_line, record) => records.push(record) },
          json: false,
        }),
      ),
    ),
  );

  expect(records[0]?.message).toBe(`password=[REDACTED]`);
  expect(JSON.stringify(records)).not.toContain(secret);
  expect(toPulumiLog(summary)?.fields).toMatchObject({ pulumiEvent: "summary" });

  const preview = createPreviewReport({ changeSummary: { create: 1, same: 2 } }, [
    summary,
    diagnostic,
  ]);
  expect(formatPulumiSummary(preview.summary)).toBe(
    "Pulumi preview: create=1 update=0 delete=0 replace=0 same=2 diagnostics=1e/0w/0i",
  );
  expect(preview.logs.map((log) => log.sequence)).toEqual([1, 2]);
  expect(
    createPreviewReport({ changeSummary: { create: 1, same: 2 } }, [diagnostic, summary]),
  ).toEqual(preview);
});

test("marks secret outputs and never serializes their plaintext", () => {
  const outputs = {
    endpoint: { value: "https://example.test", secret: false },
    password: { value: secret, secret: true },
  };
  const outputReport = createOutputReport(outputs);
  expect(outputReport.outputs).toEqual({
    endpoint: { secret: false, value: "https://example.test" },
    password: { secret: true },
  });
  expect(serializePulumiReport(outputReport)).not.toContain(secret);

  const update = createUpdateReport(
    { summary: { resourceChanges: { update: 1 }, result: "succeeded" }, outputs } as never,
    [summary],
  );
  expect(update.outputs.password).toEqual({ secret: true });
  expect(update.summary.result).toBe("succeeded");
  expect(serializePulumiReport(update)).toContain('"result":"succeeded"');
  expect(serializePulumiReport(update)).not.toContain(secret);
});
