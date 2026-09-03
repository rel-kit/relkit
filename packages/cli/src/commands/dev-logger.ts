import { admitObservabilityRecord } from "@relkit/observability";
import { isLogLevelEnabled } from "@relkit/runtime-effect";
import type { DevLog, DevOptions } from "./dev.js";
import { devLogRecord } from "./dev-log-record.js";
import { formatDevLog } from "./dev-log-format.js";

export function createDevLogger(options: DevOptions): DevLog {
  return (event) => {
    try {
      const { record, origin, forwarded } = devLogRecord(event);
      const safe = admitObservabilityRecord(options.logger?.redact?.(record) ?? record);
      if (safe?.signal !== "log") return;
      if (!forwarded) options.onRecord?.(safe, origin);
      options.logger?.collector?.collect(safe);
      options.onLog?.({
        ...event,
        level: safe.level,
        fields:
          event.fields?.output === undefined
            ? safe.fields
            : { ...safe.fields, output: safe.message },
      });
      const minimum =
        options.logger?.minimumLevel ?? (options.terminal?.verbose ? "debug" : "info");
      if (!isLogLevelEnabled(safe.level, minimum)) return;
      if (options.logger?.json) options.logger.json.write(safe);
      if (options.logger?.human === false) return;
      const line = formatDevLog(safe, {
        ...options.terminal,
        color:
          options.terminal?.color ??
          (process.stderr.isTTY === true && process.env.NO_COLOR === undefined),
        columns: options.terminal?.columns ?? process.stderr.columns ?? 100,
      });
      if (line === "") return;
      if (options.logger?.human) options.logger.human.write(line, safe);
      else process.stderr.write(`${line}\n`);
    } catch {
      // A log callback or sink must not change application lifecycle behavior.
    }
  };
}
