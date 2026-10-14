/** Exercises real guardrail child termination and fixture release through native Bun assertions, including timeout and failed callbacks. */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execute, withFixture, withTemporary } from "../phase0-harness.js";

test("guardrail fixtures release after native assertion failure", async () => {
  let observedRoot = "";
  await expect(
    withFixture({ "probe.txt": "original" }, async (root) => {
      observedRoot = root;
      expect(await readFile(join(root, "probe.txt"), "utf8")).toBe("original");
      throw new Error("injected native assertion failure");
    }),
  ).rejects.toThrow("injected native assertion failure");
  expect(observedRoot).not.toBe("");
  expect(existsSync(observedRoot)).toBe(false);
});

test("guardrail command timeout joins the actual child before root release", async () => {
  let observedRoot = "";
  await withTemporary("relkit-phase0-timeout-", async (root) => {
    observedRoot = root;
    const marker = join(root, "pid.txt");
    const script =
      "await Bun.write(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);";
    await expect(execute(process.execPath, ["-e", script, marker], root, 500)).rejects.toThrow();
    const pid = Number(await readFile(marker, "utf8"));
    expect(Number.isSafeInteger(pid)).toBe(true);
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow();
  });
  expect(existsSync(observedRoot)).toBe(false);
});
