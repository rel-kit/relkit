import { expect, test } from "bun:test";
import type { ObservabilityRecord } from "@relkit/observability";
import { collectionChange } from "../../packages/inspector/src/collector-changes";
import { signalEventTypes } from "../../apps/inspector/lib/signal-events";

test("committed background span revisions and trace records invalidate trace lists", () => {
  const span = {
    version: 2,
    signal: "span",
    spanId: "span",
    traceId: "trace",
    name: "background",
    kind: "internal",
    revision: 1,
    startedAt: "2026-10-23T00:00:00.000Z",
  } as const;
  const records: ObservabilityRecord[] = [
    { ...span, status: "started" },
    { ...span, status: "updated" },
    { ...span, status: "completed" },
    { version: 2, signal: "trace", traceId: "trace", startedAt: span.startedAt, spanCount: 1 },
  ];
  for (const record of records) {
    const type = collectionChange(record);
    expect(signalEventTypes("traces")).toContain(type);
    expect(signalEventTypes("logs")).not.toContain(type);
    expect(signalEventTypes("requests")).not.toContain(type);
  }
});
