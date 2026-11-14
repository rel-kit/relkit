/** The Drizzle PostgreSQL database `openPostgresDatabase` returns on either runtime. */
import type { PgAsyncDatabase } from "drizzle-orm/pg-core/async/db";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core/session";
import type { DrizzlePgConfig } from "drizzle-orm/pg-core/utils";
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations";

/** An asynchronous Drizzle PostgreSQL database whose connection pool can be ended. */
export type PostgresDatabase<Relations extends AnyRelations = EmptyRelations> = PgAsyncDatabase<
  PgQueryResultHKT,
  Relations
> & { readonly $client: { end(): Promise<void> } };

/** Drizzle settings passed through to the runtime's driver. */
export type PostgresDatabaseConfig<Relations extends AnyRelations = EmptyRelations> =
  DrizzlePgConfig<Relations>;

/** Connects to one PostgreSQL URL with a runtime's driver. */
export type OpenPostgres = <Relations extends AnyRelations = EmptyRelations>(
  url: string,
  config?: PostgresDatabaseConfig<Relations>,
) => PostgresDatabase<Relations>;
