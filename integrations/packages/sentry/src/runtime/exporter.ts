import {
  isTelemetryError,
  type RedactedObservabilityRecord,
  type TelemetryExporterFactoryContext,
  type TelemetryExporterRuntime,
} from "@relkit/observability";

export interface SentryExporterOptions {
  readonly dsn: string;
  readonly environment?: string;
  readonly release?: string;
  readonly sdk?: SentrySdk;
}

export interface SentryScope {
  readonly setTag: (name: string, value: string) => void;
}

export interface SentrySdk {
  readonly init: (options: Readonly<Record<string, unknown>>) => void;
  readonly withScope: (callback: (scope: SentryScope) => void) => void;
  readonly captureException: (error: Error) => unknown;
  readonly captureEvent: (event: Readonly<Record<string, unknown>>) => unknown;
  readonly flush: (timeout?: number) => Promise<boolean>;
  readonly close: (timeout?: number) => Promise<boolean>;
}

export interface SentryExporter {
  readonly exportRecord: (record: RedactedObservabilityRecord) => void;
  readonly flush: (timeoutMs?: number) => Promise<boolean>;
  readonly close: (timeoutMs?: number) => Promise<boolean>;
}

export async function createSentryExporter(
  options: SentryExporterOptions,
): Promise<SentryExporter> {
  const dsn = required(options.dsn, "dsn");
  const sdk = options.sdk ?? ((await import("@sentry/bun")) as SentrySdk);
  sdk.init({
    dsn,
    sendDefaultPii: false,
    ...(options.environment === undefined
      ? {}
      : { environment: required(options.environment, "environment") }),
    ...(options.release === undefined ? {} : { release: required(options.release, "release") }),
  });
  let closed = false;
  return Object.freeze({
    exportRecord: (record: RedactedObservabilityRecord) => {
      if (closed) throw new Error("Sentry exporter is closed");
      const tags = recordTags(record);
      sdk.withScope((scope) => {
        for (const [name, value] of Object.entries(tags).sort(([left], [right]) =>
          left.localeCompare(right),
        )) {
          scope.setTag(required(name, "tag name"), required(value, `tag ${name}`));
        }
        if (isTelemetryError(record)) sdk.captureException(new Error(message(record)));
        else
          sdk.captureEvent({
            message: message(record),
            level: record.signal === "log" ? record.level : "info",
            extra: { record },
          });
      });
    },
    flush: (timeoutMs = 1_000) => sdk.flush(timeout(timeoutMs)),
    close: async (timeoutMs = 1_000) => {
      if (closed) return true;
      closed = true;
      return sdk.close(timeout(timeoutMs));
    },
  });
}

export async function createTelemetryExporter(
  context: TelemetryExporterFactoryContext,
): Promise<TelemetryExporterRuntime> {
  const configuration = context.configuration;
  const exporter = await createSentryExporter({
    dsn: required(configuration.dsn, "dsn"),
    ...(configuration.environment === undefined
      ? {}
      : { environment: required(configuration.environment, "environment") }),
    ...(configuration.release === undefined
      ? {}
      : { release: required(configuration.release, "release") }),
  });
  return Object.freeze({
    exportRecord: exporter.exportRecord,
    flush: async (timeoutMs?: number) => void (await exporter.flush(timeoutMs)),
    close: async (timeoutMs?: number) => void (await exporter.close(timeoutMs)),
  });
}

function recordTags(record: RedactedObservabilityRecord): Readonly<Record<string, string>> {
  return {
    "relkit.signal": record.signal,
    ...(record.traceId === undefined ? {} : { "relkit.trace_id": record.traceId }),
    ...(record.serviceId === undefined ? {} : { "relkit.service_id": record.serviceId }),
    ...(record.generationId === undefined ? {} : { "relkit.generation_id": record.generationId }),
  };
}

function message(record: RedactedObservabilityRecord): string {
  if (record.signal === "log" || record.signal === "diagnostic") return record.message;
  return `RelKit ${record.signal}${isTelemetryError(record) ? " failed" : ""}`;
}

function timeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 30_000)
    throw new RangeError("Sentry timeout must be between 0 and 30000");
  return value;
}

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`Sentry ${name} must be non-empty text`);
  return value.trim();
}
