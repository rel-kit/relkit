/** Parses start arguments lazily at its command boundary, retaining owned runtime cleanup. */
import { Effect } from "effect";
import { parseProjectArgs } from "./commands/project-args.js";
import { runStartEffect } from "./commands/start.js";
import { cliValidation } from "./cli-errors.js";
import type { CliCommandContext } from "./main-support.js";

/**
 * Starts the already-built project through the existing runtime owner.
 * @param args - Normalized literal arguments.
 * @param context - Invocation cancellation policy.
 * @returns Lazy start outcome requiring the start service graph.
 */
export const executeStartEffect = Effect.fn("Cli.start-command")(function* (
  args: readonly string[],
  context: CliCommandContext,
) {
  const options = yield* cliValidation(() => parseProjectArgs(args, "start"));
  return yield* runStartEffect({
    ...optionalProjectRoot(options.projectRoot),
    ...(options.port === undefined ? {} : { port: options.port }),
    signal: context.signal,
  });
});
/**
 * Preserves absent project-root defaults for the selected domain.
 * @param projectRoot - Optional explicit root.
 * @returns The existing optional argument shape.
 */
export function optionalProjectRoot(
  projectRoot: string | undefined,
): { readonly projectRoot?: never } | { readonly projectRoot: string } {
  return projectRoot === undefined ? {} : { projectRoot };
}
