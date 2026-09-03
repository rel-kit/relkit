import { resolve } from "node:path";
import { createObservabilityHandler } from "@relkit/inspector-api";
import {
  admitObservabilityRecord,
  createObservabilityStream,
  normalizeTelemetryConfiguration,
  type ObservabilityQuery,
  type ObservabilityRecord,
  type TelemetryConfiguration,
} from "@relkit/observability";
import {
  createLocalBatchQueue,
  startLocalWorker,
  validateLocalRecord,
  type LocalLogOrigin,
  type LocalRecord,
  type StoredLocalRecord,
} from "@relkit/observability/local";
import { streamTypeForRecord } from "./dev-telemetry-stream.js";
import { collectProducerStatus } from "./dev-telemetry-status.js";
export async function startDevTelemetry(
  projectRoot: string,
  configuration: TelemetryConfiguration = {},
  onFailure: (error: Error) => void = () => undefined,
) {
  const root = resolve(
    projectRoot,
    process.env.RELKIT_OBSERVABILITY_ROOT ?? ".relkit/observability",
  );
  const token = crypto.randomUUID();
  const producerStatus = collectProducerStatus();
  let error: string | undefined;
  let committed = 0;
  const failure = (reason: unknown): void => {
    const next = reason instanceof Error ? reason : new Error(String(reason));
    if (error === undefined) onFailure(next);
    error = next.message;
  };
  const worker = startLocalWorker(failure);
  let config = normalizeTelemetryConfiguration(configuration);
  let imported: { records: number; malformed: number };
  try {
    imported = await worker.call({
      type: "open",
      root,
      ...(config.localRetention ? { retention: config.localRetention } : {}),
      ...(config.redaction ? { redaction: config.redaction } : {}),
    });
  } catch (cause) {
    await worker.close();
    throw new Error(
      `Cannot open local telemetry database. Another dev session may own it: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const stream = createObservabilityStream();
  let streamClosed = false;
  const closeStream = (): void => {
    streamClosed = true;
    stream.close();
  };
  const append = async (records: readonly LocalRecord[]): Promise<void> => {
    try {
      const safe = records.map((item) => {
        validateLocalRecord(item);
        const record = admitObservabilityRecord(item.record, config.redaction);
        if (!record) throw new TypeError("Invalid telemetry record");
        return { ...item, record };
      });
      const stored = await worker.call<StoredLocalRecord[]>({ type: "append", records: safe });
      committed += stored.length;
      for (const record of stored) {
        const type = streamTypeForRecord(record);
        if (type && !streamClosed) stream.publishRecord(type, record);
      }
    } catch (reason) {
      failure(reason);
      throw reason;
    }
  };
  const queue = createLocalBatchQueue(append, failure);
  const source = crypto.randomUUID();
  let sequence = 0;
  const query: ObservabilityQuery = {
    logs: (query = {}) => worker.call({ type: "query", kind: "logs", query }),
    requests: (query = {}) => worker.call({ type: "query", kind: "requests", query }),
    traces: (query = {}) => worker.call({ type: "query", kind: "traces", query }),
    log: (id) => worker.call({ type: "detail", kind: "log", id }),
    request: (id) => worker.call({ type: "detail", kind: "request", id }),
    trace: (id) => worker.call({ type: "detail", kind: "trace", id }),
  };
  const api = createObservabilityHandler({ query, stream });
  const status = () => ({
    protocol: "relkit.observability.query",
    version: 1,
    state:
      error || producerStatus.snapshot().failed || producerStatus.snapshot().dropped
        ? "degraded"
        : "ready",
    error,
    persisted: committed,
    failed: queue.stats().failed + producerStatus.snapshot().failed,
    dropped: queue.stats().dropped + producerStatus.snapshot().dropped,
    root,
  });
  const serve = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (path === "/producer-status" && request.method === "POST")
      return producerStatus.report(request);
    if (path === "/_relkit/v1/storage")
      return Response.json(status(), { headers: { "x-relkit-api-version": "1" } });
    if (path === "/records" && request.method === "POST") {
      try {
        const value = (await request.json()) as { records?: unknown };
        if (!Array.isArray(value.records) || value.records.length > 256)
          return Response.json({ error: "Invalid batch" }, { status: 400 });
        for (const record of value.records) validateLocalRecord(record);
        await append(value.records);
        return Response.json({ ok: true });
      } catch (reason) {
        return Response.json(
          {
            error: reason instanceof TypeError ? "Invalid telemetry record" : "Storage unavailable",
          },
          { status: reason instanceof TypeError || reason instanceof SyntaxError ? 400 : 503 },
        );
      }
    }
    await queue.flush();
    return api(request);
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    maxRequestBodySize: 2 * 1024 * 1024,
    fetch: (request) =>
      request.headers.get("authorization") === `Bearer ${token}`
        ? serve(request)
        : new Response("Unauthorized", { status: 401 }),
  });
  let closed = false;
  return {
    imported,
    root,
    query,
    status,
    closeStream,
    environment: {
      RELKIT_TELEMETRY_URL: `http://127.0.0.1:${server.port}`,
      RELKIT_TELEMETRY_TOKEN: token,
    },
    append: (record: ObservabilityRecord, origin: LocalLogOrigin = "relkit") => {
      if (config.capture?.signals && !config.capture.signals.includes(record.signal)) return;
      const safe = admitObservabilityRecord(record, config.redaction);
      if (safe) queue.enqueue({ key: `${source}:${++sequence}`, origin, record: safe });
    },
    configure: async (configuration: TelemetryConfiguration) => {
      const next = normalizeTelemetryConfiguration(configuration);
      config = next;
      try {
        await worker.call({
          type: "retention",
          retention: next.localRetention ?? {},
          ...(next.redaction ? { redaction: next.redaction } : {}),
        });
      } catch (reason) {
        failure(reason);
      }
    },
    handle: (request: Request): Promise<Response> | undefined => {
      if (
        request.method !== "GET" ||
        !/^\/_relkit\/v1\/(logs|requests|traces|stream|storage)(\/|$)/.test(
          new URL(request.url).pathname,
        )
      )
        return;
      const bearer = process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN;
      if (bearer && request.headers.get("authorization") !== `Bearer ${bearer}`)
        return Promise.resolve(
          Response.json(
            {
              protocol: "relkit.inspector",
              version: 1,
              error: "RELKIT_OBSERVABILITY_UNAUTHORIZED",
            },
            { status: 401, headers: { "x-relkit-api-version": "1" } },
          ),
        );
      return serve(request);
    },
    close: async () => {
      if (closed) return;
      closed = true;
      closeStream();
      await queue.close();
      await server.stop(true);
      await worker.close();
    },
  };
}
