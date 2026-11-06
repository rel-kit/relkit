/**
 * Shapes of the plan metrics: the result files CI jobs and walkthroughs write, and the
 * `relkit.metrics` report the metrics page and the launch checklist read.
 */

/** Templates the creation canary covers; the nightly workflow matrix lists the same names. */
export const CANARY_TEMPLATES = ["minimal", "api", "agent", "fullstack", "tasks"] as const;

/** One creation attempt of one template, written by the canary jobs. */
export interface CreationCanaryResult {
  readonly protocol: "relkit.creation-canary-result";
  readonly template: string;
  readonly outcome: "success" | "failure";
  /** Bun version the creator ran on. */
  readonly bun: string;
  /** `published` is `create-relkit@latest` from npm; `candidate` is the creator packed from the branch. */
  readonly source: "published" | "candidate";
  readonly createdAt: string;
}

/** One runtime's pass or fail of the HTTP suite, written by the runtime matrix. */
export interface RuntimeHttpResult {
  readonly protocol: "relkit.runtime-http-result";
  readonly runtime: "bun" | "node";
  /** Version the executable reported, for example `1.3.10` or `v22.12.0`. */
  readonly version: string;
  readonly outcome: "success" | "failure";
  readonly createdAt: string;
}

/** Timings of a newcomer walkthrough. */
export interface WalkthroughResult {
  readonly protocol: "relkit.walkthrough-result";
  readonly kind: "create-to-first-route" | "create-to-railway";
  /** `passed` ran live; `failed` ran live and stopped; `stubbed` exercised the flow without the service. */
  readonly outcome: "passed" | "failed" | "stubbed";
  /** Seconds from the first command to the finish line; null when the walkthrough did not finish live. */
  readonly seconds: number | null;
  readonly steps: readonly { readonly name: string; readonly seconds: number }[];
  /** Why there is no live timing, or what the number includes. */
  readonly note: string;
  readonly createdAt: string;
}

/** Agent evaluation summary from `scripts/agent-eval-pass-rate.ts`. */
export interface AgentEvalSummaryFile {
  readonly runs: number;
  readonly passed: number;
  readonly passRate: number;
}

/** Outside contributions counted by `scripts/metrics/contributions.ts`. */
export interface ContributionsResult {
  readonly protocol: "relkit.contributions";
  readonly windowDays: number;
  readonly count: number;
  readonly since: string;
  readonly createdAt: string;
}

/** Fields of the dev-loop benchmark report the metrics read (`DevLoopReport`). */
export interface DevLoopReportFile {
  readonly protocol: "relkit.dev-loop-benchmark";
  readonly sizes: readonly {
    readonly functions: number;
    readonly reload: { readonly p95Ms: number };
    readonly memoryRatio: number;
  }[];
}

/** Every input found in an inputs directory. */
export interface MetricInputs {
  readonly canary: readonly CreationCanaryResult[];
  readonly runtimes: readonly RuntimeHttpResult[];
  readonly walkthroughs: readonly WalkthroughResult[];
  readonly devLoop: DevLoopReportFile | undefined;
  readonly agentEvals: AgentEvalSummaryFile | undefined;
  readonly contributions: ContributionsResult | undefined;
}

/** `met` and `not-met` compare a value with its target; `no-data` means the CI output is missing. */
export type MetricStatus = "met" | "not-met" | "no-data";

/** The nine plan metrics. */
export type MetricId =
  | "creation-success"
  | "time-to-first-route"
  | "time-to-railway"
  | "runtimes-http"
  | "reload-p95"
  | "check-memory"
  | "agent-eval-pass-rate"
  | "outside-contributions"
  | "published-packages";

/** One metric with its current value and plan target. */
export interface MetricResult {
  readonly id: MetricId;
  readonly name: string;
  readonly target: string;
  readonly status: MetricStatus;
  /** Display value; `no data` when the CI output is missing. */
  readonly value: string;
  /** Machine value for the launch checklist; null when there is no data. */
  readonly numeric: number | null;
  /** Where the number came from, or why there is none. */
  readonly detail: string;
}

/** The report written as `metrics.json` and rendered on the metrics page. */
export interface MetricsReport {
  readonly protocol: "relkit.metrics";
  readonly version: 1;
  readonly createdAt: string;
  readonly commit: string | undefined;
  readonly metrics: readonly MetricResult[];
}
