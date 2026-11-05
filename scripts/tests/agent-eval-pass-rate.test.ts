/** The release pass rate counts only runs whose semantic and technical checks both pass. */
import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  readAgentEvalRuns,
  renderAgentEvalSummary,
  summarizeAgentEvals,
} from "../agent-eval-pass-rate.ts";

const fixture = await mkdtemp(join(tmpdir(), "relkit-agent-evals-"));
afterAll(() => rm(fixture, { recursive: true, force: true }));

test("the recorded runs have verdicts and produce a pass rate", async () => {
  const summary = summarizeAgentEvals(
    await readAgentEvalRuns(resolve(import.meta.dir, "../../tests/agent-evals/results")),
  );
  expect(summary.runs).toBe(3);
  expect(summary.semanticPassRate).toBe(100);
  expect(summary.passRate).toBe(33.3);
  expect(renderAgentEvalSummary(summary)).toContain("33.3% pass (1/3)");
});

test("a run without a verdict fails instead of being skipped", async () => {
  await writeFile(join(fixture, "run.json"), JSON.stringify({ case: "x", skill: "y", date: "z" }));
  await expect(readAgentEvalRuns(fixture)).rejects.toThrow(/run\.json has no verdict/u);
});

test("no runs is an error, not a rate", () => {
  expect(() => summarizeAgentEvals([])).toThrow(/No graded/u);
});
