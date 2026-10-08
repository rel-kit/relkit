import { canonicalJson } from "@relkit/contracts";
import { admitObservabilityRecord } from "@relkit/observability";
import { isLogLevelEnabled } from "@relkit/runtime-effect";
import type { DevLog, DevOptions } from "./dev.js";
import { devLogRecord } from "./dev-log-record.js";
import { formatDevLog } from "./dev-log-format.js";

/**
 * Preserves the selected terminal mode without adding ordinary CLI stdout output.
 * @param json - Whether development logs use JSON envelopes.
 * @param write - Borrowed diagnostic sink.
 * @returns Mutually exclusive existing human/JSON logger sinks.
 */
export function devLogSinks(
  json: boolean,
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): Pick<NonNullable<DevOptions["logger"]>, "human" | "json"> {
  return {
    human: json ? false : { write },
    json: json ? { write: (record) => write(canonicalJson(record)) } : false,
  };
}

/**
 * Constructs the synchronous SDK logging edge after validation and redaction.
 * @param options - Existing sinks, threshold, callbacks and terminal policy.
 * @returns A callback that isolates sink failures from the scoped session lifecycle.
 */
export function createDevLogger(options: DevOptions): DevLog {
  let startupFailed = false;
  let stopping = false;
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
      if (safe.message === "dev.build.started") startupFailed = false;
      if (safe.message === "dev.shutdown.started") stopping = true;
      if (!isLogLevelEnabled(safe.level, minimum)) return;
      if (options.logger?.json) options.logger.json.write(safe);
      if (options.logger?.human === false) return;
      if (stopping && origin === "inspector" && !options.terminal?.verbose) return;
      if (
        !options.terminal?.verbose &&
        minimum !== "debug" &&
        minimum !== "trace" &&
        minimum !== "all" &&
        typeof safe.fields.domain === "string" &&
        typeof safe.fields.operation === "string" &&
        /^Execution operation (?:completed|failed|interrupted)$/.test(safe.message)
      )
        return;
      if (
        /^runtime\.(provider|database|auth)$/.test(safe.component) &&
        safe.level === "error" &&
        safe.message.includes("startup failed")
      )
        startupFailed = true;
      const human =
        !options.terminal?.verbose &&
        startupFailed &&
        safe.message === "dev.generation.failed" &&
        /RELKIT_CANDIDATE_(PROVIDER|ENVIRONMENT)_NOT_READY/.test(String(safe.fields.message))
          ? {
              ...safe,
              fields: {
                previousActive: safe.fields.previousActive === true,
                message: safe.fields.previousActive
                  ? "Resolve the startup error above, then save .env or a source file to retry."
                  : "Resolve the startup error above, then run relkit dev again.",
              },
            }
          : safe;
      const line = formatDevLog(human, {
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
