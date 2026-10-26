/** Verifies redacted native dev presentation and independent production Inspector defaults. */

import { expect, test } from "bun:test";

import { type DevOptions } from "./src/commands/dev.js";
import { createDevLogger } from "./src/commands/dev-logger.js";

import { options } from "../../tests/fixtures/cli/dev-fixture.js";
import { registerDevCleanup } from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test("redacts candidate output before callbacks and human sinks", () => {
  const secret = "super-secret-password";
  const callbacks: Parameters<NonNullable<DevOptions["onLog"]>>[0][] = [];
  const output: string[] = [];
  const log = createDevLogger({
    compile: async () => {
      throw new Error("unused");
    },
    logger: { human: { write: (line) => output.push(line) }, json: false },
    onLog: (event) => callbacks.push(event),
  });

  log({
    level: "info",
    event: "candidate.startup-output",
    fields: { stream: "stdout", output: `backend ready password=${secret}` },
  });

  expect(output).toHaveLength(1);
  expect(output[0]).toMatch(/INFO\s+app\s+backend ready password=\[REDACTED\]/);
  expect(JSON.stringify({ callbacks, output })).not.toContain(secret);
});

test("hides internal child operations while retaining request logs, evidence and verbose diagnostics", () => {
  for (const verbose of [false, true]) {
    const output: string[] = [];
    let recordCount = 0;
    const log = createDevLogger({
      compile: async () => {
        throw new Error("unused");
      },
      terminal: { verbose },
      logger: {
        human: { write: (line) => output.push(line) },
        collector: {
          collect: () => {
            recordCount++;
          },
        },
      },
    });
    for (const message of [
      "Execution operation completed",
      "GET /hello → 200",
      "Database startup failed",
    ]) {
      log({
        level: "info",
        event: "candidate.startup-output",
        fields: {
          output:
            "\u001e" +
            JSON.stringify({
              version: 2,
              signal: "log",
              timestamp: new Date().toISOString(),
              level: "info",
              component: "runtime.lifecycle",
              message,
              fields: { domain: "runtime", operation: "server.readiness" },
            }),
        },
      });
    }
    expect(recordCount).toBe(3);
    expect(output.some((line) => line.includes("Execution operation completed"))).toBe(verbose);
    expect(output.some((line) => line.includes("GET /hello"))).toBe(true);
    expect(output.some((line) => line.includes("Database startup failed"))).toBe(true);
  }
});

test("reports the private bridge separately from the standalone UI", () => {
  const events: Parameters<NonNullable<DevOptions["onLog"]>>[0][] = [];
  const log = createDevLogger({
    compile: async () => {
      throw new Error("unused");
    },
    onLog: (event) => events.push(event),
  });
  log({
    level: "info",
    event: "dev.inspector.ready",
    fields: { bridge: "http://127.0.0.1:43100" },
  });
  expect(events[0]?.fields).toEqual({ bridge: "http://127.0.0.1:43100" });
});

test("keeps inspector disconnect output out of normal shutdown while retaining cleanup failures", () => {
  const output: string[] = [];
  const log = createDevLogger({
    compile: async () => {
      throw new Error("unused");
    },
    logger: { human: { write: (line) => output.push(line) } },
  });
  log({ level: "info", event: "dev.shutdown.started" });
  log({
    level: "warn",
    event: "inspector.output",
    fields: { output: "fetch failed ECONNREFUSED" },
  });
  log({
    level: "error",
    event: "dev.local-services.cleanup-failed",
    fields: { message: "cleanup timed out" },
  });
  expect(output.some((line) => line.includes("ECONNREFUSED"))).toBe(false);
  expect(output.some((line) => line.includes("cleanup timed out"))).toBe(true);
});
