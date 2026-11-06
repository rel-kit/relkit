/**
 * A save that does not evaluate keeps the previous handlers serving and reports the error
 * with its source location; fixing the file reloads normally.
 */
import { afterAll, expect, test } from "bun:test";
import { createDevFixture, functionSource, startDev } from "./dev-reload.fixture.js";

const fixture = createDevFixture();
const dev = await startDev(fixture.root);

afterAll(async () => {
  await dev.stop();
  fixture.remove();
}, 60_000);

test(
  "keeps serving the last good handlers after a syntax error",
  async () => {
    const before = await dev.waitFor("/b1", "b1 v0");
    // The location comes from the type-check watch. Save only after its first pass: a fast
    // compiler (TypeScript 7) can finish that pass on the old file and not report a save made
    // while it ran.
    const watched = Date.now() + 60_000;
    while (!/ types +(No type errors|\d+ type errors?)/u.test(dev.output()) && Date.now() < watched)
      await Bun.sleep(100);
    const file = "src/services/beta/functions/b1.function.ts";
    fixture.write(
      file,
      functionSource("b1", "v1").replace("handler: async () => {", "handler: async () => {{"),
    );
    const deadline = Date.now() + 240_000;
    while (!dev.output().includes("Reload failed") && Date.now() < deadline) await Bun.sleep(200);
    expect(dev.output()).toContain("Reload failed; previous version is still serving");
    expect(dev.output()).toMatch(/b1\.function\.ts:\d+:\d+/u);
    const served = await dev.get("/b1");
    expect(served).toEqual({ message: "b1 v0", pid: before.pid });
    fixture.write(file, functionSource("b1", "v2"));
    expect((await dev.waitFor("/b1", "b1 v2")).pid).toBe(before.pid);
  },
  { timeout: 300_000 },
);
