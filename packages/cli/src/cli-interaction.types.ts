import type { Effect } from "effect";
import type { ChoicePromptOptions, PromptDriver } from "create-relkit";
import type { CliAdapterError } from "./cli-errors.js";

/** Explicit interactive authority; native prompt callbacks consume fiber cancellation. */
export interface CliInteractionOperations {
  /**
   * Selects one declared option without allowing answers into telemetry.
   * @typeParam Value - Declaration-owned choices.
   * @param driver - Clack or caller-owned deterministic driver.
   * @param options - Declared choices and question.
   * @param signal - Optional caller cancellation combined with fiber interruption.
   * @returns Lazy validated choice.
   */
  readonly select: <Value extends string>(
    driver: PromptDriver,
    options: ChoicePromptOptions<Value>,
    signal?: AbortSignal,
  ) => Effect.Effect<Value, CliAdapterError>;
  /**
   * Requests consent at the existing native interactive boundary.
   * @param driver - Clack or deterministic caller driver.
   * @param options - Existing confirmation question.
   * @param signal - Optional caller cancellation.
   * @returns Lazy boolean consent.
   */
  readonly confirm: (
    driver: PromptDriver,
    options: { readonly message: string; readonly initialValue?: boolean },
    signal?: AbortSignal,
  ) => Effect.Effect<boolean, CliAdapterError>;
}
/** Existing root-menu conditions and optional cancellation forwarding. */
export interface RootMenuOptions {
  readonly enabled: boolean;
  readonly cwd?: string;
  readonly promptDriver?: PromptDriver;
  readonly signal?: AbortSignal;
}
/** Finite native spinner facade used by synchronous progress callbacks. */
export interface CliStatus {
  /** Starts this owned spinner once. @returns Nothing. */
  readonly start: () => void;
  /** Updates presentation. @param message - Existing progress text. @returns Nothing. */
  readonly message: (message: string) => void;
  /** Settles the owned presentation once. @param ok - Final outcome. @returns Nothing. */
  readonly finish: (ok: boolean) => void;
}
/** Mutation spinner facade preserving its initial and final messages. */
export interface ScaffoldStatus {
  /** @param message - Initial progress. @returns Nothing. */
  readonly start: (message: string) => void;
  /** @param message - Existing progress. @returns Nothing. */
  readonly message: (message: string) => void;
  /** @param ok - Outcome. @param message - Existing final message. @returns Nothing. */
  readonly finish: (ok: boolean, message: string) => void;
}
