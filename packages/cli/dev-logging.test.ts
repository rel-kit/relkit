import { expect, test } from "bun:test";
import { captureOutputLines } from "@relkit/supervisor";
import { createDevLogger, devLogSinks } from "./src/commands/dev-logger";
import { formatDevLog } from "./src/commands/dev-log-format";
import { parseProjectArgs } from "./src/commands/project-args";
import type { LogRecord } from "@relkit/runtime-effect";
import { redactFailureDetail } from "@relkit/runtime-effect";
import type { DevLogEvent } from "./src/commands/dev";

test("dev JSON uses only the supplied stderr sink after redaction", () => {
  const lines: string[] = [];
  const log = createDevLogger({
    compile: async () => undefined,
    logger: devLogSinks(true, (line) => lines.push(line)),
  });
  log({ level: "info", event: "candidate.startup-output", fields: { output: "password=secret" } });
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toContain("\n");
  expect(JSON.parse(lines[0]!)).toMatchObject({ component: "app", message: "password=[REDACTED]" });
});

test("dev severity is presentation only; raw and structured child logs are distinct", () => {
  const stored: LogRecord[] = [];
  const json: LogRecord[] = [];
  const log = createDevLogger({
    compile: async () => undefined,
    logger: { minimumLevel: "info", human: false, json: { write: (value) => json.push(value) } },
    onRecord: (value) => stored.push(value),
  });
  log({ level: "info", event: "supervisor.transition", fields: { state: "switching" } });
  expect(json).toHaveLength(0);
  expect(stored[0]?.level).toBe("debug");
  log({ level: "info", event: "candidate.startup-output", fields: { output: "hello" } });
  expect(json[0]).toMatchObject({ component: "app", message: "hello" });
  const count = stored.length;
  log({
    level: "info",
    event: "candidate.startup-output",
    fields: {
      output:
        "\u001e" +
        JSON.stringify({
          version: 1,
          signal: "log",
          timestamp: new Date().toISOString(),
          level: "warn",
          component: "app.orders",
          message: "slow",
          fields: {},
        }),
    },
  });
  expect(stored).toHaveLength(count);
  expect(json.at(-1)?.message).toBe("slow");
  log({
    level: "info",
    event: "candidate.startup-output",
    fields: { output: JSON.stringify(json.at(-1)) },
  });
  expect(stored).toHaveLength(count + 1);
  expect(stored.at(-1)?.component).toBe("app");
});

test("truncated runtime presentation copies are never persisted a second time", async () => {
  const stored: LogRecord[] = [];
  const shown: LogRecord[] = [];
  const log = createDevLogger({
    compile: async () => undefined,
    logger: { human: false, json: { write: (record) => shown.push(record) } },
    onRecord: (record) => stored.push(record),
  });
  await captureOutputLines(
    new Response(`\u001e${JSON.stringify({ message: "x".repeat(100_000) })}\n`).body!,
    (output) => log({ level: "info", event: "candidate.startup-output", fields: { output } }),
  );
  expect(stored).toHaveLength(0);
  expect(shown[0]?.message).toContain("[output truncated]");
});

test("UTF-8, split secrets, final output, and oversized diagnostics remain continuously visible", async () => {
  const messages: LogRecord[] = [];
  const callbacks: DevLogEvent[] = [];
  const log = createDevLogger({
    compile: async () => undefined,
    logger: { human: false, json: { write: (value) => messages.push(value) } },
    onLog: (event) => callbacks.push(event),
  });
  const bytes = new TextEncoder().encode(
    `مرحبا password=split-secret\n${"x".repeat(100_000)}\nlast line`,
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    },
  });
  await captureOutputLines(stream, (output) =>
    log({ level: "info", event: "candidate.startup-output", fields: { output } }),
  );
  expect(messages[0]?.message).toContain("مرحبا");
  expect(messages[1]?.message).toContain("[output truncated]");
  expect(messages.at(-1)?.message).toBe("last line");
  expect(JSON.stringify([messages, callbacks])).not.toContain("split-secret");
  expect(messages.some((value) => value.message.includes("�"))).toBe(false);
  expect(Buffer.byteLength(messages[1]!.message)).toBeLessThanOrEqual(64 * 1024);
});

test("narrow formatting preserves complete URLs, errors, local milliseconds, and flags", () => {
  const record: LogRecord = {
    version: 1,
    signal: "log",
    timestamp: "2026-09-03T00:00:00.123Z",
    level: "info",
    component: "cli.dev",
    message: "dev.ready",
    fields: {
      backend: "http://127.0.0.1:3000",
      inspector: "http://127.0.0.1:3210",
      openapi: "http://127.0.0.1:3000/_relkit/v1/openapi.json",
    },
  };
  const output = formatDevLog(record, { columns: 50, color: false });
  expect(output).toMatch(/^\d{2}:\d{2}:\d{2}\.123 INFO/);
  expect(output).toContain(String(record.fields.openapi));
  expect(output).not.toContain("\x1b");
  const failure = formatDevLog(
    {
      ...record,
      level: "error",
      message: "dev.generation.failed",
      fields: { previousActive: true, message: "Compile failed" },
    },
    { columns: 120 },
  );
  expect(failure).toContain("previous version is still serving");
  expect(
    parseProjectArgs(["--verbose", "--log-level", "error", "--no-color"], "dev"),
  ).toMatchObject({ verbose: true, logLevel: "error", noColor: true });
  expect(() => parseProjectArgs(["--log-level", "info"], "build")).toThrow();
  const cause = new Error("password=hidden", { cause: new Error("Database unavailable") });
  expect(redactFailureDetail(cause)).not.toHaveProperty("cause");
  expect(redactFailureDetail(cause, undefined, 0, true)).toMatchObject({
    message: "password=[REDACTED]",
    cause: { message: "Database unavailable" },
  });
});
