/** A SQLite connection opened for migrations. */
export interface MigrationSqlite {
  /** Native client passed to the Drizzle driver as `client`. */
  readonly client: object;
  /**
   * Runs SQL without results.
   * @param sql - Statements.
   */
  readonly exec: (sql: string) => void;
  /** Closes the connection. */
  readonly close: () => void;
}
