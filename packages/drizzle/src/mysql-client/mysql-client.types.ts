/** The Drizzle MySQL database `openMysqlDatabase` returns on either runtime. */
import type { MySqlAsyncDatabase } from "drizzle-orm/mysql-core/async/db";
import type { MySqlQueryResultHKT } from "drizzle-orm/mysql-core/session";
import type { DrizzleMySqlConfig } from "drizzle-orm/mysql-core/utils";
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations";

/** An asynchronous Drizzle MySQL database whose connection pool can be ended. */
export type MysqlDatabase<Relations extends AnyRelations = EmptyRelations> = MySqlAsyncDatabase<
  MySqlQueryResultHKT,
  Relations
> & { readonly $client: { end(): Promise<void> } };

/** Drizzle settings passed through to the runtime's driver. */
export type MysqlDatabaseConfig<Relations extends AnyRelations = EmptyRelations> =
  DrizzleMySqlConfig<Relations>;

/** Connects to one MySQL URL with a runtime's driver. */
export type OpenMysql = <Relations extends AnyRelations = EmptyRelations>(
  url: string,
  config?: MysqlDatabaseConfig<Relations>,
) => MysqlDatabase<Relations>;
