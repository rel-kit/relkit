/** Registers the retained project-discovery scenarios in their original order with cohesive case fixtures. */
import { describe, test } from "bun:test";
import { case1Whitespace } from "./project-discovery.whitespace.cases.js";
import { case2Metadata } from "./project-discovery.metadata.cases.js";
import { case3Provisioning } from "./project-discovery.provisioning.cases.js";
import { case4Edits } from "./project-discovery.edits.cases.js";
describe("scaffold project discovery", () => {
  test("appends exports while preserving leading and internal whitespace", case1Whitespace);
  test(
    "discovers canonical services, members, tools, prompts, profiles, and imported env",
    case2Metadata,
  );
  test("requires real AWS and Pulumi imports before offering provisioning", case3Provisioning);
  test("plans byte-preserving canonical insertions and refuses unsafe shapes", case4Edits);
});
