import type { CandidateCompile, CandidateCompileRequest } from "@relkit/supervisor";
import type { TelemetryConfiguration } from "@relkit/observability";
import type { InspectorConfiguration } from "@relkit/contracts";
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { CheckResult } from "./check-result.types.js";

/** Existing manual compiler facade expected by the supervisor SDK. */
export interface DevLocalCompiler {
  /**
   * Admits one foreign SDK compilation to the session's native FIFO worker.
   * @param request - Candidate identity, directory and cancellation authority.
   * @returns Public SDK build receipt after scoped compilation settles.
   */
  readonly compile: CandidateCompile;
  /**
   * Closes admission and joins all accepted work and local owners.
   * @returns Shared physical shutdown completion.
   */
  readonly close: () => Promise<void>;
}
/** Native session compiler; the callback queue is only the foreign SDK bridge. */
export interface EffectDevLocalCompiler {
  /**
   * Admits one foreign SDK compilation without executing an Effect in the callback.
   * @param request - SDK-owned generation and caller cancellation.
   * @returns Build settlement after the native queue worker joins compilation.
   */
  readonly compile: CandidateCompile;
  /**
   * Compiles one accepted cohort using captured compiler/project/local authority.
   * @param request - Generation-specific destination and cancellation.
   * @returns A lazy SDK-compatible build receipt with no hidden service requirements.
   */
  readonly compileEffect: (
    request: CandidateCompileRequest,
  ) => Effect.Effect<Awaited<ReturnType<CandidateCompile>>, CliAdapterError>;
  /** Advances import epochs and replaces this session's success-only recipe cache. */
  readonly invalidateEffect: Effect.Effect<void>;
  /** Interrupts workers, joins native resource cleanup and closes admission exactly once. */
  readonly closeEffect: Effect.Effect<void>;
}
/** Captured generation and local orchestration policy. */
export interface DevCompilerOptions {
  readonly projectRoot: string;
  /** Single-use initial validation, absent after an intervening input edit. */
  readonly initialCheck?: Effect.Effect<CheckResult | undefined, CliAdapterError>;
  /** Releases the initial input watch when an edit invalidates reuse before consumption. */
  readonly discardInitialCheck?: Effect.Effect<void>;
  readonly localEnabled?: boolean;
  /**
   * Applies accepted generation telemetry policy through captured native authority.
   * @param configuration - Owner-validated policy from the accepted graph.
   * @returns Lazy configuration completion before candidate publication.
   */
  readonly configureTelemetry?: (
    configuration: TelemetryConfiguration,
  ) => Effect.Effect<void, CliAdapterError>;
  /**
   * Prepares accepted generation inspector policy before its backend starts.
   * @param configuration - Defaulted inspector settings from the accepted check.
   * @param request - Generation whose promotion later applies this policy to the bridge.
   * @returns Inspector credentials for this generation's environment.
   */
  readonly configureInspector?: (
    configuration: InspectorConfiguration,
    request: CandidateCompileRequest,
  ) => Effect.Effect<Readonly<Record<string, string | undefined>>, CliAdapterError>;
  readonly color?: boolean;
  readonly backendPort?: number;
}
/** One native Promise caller admitted to the session compiler queue. */
export interface DevCompileMessage {
  readonly request: CandidateCompileRequest;
  /**
   * Settles the admitted foreign caller after successful native compilation.
   * @param value - Accepted build receipt.
   * @returns No value; this callback holds no Effect execution authority.
   */
  readonly resolve: (value: Awaited<ReturnType<CandidateCompile>>) => void;
  /**
   * Settles the admitted caller after failure and joined release.
   * @param reason - Original failure or caller cancellation identity.
   * @returns No value; this callback never starts another runtime.
   */
  readonly reject: (reason: unknown) => void;
}
