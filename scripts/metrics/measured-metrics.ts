/** Evaluates the metrics that come from the dev-loop benchmark, the agent evaluations and GitHub. */
import { missing, TARGETS } from "./metric-support.js";
import type { MetricInputs, MetricResult } from "./types.js";

export function devLoopMetrics(inputs: MetricInputs): MetricResult[] {
  const reloadName = "Save-to-serving p95 for a 100-function app";
  const reloadTarget = `Under ${TARGETS.reloadP95Ms} ms`;
  const memoryName = "`relkit check` peak memory compared with `tsc`";
  const memoryTarget = `At or below ${TARGETS.memoryRatio}×`;
  const size = inputs.devLoop?.sizes.find((item) => item.functions === TARGETS.sizeFunctions);
  if (size === undefined) {
    const detail = "No dev-loop benchmark report with a 100-function size was found.";
    return [
      missing("reload-p95", reloadName, reloadTarget, detail),
      missing("check-memory", memoryName, memoryTarget, detail),
    ];
  }
  return [
    {
      id: "reload-p95",
      name: reloadName,
      target: reloadTarget,
      status: size.reload.p95Ms < TARGETS.reloadP95Ms ? "met" : "not-met",
      value: `${Math.round(size.reload.p95Ms)} ms`,
      numeric: Math.round(size.reload.p95Ms),
      detail: "Dev-loop benchmark, 100 functions.",
    },
    {
      id: "check-memory",
      name: memoryName,
      target: memoryTarget,
      status: size.memoryRatio <= TARGETS.memoryRatio ? "met" : "not-met",
      value: `${size.memoryRatio.toFixed(2)}×`,
      numeric: Math.round(size.memoryRatio * 100) / 100,
      detail: "Dev-loop benchmark, 100 functions.",
    },
  ];
}

export function agentEvalMetric(inputs: MetricInputs): MetricResult {
  const name = "Agent eval pass rate (check and tests, first attempt)";
  const target = "Published every release";
  const summary = inputs.agentEvals;
  if (summary === undefined)
    return missing("agent-eval-pass-rate", name, target, "No agent evaluation summary was found.");
  return {
    id: "agent-eval-pass-rate",
    name,
    target,
    status: "met",
    value: `${summary.passRate}% (${summary.passed} of ${summary.runs} runs)`,
    numeric: summary.passRate,
    detail: "Graded runs under tests/agent-evals/results.",
  };
}

export function contributionsMetric(inputs: MetricInputs): MetricResult {
  const name = "Issues and PRs from outside contributors per month";
  const target = `${TARGETS.contributionsPerMonth} or more after launch`;
  const result = inputs.contributions;
  if (result === undefined)
    return missing("outside-contributions", name, target, "The contributions count did not run.");
  return {
    id: "outside-contributions",
    name,
    target,
    status: result.count >= TARGETS.contributionsPerMonth ? "met" : "not-met",
    value: `${result.count} in ${result.windowDays} days`,
    numeric: result.count,
    detail: `Opened since ${result.since.slice(0, 10)} by people outside the organization; the target applies after launch.`,
  };
}
