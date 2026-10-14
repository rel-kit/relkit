/** Native function, service and route source fixtures preserve the public plain TypeScript authoring API. */
export const generatedRecordsSources = {
  "src/services/records/service.ts": `/** Exposes the records probe through the ordinary native service boundary without acquiring its database. */
import { defineService } from "@relkit/app/services";
import probe from "./functions/probe.function.js";
export default defineService({ functions: { probe } });
`,
  "src/services/records/functions/probe.function.ts": `/** Dispatches controlled native database/auth acceptance modes and returns observable ownership flags. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineFunction({
  // Mutation modes exercise commit/rollback/numeric precision; remaining modes observe SDK ownership and reentrancy.
  input: z.object({ mode: z.union([z.literal("write"), z.literal("rollback"), z.literal("read"), z.literal("ownership"), z.literal("descendants"), z.literal("numeric"), z.literal("nested-auth")]) }),
  // Shared/isolated/recovered are lifecycle observations; optional numeric/nested fields belong only to their probe modes.
  output: z.object({ count: z.number(), shared: z.boolean(), isolated: z.boolean(), recovered: z.boolean(), numeric: z.number().optional(), nested: z.boolean().optional() }),
  /**
   * Executes one validated fixture mode through the admitted native context.
   * @param input - Closed native probe mode.
   * @param context - Borrowed database/auth context owned by the generated host.
   * @returns Record count and mode-specific ownership, numeric or nested-auth observations.
   */
  handler: async ({ mode }, context) => {
    const databasePath = process.env.DATABASE_PATH;
    if (databasePath === undefined) throw new Error("Missing native fixture database path");
    let ownership = { shared: false, isolated: false, recovered: false };
    let numeric: number | undefined, nested: boolean | undefined;
    if (mode === "numeric") {
      await context.database.samples.insert({ data: { id: 1, value: 1e20 } });
      await context.database.samples.update({ where: { id: 1 }, data: { value: -1e100 } });
      numeric = (await context.database.samples.findOne({ where: { id: 1 } }))?.value;
    }
    if (mode === "nested-auth") nested = await context.database.records.nestedAuth(databasePath);
    if (mode === "write") await context.database.records.insert({ data: { id: 1, value: "kept" } });
    if (mode === "rollback") {
      try {
        await context.database.transaction(async (transaction) => {
          await transaction.records.insert({ data: { id: 2, value: "rolled back" } });
          throw new Error("fixture rollback");
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "fixture rollback") throw error;
      }
    }
    if (mode === "ownership") ownership = await context.database.records.ownership(context.database, String(context.env.DATABASE_PATH));
    if (mode === "descendants") await context.database.records.descendants(databasePath);
    return { count: (await context.database.records.findMany()).length, ...ownership,
      ...(numeric === undefined ? {} : { numeric }), ...(nested === undefined ? {} : { nested }) };
  },
});
`,
  "src/routes/records/route.ts": `/** Mounts the public records probe as one native POST route through its service facade. */
import { defineRoute } from "@relkit/app/routes";
import records from "@app/services/records/service.js";
export const POST = defineRoute({ target: records.probe });
`,
} as const;
