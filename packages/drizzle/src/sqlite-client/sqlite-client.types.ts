/** The Drizzle SQLite database `openSqliteDatabase` returns on either runtime. */
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations";
import type { SQLiteAsyncDatabase } from "drizzle-orm/sqlite-core/async/db";
import type { DrizzleSQLiteConfig } from "drizzle-orm/sqlite-core/utils";

/** A synchronous-driver Drizzle database whose native client can be closed. */
export type SqliteDatabase<Relations extends AnyRelations = EmptyRelations> = SQLiteAsyncDatabase<
  "sync",
  unknown,
  Relations
> & { readonly $client: { close(): void } };

/** Drizzle settings passed through to the runtime's driver. */
export type SqliteDatabaseConfig<Relations extends AnyRelations = EmptyRelations> =
  DrizzleSQLiteConfig<Relations>;

/** Opens one database file with a runtime's driver. */
export type OpenSqlite = <Relations extends AnyRelations = EmptyRelations>(
  path: string,
  config?: SqliteDatabaseConfig<Relations>,
) => SqliteDatabase<Relations>;
