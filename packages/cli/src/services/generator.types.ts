import type { Effect } from "effect";
import type {
  AddRequest,
  AddResult,
  ApplyScaffoldContext,
  CreateScaffoldPlan,
  PromptDriver,
  ScaffoldPlan,
} from "create-relkit";
import type { CliAdapterError } from "../cli-errors.js";
import type { CliCommandContext } from "../main-support-types.js";

/** Explicit root/name resolution settings at the foreign generator boundary. */
export interface GeneratorCreateResolution {
  readonly json: boolean;
  readonly interactive: boolean;
  readonly signal: AbortSignal;
  readonly promptDriver?: PromptDriver;
}
/** Explicit artifact resolution settings at the foreign generator boundary. */
export interface GeneratorAddResolution {
  readonly interactive: boolean;
  readonly signal: AbortSignal;
  readonly cwd?: string;
  readonly promptDriver?: PromptDriver;
}
/** Generator facade preserving legacy Promise APIs behind typed lazy operations. */
export interface CliGeneratorOperations {
  /**
   * Resolves the missing name and explicit creation flags.
   * @param args - Original arguments.
   * @param context - Explicit prompt/cancellation settings.
   * @returns Lazy opaque options and whether a name was requested.
   */
  readonly resolveCreate: (
    args: readonly string[],
    context: GeneratorCreateResolution,
  ) => Effect.Effect<{ readonly options: unknown; readonly prompted: boolean }, CliAdapterError>;
  /**
   * Produces an optional preview through the existing foreign API.
   * @param options - Opaque generator-owned normalized options.
   * @param context - Existing root override.
   * @returns Lazy preview when supported.
   */
  readonly previewCreate: (
    options: unknown,
    context: { readonly cwd?: string },
  ) => Effect.Effect<CreateScaffoldPlan | undefined, CliAdapterError>;
  /**
   * Runs one generator-owned transaction, including its final consent.
   * @param options - Opaque normalized options.
   * @param context - Existing CLI and prompt settings.
   * @returns Lazy public result after physical rollback or completion settles.
   */
  readonly generate: (
    options: unknown,
    context: CliCommandContext,
  ) => Effect.Effect<unknown, CliAdapterError>;
  /**
   * Resolves one existing add request.
   * @param args - Original artifact arguments.
   * @param context - Prompt/root/cancellation settings.
   * @returns Lazy typed request and whether it prompted.
   */
  readonly resolveAdd: (
    args: readonly string[],
    context: GeneratorAddResolution,
  ) => Effect.Effect<{ readonly request: AddRequest; readonly prompted: boolean }, CliAdapterError>;
  /**
   * Plans a resolved artifact without mutation.
   * @param request - Generator-owned request.
   * @returns Lazy complete scaffold plan.
   */
  readonly planAdd: (request: AddRequest) => Effect.Effect<ScaffoldPlan, CliAdapterError>;
  /**
   * Commits one generator-owned add transaction.
   * @param plan - Complete plan.
   * @param context - Existing verification/cancellation/progress settings.
   * @returns Lazy public result after physical mutation and rollback settle.
   */
  readonly applyAdd: (
    plan: ScaffoldPlan,
    context: ApplyScaffoldContext & { readonly signal: AbortSignal },
  ) => Effect.Effect<AddResult, CliAdapterError>;
}
