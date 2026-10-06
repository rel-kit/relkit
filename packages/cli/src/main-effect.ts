import { Effect } from "effect";
import { observeCli } from "./cli-runtime.js";
import { executeCommandEffect } from "./command-dispatch.js";
import { resolveRootMenuEffect } from "./root-menu.js";
import { executeScaffoldCommandEffect } from "./scaffold-command.js";
import { createCliStatusEffect } from "./cli-status.js";
import { createCliLoggerEffect } from "./cli-logger.js";
import {
  cliErrorMessage,
  parseEffectCliEffect,
  unknownCommandMessage,
  type CliInvocation,
} from "./cli-effect-runtime.js";
import {
  CLI_EXIT_CODES,
  CLI_VERSION,
  helpPayload,
  type CliIo,
  type CliReporter,
  type CliRuntime,
  type CliCommandContext,
} from "./main-support.js";

/**
 * Composes menu resolution, pure parsing and the selected command domain.
 * @param argv - Existing command arguments.
 * @param runtime - Invocation-owned optional injections.
 * @param reporter - Existing result presentation policy.
 * @param io - Invocation-owned native sinks.
 * @param json - Whether machine-readable presentation is selected.
 * @param signal - Combined caller and process cancellation.
 * @returns Lazy CLI status with explicit menu filesystem/prompt requirements.
 */
export const runCliProgram = Effect.fn("Cli.invocation")(
  function* (
    argv: readonly string[],
    runtime: CliRuntime,
    reporter: CliReporter,
    io: CliIo,
    json: boolean,
    signal: AbortSignal,
  ) {
    const input = yield* resolveRootMenuEffect(argv, {
      enabled:
        !json &&
        !(runtime.ci ?? Boolean(process.env.CI)) &&
        (runtime.tty ?? process.stdin.isTTY) === true,
      signal,
      ...(runtime.cwd ? { cwd: runtime.cwd } : {}),
      ...(runtime.promptDriver ? { promptDriver: runtime.promptDriver } : {}),
    });
    if (hasAction(input, "help", "h") && hasAction(input, "version", "v")) {
      reporter.error("RELKIT_CLI_USAGE", "--help and --version are exclusive");
      return CLI_EXIT_CODES.usage;
    }
    const version = runtime.version ?? CLI_VERSION;
    const parsed = yield* parseEffectCliEffect(input, version);
    if (parsed.error !== undefined) {
      if (parsed.error._tag === "ShowHelp" && parsed.error.errors.length === 0) {
        reporter.output(helpPayload(version, parsed.helpPath), parsed.stdout);
        return CLI_EXIT_CODES.success;
      }
      const unknown = unknownCommandMessage(parsed.error);
      reporter.error(
        unknown === undefined ? "RELKIT_CLI_USAGE" : "RELKIT_COMMAND_UNAVAILABLE",
        unknown ?? cliErrorMessage(parsed.error),
      );
      return unknown === undefined ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
    }
    if (hasAction(parsed.argv, "version", "v")) {
      reporter.output({ name: "relkit", version }, `relkit ${version}`);
      return CLI_EXIT_CODES.success;
    }
    const shell = actionValue(parsed.argv, "completions");
    if (shell !== undefined) {
      reporter.output(
        { name: "relkit", shell: shell === "sh" ? "bash" : shell, script: parsed.stdout },
        parsed.stdout,
      );
      return CLI_EXIT_CODES.success;
    }
    if (hasAction(parsed.argv, "help", "h") || parsed.invocation === undefined) {
      reporter.output(helpPayload(version, parsed.helpPath), parsed.stdout);
      return CLI_EXIT_CODES.success;
    }
    return yield* executeInvocationEffect(parsed.invocation, json, runtime, reporter, io, signal);
  },
  (effect) => observeCli("invocation.program", effect),
);

/**
 * Owns command presentation and composes exactly one selected domain.
 * @param invocation - Parsed command selection.
 * @param json - Machine-readable presentation.
 * @param runtime - Existing optional native injections.
 * @param reporter - Result and error presentation.
 * @param io - Native sinks.
 * @param signal - Invocation cancellation.
 * @returns Lazy domain exit status after its nested command resources settle.
 */
const executeInvocationEffect = Effect.fn("Cli.command")(
  function* (
    invocation: CliInvocation,
    json: boolean,
    runtime: CliRuntime,
    reporter: CliReporter,
    io: CliIo,
    signal: AbortSignal,
  ) {
    const log = yield* createCliLoggerEffect(json, io);
    const status = yield* createCliStatusEffect(runtime, json, invocation.command);
    status.start();
    const context: CliCommandContext = {
      command: invocation.command,
      args: invocation.args,
      json,
      signal,
      tty: runtime.tty ?? process.stdin.isTTY,
      ci: runtime.ci ?? Boolean(process.env.CI),
      ...(runtime.cwd ? { cwd: runtime.cwd } : {}),
      ...(runtime.promptDriver ? { promptDriver: runtime.promptDriver } : {}),
      reporter,
      log,
      io,
      ...(json
        ? {}
        : {
            onProgress: (message: string) =>
              runtime.io ? io.stderr(message) : status.message(message),
          }),
    };
    const scaffold = yield* executeScaffoldCommandEffect(invocation, context, runtime);
    const result = scaffold ?? (yield* executeCommandEffect(invocation, context));
    status.finish(result === CLI_EXIT_CODES.success);
    return result;
  },
  (effect) => observeCli("invocation.command", effect),
);

/**
 * Detects an action in the existing normalized argument layout.
 * @param argv - Normalized arguments.
 * @param name - Long action name.
 * @param alias - Optional short action.
 * @returns Whether the action is present.
 */
function hasAction(argv: readonly string[], name: string, alias?: string): boolean {
  return argv.some(
    (entry) => entry === `--${name}` || (alias === undefined ? false : entry === `-${alias}`),
  );
}

/**
 * Reads an action value without altering parser-owned argument normalization.
 * @param argv - Normalized arguments.
 * @param name - Long action name.
 * @returns Optional inline or following value.
 */
function actionValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.findIndex((entry) => entry === `--${name}` || entry.startsWith(`--${name}=`));
  if (index < 0) return undefined;
  return argv[index]!.includes("=") ? argv[index]!.split("=", 2)[1] : argv[index + 1];
}
