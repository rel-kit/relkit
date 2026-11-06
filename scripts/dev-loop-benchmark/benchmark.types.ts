/**
 * Shapes of the development-loop benchmark: the generated applications, the per-size
 * measurements, the budgets they are judged against and the JSON report that release
 * readiness uploads and the docs benchmarks page renders.
 */

/** One generated benchmark application. */
export interface BenchmarkApp {
  /** Absolute application root. */
  readonly root: string;
  /** Number of function descriptors and routes. */
  readonly functions: number;
  /** Project-relative handler module the reload benchmark edits. */
  readonly editedFile: string;
  /** Route served by the edited handler. */
  readonly route: string;
}

/** Distribution of save-to-serving latencies in milliseconds. */
export interface ReloadMeasurement {
  /** Every sample in save order. */
  readonly samplesMs: readonly number[];
  readonly medianMs: number;
  /** Nearest-rank 95th percentile. */
  readonly p95Ms: number;
  readonly maximumMs: number;
  /** Milliseconds from launching `relkit dev` to the first correct response. */
  readonly firstStartMs: number;
}

/** Options for one reload measurement. */
export interface ReloadOptions {
  /** Absolute path of the CLI entry (`packages/cli/dist/bin.js`). */
  readonly cli: string;
  /** Number of measured saves. */
  readonly saves: number;
  readonly startDeadlineMs: number;
  readonly saveDeadlineMs: number;
  /** Delay inserted into the edited handler module's evaluation, for the budget fixture. */
  readonly injectDelayMs: number;
}

/** Peak resident memory of one process tree in bytes. */
export interface MemoryMeasurement {
  readonly peakBytes: number;
  readonly durationMs: number;
  readonly exitCode: number;
}

/** Measurements for one application size. */
export interface SizeMeasurement {
  readonly functions: number;
  readonly reload: ReloadMeasurement;
  readonly check: MemoryMeasurement;
  readonly tsc: MemoryMeasurement;
  /** `check.peakBytes / tsc.peakBytes`. */
  readonly memoryRatio: number;
}

/** Limits for one application size. */
export interface SizeBudget {
  readonly functions: number;
  /** Save-to-serving p95 must stay below this. */
  readonly reloadP95Ms: number;
  /** `relkit check` peak memory may be at most this multiple of `tsc`. */
  readonly memoryRatio: number;
}

/** One budget violation, carrying the measured value. */
export interface BudgetViolation {
  readonly functions: number;
  readonly metric: "reload-p95" | "check-memory" | "missing";
  readonly measured: number;
  readonly limit: number;
  readonly message: string;
}

/** Host that produced a report. */
export interface BenchmarkHost {
  readonly bun: string;
  readonly platform: string;
  readonly arch: string;
  readonly os: string;
  readonly cpu: string | undefined;
  readonly cpus: number;
  readonly memoryBytes: number;
  /** `local`, or `github-actions` with the runner image when CI produced the report. */
  readonly runner: string;
}

/** The complete benchmark report. */
export interface DevLoopReport {
  readonly protocol: "relkit.dev-loop-benchmark";
  readonly version: 1;
  readonly createdAt: string;
  /** Commit measured, when known. */
  readonly commit: string | undefined;
  readonly host: BenchmarkHost;
  readonly sizes: readonly SizeMeasurement[];
  readonly budgets: readonly SizeBudget[];
  readonly violations: readonly BudgetViolation[];
  readonly passed: boolean;
}
