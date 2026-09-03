import { openDuckdbDatabase } from "./duckdb-database.js";
import type { LocalWorkerCommand } from "./types.js";
import { ObservabilityQueryError } from "../query-types.js";

let database: Awaited<ReturnType<typeof openDuckdbDatabase>> | undefined;
let tail = Promise.resolve();
const cleanup = setInterval(() => {
  tail = tail
    .then(() => database?.flush())
    .catch((error: unknown) => {
      process.send?.({ id: 0, fatal: true, error: `Telemetry cleanup failed: ${String(error)}` });
      process.exitCode = 1;
      process.disconnect?.();
    });
}, 60_000);
cleanup.unref();

process.on("message", (message: { readonly id: number; readonly command: LocalWorkerCommand }) => {
  tail = tail.then(async () => {
    try {
      const value = await execute(message.command);
      process.send?.({ id: message.id, value });
      if (message.command.type === "close") process.disconnect?.();
    } catch (error) {
      process.send?.({
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof ObservabilityQueryError ? { code: error.code } : {}),
      });
    }
  });
});
process.on("disconnect", () => {
  clearInterval(cleanup);
  void tail.then(() => database?.close()).finally(() => process.exit());
});

async function execute(command: LocalWorkerCommand): Promise<unknown> {
  if (command.type === "open") {
    database = await openDuckdbDatabase(command.root, command.retention, command.redaction);
    return database.imported;
  }
  if (!database) throw new Error("Telemetry database is not open");
  switch (command.type) {
    case "append":
      return database.append(command.records);
    case "query":
      return database.list(command.kind, command.query);
    case "detail":
      return database.detail(command.kind, command.id);
    case "retention":
      return database.configure(command.retention, command.redaction);
    case "flush":
      return database.flush();
    case "close": {
      await database.close();
      database = undefined;
      return undefined;
    }
  }
}
