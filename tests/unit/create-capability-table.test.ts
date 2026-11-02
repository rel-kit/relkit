/** Checks how per-template measurements merge into the published creation capability table. */
import { expect, test } from "bun:test";
import { CREATE_CAPABILITY_TABLE } from "../../packages/create-relkit/src/create-capabilities.ts";
import { formatTable, mergeResults } from "../../scripts/create-capability-table.ts";

const minimal = CREATE_CAPABILITY_TABLE.entries[0]!;

test("tested templates become entries and the rest are listed as untested", () => {
  const table = mergeResults(
    [
      { template: "minimal", status: "tested", entry: minimal },
      { template: "agent", status: "untested", reason: "fresh run 3 timed out" },
    ],
    "1.3.11",
  );
  expect(table.runtime).toEqual({ name: "bun", version: "1.3.11" });
  expect(table.entries).toEqual([minimal]);
  expect(table.untested).toEqual([
    { template: "api", reason: "not measured" },
    { template: "agent", reason: "fresh run 3 timed out" },
    { template: "fullstack", reason: "not measured" },
    { template: "tasks", reason: "not measured" },
  ]);
  expect(formatTable(table)).toContain("| minimal | tested |");
  expect(formatTable(table)).toContain("| agent | untested: fresh run 3 timed out |");
});
