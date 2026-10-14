/** Pure specialized-service source inventory; application clients are acquired only by generated-host probes. */
import { lifecycleSource } from "./generated-host-lifecycle.sources.js";
import { probeDescendantsSource } from "./generated-host-probe-descendants.sources.js";
import { probeNestedAuthSource } from "./generated-host-probe-nested-auth.sources.js";

export const generatedDatabaseSources = {
  "src/services/database/service.ts": `/** Declares the lazy native SQLite service and records physical client release in the test-owned probe file. */
import { appendFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { defineDrizzleService } from "@relkit/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.js";
import recordsModel from "./models/records.model.js";
export default defineDrizzleService({
  schema,
  models: { records: recordsModel },
  client: ({ env }) => drizzle({ client: new Database(env.DATABASE_PATH) }),
  dispose: (database) => {
    database.$client.close();
    const releases = process.env.RELKIT_TEST_RELEASES;
    if (releases === undefined) throw new Error("Missing release probe path");
    appendFileSync(releases, "released\\n");
  },
});
`,
  "src/services/database/models/records.model.ts": `/** Exposes native lifecycle probes as model extensions while preserving admitted SDK lease context. */
import { defineModel } from "@relkit/drizzle";
import { records } from "../schema/index.js";
import { probeLifecycle, probeDescendants, probeNestedAuth } from "../lifecycle.js";
export default defineModel({
  table: records,
  extend: {
    /**
     * Compares native context identity without reading or widening its database capabilities.
     * @param _context - Injected native table/client context, unused by this identity probe.
     * @param context - Original native database context used only as an object identity token.
     * @param databasePath - Explicit SQLite fixture path.
     * @returns Shared, isolated and recovery observations after owned clients close.
     */
    ownership: (_context, context: object, databasePath: string) =>
    probeLifecycle(context, { DATABASE_PATH: databasePath }),
    /**
     * Exercises native transaction descendant close ordering.
     * @param _context - Borrowed injected table/client context.
     * @param databasePath - Explicit SQLite fixture path.
     * @returns Completion after admitted descendants and isolated close settle.
     */
    descendants: (_context, databasePath: string) => probeDescendants(databasePath),
    /**
     * Exercises native reentrant auth factories while borrowing host ownership.
     * @param _context - Borrowed injected table/client context.
     * @param databasePath - Explicit host database path.
     * @returns Whether both native auth session queries succeed.
     */
    nestedAuth: (_context, databasePath: string) => probeNestedAuth(databasePath) },
});
`,
  "src/services/database/lifecycle.ts": lifecycleSource,
  "src/services/database/probe-descendants.ts": probeDescendantsSource,
  "src/services/database/probe-nested-auth.ts": probeNestedAuthSource,
} as const;
