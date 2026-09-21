import { createHash, randomUUID } from "node:crypto";

const INNGEST_IMAGE =
  "inngest/inngest@sha256:d5365a31f8bf504dc2d54ddd114fcdc1a0413f8b57a450365c095ab6234ad8c2";
const POSTGRES_IMAGE =
  "postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685";
const REDIS_IMAGE =
  "redis:7-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf";

export type NativeStack = {
  readonly namespace: string;
  readonly baseUrl: string;
  readonly eventKey: string;
  readonly signingKey: string;
  readonly postgres: string;
  readonly inngest: string;
  readonly restartInngest: () => Promise<void>;
  readonly queryPostgres: (sql: string) => Promise<string>;
  readonly close: () => Promise<void>;
};

export type NativeStackOptions = {
  readonly healthTimeoutMs?: number;
};

export function dockerHostArguments(
  platform: NodeJS.Platform = process.platform,
): readonly string[] {
  return platform === "linux" ? ["--add-host", "host.docker.internal:host-gateway"] : [];
}

export function inngestReadinessHeaders(signingKey: string): Readonly<Record<string, string>> {
  return {
    authorization: `Bearer ${createHash("sha256")
      .update(Buffer.from(signingKey, "hex"))
      .digest("hex")}`,
  };
}

export async function reservePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = server.port;
  server.stop(true);
  if (port === undefined) throw new Error("Bun did not allocate a port");
  return port;
}

export async function waitFor<T>(
  label: string,
  check: () => Promise<T | false | undefined>,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== false && value !== undefined) return value;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}: ${String(lastError ?? "not ready")}`);
}

export async function startNativeStack(
  workerPort: number,
  options: NativeStackOptions = {},
): Promise<NativeStack> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const namespace = `relkit-jobs-${suffix}`;
  const network = `${namespace}-network`;
  const postgres = `${namespace}-postgres`;
  const redis = `${namespace}-redis`;
  const inngest = `${namespace}-inngest`;
  const postgresVolume = `${namespace}-postgres-data`;
  const redisVolume = `${namespace}-redis-data`;
  const eventKey = `relkit-event-${suffix}`;
  const signingKey = "a".repeat(64);
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  await docker(["pull", INNGEST_IMAGE]);
  await docker(["network", "create", network]);
  try {
    await docker(["volume", "create", postgresVolume]);
    await docker(["volume", "create", redisVolume]);
    await docker([
      "run",
      "-d",
      "--name",
      postgres,
      "--network",
      network,
      "--network-alias",
      "postgres",
      "-e",
      "POSTGRES_DB=inngest",
      "-e",
      "POSTGRES_USER=inngest",
      "-e",
      "POSTGRES_PASSWORD=relkit-test-password",
      "-v",
      `${postgresVolume}:/var/lib/postgresql/data`,
      POSTGRES_IMAGE,
    ]);
    await waitFor("PostgreSQL", async () =>
      (
        await docker(["exec", postgres, "pg_isready", "-U", "inngest", "-d", "inngest"], true)
      ).includes("accepting connections"),
    );
    await docker([
      "run",
      "-d",
      "--name",
      redis,
      "--network",
      network,
      "--network-alias",
      "redis",
      "-v",
      `${redisVolume}:/data`,
      REDIS_IMAGE,
      "redis-server",
      "--appendonly",
      "yes",
      "--appendfsync",
      "always",
    ]);
    await waitFor(
      "Redis",
      async () => (await docker(["exec", redis, "redis-cli", "ping"], true)).trim() === "PONG",
    );
    await docker([
      "run",
      "-d",
      "--name",
      inngest,
      "--network",
      network,
      ...dockerHostArguments(),
      "-p",
      `127.0.0.1:${port}:8288`,
      "-e",
      `INNGEST_EVENT_KEY=${eventKey}`,
      "-e",
      `INNGEST_SIGNING_KEY=${signingKey}`,
      "-e",
      "INNGEST_POSTGRES_URI=postgres://inngest:relkit-test-password@postgres:5432/inngest",
      "-e",
      "INNGEST_REDIS_URI=redis://redis:6379",
      INNGEST_IMAGE,
      "inngest",
      "start",
      "--host",
      "0.0.0.0",
      "--port",
      "8288",
      "--event-key",
      eventKey,
      "--signing-key",
      signingKey,
      "--postgres-uri",
      "postgres://inngest:relkit-test-password@postgres:5432/inngest",
      "--redis-uri",
      "redis://redis:6379",
      "--sdk-url",
      `http://host.docker.internal:${workerPort}/api/inngest`,
      "--poll-interval",
      "1",
      "--retry-interval",
      "1",
      "--queue-workers",
      "10",
      "--log-level",
      "debug",
    ]);
    await waitFor(
      "Inngest API",
      async () =>
        (
          await fetch(`${baseUrl}/v2/runs?limit=1`, {
            headers: inngestReadinessHeaders(signingKey),
          })
        ).ok,
      options.healthTimeoutMs ?? 30_000,
    );
    const close = async () => {
      await docker(["rm", "-f", inngest, redis, postgres], true);
      await docker(["volume", "rm", "-f", redisVolume, postgresVolume], true);
      await docker(["network", "rm", network], true);
    };
    return {
      namespace,
      baseUrl,
      eventKey,
      signingKey,
      postgres,
      inngest,
      restartInngest: async () => {
        await docker(["restart", inngest]);
        await waitFor("restarted Inngest", async () => (await fetch(`${baseUrl}/health`)).ok);
      },
      queryPostgres: (sql) =>
        docker(["exec", postgres, "psql", "-U", "inngest", "-d", "inngest", "-Atqc", sql]),
      close,
    };
  } catch (error) {
    const logs = await docker(["logs", "--tail", "80", inngest], true);
    if (logs) console.error(`Inngest container logs:\n${logs}`);
    const status = await docker(
      [
        "inspect",
        "--format",
        "{{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}",
        inngest,
      ],
      true,
    );
    if (status) console.error(`Inngest container status: ${status}`);
    await docker(["rm", "-f", inngest, redis, postgres], true);
    await docker(["volume", "rm", "-f", redisVolume, postgresVolume], true);
    await docker(["network", "rm", network], true);
    throw error;
  }
}

export async function docker(args: readonly string[], tolerateFailure = false): Promise<string> {
  const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0 && !tolerateFailure) {
    throw new Error(`docker ${args.join(" ")} failed (${exitCode}): ${stderr.trim()}`);
  }
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}
