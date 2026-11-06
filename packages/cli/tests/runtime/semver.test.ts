/** Covers the portable range check `relkit doctor` uses on Bun and Node, against Bun's own. */
import { expect, test } from "bun:test";
import { satisfiesRange } from "../../src/runtime/semver.ts";

const cases: readonly (readonly [string, string])[] = [
  ["1.3.10", ">=1.3.10"],
  ["1.3.9", ">=1.3.10"],
  ["5.9.3", "5.9.3"],
  ["5.9.4", "^5.9.3"],
  ["6.0.0", "^5.9.3"],
  ["0.8.9", "^0.8.8"],
  ["0.9.0", "^0.8.8"],
  ["0.0.4", "^0.0.3"],
  ["1.0.0-rc.5-169397b", "1.0.0-rc.5-169397b"],
  ["1.0.0-rc.6", "^1.0.0-rc.5"],
  ["1.0.0-rc.5", "^0.9"],
  ["1.2.3", "*"],
  ["1.2.3", "1.x"],
  ["2.0.0", "1.x || 2"],
  ["1.2.4", "~1.2.3"],
  ["1.3.0", "~1.2.3"],
  ["22.13.0", ">=22.13.0"],
  ["1.2.3", ">1.0.0 <2.0.0"],
  ["2.0.0", ">1.0.0 <2.0.0"],
];

test.each(cases)("%s against %s agrees with Bun.semver", (version, range) => {
  expect(satisfiesRange(version, range)).toBe(Bun.semver.satisfies(version, range));
});

test("rejects a malformed version", () => {
  expect(() => satisfiesRange("not-a-version", "*")).toThrow("Invalid version");
});
