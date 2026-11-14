/** Verifies request-log severity and the request line layout of the development terminal log. */
import { expect, test } from "bun:test";
import type { LogRecord } from "relkit/runtime-effect";
import { formatDevLog } from "../../src/commands/dev-log-format.js";
import { HTTP_LOG_LEVEL_SOURCE } from "../../src/commands/build-server-http.js";

const request = (path: string, status = 200): LogRecord => ({
  version: 2,
  signal: "log",
  timestamp: new Date().toISOString(),
  level: "info",
  component: "runtime.http",
  message: "request.completed",
  fields: { method: "GET", path, status, durationMs: 98 },
});

test("a long request path keeps the status and duration on the request line", () => {
  const path = `/fleet/drivers/${"d".repeat(40)}/vehicles/${"v".repeat(40)}/assignments`;
  for (const columns of [60, 80, 100]) {
    const [first, ...rest] = formatDevLog(request(path), { columns }).split("\n");
    expect(first).toContain(`GET ${path} → 200 in 98ms`);
    expect(rest).toEqual([]);
  }
});

test("a long scope name is never cut in the middle", () => {
  const record: LogRecord = {
    ...request("/"),
    component: "service.drivers-vehicle-assignments",
    message: "assignment.created",
    fields: {},
  };
  for (const columns of [60, 100]) {
    const line = formatDevLog(record, { columns });
    expect(line).toContain("service.drivers-vehicle-assignments");
    expect(line).not.toContain("…");
  }
});

test("a recorded exception prints its cause and request, and its stack only with --verbose", () => {
  const record: LogRecord = {
    version: 2,
    signal: "log",
    timestamp: new Date().toISOString(),
    level: "error",
    component: "http",
    message: "Error: Failed query: select 1 params: [REDACTED]",
    requestId: "request-1",
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    fields: {
      "exception.type": "Error",
      "exception.message": "Failed query: select 1 params: [REDACTED]",
      "exception.stacktrace":
        "Error: Failed query: select 1 params: [REDACTED]\n    at handler (src/a1.function.ts:8:36)",
      "relkit.error.code": "RELKIT_UNEXPECTED_DEFECT",
      "relkit.error.kind": "defect",
    },
  };
  const quiet = formatDevLog(record, { columns: 200 }).split("\n");
  expect(quiet[0]).toContain("ERROR http");
  expect(quiet[0]).toContain("Error: Failed query: select 1 params: [REDACTED]");
  expect(quiet.slice(1).map((line) => line.trim())).toEqual([
    "request: request-1",
    "trace: 4bf92f3577b34da6a3ce929d0e0e4736",
  ]);
  const verbose = formatDevLog(record, { columns: 200, verbose: true });
  expect(verbose).toContain("at handler (src/a1.function.ts:8:36)");
  expect(verbose).toContain("request: request-1");
  expect(verbose.split("Failed query")).toHaveLength(2);
});

test("client errors log at info except authentication, authorization and rate limits", () => {
  const level = new Function(`${HTTP_LOG_LEVEL_SOURCE}\nreturn httpLogLevel;`)() as (event: {
    type: string;
    status: number;
  }) => string;
  const completed = (status: number) => level({ type: "request.completed", status });
  expect(completed(200)).toBe("info");
  for (const status of [400, 404, 405, 409, 413, 422]) expect(completed(status)).toBe("info");
  for (const status of [401, 403, 429]) expect(completed(status)).toBe("warn");
  expect(completed(500)).toBe("error");
  expect(completed(503)).toBe("error");
  expect(level({ type: "request.cancelled", status: 499 })).toBe("debug");
});
