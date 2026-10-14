/** Native database context and schema row domains exercised by the grouped example. */
import type { activateDrizzleService } from "@relkit/drizzle";
import type database from "@app/services/database/service.js";
import type { users } from "@app/services/database/schema/index.js";
export type DataModelContext = Awaited<
  ReturnType<typeof activateDrizzleService<typeof database>>
>["context"];
export type DataModelUser = typeof users.$inferSelect;
