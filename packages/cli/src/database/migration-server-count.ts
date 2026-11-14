/**
 * Reads how many migrations a PostgreSQL database has recorded, so `db migrate` can say how many it
 * applied. drizzle-kit runs server migrations and reports no counts, so the worker counts the rows
 * of Drizzle's migration log (`drizzle.__drizzle_migrations` unless configured) before and after.
 * It connects with the application's own `pg` package; when the application uses another driver,
 * another dialect, or the connection fails, the count is unknown and the report claims no work.
 * The connection's values never leave this module.
 */
import { consumerModule } from "./migration-config.js";
import type { MigrationConfig } from "./migration.schemas.js";

/** Bound on connecting for the count; drizzle-kit reports real connection failures itself. */
const CONNECT_TIMEOUT_MS = 5_000;

/** The part of a `pg` client the count uses. */
interface CountClient {
  readonly connect: () => Promise<void>;
  readonly query: (
    text: string,
    values?: readonly string[],
  ) => Promise<{ readonly rows: readonly Record<string, boolean | number | string | null>[] }>;
  readonly end: () => Promise<void>;
}

/**
 * Counts the migration log's rows.
 * @param root - Application root.
 * @param config - Validated configuration.
 * @returns Recorded migrations (0 when the log does not exist yet), or undefined when unknown.
 */
export async function serverMigrationCount(
  root: string,
  config: MigrationConfig,
): Promise<number | undefined> {
  if (config.dialect !== "postgresql") return undefined;
  let client: CountClient;
  try {
    client = await postgresClient(root, config);
  } catch {
    return undefined;
  }
  try {
    await client.connect();
    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
    const table = `${quote(config.migrations?.schema ?? "drizzle")}.${quote(config.migrations?.table ?? "__drizzle_migrations")}`;
    const exists = await client.query("SELECT to_regclass($1) IS NOT NULL AS found", [table]);
    if (exists.rows[0]?.found !== true) return 0;
    const count = await client.query(`SELECT count(*)::int AS rows FROM ${table}`);
    const rows = Number(count.rows[0]?.rows);
    return Number.isSafeInteger(rows) ? rows : undefined;
  } catch {
    return undefined;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Creates a client with the application's `pg` and the configuration's credentials.
 * @param root - Application root.
 * @param config - Validated PostgreSQL configuration.
 * @returns An unconnected client; rejects when `pg` is not a dependency.
 */
async function postgresClient(root: string, config: MigrationConfig): Promise<CountClient> {
  const module = await consumerModule(root, "pg");
  const namespace =
    typeof module.default === "object" && module.default !== null ? module.default : module;
  const Client = Reflect.get(namespace, "Client");
  if (typeof Client !== "function") throw new Error("Unsupported pg module");
  const { url, ...credentials } = config.dbCredentials;
  const connection = typeof url === "string" ? { connectionString: url } : credentials;
  // pg's Client has connect/query/end with these shapes; any failure is caught as an unknown count.
  return Reflect.construct(Client, [
    { ...connection, connectionTimeoutMillis: CONNECT_TIMEOUT_MS },
  ]) as CountClient;
}
