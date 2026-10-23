/** Registers the retained runtime-integration-plan scenarios in their original order with cohesive case fixtures. */
import { describe, test } from "bun:test";
import { case1Selection } from "./runtime-integration-plan.selection.cases.js";
import { case2Provenance, case5Provenance } from "./runtime-integration-plan.provenance.cases.js";
import { case3Generation, case4Generation } from "./runtime-integration-plan.generation.cases.js";
describe("runtime integration plan", () => {
  test("emits only graph-required runtimes in stable registration order", case1Selection);
  test("resolves only explicitly installed standalone integration provenance", case2Provenance);
  test("rejects mismatched identities and duplicate runtime registrations", case3Generation);
  test(
    "generates one deterministic literal import per selected package export after preflight",
    case4Generation,
  );
  test("rejects authored runtime paths and package-root escapes", case5Provenance);
});
