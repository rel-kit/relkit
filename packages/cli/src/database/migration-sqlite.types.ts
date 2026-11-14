/** A SQLite connection opened for migrations. */
export interface MigrationSqlite {
  /** Native client passed to the Drizzle driver as `client`. */
  readonly client: object;
  /**
   * Runs SQL without results.
   * @param sql - Statements.
   */
  readonly exec: (sql: string) => void;
  /**
   * Reads the first column of the first row.
   * @param sql - One query.
   * @param parameters - Positional text parameters.
   * @returns That value, or undefined when there is no row.
   */
  readonly scalar: (sql: string, ...parameters: string[]) => number | string | undefined;
  /** Closes the connection. */
  readonly close: () => void;
}
