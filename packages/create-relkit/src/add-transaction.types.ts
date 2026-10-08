import type { Effect } from "effect";
import type { AddResult, ScaffoldPlan } from "./add-types.js";
import type {
  GeneratorDomainError,
  GeneratorIoError,
  GeneratorProcessError,
} from "./generator-errors.js";
import type { GeneratorCommandResult, GeneratorCommandRunner } from "./generator-process.types.js";

/** Existing command-runner result compatibility surface. */
export interface AddCommandResult extends GeneratorCommandResult {}

/** Existing scaffold transaction settings, preserving all caller injection points. */
export interface ApplyScaffoldContext {
  readonly commandRunner?: GeneratorCommandRunner;
  readonly bunExecutable?: string;
  readonly relkitExecutable?: string;
  readonly signal?: AbortSignal;
  /**
   * Reports the current step through the caller's progress sink.
   * @param message - User-facing progress text for the current step.
   * @returns Completion after the sink receives one progress message.
   */
  readonly onProgress?: (message: string) => void;
  readonly deferVerification?: boolean;
}

/** Scoped add-transaction owner; infrastructure remains an explicit Layer dependency. */
export interface ScaffoldTransactionService {
  /**
   * Applies planned files, installs/checks when required and rolls back failure.
   * @param plan - Immutable conflict-checked scaffold plan.
   * @param context - Caller-owned settings and cancellation.
   * @returns A scoped Effect returning the unchanged AddResult after all owned cleanup settles.
   */
  readonly apply: (
    plan: ScaffoldPlan,
    context: ApplyScaffoldContext,
  ) => Effect.Effect<AddResult, GeneratorDomainError | GeneratorIoError | GeneratorProcessError>;
}
