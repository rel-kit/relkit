/**
 * The generated development server holds a request's error record until the request line is
 * printed, so the two appear together. An error logged for that request after it completed must
 * be printed at once: nothing would release it later.
 */
import { expect, test } from "bun:test";
import { SERVER_RUNTIME_SUPPORT_SOURCE } from "../../src/commands/build-server-runtime-support.js";

interface LogRecord {
  readonly signal: string;
  readonly level: string;
  readonly requestId?: string;
  readonly message: string;
}

/** Evaluates the holding functions of the generated source against a recording writer. */
function holding(printed: string[]) {
  const start = SERVER_RUNTIME_SUPPORT_SOURCE.indexOf("const heldHttpLogs");
  const end = SERVER_RUNTIME_SUPPORT_SOURCE.indexOf("function healthResponse");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const build = new Function(
    "writeRuntimeLog",
    "process",
    `${SERVER_RUNTIME_SUPPORT_SOURCE.slice(start, end)}\nreturn { writeHttpLog, releaseHttpLogs };`,
  );
  return build((record: LogRecord) => printed.push(record.message), {
    env: { RELKIT_DEV_LOGS: "1" },
  }) as {
    readonly writeHttpLog: (record: LogRecord) => void;
    readonly releaseHttpLogs: (requestId: string) => void;
  };
}

const error = (requestId: string, message: string): LogRecord => ({
  signal: "log",
  level: "error",
  requestId,
  message,
});

test("an error is held until its request completes", () => {
  const printed: string[] = [];
  const logs = holding(printed);
  logs.writeHttpLog(error("request-1", "failed query"));
  expect(printed).toEqual([]);
  logs.releaseHttpLogs("request-1");
  expect(printed).toEqual(["failed query"]);
});

test("an error logged after its request completed is printed at once", () => {
  const printed: string[] = [];
  const logs = holding(printed);
  logs.releaseHttpLogs("request-2");
  logs.writeHttpLog(error("request-2", "background work failed"));
  expect(printed).toEqual(["background work failed"]);
});
