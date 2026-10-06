import type { Effect } from "effect";
import type { createPulumiWorkspace, writePulumiProgram } from "@relkit/deploy-pulumi";
import type { CliAdapterError } from "../cli-errors.js";
import type { PulumiStack } from "../commands/deploy-support.types.js";

/**
 * Selects one native SDK method without widening its arguments or result.
 * @typeParam F - The installed SDK method signature.
 */
type SdkCall<F extends (...args: never[]) => unknown> = (
  ...args: Parameters<F>
) => Effect.Effect<Awaited<ReturnType<F>>, CliAdapterError>;
/**
 * Adds an explicit stack receiver to one SDK operation.
 * @typeParam K - Selected, declaration-owned stack operation.
 */
type StackCall<K extends "preview" | "up" | "previewDestroy" | "destroy" | "refresh" | "outputs"> =
  (
    stack: PulumiStack,
    ...args: Parameters<PulumiStack[K]>
  ) => Effect.Effect<Awaited<ReturnType<PulumiStack[K]>>, CliAdapterError>;

/** SDK authority; planning and confirmation belong to the deployment domain. */
export interface PulumiCapabilities {
  /**
   * Writes one deterministic program; cancellation waits for native writes.
   * @param args - Exact installed program API arguments.
   * @returns The emitted program's paths and bytes.
   */
  readonly writeProgram: SdkCall<typeof writePulumiProgram>;
  /**
   * Opens one explicit workspace without mutation retries.
   * @param args - Exact installed workspace options.
   * @returns The selected native workspace handle.
   */
  readonly openWorkspace: SdkCall<typeof createPulumiWorkspace>;
  /**
   * Previews changes and owns native cancellation through settlement.
   * @param stack - Selected SDK stack.
   * @param args - Exact SDK preview options.
   * @returns Native preview details for report construction.
   */
  readonly preview: StackCall<"preview">;
  /**
   * Applies once after domain confirmation.
   * @param stack - Selected SDK stack.
   * @param args - Exact SDK update options.
   * @returns Native update details; no automatic retry occurs.
   */
  readonly up: StackCall<"up">;
  /**
   * Previews deletion before confirmation.
   * @param stack - Selected SDK stack.
   * @param args - Exact SDK preview-destroy options.
   * @returns Native planned changes.
   */
  readonly previewDestroy: StackCall<"previewDestroy">;
  /**
   * Destroys once after domain confirmation.
   * @param stack - Selected SDK stack.
   * @param args - Exact SDK destroy options.
   * @returns Native destruction details.
   */
  readonly destroy: StackCall<"destroy">;
  /**
   * Refreshes provider state once.
   * @param stack - Selected SDK stack.
   * @param args - Exact SDK refresh options.
   * @returns Native refresh details.
   */
  readonly refresh: StackCall<"refresh">;
  /**
   * Reads outputs; its uncancellable SDK call settles before interruption returns.
   * @param stack - Selected SDK stack.
   * @returns Native outputs, redacted later by the SDK report owner.
   */
  readonly outputs: StackCall<"outputs">;
}
