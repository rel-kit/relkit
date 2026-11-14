/**
 * A new generation whose process exits while it starts is reported at once as one error block
 * holding what the process wrote (the error and its file and line), not after the 10 s health
 * timeout, and the previous version keeps serving. The modules here throw only when the
 * `RELKIT_GENERATION_TOKEN` variable of a served generation is set, so the check accepts the save
 * and the failure happens where it did in the audit: a function change the serving process
 * cannot load, which falls back to a new process, and a configuration change, which always
 * starts one. A fix saved two seconds after the broken save is live within the budget of its
 * own save. The bound is the one of compile-failure.test.ts.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { configSource, createDevFixture, functionSource, startDev } from "./dev-reload.fixture.js";
import type { DevProcess } from "./dev-reload.fixture.types.js";
import {
  BUDGET_MS,
  FUNCTION_FILE as file,
  failureBlock,
  failureReported,
  served,
  settle,
  typeCheckSettled,
} from "./failure-timing.js";

const throwsWhenServed = (message: string) =>
  `\nif (process.env.RELKIT_GENERATION_TOKEN !== undefined) throw new Error("${message}");\n`;
const fixture = createDevFixture();
let dev: DevProcess;

beforeAll(async () => {
  dev = await startDev(fixture.root, false);
  await dev.waitFor("/b1", "b1 v0");
  await typeCheckSettled(dev);
}, 180_000);

afterAll(async () => {
  await dev.stop();
  fixture.remove();
}, 60_000);

/**
 * Saves a file, waits for the failure report, and checks its timing and presentation.
 * @param path - Project file.
 * @param text - Contents that make the new process exit.
 * @param location - `file:line` the block must name.
 * @returns Milliseconds until the failure was reported.
 */
async function expectExitReported(path: string, text: string, location: string) {
  const before = await dev.get("/b1");
  const from = dev.output().length;
  fixture.write(path, text);
  const reported = await failureReported(dev, from, 15_000);
  expect(reported).toBeLessThan(BUDGET_MS);
  await Bun.sleep(1_000);
  const block = failureBlock(dev, from);
  expect(block).toMatch(/^\S+ ERROR build +Reload failed; previous version is still serving/u);
  expect(block).toContain("The new version exited with code 1 before it was ready.");
  expect(block).toContain(location);
  expect(block).not.toContain("TIMEOUT");
  const after = dev.output().slice(from);
  expect(after.match(/Reload failed/gu)).toHaveLength(1);
  expect(after).not.toMatch(/ WARN +app /u);
  expect(await dev.get("/b1")).toEqual(before);
  return reported;
}

test(
  "reports a function module that throws in the new process within the budget",
  async () => {
    await settle(dev, fixture, "v1");
    const text = `${functionSource("b1", "v2")}${throwsWhenServed("function failure")}`;
    const reported = await expectExitReported(file, text, `${file}:13:`);
    console.log(`function exit reported after ${reported} ms`);
    fixture.write(file, functionSource("b1", "v3"));
    expect(await served(dev, "b1 v3", BUDGET_MS)).toBeDefined();
  },
  { timeout: 120_000 },
);

test(
  "serves a fix saved two seconds after the broken save within the budget of that save",
  async () => {
    await settle(dev, fixture, "v4");
    fixture.write(file, `${functionSource("b1", "v5")}${throwsWhenServed("function failure")}`);
    await Bun.sleep(2_000);
    fixture.write(file, functionSource("b1", "v6"));
    const live = await served(dev, "b1 v6", 30_000);
    console.log(`fix saved 2 s after the broken save served after ${live} ms`);
    expect(live).toBeLessThan(BUDGET_MS);
  },
  { timeout: 120_000 },
);

test(
  "reports a configuration that throws in the new process within the budget",
  async () => {
    await settle(dev, fixture, "v7");
    const config = "relkit.config.ts";
    const text = `${configSource(1_048_576)}${throwsWhenServed("configuration failure")}`;
    const reported = await expectExitReported(config, text, `${config}:6:`);
    console.log(`configuration exit reported after ${reported} ms`);
    const from = dev.output().length;
    fixture.write(config, configSource(2_097_152));
    const deadline = Date.now() + 30_000;
    while (!dev.output().slice(from).includes("Reloaded") && Date.now() < deadline)
      await Bun.sleep(50);
    expect(dev.output().slice(from)).toContain("Reloaded");
  },
  { timeout: 120_000 },
);
