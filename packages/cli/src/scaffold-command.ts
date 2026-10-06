import { Effect, Layer } from "effect";
import type { CliInvocation } from "./cli-effect-runtime.js";
import { interactionLayer } from "./cli-interaction.service.js";
import { generatorLayer } from "./services/generator.service.js";
import { runCliEffect } from "./cli-runtime.js";
import { executeCreateEffect, executeAddEffect } from "./scaffold-mutations.js";
import type { CliCommandContext, CliRuntime } from "./main-support.js";

/**
 * Executes a public scaffold Promise edge with invocation-owned generator services.
 * @param invocation - Parsed command and original arguments.
 * @param context - Existing presentation and cancellation policy.
 * @param runtime - Optional generator and native presentation injection.
 * @returns Existing exit code, or undefined for another command.
 */
export function executeScaffoldCommand(
  invocation: CliInvocation,
  context: CliCommandContext,
  runtime: CliRuntime,
): Promise<number | undefined> {
  return runCliEffect(
    executeScaffoldCommandEffect(invocation, context, runtime),
    Layer.empty,
    context.signal,
  );
}

/**
 * Selects scaffold services lazily inside the caller's invocation scope.
 * @param invocation - Parsed command and original arguments.
 * @param context - Existing presentation and cancellation policy.
 * @param runtime - Optional generator and native presentation injection.
 * @returns Lazy existing exit code, without acquiring the generator for other commands.
 */
export function executeScaffoldCommandEffect(
  invocation: CliInvocation,
  context: CliCommandContext,
  runtime: CliRuntime,
) {
  if (invocation.command !== "create" && invocation.command !== "add")
    return Effect.succeed(undefined);
  const command = invocation.command === "create" ? executeCreateEffect : executeAddEffect;
  return command(invocation.args, context, runtime).pipe(
    Effect.provide(Layer.merge(generatorLayer(runtime), interactionLayer)),
  );
}
