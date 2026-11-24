/** Parses start arguments lazily at its command boundary, retaining owned runtime cleanup. */
import { Effect } from "effect";
import { parseProjectArgs } from "./commands/project-args.js";
import { runStartEffect } from "./commands/start.js";
import { cliValidation } from "./cli-errors.js";
import type { CliCommandContext } from "./main-support.js";
import type { CliIo } from "./main-support-types.js";

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
  const output = serverOutput(context);
  return yield* runStartEffect(
    {
      ...optionalProjectRoot(options.projectRoot),
      ...(options.port === undefined ? {} : { port: options.port }),
      ...(output === undefined ? {} : { output }),
      signal: context.signal,
    },
    (server) => {
      const url = `http://${server.hostname}:${server.port}`;
      context.reporter.output(
        { ok: true, url, port: server.port },
        `Server ready at ${url} (Ctrl+C to stop)`,
      );
    },
  );
});

/**
 * Chooses where the server's own output goes.
 * @param context - Invocation sinks and presentation mode.
 * @returns Line sinks; with JSON output the server's stdout goes to stderr so stdout stays parseable.
 */
export function serverOutput(context: CliCommandContext): CliIo | undefined {
  const io = context.io;
  if (io === undefined) return undefined;
  return context.json ? { stdout: io.stderr, stderr: io.stderr } : io;
}
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
