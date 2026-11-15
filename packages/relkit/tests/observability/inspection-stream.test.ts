/** The inspection stream sends one revision per finished span and leaves out framework success logs. */
import { expect, test, vi } from "vitest";
import {
  createInspectionStream,
  isFrameworkSuccessLog,
} from "../../src/observability/inspection-stream.js";
import type { ObservabilityRecord } from "../../src/observability/index.js";

const at = "2026-11-15T00:00:00.000Z";
const span = (
  spanId: string,
  status: "started" | "updated" | "completed",
  revision: number,
): ObservabilityRecord => ({
  version: 2,
  signal: "span",
  traceId: "1".padStart(32, "0"),
  spanId,
  name: "POST /items",
  kind: "server",
  status,
  revision,
  startedAt: at,
});
const log = (message: string, outcome: string, level: "info" | "error" = "info") =>
  ({
    version: 2,
    signal: "log",
    timestamp: at,
    level,
    component: "http",
    message,
    fields: { domain: "http", operation: "route.handle", outcome },
  }) as const satisfies ObservabilityRecord;

test("a finished span is sent once, as its completed revision", () => {
  const sent: ObservabilityRecord[] = [];
  const stream = createInspectionStream((record) => sent.push(record));
  for (let revision = 0; revision < 20; revision++)
    stream.offer(span("a", revision === 0 ? "started" : "updated", revision));
  stream.offer(span("a", "completed", 20));
  stream.flush();
  expect(sent).toEqual([span("a", "completed", 20)]);
});

test("an unfinished span sends its latest revision after the delay", () => {
  vi.useFakeTimers();
  try {
    const sent: ObservabilityRecord[] = [];
    const stream = createInspectionStream((record) => sent.push(record), { spanDelayMs: 50 });
    stream.offer(span("a", "started", 0));
    stream.offer(span("a", "updated", 1));
    stream.offer(span("b", "started", 0));
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(sent).toEqual([span("a", "updated", 1), span("b", "started", 0)]);
  } finally {
    vi.useRealTimers();
  }
});

test("framework success logs stay out unless asked for; failures and other logs pass", () => {
  const success = log("Execution operation completed", "success");
  const failure = log("Execution operation failed", "failure", "error");
  const request = log("request.completed", "success");
  expect([success, failure, request].map(isFrameworkSuccessLog)).toEqual([true, false, false]);
  const sent: ObservabilityRecord[] = [];
  const stream = createInspectionStream((record) => sent.push(record));
  for (const record of [success, failure, request]) stream.offer(record);
  expect(sent).toEqual([failure, request]);
  expect(stream.withheld()).toBe(1);
  const all: ObservabilityRecord[] = [];
  const verbose = createInspectionStream((record) => all.push(record), {
    frameworkSuccessLogs: true,
  });
  verbose.offer(success);
  expect(all).toEqual([success]);
});
