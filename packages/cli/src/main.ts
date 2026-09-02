import { Effect } from "effect";
import { canonicalJson } from "@relkit/contracts";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";
import { formatGenerateResult } from "create-relkit";
import { executeCommand } from "./command-dispatch.js";
import {
  cliErrorMessage,
  isJsonMode,
  parseEffectCli,
  unknownCommandMessage,
  type CliInvocation,
} from "./cli-effect-runtime.js";
import {
  CLI_EXIT_CODES,
  CLI_VERSION,
  createReporter,
  errorMessage,
  fail,
  helpPayload,
  installSignals,
  isGeneratorApi,
  loadCreateRelkit,
  toFailure,
  type CliIo,
  type CliLogger,
  type CliReporter,
  type CliRuntime,
} from "./main-support.js";

export * from "./cli-help-model.js";
export * from "./main-support.js";

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  runtime: CliRuntime = {},
): Promise<number> {
  const io = runtime.io ?? processIo;
  const json = isJsonMode(argv);
  const reporter = createReporter(json, io);
  if (hasAction(argv, "help", "h") && hasAction(argv, "version", "v")) {
    reporter.error("RELKIT_CLI_USAGE", "--help and --version are exclusive");
    return CLI_EXIT_CODES.usage;
  }
  const version = runtime.version ?? CLI_VERSION;
  let parsed: Awaited<ReturnType<typeof parseEffectCli>>;
  try {
    parsed = await parseEffectCli(argv, version);
  } catch (error) {
    reporter.error("RELKIT_INTERNAL_ERROR", errorMessage(error));
    return CLI_EXIT_CODES.failure;
  }
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
  const completionShell = actionValue(parsed.argv, "completions");
  if (completionShell !== undefined) {
    reporter.output(
      {
        name: "relkit",
        shell: completionShell === "sh" ? "bash" : completionShell,
        script: parsed.stdout,
      },
      parsed.stdout,
    );
    return CLI_EXIT_CODES.success;
  }
  if (hasAction(parsed.argv, "help", "h") || parsed.invocation === undefined) {
    reporter.output(helpPayload(version, parsed.helpPath), parsed.stdout);
    return CLI_EXIT_CODES.success;
  }
  return executeInvocation(parsed.invocation, json, runtime, reporter, io);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runCli(argv);
}

async function executeInvocation(
  invocation: CliInvocation,
  json: boolean,
  runtime: CliRuntime,
  reporter: CliReporter,
  io: CliIo,
): Promise<number> {
  const controller = new AbortController();
  const signal = runtime.signal
    ? AbortSignal.any([runtime.signal, controller.signal])
    : controller.signal;
  const removeSignals =
    runtime.installSignalHandlers === false ? () => undefined : installSignals(controller);
  const log = createCliLogger(json, io);
  const status = richStatus(runtime, json, io, invocation.command);
  try {
    status.start();
    const result = await execute(invocation, runtime, signal, reporter, log, json, io);
    if (signal.aborted) {
      const failure = toFailure(signal.reason, signal);
      reporter.error(failure.code, failure.message);
      return failure.exitCode;
    }
    status.finish(result === CLI_EXIT_CODES.success);
    return result;
  } catch (error) {
    const failure = toFailure(error, signal);
    reporter.error(failure.code, failure.message);
    status.finish(false);
    return failure.exitCode;
  } finally {
    removeSignals();
  }
}

async function execute(
  invocation: CliInvocation,
  runtime: CliRuntime,
  signal: AbortSignal,
  reporter: CliReporter,
  log: CliLogger,
  json: boolean,
  io: CliIo,
): Promise<number> {
  const context = {
    command: invocation.command,
    args: invocation.args,
    json,
    signal,
    tty: runtime.tty ?? process.stdin.isTTY,
    reporter,
    log,
    ...(json ? {} : { onProgress: (message: string) => io.stderr(message) }),
  };
  if (invocation.command !== "create") return executeCommand(invocation, context);
  const api = await (runtime.loadCreateRelkit ?? loadCreateRelkit)();
  if (!isGeneratorApi(api))
    throw fail("RELKIT_CREATE_API_UNAVAILABLE", "The create-relkit generator API is unavailable.");
  let options: unknown;
  try {
    options = api.normalizeCreateOptions(invocation.args, { json });
  } catch (error) {
    throw fail("RELKIT_CLI_USAGE", errorMessage(error), CLI_EXIT_CODES.usage);
  }
  const result = await api.generateProject(options, context);
  if (result !== undefined) reporter.output(result, formatGenerateResult(result));
  return CLI_EXIT_CODES.success;
}

function createCliLogger(json: boolean, io: CliIo): CliLogger {
  const layer = createLoggerLayer({
    component: "cli",
    human: json ? false : { write: (line: string) => io.stderr(line) },
    json: json ? { write: (record: LogRecord) => io.stderr(canonicalJson(record)) } : false,
  });
  return (level, message, fields) => {
    const effect =
      level === "error" || level === "fatal" ? Effect.logError(message) : Effect.logInfo(message);
    Effect.runSync(effect.pipe(Effect.annotateLogs(fields ?? {}), Effect.provide(layer)));
  };
}

function hasAction(argv: readonly string[], name: string, alias?: string): boolean {
  return argv.some(
    (entry) => entry === `--${name}` || (alias === undefined ? false : entry === `-${alias}`),
  );
}
function actionValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.findIndex((entry) => entry === `--${name}` || entry.startsWith(`--${name}=`));
  if (index < 0) return undefined;
  return argv[index]!.includes("=") ? argv[index]!.split("=", 2)[1] : argv[index + 1];
}
function richStatus(runtime: CliRuntime, json: boolean, io: CliIo, command: string) {
  const enabled =
    !json &&
    command !== "create" &&
    !(runtime.ci ?? Boolean(process.env.CI)) &&
    (runtime.tty ?? process.stderr.isTTY) === true;
  return {
    start: () => enabled && io.stderr(`● relkit ${command}`),
    finish: (ok: boolean) => enabled && io.stderr(`${ok ? "✓" : "✗"} relkit ${command}`),
  };
}

const processIo: CliIo = Object.freeze({
  stdout: (line: string) => process.stdout.write(`${line}\n`),
  stderr: (line: string) => process.stderr.write(`${line}\n`),
});

if (import.meta.main) process.exitCode = await main();
