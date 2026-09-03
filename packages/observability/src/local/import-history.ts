import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { ObservabilityRecord } from "../model.js";
import { validateLocalRecord, type LocalRecord, type StoredLocalRecord } from "./types.js";

export async function importLocalHistory(
  root: string,
  connection: DuckDBConnection,
  append: (records: readonly LocalRecord[]) => Promise<readonly StoredLocalRecord[]>,
) {
  let records = 0;
  let malformed = 0;
  for (const path of await files(root)) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    const fingerprint = hash.digest("hex");
    const source = `${relative(root, path).replace(".active.ndjson", ".ndjson")}:${fingerprint}`;
    const exists = await connection.runAndReadAll("SELECT source FROM imports WHERE source = ?", [
      source,
    ]);
    if (exists.getRowObjectsJson().length) continue;
    let lineNumber = 0;
    let bad = 0;
    let pending: LocalRecord[] = [];
    const input = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    try {
      for await (const line of input) {
        lineNumber++;
        if (!line.trim()) continue;
        let item: LocalRecord;
        try {
          const record = JSON.parse(line) as ObservabilityRecord;
          item = {
            key: `legacy:${source}:${lineNumber}`,
            record,
            origin:
              record.signal === "log" && record.component.startsWith("cli.")
                ? "relkit"
                : record.signal === "log" && record.component === "inspector"
                  ? "inspector"
                  : "application",
          };
          validateLocalRecord(item);
        } catch {
          bad++;
          continue;
        }
        pending.push(item);
        if (pending.length === 256) {
          records += (await append(pending)).length;
          pending = [];
        }
      }
      if (pending.length) records += (await append(pending)).length;
      await connection.run("INSERT INTO imports VALUES (?, ?) ON CONFLICT DO NOTHING", [
        source,
        bad,
      ]);
      await connection.run("DELETE FROM receipts WHERE starts_with(key, ?)", [`legacy:${source}:`]);
      malformed += bad;
    } finally {
      input.close();
    }
  }
  return { records, malformed };
}

async function files(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    const path = join(root, item.name);
    if (item.isDirectory()) result.push(...(await files(path)));
    else if (item.isFile() && item.name.endsWith(".ndjson")) result.push(path);
  }
  return result.sort();
}
