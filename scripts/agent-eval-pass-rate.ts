/**
 * Reports the agent evaluations' pass rate from the graded runs under tests/agent-evals/results.
 * A run passes when both its semantic review and its technical checks pass; an incomplete
 * technical check counts as not passed. In GitHub Actions the rate is written as step outputs
 * and to the step summary; `--output <file>` also writes the JSON summary.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** One graded evaluation run as recorded in its result file. */
export interface AgentEvalRun {
  readonly file: string;
  readonly case: string;
  readonly skill: string;
  readonly date: string;
  readonly semantic: string;
  readonly technical: string;
}

/** Pass-rate summary across every graded run. */
export interface AgentEvalSummary {
  readonly runs: number;
  readonly passed: number;
  readonly semanticPassed: number;
  readonly passRate: number;
  readonly semanticPassRate: number;
  readonly results: readonly AgentEvalRun[];
}

const VERDICTS = new Set(["pass", "fail", "incomplete"]);

/**
 * Reads every graded run in a results directory.
 * @param directory - Directory of `*.json` result records.
 * @returns Runs sorted by file name; a record without a valid verdict fails.
 */
export async function readAgentEvalRuns(directory: string): Promise<AgentEvalRun[]> {
  const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (file) => {
      const record = JSON.parse(await readFile(join(directory, file), "utf8")) as {
        case?: unknown;
        skill?: unknown;
        date?: unknown;
        verdict?: { semantic?: unknown; technical?: unknown };
      };
      const semantic = String(record.verdict?.semantic);
      const technical = String(record.verdict?.technical);
      if (!VERDICTS.has(semantic) || !VERDICTS.has(technical))
        throw new Error(
          `${file} has no verdict. Add "verdict": { "semantic": "pass|fail|incomplete", "technical": "pass|fail|incomplete" }.`,
        );
      return {
        file,
        case: String(record.case),
        skill: String(record.skill),
        date: String(record.date),
        semantic,
        technical,
      };
    }),
  );
}

/**
 * Computes pass rates as percentages with one decimal.
 * @param results - Graded runs.
 * @returns The summary; zero runs fail because a rate would be meaningless.
 */
export function summarizeAgentEvals(results: readonly AgentEvalRun[]): AgentEvalSummary {
  if (results.length === 0) throw new Error("No graded agent evaluation runs were found.");
  const passed = results.filter(
    (run) => run.semantic === "pass" && run.technical === "pass",
  ).length;
  const semanticPassed = results.filter((run) => run.semantic === "pass").length;
  const rate = (count: number) => Math.round((count / results.length) * 1000) / 10;
  return {
    runs: results.length,
    passed,
    semanticPassed,
    passRate: rate(passed),
    semanticPassRate: rate(semanticPassed),
    results,
  };
}

/**
 * Renders the summary as a Markdown table for the step summary.
 * @param summary - Computed summary.
 * @returns Markdown text.
 */
export function renderAgentEvalSummary(summary: AgentEvalSummary): string {
  const rows = summary.results.map(
    (run) => `| ${run.date} | ${run.skill} | ${run.case} | ${run.semantic} | ${run.technical} |`,
  );
  return [
    `### Agent evaluations: ${summary.passRate}% pass (${summary.passed}/${summary.runs})`,
    "",
    `Semantic review alone: ${summary.semanticPassRate}% (${summary.semanticPassed}/${summary.runs}).`,
    "",
    "| Date | Skill | Case | Semantic | Technical |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const outputIndex = process.argv.indexOf("--output");
  const summary = summarizeAgentEvals(
    await readAgentEvalRuns(join(root, "tests/agent-evals/results")),
  );
  const markdown = renderAgentEvalSummary(summary);
  console.log(markdown);
  if (outputIndex !== -1) {
    const output = resolve(process.argv[outputIndex + 1] ?? "agent-evals.json");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (process.env.GITHUB_OUTPUT)
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `pass-rate=${summary.passRate}\nsemantic-pass-rate=${summary.semanticPassRate}\nruns=${summary.runs}\n`,
      { flag: "a" },
    );
  if (process.env.GITHUB_STEP_SUMMARY)
    await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: "a" });
}
