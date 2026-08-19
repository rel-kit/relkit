import type { ObservabilityRecord } from "./model.js";
import { createObservabilityCollector, type ObservabilityCollectorOptions } from "./collector.js";
import { createObservabilityQuery, type ObservabilityQuery } from "./query.js";
import { createObservabilityStream, type ObservabilityStreamEventType } from "./stream.js";
import { createObservabilityIndex } from "./storage/index.js";
import { createObservabilitySegmentStore } from "./storage/segments.js";

export interface ObservabilityRuntimeOptions extends ObservabilityCollectorOptions {
  readonly root?: string;
}

export async function createObservabilityRuntime(options: ObservabilityRuntimeOptions = {}) {
  const collector = createObservabilityCollector(options);
  const shared = {
    ...(options.root === undefined ? {} : { root: options.root }),
    ...(options.redaction === undefined ? {} : { redaction: options.redaction }),
  };
  const index = await createObservabilityIndex(shared);
  const store = await createObservabilitySegmentStore({
    ...shared,
    index,
  });
  const baseQuery = createObservabilityQuery(index, shared);
  const stream = createObservabilityStream(shared);
  const pending = new Set<Promise<unknown>>();
  const persist = (record: ObservabilityRecord | undefined): void => {
    if (record === undefined) return;
    const type = streamType(record);
    if (type !== undefined) stream.publishRecord(type, record);
    const write = store.append(record).finally(() => pending.delete(write));
    pending.add(write);
  };
  const flush = async (): Promise<void> => {
    await Promise.all([...pending]);
    await store.flush();
    await index.flush();
  };
  const query: ObservabilityQuery = Object.freeze({
    requests: async (value: Parameters<ObservabilityQuery["requests"]>[0]) => {
      await flush();
      return baseQuery.requests(value);
    },
    request: async (id: string) => {
      await flush();
      return baseQuery.request(id);
    },
    logs: async (value: Parameters<ObservabilityQuery["logs"]>[0]) => {
      await flush();
      return baseQuery.logs(value);
    },
    log: async (cursor: string) => {
      await flush();
      return baseQuery.log(cursor);
    },
    traces: async (value: Parameters<ObservabilityQuery["traces"]>[0]) => {
      await flush();
      return baseQuery.traces(value);
    },
    trace: async (id: string) => {
      await flush();
      return baseQuery.trace(id);
    },
  });
  return Object.freeze({
    protocol: collector.protocol,
    version: collector.version,
    collect: (record: ObservabilityRecord) => {
      const admitted = collector.collect(record);
      persist(admitted);
      return admitted;
    },
    emit: (event: unknown) => {
      const admitted = collector.emit(event);
      persist(admitted);
      return admitted;
    },
    read: collector.read,
    readRecords: collector.read,
    query,
    stream,
    flush,
    close: async () => {
      await flush();
      stream.close();
      await store.close();
      await index.close();
    },
  });
}

function streamType(record: ObservabilityRecord): ObservabilityStreamEventType | undefined {
  if (record.signal === "request") return "request.completed";
  if (record.signal === "log") return "log.emitted";
  if (record.signal === "span")
    return record.status === "started" ? "span.started" : "span.completed";
  if (record.signal === "job") return "job.changed";
  if (record.signal === "event")
    return record.kind === "publication" ? "event.published" : "event.delivery.changed";
  if (record.signal === "generation") return "generation.changed";
  return record.signal === "diagnostic" ? "diagnostic.changed" : undefined;
}
