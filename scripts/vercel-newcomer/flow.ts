/**
 * The newcomer deploy flow against Vercel: create a throwaway database and project, deploy the
 * prepared app to the project's production target (Vercel Cron runs only there), prove HTTPS
 * reachability, prove that jobs and events submitted over HTTP complete, that Vercel Cron claims a
 * new schedule occurrence with exactly one run per occurrence even when the cron endpoint is called
 * concurrently, and that the endpoint refuses a caller without the cron secret. The project and the
 * database are removed in a `finally` block whatever happens. Every external effect goes through a
 * port, so the same flow runs against a stub.
 */
import type { BackendReader } from "../railway-newcomer/flow.js";
import type { VercelDriver } from "./vercel.js";

/** Creates and drops the per-run database on the test's Postgres server. */
export interface DatabaseAdmin {
  /** @param name - Database name. @returns Its connection URL. */
  create(name: string): Promise<string>;
  /** @param name - Database name. */
  drop(name: string): Promise<void>;
}

/** Ports the flow needs. */
export interface VercelNewcomerPorts {
  readonly vercel: VercelDriver;
  readonly database: DatabaseAdmin;
  readonly fetch: typeof fetch;
  /** Opens the backend reader. @param url - Database URL. */
  readonly backend: (url: string) => Promise<BackendReader>;
  readonly secret: () => string;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (message: string) => void;
}

/** Path prefix of the generated cron endpoint. */
const CRON = "/_relkit/v1/vercel/cron/job.probe.record-job/everyMinute";

/**
 * Runs the whole flow and always removes what it created.
 * @param ports - External effects.
 * @param projectRoot - Prepared project with `vercel.json` and the function entry.
 * @param runId - Unique suffix of the project and database names.
 * @returns Timings of each phase, in seconds from the start.
 */
export async function runVercelNewcomerDeploy(
  ports: VercelNewcomerPorts,
  projectRoot: string,
  runId: string,
) {
  const started = ports.now();
  const timings: Record<string, number> = {};
  const mark = (phase: string) => {
    timings[phase] = Math.round((ports.now() - started) / 1000);
    ports.log(`${phase} after ${timings[phase]} s`);
  };
  if (!(await ports.vercel.authenticated()))
    throw new Error("Vercel credentials are missing: set VERCEL_TOKEN or run vercel login.");
  const name = `relkit-test-${runId}`.toLowerCase().replace(/[^a-z0-9-]/gu, "-");
  const databaseName = name.replaceAll("-", "_");
  const databaseUrl = await ports.database.create(databaseName);
  let projectId: string | undefined;
  let backend: BackendReader | undefined;
  try {
    projectId = await ports.vercel.createProject(name);
    const secret = ports.secret();
    await ports.vercel.setEnv(projectId, "DATABASE_URL", databaseUrl);
    await ports.vercel.setEnv(projectId, "CRON_SECRET", secret);
    const origin = (await ports.vercel.deploy(projectRoot, projectId)).replace(/\/$/u, "");
    mark("deployed");
    await until(ports, "HTTPS /healthz answers 200", 180, async () =>
      ports.fetch(`${origin}/healthz`).then(
        (response) => response.status === 200,
        () => false,
      ),
    );
    mark("reachable");
    backend = await ports.backend(databaseUrl);
    const opened = backend;
    const before = (await opened.occurrences()).length;
    for (const [path, key] of [
      ["jobs", "vercel-job"],
      ["events", "vercel-event"],
    ] as const) {
      const response = await ports.fetch(`${origin}/probe/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ key }),
      });
      if (!response.ok)
        throw new Error(
          `POST /probe/${path} answered ${response.status}: ${await response.text()}`,
        );
    }
    await until(ports, "the HTTP job and the event consumer complete", 180, async () => {
      const runs = await opened.runs();
      return (
        runs.get("vercel-job") === "completed" && runs.get("event-vercel-event") === "completed"
      );
    });
    mark("jobs-and-events");
    await until(ports, "Vercel Cron claims a new schedule occurrence", 240, async () => {
      const occurrences = await opened.occurrences();
      return occurrences.length > before && occurrences.every((occurrence) => occurrence.runs >= 1);
    });
    mark("scheduled");
    const cron = (authorization?: string) =>
      ports.fetch(`${origin}${CRON}`, {
        headers: authorization === undefined ? {} : { authorization },
      });
    const concurrent = await Promise.all([cron(`Bearer ${secret}`), cron(`Bearer ${secret}`)]);
    if (concurrent.some((response) => response.status !== 200))
      throw new Error(`The cron endpoint answered ${concurrent.map((r) => r.status).join(", ")}.`);
    const refused = await cron("Bearer wrong");
    if (refused.status !== 401)
      throw new Error(`The cron endpoint answered ${refused.status} to a wrong secret.`);
    const duplicated = (await opened.occurrences()).filter((occurrence) => occurrence.runs !== 1);
    if (duplicated.length > 0)
      throw new Error(
        `Schedule occurrences without exactly one run: ${JSON.stringify(duplicated)}`,
      );
    mark("exactly-once");
    return timings;
  } finally {
    await backend?.close().catch(() => undefined);
    if (projectId !== undefined) await ports.vercel.deleteProject(projectId);
    await ports.database.drop(databaseName);
    mark("deleted");
  }
}

/**
 * Polls a condition once every five seconds.
 * @param ports - External effects.
 * @param what - Description for the timeout error.
 * @param seconds - Deadline.
 * @param check - Condition.
 */
async function until(
  ports: VercelNewcomerPorts,
  what: string,
  seconds: number,
  check: () => Promise<boolean>,
): Promise<void> {
  const deadline = ports.now() + seconds * 1000;
  while (ports.now() < deadline) {
    if (await check()) return;
    await ports.sleep(5_000);
  }
  throw new Error(`Timed out after ${seconds} s waiting until ${what}.`);
}
