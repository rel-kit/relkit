/**
 * Describes external command-to-response measurements and native authority.
 * The benchmark owns each child scope; adapters supply process, HTTP and report
 * I/O while the active Effect Clock controls all elapsed-time measurements.
 */
import type { Effect, Scope } from "effect";
import type { ReadinessBenchmarkError } from "./benchmark-error.js";

/** One literal generated command and the real response required from it. */
export interface StartRequest {
  readonly projectRoot: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly url: string;
  readonly expectedStatus: number;
  readonly expectedBody: string;
  readonly deadlineMs: number;
}

/** A process acquired by the benchmark and finalized by its surrounding Scope. */
export interface BenchmarkChild {
  readonly exitCode: () => Effect.Effect<number | undefined>;
  readonly output: () => Effect.Effect<string>;
}

/** Complete HTTP bytes observed by the external probe. */
export interface BenchmarkResponse {
  readonly status: number;
  readonly body: string;
}

/** Replaceable native boundaries; construction itself performs no I/O. */
export interface BenchmarkNativeOperations {
  readonly preflight: (request: StartRequest) => Effect.Effect<void, ReadinessBenchmarkError>;
  readonly start: (
    request: StartRequest,
  ) => Effect.Effect<BenchmarkChild, ReadinessBenchmarkError, Scope.Scope>;
  readonly probe: (
    url: string,
  ) => Effect.Effect<BenchmarkResponse | undefined, ReadinessBenchmarkError>;
  readonly report: (path: string, contents: string) => Effect.Effect<void, ReadinessBenchmarkError>;
}

/** Every launch remains a sample, including unsuccessful serving or cleanup. */
export interface StartSample {
  readonly durationMs: number;
  readonly outcome: "response" | "timeout" | "child-exited";
  readonly exitCode: number | undefined;
  readonly output: string;
  /** Complete reason classifications when release failed after this observation. */
  readonly cleanupFailure?: { readonly reasons: readonly ("Fail" | "Die" | "Interrupt")[] };
}

/** Aggregate statistics preserve full precision and include unsuccessful attempts. */
export interface StartSummary {
  readonly runs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maximumMs: number;
  readonly passed: boolean;
}

/** Measured workflow borrowing one acquired native implementation. */
export interface ReadinessBenchmarkOperations {
  readonly measure: (request: StartRequest) => Effect.Effect<StartSample, ReadinessBenchmarkError>;
}
