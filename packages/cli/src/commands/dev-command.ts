import { canonicalJson } from "@relkit/contracts";
import { admitObservabilityRecord, type TelemetryConfiguration } from "@relkit/observability";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkProject } from "./check.js";
import { startDev, type DevOptions } from "./dev.js";
import { createDevLogger } from "./dev-logger.js";
import { developmentPorts } from "./dev-inspector.js";
import { createDevLocalCompiler } from "./dev-local.js";
import { startDevSourceWatcher } from "./dev-watch.js";
import { parseProjectArgs } from "./project-args.js";
import { startDevTelemetry } from "./dev-telemetry.js";
import { fail, type CliCommandContext } from "../main-support.js";

export async function runDevCommand(
  args: readonly string[],
  context: CliCommandContext,
): Promise<void> {
  const options = parseProjectArgs(args, "dev");
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const ports = await developmentPorts(
    projectRoot,
    options.port,
    options.inspectorPort,
    process.env,
  );
  const write = context.io?.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const logger: NonNullable<DevOptions["logger"]> = {
    redact: (record) => {
      const safe = admitObservabilityRecord(record, configuration.redaction);
      return safe?.signal === "log" ? safe : record;
    },
    minimumLevel: options.logLevel ?? (options.verbose ? "debug" : "info"),
    human: context.json ? false : { write },
    json: context.json ? { write: (record) => write(canonicalJson(record)) } : false,
  };
  const terminal = {
    verbose: options.verbose ?? false,
    color:
      !options.noColor &&
      !context.json &&
      process.env.NO_COLOR === undefined &&
      process.stderr.isTTY === true,
  };
  // Resolve retention before importing history, so user-configured longer retention is honored.
  const checked = await checkProject({ projectRoot, mode: "development", signal: context.signal });
  if (!checked.ok)
    throw fail(
      "RELKIT_DEV_COMPILE_FAILED",
      checked.diagnostics.map((item) => item.message).join("\n"),
    );
  const graph = JSON.parse(checked.outputs.graph) as {
    nodes: { kind: string; telemetry?: TelemetryConfiguration }[];
  };
  let configuration = graph.nodes.find((node) => node.kind === "app")?.telemetry ?? {};
  let telemetry: Awaited<ReturnType<typeof startDevTelemetry>> | undefined;
  const compiler = createDevLocalCompiler(projectRoot, options.local !== "off", (next) => {
    configuration = next;
    return telemetry?.configure(next);
  });
  const log = createDevLogger({ compile: compiler.compile, logger, terminal });
  telemetry = await startDevTelemetry(projectRoot, configuration, (error) =>
    log({ level: "error", event: "dev.storage.failed", fields: { message: error.message } }),
  );
  const generatedRoot = join(projectRoot, ".relkit", "generated");
  let generatedDirectory: string | undefined;
  try {
    if (telemetry.imported.records || telemetry.imported.malformed)
      log({
        level: telemetry.imported.malformed ? "warn" : "info",
        event: "dev.storage.imported",
        fields: telemetry.imported,
      });
    await mkdir(generatedRoot, { recursive: true });
    generatedDirectory = await mkdtemp(join(generatedRoot, ".dev-"));
    const session = await startDev({
      projectRoot,
      stablePort: ports.backend,
      generatedDirectory,
      signal: context.signal,
      inspector: { ...ports.inspector, environment: { FORCE_COLOR: "0", NO_COLOR: undefined } },
      compile: compiler.compile,
      localServices: compiler,
      candidateStopTimeoutMs: 30_000,
      logger,
      terminal,
      environment: {
        RELKIT_DEV_LOGS: "1",
        RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS: process.env.RELKIT_TELEMETRY_FLUSH_TIMEOUT_MS ?? "15000",
        ...telemetry.environment,
      },
      intercept: telemetry.handle,
      onStopping: telemetry.closeStream,
      onRecord: telemetry.append,
      observability: { append: (record) => telemetry?.append(record) },
    });
    try {
      const watcher = startDevSourceWatcher(session);
      try {
        await session.waitForShutdown();
      } finally {
        watcher.close();
      }
    } finally {
      await session.stop();
    }
  } finally {
    await compiler.close();
    await telemetry.close();
    if (generatedDirectory)
      await rm(generatedDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
