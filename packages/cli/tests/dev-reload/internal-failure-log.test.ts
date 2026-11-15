/**
 * A handler that throws answers 500 with a generic body, and the development terminal shows the
 * redacted cause once, right after the request line, with the request ID; the stack is shown only
 * with `--verbose`.
 */
import { afterAll, expect, test } from "bun:test";
import { createDevFixture, functionSource, startDev } from "./dev-reload.fixture.js";

const cause = "Failed query: select balance from ledger where owner = $1 params: owner-4242";
const fixture = createDevFixture();
fixture.write(
  "src/services/alpha/functions/a1.function.ts",
  functionSource("a1", "v0", `if (process.pid > 0) throw new Error(${JSON.stringify(cause)});`),
);
const dev = await startDev(fixture.root, false);

afterAll(async () => {
  await dev.stop();
  fixture.remove();
}, 60_000);

test(
  "prints the redacted cause of a 500 once, with its request ID",
  async () => {
    await dev.waitFor("/b1", "b1 v0");
    const response = await dev.request("/a1");
    const body = await response.text();
    const requestId = response.headers.get("x-request-id") ?? "";
    expect(response.status).toBe(500);
    expect(requestId).not.toBe("");
    expect(body).not.toContain("ledger");

    // The request line and the cause are written together; give the terminal time to receive both.
    const deadline = Date.now() + 10_000;
    while (!dev.output().includes("GET /a1 → 500") && Date.now() < deadline) await Bun.sleep(50);
    await Bun.sleep(500);
    const lines = dev.output().split("\n");
    const requestLine = lines.findIndex((line) => line.includes("GET /a1 → 500"));
    const causeLines = lines.filter((line) => line.includes("select balance from ledger"));
    expect(requestLine).toBeGreaterThanOrEqual(0);
    expect(causeLines).toHaveLength(1);
    expect(causeLines[0]).toContain("ERROR");
    expect(causeLines[0]).toContain(
      "Error: Failed query: select balance from ledger where owner = $1 params: [REDACTED]",
    );
    expect(dev.output()).not.toContain("owner-4242");
    expect(dev.output()).not.toContain("Execution operation failed");
    // The cause follows the request line and names the request; no stack without --verbose.
    const causeLine = lines.indexOf(causeLines[0]!);
    expect(causeLine).toBeGreaterThan(requestLine);
    const block = lines.slice(causeLine, causeLine + 4).join("\n");
    expect(block).toContain(`request: ${requestId}`);
    expect(block).not.toMatch(/^\s+at /m);
  },
  { timeout: 300_000 },
);
