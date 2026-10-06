import type { Effect } from "effect";
import type { CreateOptions } from "./options.js";
import type { GenerateProjectContext, GenerateProjectResult } from "./generate-types.js";
import type {
  GeneratorDomainError,
  GeneratorIoError,
  GeneratorProcessError,
  GeneratorPromptError,
} from "./generator-errors.js";

/** Creation owner, acquired with explicit I/O and interactive authority. */
export interface ProjectGenerationService {
  /**
   * Creates and publishes one project after optional interactive consent.
   * @param options - Explicit request options or declared prompt choices.
   * @param context - Caller-owned settings and cancellation.
   * @returns A scoped Effect returning the generated result after owned processes and cleanup settle.
   */
  readonly generate: (
    options: CreateOptions,
    context: GenerateProjectContext,
  ) => Effect.Effect<
    GenerateProjectResult,
    GeneratorDomainError | GeneratorIoError | GeneratorProcessError | GeneratorPromptError
  >;
}
