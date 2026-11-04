/**
 * Collects the session's logs, requests and spans from the bridge's record buffer, as its own
 * named collector, so the request tools can answer without the Inspector UI running. The bridge
 * keeps records until every active collector acknowledges them, so this one never takes records
 * away from the Inspector.
 */
import { randomUUID } from "node:crypto";
import {
  CAPTURE_CONSUMER_HEADER,
  INSPECTION_ACK_PATH,
  INSPECTION_RECORDS_PATH,
} from "relkit/inspector-api/connection";
import type { McpSession } from "./mcp.types.js";

/** One observability record as the bridge serves it. */
export type McpRecord = Readonly<Record<string, unknown>> & {
  readonly signal?: string;
  readonly requestId?: string;
  readonly traceId?: string;
};

/** Pulls and retains the most recent records of one session. */
export interface McpRecordCollector {
  /** Reads every record buffered since the last call and acknowledges it. */
  readonly sync: () => Promise<void>;
  /** Retained records, oldest first. */
  readonly records: () => readonly McpRecord[];
}

/**
 * Creates a collector with a bounded memory of records.
 * @param session - Authenticated session.
 * @param limit - Maximum records kept; older records are dropped first.
 * @returns A collector whose `sync` is safe to call from several tools at once.
 */
export function mcpRecordCollector(session: McpSession, limit = 4096): McpRecordCollector {
  const consumer = `relkit-mcp-${randomUUID()}`;
  const kept: McpRecord[] = [];
  let cursor = 0;
  let running: Promise<void> | undefined;
  const page = async (): Promise<boolean> => {
    const response = await session.request(`${INSPECTION_RECORDS_PATH}?after=${cursor}`, {
      headers: { [CAPTURE_CONSUMER_HEADER]: consumer },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const body = (await response.json()) as {
      records?: readonly { sequence: number; record: McpRecord }[];
    };
    const records = body.records ?? [];
    for (const entry of records) {
      kept.push(entry.record);
      cursor = Math.max(cursor, entry.sequence);
    }
    if (kept.length > limit) kept.splice(0, kept.length - limit);
    if (records.length === 0) return false;
    const ack = await session.request(INSPECTION_ACK_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", [CAPTURE_CONSUMER_HEADER]: consumer },
      body: JSON.stringify({ through: cursor }),
    });
    await ack.body?.cancel();
    return true;
  };
  const drain = async () => {
    for (let pages = 0; pages < 64 && (await page()); pages++);
  };
  return {
    sync: () => {
      running ??= drain().finally(() => {
        running = undefined;
      });
      return running;
    },
    records: () => kept,
  };
}

/**
 * Lists the latest completed requests, newest first.
 * @param records - Retained records.
 * @param limit - Maximum number returned.
 * @param failedOnly - Keep only requests with status 500 or above or a failed outcome.
 * @returns Request records with their IDs, routes and status.
 */
export function recentRequests(
  records: readonly McpRecord[],
  limit: number,
  failedOnly: boolean,
): McpRecord[] {
  const latest = new Map<string, McpRecord>();
  for (const record of records)
    if (record.signal === "request" && typeof record.requestId === "string")
      latest.set(record.requestId, record);
  return [...latest.values()]
    .filter((record) => !failedOnly || failed(record))
    .reverse()
    .slice(0, limit);
}

/**
 * Gathers one request's request record, logs and spans.
 * @param records - Retained records.
 * @param id - A request ID or trace ID.
 * @returns The request (when known), its trace ID, and its logs and spans in order.
 */
export function requestTrace(records: readonly McpRecord[], id: string) {
  const request = [...records]
    .reverse()
    .find(
      (record) => record.signal === "request" && (record.requestId === id || record.traceId === id),
    );
  const traceId = typeof request?.traceId === "string" ? request.traceId : id;
  const related = records.filter(
    (record) => record.traceId === traceId || (request !== undefined && record.requestId === id),
  );
  const spans = new Map<string, McpRecord>();
  for (const record of related)
    if (record.signal === "span" && typeof record.spanId === "string")
      spans.set(record.spanId, record);
  return {
    traceId,
    ...(request === undefined ? {} : { request }),
    logs: related.filter((record) => record.signal === "log"),
    spans: [...spans.values()],
  };
}

/** Whether a request record describes a failure. */
function failed(record: McpRecord): boolean {
  const status = typeof record.status === "number" ? record.status : 0;
  return status >= 500 || (typeof record.outcome === "string" && record.outcome !== "success");
}
