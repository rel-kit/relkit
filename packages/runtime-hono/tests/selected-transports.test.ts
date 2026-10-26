/** Verifies optional SDK selection follows the same exposure policy as installed docs routes. */
import { expect, test } from "vitest";
import { selectedHttpCapabilities } from "../src/selected-transports.js";

test.each([
  [{ ui: "scalar", enabled: false }, []],
  [{ ui: "scalar" }, ["scalar"]],
  [{ ui: "scalar", mode: "test", enabled: false }, []],
  [{ ui: "scalar", mode: "production" }, []],
  [{ ui: "scalar", mode: "production", enabledInProduction: false }, []],
  [{ ui: "scalar", mode: "production", enabledInProduction: true }, ["scalar"]],
  [{ ui: false, enabledInProduction: true, mode: "production" }, []],
] as const)("docs selection %j requires %j", (apiDocs, expected) => {
  expect(selectedHttpCapabilities({ apiDocs })).toEqual(expected);
});
