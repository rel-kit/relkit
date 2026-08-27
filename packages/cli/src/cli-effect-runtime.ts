import { Console, Effect, FileSystem, Layer, Path, Result, Stdio, Terminal } from "effect";
import { CliConfig, CliError, Command, GlobalFlag } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";
import { createCliCommand } from "./cli-command.js";
import { findCliHelp } from "./cli-help-model.js";

export interface CliInvocation {
  readonly command: string;
  readonly args: readonly string[];
}
export interface CliParseResult {
  readonly argv: readonly string[];
  readonly invocation?: CliInvocation;
  readonly error?: CliError.CliError;
  readonly stdout: string;
  readonly stderr: string;
  readonly helpPath: readonly string[];
}

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

/** Parses and validates one invocation through Effect CLI without running product handlers. */
export async function parseEffectCli(
  input: readonly string[],
  version: string,
): Promise<CliParseResult> {
  const argv = normalizeActionAliases(input);
  let invocation: CliInvocation | undefined;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const command = createCliCommand((name, args) => {
    invocation = Object.freeze({ command: name, args: Object.freeze([...args]) });
  });
  const capture = captureConsole(stdout, stderr);
  const result = await Effect.runPromise(
    Effect.result(
      Command.runWith(command, { version, renderErrors: true })(argv).pipe(
        Effect.provide(cliLayer),
        Effect.provideService(Console.Console, capture),
      ),
    ),
  );
  return Object.freeze({
    argv: Object.freeze([...argv]),
    ...(invocation ? { invocation } : {}),
    ...(Result.isFailure(result) && CliError.isCliError(result.failure)
      ? { error: result.failure }
      : {}),
    stdout: stdout.join("\n"),
    stderr: stderr.join("\n"),
    helpPath: Object.freeze(helpPath(argv)),
  });
}

export function isJsonMode(argv: readonly string[]): boolean {
  let enabled = false;
  for (const argument of argv) {
    if (argument === "--json" || argument === "--json=true") enabled = true;
    else if (argument === "--json=false") enabled = false;
  }
  return enabled;
}

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

export function unknownCommandMessage(error: CliError.CliError): string | undefined {
  if (error._tag !== "ShowHelp") return undefined;
  const unknown = error.errors.find((entry) => entry._tag === "UnknownSubcommand");
  if (!unknown || unknown._tag !== "UnknownSubcommand") return undefined;
  return unknown.suggestions.length === 0
    ? `Command is not implemented: ${unknown.subcommand}`
    : unknown.message;
}

function normalizeActionAliases(argv: readonly string[]): readonly string[] {
  const command = argv.findIndex((argument) => !argument.startsWith("-"));
  if (command < 0) return argv;
  if (argv[command] === "help")
    return [...argv.slice(0, command), ...argv.slice(command + 1), "--help"];
  if (argv[command] === "version" && command === argv.length - 1)
    return [...argv.slice(0, command), "--version"];
  return argv;
}

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

function captureConsole(stdout: string[], stderr: string[]): Console.Console {
  const write =
    (target: string[]) =>
    (...values: readonly unknown[]) => {
      target.push(values.map(String).join(" "));
    };
  return Object.assign(Object.create(console) as Console.Console, {
    log: write(stdout),
    info: write(stdout),
    error: write(stderr),
    warn: write(stderr),
  });
}
