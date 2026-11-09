/**
 * Supplies a real Postgres database to the backend tests. With
 * `RELKIT_TEST_POSTGRES_URL` (CI's service container) each suite gets a fresh
 * database on that server; with `RELKIT_TEST_DOCKER=1` a pinned Postgres
 * container is started for the suite; otherwise suites skip. `close()` drops
 * the database or removes the container.
 */
import { randomUUID } from "node:crypto";
import { SQL } from "bun";

const IMAGE =
  "postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685";

/** One acquired test database. */
export interface TestPostgres {
  readonly url: string;
  readonly query: (
    text: string,
  ) => Promise<readonly Record<string, string | number | boolean | null>[]>;
  readonly close: () => Promise<void>;
}

/** True when a Postgres source is configured for this run. */
export const postgresAvailable =
  process.env.RELKIT_TEST_POSTGRES_URL !== undefined || process.env.RELKIT_TEST_DOCKER === "1";

/**
 * Creates a fresh database on the configured server or in a new container.
 * @returns The database, or undefined when no source is configured.
 */
export async function acquirePostgres(): Promise<TestPostgres | undefined> {
  const configured = process.env.RELKIT_TEST_POSTGRES_URL;
  if (configured !== undefined) return freshDatabase(configured, async () => undefined);
  if (process.env.RELKIT_TEST_DOCKER !== "1") return undefined;
  const container = await startContainer();
  return freshDatabase(container.url, container.remove);
}

/**
 * Creates a uniquely named database and returns a URL that points at it.
 * @param serverUrl - Admin URL of the server.
 * @param release - Cleanup run after the database is dropped.
 * @returns The test database.
 */
async function freshDatabase(
  serverUrl: string,
  release: () => Promise<void>,
): Promise<TestPostgres> {
  const name = `relkit_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const admin = new SQL(serverUrl);
  await admin.unsafe(`create database ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const client = new SQL(url.toString());
  return {
    url: url.toString(),
    query: async (text) => [...(await client.unsafe(text))],
    close: async () => {
      await client.close();
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.close();
      await release();
    },
  };
}

/**
 * Starts a disposable Postgres container on a free local port.
 * @returns Its admin URL and a remover.
 */
async function startContainer(): Promise<{ url: string; remove: () => Promise<void> }> {
  const name = `relkit-postgres-test-${randomUUID().slice(0, 8)}`;
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  await docker(
    ["run", "-d", "--rm", "--name", name, "-e", "POSTGRES_PASSWORD=relkit"].concat([
      "-p",
      `127.0.0.1:${port}:5432`,
      IMAGE,
    ]),
  );
  const remove = async () => void (await docker(["rm", "-f", name], true));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ready = await docker(
      ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"],
      true,
    );
    if (ready.includes("accepting connections"))
      return { url: `postgres://postgres:relkit@127.0.0.1:${port}/postgres`, remove };
    await Bun.sleep(250);
  }
  await remove();
  throw new Error("Postgres container did not become ready");
}

/**
 * Runs a Docker CLI command.
 * @param args - Arguments.
 * @param tolerate - Return output instead of throwing on failure.
 * @returns Standard output.
 */
async function docker(args: readonly string[], tolerate = false): Promise<string> {
  const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0 && !tolerate) throw new Error(`docker ${args[0]} failed: ${stderr.trim()}`);
  return stdout.trim();
}
