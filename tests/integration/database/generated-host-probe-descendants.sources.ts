/** Authored native SDK acceptance callback; resource ownership is explicit and native lease context is retained. */
export const probeDescendantsSource = `/** Native transaction callbacks retain lease inheritance across their accepted descendants. */
import { activateDrizzleService, defineDrizzleService, defineModel } from "@relkit/drizzle/sqlite";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";
/**
 * Tests close ordering through native transaction callbacks.
 * @param databasePath - Explicit test-owned SQLite path.
 * @returns Completion once transaction descendants and close have settled.
 */
export async function probeDescendants(databasePath: string): Promise<void> {
  const entrance = Promise.withResolvers<void>();
  const releaseGate = Promise.withResolvers<void>();
  const entered = entrance.promise;
  const released = releaseGate.promise;
  let disposed = false, committed = false;
  const model = defineModel({ table: schema.records, extend: {
    delayedRead: async ({ database, table }) => {
      entrance.resolve(); await released; return database.select().from(table);
    },
  } });
  const service = defineDrizzleService({
    schema: { records: schema.records }, models: { records: model },
    client: () => drizzle({ client: new Database(databasePath) }),
    dispose: (client) => { disposed = true; client.$client.close(); },
  });
  const active = await activateDrizzleService(service, {}, { isolated: true });
  let child: Promise<readonly { id: number; value: string }[]> | undefined;
  try {
  const parent = active.context.transaction(async (tx) => {
    child = tx.records.delayedRead(); await Promise.race([entered, child]);
  }).then(() => { committed = true; });
  await Promise.race([entered, parent]);
  const closing = active.close();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const premature = committed || disposed;
  releaseGate.resolve();
  const outcomes = await Promise.allSettled([parent, child, closing]);
  for (const outcome of outcomes) if (outcome.status === "rejected") throw outcome.reason;
  if (premature || !committed || !disposed) throw new Error("transaction descendant lifetime failed");
  } finally { releaseGate.resolve(); await active.close(); }
}
`;
