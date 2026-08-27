import { Effect } from "effect";
import { admitObservabilityRecord, OBSERVABILITY_MODEL_VERSION } from "@relkit/observability";
import { createLoggerLayer } from "@relkit/runtime-effect";
import type { DevLog, DevLogEvent, DevOptions } from "./dev.js";

export function createDevLogger(options: DevOptions): DevLog {
  const human = { write: (line: string) => process.stderr.write(`${line}\n`) };
  const loggerOptions = {
    component: "cli.dev",
    human: options.logger?.human ?? human,
    json: options.logger?.json ?? false,
    ...(options.logger?.minimumLevel === undefined
      ? {}
      : { minimumLevel: options.logger.minimumLevel }),
    ...(options.logger?.collector === undefined ? {} : { collector: options.logger.collector }),
    ...(options.logger?.redact === undefined ? {} : { redact: options.logger.redact }),
  };
  const layer = createLoggerLayer(loggerOptions);
  const jsonLayer = createLoggerLayer({ ...loggerOptions, human: false });
  return (event: DevLogEvent) => {
    try {
      const candidate = candidateOutput(event, options);
      const safeEvent = candidate?.event ?? event;
      options.onLog?.(safeEvent);
      if (candidate !== undefined) {
        writeCandidateOutput(candidate, options);
        if (options.logger?.json === undefined || options.logger.json === false) return;
      }
      const effect =
        safeEvent.level === "error"
          ? Effect.logError(safeEvent.event)
          : safeEvent.level === "warn"
            ? Effect.logWarning(safeEvent.event)
            : Effect.logInfo(safeEvent.event);
      Effect.runSync(
        effect.pipe(
          Effect.annotateLogs(safeEvent.fields ?? {}),
          Effect.provide(candidate === undefined ? layer : jsonLayer),
        ),
      );
    } catch {
      // Logging must not change lifecycle cleanup.
    }
  };
}

function candidateOutput(event: DevLogEvent, options: DevOptions) {
  if (event.event !== "candidate.startup-output" || typeof event.fields?.output !== "string")
    return undefined;
  const record = {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "log" as const,
    timestamp: new Date().toISOString(),
    level: event.level,
    component: "cli.dev",
    message: event.fields.output,
    fields: { stream: String(event.fields.stream ?? "stdout") },
  };
  const admitted = admitObservabilityRecord(options.logger?.redact?.(record) ?? record);
  if (admitted?.signal !== "log") throw new TypeError("Candidate output redaction failed.");
  return {
    event: { ...event, fields: { ...event.fields, output: admitted.message } },
    output: admitted.message,
    record: admitted,
  };
}

function writeCandidateOutput(
  candidate: NonNullable<ReturnType<typeof candidateOutput>>,
  options: DevOptions,
): void {
  if (options.logger?.human === false) return;
  if (options.logger?.human !== undefined) {
    options.logger.human.write(candidate.output.trimEnd(), candidate.record);
    return;
  }
  const stream = candidate.record.fields.stream === "stderr" ? process.stderr : process.stdout;
  stream.write(candidate.output);
}
