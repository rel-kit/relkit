import { mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { canonicalJson } from "@relkit/contracts";
import { admitObservabilityRecord } from "../record-admission.js";
import type { TelemetryLocalRetentionPolicy } from "../telemetry-config.js";
import type { RedactionPolicy } from "../redaction.js";
import { createDuckdbQuery } from "./duckdb-query.js";
import { importLocalHistory } from "./import-history.js";
import {
  recordTime,
  validateLocalRecord,
  type LocalRecord,
  type StoredLocalRecord,
} from "./types.js";

export async function openDuckdbDatabase(
  root: string,
  configured: TelemetryLocalRetentionPolicy = {},
  redaction?: RedactionPolicy,
) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const path = join(root, "observability.duckdb");
  const instance = await DuckDBInstance.create(path);
  const connection = await instance.connect();
  await chmod(path, 0o600);
  let retention = configured;
  await connection.run(`
    CREATE SEQUENCE IF NOT EXISTS record_ids;
    CREATE TABLE IF NOT EXISTS records (
      id BIGINT PRIMARY KEY DEFAULT nextval('record_ids'), origin VARCHAR NOT NULL,
      signal VARCHAR NOT NULL, recorded_at BIGINT NOT NULL, received_at BIGINT NOT NULL,
      request_id VARCHAR, trace_id VARCHAR, bytes BIGINT NOT NULL, payload JSON NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipts (key VARCHAR PRIMARY KEY, received_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS imports (source VARCHAR PRIMARY KEY, malformed BIGINT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_trace ON records(trace_id);
    CREATE INDEX IF NOT EXISTS records_request ON records(request_id);
  `);
  const query = createDuckdbQuery(connection);
  const retain = async (): Promise<void> => {
    const age = retention.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
    const maximum = retention.maxBytes ?? 256 * 1024 * 1024;
    const entries = retention.maxEntries ?? Number.MAX_SAFE_INTEGER;
    await connection.run("DELETE FROM records WHERE recorded_at < ?", [Date.now() - age]);
    await connection.run(
      `DELETE FROM records WHERE id IN (
      SELECT id FROM (SELECT id, sum(bytes) OVER (ORDER BY id DESC) AS total,
      row_number() OVER (ORDER BY id DESC) AS position FROM records) WHERE total > ? OR position > ?
    )`,
      [maximum, entries],
    );
    await connection.run(
      "DELETE FROM receipts WHERE received_at < ? AND NOT starts_with(key, 'legacy:')",
      [Date.now() - 7 * 24 * 60 * 60 * 1000],
    );
  };
  const append = async (records: readonly LocalRecord[]): Promise<StoredLocalRecord[]> => {
    if (records.length > 256) throw new RangeError("Telemetry batches contain at most 256 records");
    const committed: StoredLocalRecord[] = [];
    await connection.run("BEGIN TRANSACTION");
    try {
      for (const item of records) {
        validateLocalRecord(item);
        const safe = admitObservabilityRecord(item.record, redaction);
        if (!safe) throw new TypeError("Telemetry record could not be admitted");
        const receipt = await connection.runAndReadAll(
          "INSERT INTO receipts VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING key",
          [item.key, Date.now()],
        );
        if (receipt.getRowObjectsJson().length === 0) continue;
        const payload = canonicalJson(safe);
        const result = await connection.runAndReadAll(
          `INSERT INTO records
          (origin, signal, recorded_at, received_at, request_id, trace_id, bytes, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id::VARCHAR AS id`,
          [
            item.origin,
            safe.signal,
            recordTime(safe),
            Date.now(),
            safe.requestId ?? null,
            safe.traceId ?? null,
            Buffer.byteLength(payload),
            payload,
          ],
        );
        committed.push({
          ...safe,
          cursor: String(result.getRowObjectsJson()[0]?.id),
          origin: item.origin,
        });
      }
      await retain();
      await connection.run("COMMIT");
      return committed;
    } catch (error) {
      await connection.run("ROLLBACK");
      throw error;
    }
  };
  try {
    const imported = await importLocalHistory(root, connection, append);
    await retain();
    await connection.run("CHECKPOINT");
    return {
      ...query,
      append,
      imported,
      configure: async (value: TelemetryLocalRetentionPolicy, nextRedaction?: RedactionPolicy) => {
        retention = value;
        redaction = nextRedaction;
        await retain();
        await connection.run("CHECKPOINT");
      },
      flush: async () => {
        await retain();
        await connection.run("CHECKPOINT");
      },
      close: async () => {
        try {
          await connection.run("CHECKPOINT");
        } finally {
          connection.closeSync();
          instance.closeSync();
        }
      },
    };
  } catch (error) {
    connection.closeSync();
    instance.closeSync();
    throw error;
  }
}
