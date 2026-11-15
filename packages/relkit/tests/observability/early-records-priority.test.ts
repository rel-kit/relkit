/** A full buffer gives up whole low-value records first and never the end of a kept request. */
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { EarlyRetention } from "../../src/observability/early-records.service.js";
import type { ObservabilityRecord } from "../../src/observability/index.js";

const at = "2026-11-15T00:00:00.000Z";
const log = (message: string, fields: Record<string, string> = {}): ObservabilityRecord => ({
  version: 2,
  signal: "log",
  timestamp: at,
  level: "info",
  component: "http",
  message,
  fields,
});
const frameworkLog = () =>
  log("Execution operation completed", {
    domain: "http",
    operation: "route.handle",
    outcome: "success",
  });
const span = (
  spanId: string,
  status: "started" | "updated" | "completed",
): ObservabilityRecord => ({
  version: 2,
  signal: "span",
  traceId: "1".padStart(32, "0"),
  spanId: spanId.repeat(16),
  name: "POST /items",
  kind: "server",
  status,
  revision: status === "completed" ? 2 : 0,
  startedAt: at,
  ...(status === "completed" ? { completedAt: at, durationMs: 1 } : {}),
});
const request = (requestId: string, phase: "started" | "completed"): ObservabilityRecord => ({
  version: 2,
  signal: "request",
  phase,
  requestId,
  traceId: "1".padStart(32, "0"),
  generationId: "generation-1",
  graphHash: "sha256:test",
  startedAt: at,
  method: "POST",
  rawPath: "/items",
  ...(phase === "completed"
    ? { completedAt: at, durationMs: 1, status: 201, outcome: "success" as const }
    : {}),
});

const kinds = (entries: readonly { readonly record: ObservabilityRecord }[]) =>
  entries.map(({ record }) =>
    record.signal === "request"
      ? `request:${record.phase}`
      : record.signal === "span"
        ? `span:${record.status}`
        : `log:${record.message}`,
  );

it.effect("gives up framework success logs, then other logs, then unfinished spans", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention.make({ maxRecords: 4 });
    yield* buffer.admit(request("r1", "started"));
    yield* buffer.admit(span("a", "started"));
    yield* buffer.admit(log("application line"));
    yield* buffer.admit(frameworkLog());
    yield* buffer.admit(request("r1", "completed"));
    expect(kinds(yield* buffer.snapshot())).toEqual([
      "request:started",
      "span:started",
      "log:application line",
      "request:completed",
    ]);
    yield* buffer.admit(span("a", "completed"));
    yield* buffer.admit(span("b", "updated"));
    expect(kinds(yield* buffer.snapshot())).toEqual([
      "request:started",
      "request:completed",
      "span:completed",
      "span:updated",
    ]);
    expect((yield* buffer.status()).droppedByKind).toEqual({
      frameworkLogs: 1,
      logs: 1,
      spans: 1,
      other: 0,
      requestStarts: 0,
      requestEnds: 0,
    });
  }),
);

it.effect("keeps a request's end over its start, so no kept start is left without its end", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention.make({ maxRecords: 3 });
    yield* buffer.admit(request("r1", "started"));
    yield* buffer.admit(request("r2", "started"));
    yield* buffer.admit(request("r1", "completed"));
    yield* buffer.admit(request("r2", "completed"));
    const kept = (yield* buffer.snapshot()).map(({ record }) =>
      record.signal === "request" ? `${record.requestId}:${record.phase}` : "",
    );
    expect(kept).toEqual(["r2:started", "r1:completed", "r2:completed"]);
    expect((yield* buffer.status()).droppedByKind).toMatchObject({
      requestStarts: 1,
      requestEnds: 0,
    });
  }),
);
