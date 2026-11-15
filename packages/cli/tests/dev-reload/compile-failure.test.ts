/**
 * A save that does not parse is reported as a compile failure at once, naming the file, as one
 * error block; the previous version keeps serving, and a fix saved while the failure is still
 * pending, or right after it is reported, is live within the reload budget of its own save. A
 * module that throws at the top level is reported the same way, and a save whose only errors are
 * type errors still reloads.
 *
 * Bound: the published budget is 300 ms save-to-serving p95 for a 10-function application on
 * the CI runner. These tests run beside other work on a developer laptop, so they allow ten
 * times that, 3 s, which still fails the old behaviour: the failure surfaced only when the
 * evaluator's 10 s timeout expired, and a fix saved inside that window waited for it.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createDevFixture, functionSource, startDev } from "./dev-reload.fixture.js";
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

const broken = (revision: string) => `${functionSource("b1", revision)}\nconst broken: = ;\n`;
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

test(
  "reports a syntax error with its file within the budget, once, as an error",
  async () => {
    const before = await dev.waitFor("/b1", "b1 v0");
    const from = dev.output().length;
    fixture.write(file, broken("v1"));
    const reported = await failureReported(dev, from, 15_000);
    console.log(`syntax error reported after ${reported} ms`);
    expect(reported).toBeLessThan(BUDGET_MS);
    // Give a late duplicate report time to appear before counting.
    await Bun.sleep(1_500);
    const block = failureBlock(dev, from);
    expect(block).toMatch(/^\S+ ERROR build +Reload failed; previous version is still serving/u);
    // The parse error's own location and message, without the absolute path Bun's error names.
    const line = broken("v1").split("\n").indexOf("const broken: = ;") + 1;
    expect(block).toContain(
      `${file}:${line}:15 - error RELKIT_EVALUATOR_IMPORT_FAILED: Unexpected =`,
    );
    expect(block).toContain(`${line}:17 Unexpected ;`);
    expect(block).not.toContain(fixture.root);
    expect(block).not.toContain("errors building");
    expect(block).not.toContain("TIMEOUT");
    const after = dev.output().slice(from);
    expect(after.match(/Reload failed/gu)).toHaveLength(1);
    expect(after).not.toMatch(/ WARN +app /u);
    expect(await dev.get("/b1")).toEqual({ message: "b1 v0", pid: before.pid });
  },
  { timeout: 120_000 },
);

test(
  "serves a fix saved two seconds after the syntax error within the budget of that save",
  async () => {
    await settle(dev, fixture, "v2");
    fixture.write(file, broken("v3"));
    await Bun.sleep(2_000);
    fixture.write(file, functionSource("b1", "v4"));
    const live = await served(dev, "b1 v4", 30_000);
    console.log(`fix saved 2 s after the syntax error served after ${live} ms`);
    expect(live).toBeLessThan(BUDGET_MS);
  },
  { timeout: 120_000 },
);

test(
  "serves a fix saved right after the failure report within the budget of that save",
  async () => {
    await settle(dev, fixture, "v5");
    const from = dev.output().length;
    fixture.write(file, broken("v6"));
    expect(await failureReported(dev, from, 30_000)).toBeDefined();
    fixture.write(file, functionSource("b1", "v7"));
    const live = await served(dev, "b1 v7", 30_000);
    console.log(`fix saved after the report served after ${live} ms`);
    expect(live).toBeLessThan(BUDGET_MS);
  },
  { timeout: 120_000 },
);

test(
  "reports a module that throws at the top level with its message, and reloads its fix",
  async () => {
    await settle(dev, fixture, "v8");
    const from = dev.output().length;
    fixture.write(file, `${functionSource("b1", "v9")}\nthrow new Error("top-level failure");\n`);
    const reported = await failureReported(dev, from, 15_000);
    console.log(`top-level throw reported after ${reported} ms`);
    expect(reported).toBeLessThan(BUDGET_MS);
    expect(failureBlock(dev, from)).toContain(
      `${file}:1:1 - error RELKIT_EVALUATOR_IMPORT_FAILED: top-level failure`,
    );
    expect((await dev.get("/b1"))?.message).toBe("b1 v8");
    fixture.write(file, functionSource("b1", "v10"));
    expect(await served(dev, "b1 v10", BUDGET_MS)).toBeDefined();
  },
  { timeout: 120_000 },
);

test(
  "still reloads a save whose only errors are type errors",
  async () => {
    await settle(dev, fixture, "v11");
    fixture.write(file, `${functionSource("b1", "v12")}\nexport const wrong: number = "text";\n`);
    const live = await served(dev, "b1 v12", 30_000);
    console.log(`type-only error served after ${live} ms`);
    expect(live).toBeLessThan(BUDGET_MS);
  },
  { timeout: 120_000 },
);
