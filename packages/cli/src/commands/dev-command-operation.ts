/** Validates initial project evidence before acquiring compiler/session resources; session composition owns runtime lifetimes. */
import { Effect, Ref } from "effect";
import { resolve } from "node:path";
import { cliValidation } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { fail } from "../main-support.js";
import type { CliCommandContext } from "../main-support-types.js";
import { developmentPortsEffect } from "./dev-inspector.js";
import { formatDevDiagnostics } from "./dev-local-diagnostics.js";
import { parseProjectArgs } from "./project-args.js";
import { telemetryConfigurationFromGraphEffect } from "./dev-telemetry-config.js";
import { checkInitialDevProjectEffect } from "./dev-initial-check.js";
import { runDevCommandSession } from "./dev-command-session.js";

/**
 * Composes retention, compiler/local services, generated stage, stable session and watcher.
 * @param args - Existing dev command flags.
 * @param context - Scoped invocation cancellation and output policy.
 * @returns Completion after all session work and native cleanup have joined.
 */
export const devCommandOperationEffect = Effect.fn("Dev.command")(
  function* (args: readonly string[], context: CliCommandContext) {
    const options = yield* cliValidation(() => parseProjectArgs(args, "dev"));
    const projectRoot = resolve(options.projectRoot ?? process.cwd());
    const ports = yield* developmentPortsEffect(
      projectRoot,
      options.port,
      options.inspectorPort,
      process.env,
    );
    const terminal = {
      verbose: options.verbose ?? false,
      color:
        !options.noColor &&
        !context.json &&
        process.env.NO_COLOR === undefined &&
        process.stderr.isTTY === true,
    };
    // The initial retention check precedes session acquisition. Its CPU-heavy
    // compiler must have a process owner so SIGTERM can interrupt and join it.
    const initial = yield* checkInitialDevProjectEffect(projectRoot);
    const { checked } = initial;
    if (!checked.ok)
      return yield* Effect.fail(
        fail(
          "RELKIT_DEV_COMPILE_FAILED",
          formatDevDiagnostics(projectRoot, checked.diagnostics, terminal.color),
        ),
      );
    const configuration = yield* Ref.make(
      yield* telemetryConfigurationFromGraphEffect(checked.outputs.graph),
    );
    return yield* runDevCommandSession({
      options,
      projectRoot,
      ports,
      terminal,
      initial,
      configuration,
      context,
    });
  },
  (effect, _args: readonly string[], _context: CliCommandContext) =>
    observeCli("dev.command", effect),
);
