/**
 * Type-checking runs beside the dev server: a save that introduces a type error but still
 * evaluates is served at once, and the error arrives afterwards as a `dev.typecheck.failed`
 * log record with its location. The watch-output parser is covered separately.
 */
import { afterAll, expect, test } from "bun:test";
import { parseTypecheckLine } from "../../src/dev-reload/typecheck-output.js";
import { createDevFixture, functionSource, startDev } from "./dev-reload.fixture.js";

test("parses diagnostics and pass boundaries of tsc --watch output", () => {
  expect(
    parseTypecheckLine(
      "/app/src/a.ts(3,7): error TS2322: Type 'string' is not assignable.",
      "/app",
    ),
  ).toEqual({
    kind: "diagnostic",
    diagnostic: {
      file: "src/a.ts",
      line: 3,
      column: 7,
      code: "TS2322",
      message: "Type 'string' is not assignable.",
    },
  });
  expect(
    parseTypecheckLine("12:00:01 AM - Found 2 errors. Watching for file changes.", "/app"),
  ).toEqual({
    kind: "finished",
    errors: 2,
  });
  expect(
    parseTypecheckLine(
      "[12:00:00] - File change detected. Starting incremental compilation...",
      "/app",
    ).kind,
  ).toBe("started");
  expect(parseTypecheckLine("  continuation", "/app").kind).toBe("other");
});

const fixture = createDevFixture();
const dev = await startDev(fixture.root);

afterAll(async () => {
  await dev.stop();
  fixture.remove();
}, 60_000);

test(
  "a type error does not block a reload",
  async () => {
    await dev.waitFor("/a2", "a2 v0");
    const typeError = 'const wrong: number = "not a number"; void wrong;';
    fixture.write(
      "src/services/alpha/functions/a2.function.ts",
      functionSource("a2", "v1", typeError),
    );
    await dev.waitFor("/a2", "a2 v1");
    const deadline = Date.now() + 240_000;
    while (!dev.output().includes("dev.typecheck.failed") && Date.now() < deadline)
      await Bun.sleep(200);
    expect(dev.output()).toContain("src/services/alpha/functions/a2.function.ts:");
    expect(dev.output()).toContain("TS2322");
  },
  { timeout: 300_000 },
);
