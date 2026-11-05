/**
 * Turns the CI outputs into the plan's nine metrics. Every metric states its current value and its
 * target from the lead review (section 6); a metric whose CI output is missing is `no data`, which
 * is not a failure: the metrics page lists it and the launch checklist decides what blocks.
 */
import { CANARY_TEMPLATES } from "./types.js";
import type { MetricInputs, MetricResult, WalkthroughResult } from "./types.js";
import { agentEvalMetric, contributionsMetric, devLoopMetrics } from "./measured-metrics.js";
import { duration, missing, TARGETS } from "./metric-support.js";
import { packagesMetric, type PackageCounts } from "./packages.js";

export { countPackages, type PackageCounts } from "./packages.js";

function creationSuccess(inputs: MetricInputs): MetricResult {
  const name = "Creation success on the latest Bun";
  const target = "100% of templates, checked nightly";
  const published = inputs.canary.filter((item) => item.source === "published");
  const results = published.length > 0 ? published : inputs.canary;
  if (results.length === 0)
    return missing("creation-success", name, target, "No creation canary result was found.");
  const passed = CANARY_TEMPLATES.filter((template) =>
    results.some((item) => item.template === template && item.outcome === "success"),
  );
  const failed = results.filter((item) => item.outcome === "failure").map((item) => item.template);
  const bun = [...new Set(results.map((item) => item.bun))].join(", ");
  const source = results[0]?.source === "published" ? "create-relkit@latest" : "the packed creator";
  return {
    id: "creation-success",
    name,
    target,
    status: passed.length === CANARY_TEMPLATES.length && failed.length === 0 ? "met" : "not-met",
    value: `${passed.length} of ${CANARY_TEMPLATES.length} templates`,
    numeric: Math.round((passed.length / CANARY_TEMPLATES.length) * 100),
    detail: `${source} on Bun ${bun}${failed.length > 0 ? `; failing: ${failed.join(", ")}` : ""}.`,
  };
}

function walkthroughMetric(
  inputs: MetricInputs,
  kind: WalkthroughResult["kind"],
  spec: { id: "time-to-first-route" | "time-to-railway"; name: string; limit: number },
): MetricResult {
  const target = `Under ${duration(spec.limit)}`;
  const live = inputs.walkthroughs.find((item) => item.kind === kind && item.outcome !== "stubbed");
  const stub = inputs.walkthroughs.find((item) => item.kind === kind);
  if (live === undefined)
    return missing(
      spec.id,
      spec.name,
      target,
      stub === undefined
        ? "The walkthrough has not run."
        : `Only the stubbed walkthrough ran: ${stub.note}`,
    );
  if (live.outcome === "failed" || live.seconds === null)
    return {
      id: spec.id,
      name: spec.name,
      target,
      status: "not-met",
      value: "failed",
      numeric: null,
      detail: live.note,
    };
  return {
    id: spec.id,
    name: spec.name,
    target,
    status: live.seconds < spec.limit ? "met" : "not-met",
    value: duration(live.seconds),
    numeric: live.seconds,
    detail: live.note,
  };
}

function runtimesHttp(inputs: MetricInputs): MetricResult {
  const name = "Runtimes passing the HTTP suite";
  const target = "Bun and Node, then Workers";
  if (inputs.runtimes.length === 0)
    return missing("runtimes-http", name, target, "No runtime matrix result was found.");
  const label = (item: MetricInputs["runtimes"][number]) =>
    item.runtime === "bun"
      ? `Bun ${item.version}`
      : `Node ${item.version.replace(/^v/u, "").split(".")[0]}`;
  const passing = inputs.runtimes.filter((item) => item.outcome === "success");
  const failing = inputs.runtimes.filter((item) => item.outcome === "failure");
  const both =
    passing.some((item) => item.runtime === "bun") &&
    passing.some((item) => item.runtime === "node");
  return {
    id: "runtimes-http",
    name,
    target,
    status: both && failing.length === 0 ? "met" : "not-met",
    value: passing.map(label).join(", ") || "none",
    numeric: passing.length,
    detail:
      failing.length > 0
        ? `Failing: ${failing.map(label).join(", ")}.`
        : "Workers joins the matrix with its Tier 2 target.",
  };
}

/**
 * Builds the nine metrics.
 * @param inputs - CI outputs found.
 * @param packages - Published package counts, or undefined when the workspace is not available.
 * @returns One result per plan metric, in the order of the lead review.
 */
export function evaluateMetrics(
  inputs: MetricInputs,
  packages: PackageCounts | undefined,
): MetricResult[] {
  const [reload, memory] = devLoopMetrics(inputs) as [MetricResult, MetricResult];
  return [
    creationSuccess(inputs),
    walkthroughMetric(inputs, "create-to-first-route", {
      id: "time-to-first-route",
      name: "Time from `create` to a first route",
      limit: TARGETS.firstRouteSeconds,
    }),
    walkthroughMetric(inputs, "create-to-railway", {
      id: "time-to-railway",
      name: "Time from `create` to an app deployed on Railway",
      limit: TARGETS.railwaySeconds,
    }),
    runtimesHttp(inputs),
    reload,
    memory,
    agentEvalMetric(inputs),
    contributionsMetric(inputs),
    packagesMetric(packages),
  ];
}
