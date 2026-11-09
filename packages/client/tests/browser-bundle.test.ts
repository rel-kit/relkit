import { expect, test } from "bun:test";
import { analyzeBrowserBundle } from "../scripts/browser-bundle.ts";

test("the browser entries bundle without any Effect module", async () => {
  const report = await analyzeBrowserBundle();
  expect(report.effectImports).toEqual([]);
  expect(report.modules).toBeGreaterThan(0);
}, 60_000);
