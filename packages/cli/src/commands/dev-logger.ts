import { Effect } from "effect";
import { createLoggerLayer } from "@zsys/runtime-effect";
import type { DevLog, DevLogEvent, DevOptions } from "./dev.js";

export function createDevLogger(options: DevOptions): DevLog {
  const human = { write: (line: string) => process.stderr.write(`${line}\n`) };
  const layer = createLoggerLayer({
    component: "cli.dev",
    human: options.logger?.human ?? human,
    json: options.logger?.json ?? false,
    ...(options.logger?.minimumLevel === undefined
      ? {}
      : { minimumLevel: options.logger.minimumLevel }),
    ...(options.logger?.collector === undefined ? {} : { collector: options.logger.collector }),
    ...(options.logger?.redact === undefined ? {} : { redact: options.logger.redact }),
  });
  return (event: DevLogEvent) => {
    try {
      options.onLog?.(event);
      const effect =
        event.level === "error"
          ? Effect.logError(event.event)
          : event.level === "warn"
            ? Effect.logWarning(event.event)
            : Effect.logInfo(event.event);
      Effect.runSync(effect.pipe(Effect.annotateLogs(event.fields ?? {}), Effect.provide(layer)));
    } catch {
      // Logging must not change lifecycle cleanup.
    }
  };
}
