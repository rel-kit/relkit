/** Composes add discovery and interactive resolution into one request workflow, preserving typed cancellation and validation failures. This companion contains the shared planning contracts without executing work. */

import type { Effect } from "effect";
import type { AddRequest } from "create-relkit/internal/add-types";
import type { PromptDriver } from "create-relkit/internal/prompt-driver.types";
import type {
  GeneratorDomainError,
  GeneratorIoError,
  GeneratorPromptError,
} from "create-relkit/internal/generator-errors";

/** Existing interactive-add resolution context. */
export interface ResolveAddContext {
  readonly cwd?: string;
  readonly interactive?: boolean;
  readonly promptDriver?: PromptDriver;
  readonly signal?: AbortSignal;
}

/** Existing resolved add request and consent-relevant prompted flag. */
export interface ResolvedAddRequest {
  readonly request: AddRequest;
  readonly prompted: boolean;
}

/** Finite add-resolution owner with explicit discovery, prompt and source authority. */
export interface AddResolutionService {
  /**
   * Resolves missing interactive add choices against source-discovered facts.
   * @param args - Literal flag and positional arguments.
   * @param context - Caller-owned settings and cancellation.
   * @returns An Effect returning a validated request and whether resolution prompted.
   */
  readonly resolve: (
    args: readonly string[],
    context: ResolveAddContext,
  ) => Effect.Effect<
    ResolvedAddRequest,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError
  >;
}
