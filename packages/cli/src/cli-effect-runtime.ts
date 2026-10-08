import {
  Console,
  Effect,
  FileSystem,
  Layer,
  MutableRef,
  Path,
  Ref,
  Result,
  Stdio,
  Terminal,
} from "effect";
import { CliConfig, CliError, Command, GlobalFlag } from "effect/cli";
import { ChildProcessSpawner } from "effect/process";
import { createCliCommand } from "./cli-command.js";
import { findCliHelp } from "./cli-help-model.js";
import { observeCli, runCliEffect } from "./cli-runtime.js";
import type { CliInvocation, CliParseResult } from "./cli-effect-runtime.types.js";
export type { CliInvocation, CliParseResult } from "./cli-effect-runtime.types.js";

const cliLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({}),
  CliConfig.layer({
    builtIns: [GlobalFlag.Help, GlobalFlag.Version, GlobalFlag.Completions],
  }),
  Layer.succeed(
    Terminal.Terminal,
    Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(24),
      readInput: Effect.die("Interactive CLI input is disabled."),
      readLine: Effect.die("Interactive CLI input is disabled."),
      display: () => Effect.void,
    }),
  ),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("CLI completion does not spawn processes.")),
  ),
);

/**
 * Parses one invocation with parser-only services acquired inside its effect.
 * @param input - Caller-owned arguments, including built-in help and version flags.
 * @param version - Version presented by the built-in version command.
 * @returns The captured parse result, requiring no product service or runtime.
 * @remarks Native parser and Console callbacks synchronously update invocation-local Refs;
 * they never execute an Effect or share state with another parse.
 */
export const parseEffectCliEffect = Effect.fn("Cli.parse")(
  function* (
    input: readonly string[],
    version: string,
  ): Generator<Effect.Effect<unknown>, CliParseResult, never> {
    const argv = normalizeActionAliases(input);
    const invocation = yield* Ref.make<CliInvocation | undefined>(undefined);
    const stdout = yield* Ref.make<readonly string[]>([]);
    const stderr = yield* Ref.make<readonly string[]>([]);
    const command = createCliCommand((name, args) => {
      MutableRef.set(
        invocation.ref,
        Object.freeze({ command: name, args: Object.freeze([...args]) }),
      );
    });
    const capture = captureConsole(stdout, stderr);
    const result = yield* Effect.result(
      Command.runWith(command, { version, renderErrors: true })(argv).pipe(
        Effect.provide(cliLayer),
        Effect.provideService(Console.Console, capture),
      ),
    );
    const selected = yield* Ref.get(invocation);
    return Object.freeze({
      argv: Object.freeze([...argv]),
      ...(selected ? { invocation: selected } : {}),
      ...(Result.isFailure(result) && CliError.isCliError(result.failure)
        ? { error: result.failure }
        : {}),
      stdout: (yield* Ref.get(stdout)).join("\n"),
      stderr: (yield* Ref.get(stderr)).join("\n"),
      helpPath: Object.freeze(helpPath(argv)),
    });
  },
  (effect, _input, _version) => observeCli("command.parse", effect),
);

/**
 * Adapts standalone parser use to the shared CLI Promise execution edge.
 * @param input - Arguments to validate without running product handlers.
 * @param version - Version displayed by the built-in version command.
 * @returns One isolated parser result after its lifetime completes.
 */
export function parseEffectCli(input: readonly string[], version: string): Promise<CliParseResult> {
  return runCliEffect(parseEffectCliEffect(input, version), Layer.empty);
}

/** Selects the final JSON flag value using the established CLI precedence.
 * @param argv - Original CLI arguments.
 * @returns The last explicit JSON-mode setting, preserving false overrides.
 */
export function isJsonMode(argv: readonly string[]): boolean {
  let enabled = false;
  for (const argument of argv) {
    if (argument === "--json" || argument === "--json=true") enabled = true;
    else if (argument === "--json=false") enabled = false;
  }
  return enabled;
}

/** Projects parser failures into the established public error wording.
 * @param error - Validated Effect CLI parser failure.
 * @returns Existing public wording, including the required-name compatibility message.
 */
export function cliErrorMessage(error: CliError.CliError): string {
  if (
    error._tag === "ShowHelp" &&
    error.commandPath.join(" ") === "relkit create" &&
    error.errors.some((entry) => entry._tag === "MissingArgument" && entry.argument === "name")
  )
    return "name is required";
  return error._tag === "ShowHelp"
    ? error.errors.map((entry) => entry.message).join("\n") || error.message
    : error.message;
}

/** Recognizes unknown-command parser failures for public presentation.
 * @param error - Validated parser failure.
 * @returns Existing unknown-command wording, absent for unrelated failures.
 */
export function unknownCommandMessage(error: CliError.CliError): string | undefined {
  if (error._tag !== "ShowHelp") return undefined;
  const unknown = error.errors.find((entry) => entry._tag === "UnknownSubcommand");
  if (!unknown || unknown._tag !== "UnknownSubcommand") return undefined;
  return unknown.suggestions.length === 0
    ? `Command is not implemented: ${unknown.subcommand}`
    : unknown.message;
}

/** Normalizes help and version action aliases before parsing.
 * @param argv - Original invocation tokens.
 * @returns The existing help/version action aliases expressed as parser flags.
 */
function normalizeActionAliases(argv: readonly string[]): readonly string[] {
  const command = argv.findIndex((argument) => !argument.startsWith("-"));
  if (command < 0) return argv;
  if (argv[command] === "help")
    return [...argv.slice(0, command), ...argv.slice(command + 1), "--help"];
  if (argv[command] === "version" && command === argv.length - 1)
    return [...argv.slice(0, command), "--version"];
  return argv;
}

/** Selects the static help path from normalized invocation tokens.
 * @param argv - Normalized invocation tokens.
 * @returns The matching static help tree path without executing a command.
 */
function helpPath(argv: readonly string[]): readonly string[] {
  const path: string[] = [];
  let node = findCliHelp(path);
  for (const argument of argv) {
    const child = node?.commands.find((entry) => entry.name === argument);
    if (!child) continue;
    path.push(child.name);
    node = child;
  }
  return path;
}

/**
 * Captures native parser console callbacks into invocation-owned Refs.
 * @param stdout - This parse's borrowed output admission.
 * @param stderr - This parse's diagnostic admission.
 * @returns A synchronous Console substitute; callbacks never execute an Effect.
 */
function captureConsole(
  stdout: Ref.Ref<readonly string[]>,
  stderr: Ref.Ref<readonly string[]>,
): Console.Console {
  const write =
    (target: Ref.Ref<readonly string[]>) =>
    (...values: readonly unknown[]) => {
      MutableRef.update(target.ref, (lines) => [...lines, values.map(String).join(" ")]);
    };
  return {
    ...console,
    log: write(stdout),
    info: write(stdout),
    error: write(stderr),
    warn: write(stderr),
  };
}
