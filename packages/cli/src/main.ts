import { Effect } from "effect";
import { canonicalJson } from "@zsys/contracts";
import { createLoggerLayer, type LogRecord } from "@zsys/runtime-effect";
import { formatGenerateResult } from "create-zsys";
import { executeCommand } from "./command-dispatch.js";
import {
  CLI_EXIT_CODES,
  CLI_VERSION,
  createReporter,
  errorMessage,
  fail,
  helpPayload,
  helpText,
  installSignals,
  isGeneratorApi,
  loadCreateZsys,
  toFailure,
  type CliIo,
  type CliLogger,
  type CliReporter,
  type CliRuntime,
  type ParsedCliArgs,
  parseCliArgs,
} from "./main-support.js";

export * from "./main-support.js";

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  runtime: CliRuntime = {},
): Promise<number> {
  const parsed = parseCliArgs(argv);
  const io = runtime.io ?? processIo;
  const reporter = createReporter(parsed.json, io);
  if (parsed.error !== undefined) {
    reporter.error("ZSYS_CLI_USAGE", parsed.error);
    return CLI_EXIT_CODES.usage;
  }
  const version = runtime.version ?? CLI_VERSION;
  if (parsed.help) {
    reporter.output(helpPayload(version, parsed.command), helpText(version, parsed.command));
    return CLI_EXIT_CODES.success;
  }
  if (parsed.version) {
    reporter.output({ name: "zsys", version }, `zsys ${version}`);
    return CLI_EXIT_CODES.success;
  }
  if (parsed.command === undefined) {
    reporter.output(helpPayload(version, undefined), helpText(version, undefined));
    return CLI_EXIT_CODES.success;
  }

  const controller = new AbortController();
  const signal = runtime.signal
    ? AbortSignal.any([runtime.signal, controller.signal])
    : controller.signal;
  const removeSignals =
    runtime.installSignalHandlers === false ? () => undefined : installSignals(controller);
  const loggerLayer = createLoggerLayer({
    component: "cli",
    human: parsed.json ? false : { write: (line: string) => io.stderr(line) },
    json: parsed.json ? { write: (record: LogRecord) => io.stderr(canonicalJson(record)) } : false,
  });
  const log: CliLogger = (level, message, fields) => {
    try {
      const effect =
        level === "error" || level === "fatal"
          ? Effect.logError(message)
          : level === "warn"
            ? Effect.logWarning(message)
            : level === "info"
              ? Effect.logInfo(message)
              : Effect.logDebug(message);
      Effect.runSync(effect.pipe(Effect.annotateLogs(fields ?? {}), Effect.provide(loggerLayer)));
    } catch {
      /* Logging must not change command cleanup. */
    }
  };
  try {
    const result = await execute(parsed, runtime, signal, reporter, log);
    if (signal.aborted) {
      const failure = toFailure(signal.reason, signal);
      reporter.error(failure.code, failure.message);
      return failure.exitCode;
    }
    return result;
  } catch (error) {
    const failure = toFailure(error, signal);
    reporter.error(failure.code, failure.message);
    return failure.exitCode;
  } finally {
    removeSignals();
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runCli(argv);
}

async function execute(
  parsed: ParsedCliArgs,
  runtime: CliRuntime,
  signal: AbortSignal,
  reporter: CliReporter,
  log: CliLogger,
): Promise<number> {
  if (parsed.command !== "create")
    return executeCommand(parsed, {
      command: parsed.command ?? "",
      args: parsed.args,
      json: parsed.json,
      signal,
      reporter,
      log,
    });
  const api = await (runtime.loadCreateZsys ?? loadCreateZsys)();
  if (!isGeneratorApi(api))
    throw fail("ZSYS_CREATE_API_UNAVAILABLE", "The create-zsys generator API is unavailable.");
  let options: unknown;
  try {
    options = api.normalizeCreateOptions(parsed.args, { json: parsed.json });
  } catch (error) {
    throw fail("ZSYS_CLI_USAGE", errorMessage(error), CLI_EXIT_CODES.usage);
  }
  const result = await api.generateProject(options, {
    command: "create",
    args: parsed.args,
    json: parsed.json,
    signal,
    reporter,
    log,
  });
  if (result !== undefined) reporter.output(result, formatGenerateResult(result));
  return CLI_EXIT_CODES.success;
}

const processIo: CliIo = Object.freeze({
  stdout: (line: string) => process.stdout.write(`${line}\n`),
  stderr: (line: string) => process.stderr.write(`${line}\n`),
});

if (import.meta.main) process.exitCode = await main();
