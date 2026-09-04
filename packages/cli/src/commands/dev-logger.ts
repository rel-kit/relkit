import { canonicalJson } from "@relkit/contracts";
import { admitObservabilityRecord } from "@relkit/observability";
import { isLogLevelEnabled } from "@relkit/runtime-effect";
import type { DevLog, DevOptions } from "./dev.js";
import { devLogRecord } from "./dev-log-record.js";
import { formatDevLog } from "./dev-log-format.js";

export function devLogSinks(
  json: boolean,
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): Pick<NonNullable<DevOptions["logger"]>, "human" | "json"> {
  return {
    human: json ? false : { write },
    json: json ? { write: (record) => write(canonicalJson(record)) } : false,
  };
}

export function createDevLogger(options: DevOptions): DevLog {
  return (event) => {
    try {
      const { record, origin, forwarded, transient } = devLogRecord(event);
      const safe = admitObservabilityRecord(options.logger?.redact?.(record) ?? record);
      if (safe?.signal !== "log") return;
      if (!forwarded && !transient) options.onRecord?.(safe, origin);
      if (!transient) options.logger?.collector?.collect(safe);
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
