/**
 * The newcomer deploy flow against Cloudflare: create a throwaway database, name the Worker
 * `relkit-test-<run id>` and write its deploy files, create its work queue, deploy, set the
 * database secret, prove HTTPS readiness (which includes the Durable Object realtime provider's
 * first round trip), prove that a job and an event submitted over HTTP complete through the queue
 * wake-up, that the Cron Trigger claims new schedule occurrences, and that every occurrence has
 * exactly one run. The Worker, the queue and the database are removed in a `finally` block
 * whatever happens. Every external effect goes through a port, so the same flow runs against a stub.
 */
import type { BackendReader } from "../railway-newcomer/flow.js";
import type { DatabaseAdmin } from "../vercel-newcomer/flow.js";
import type { CloudflareDriver } from "./cloudflare.js";

/** Ports the flow needs. */
export interface CloudflareNewcomerPorts {
  readonly cloudflare: CloudflareDriver;
  readonly database: DatabaseAdmin;
  readonly fetch: typeof fetch;
  /** Opens the backend reader. @param url - Database URL. */
  readonly backend: (url: string) => Promise<BackendReader>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (message: string) => void;
}

/**
 * Runs the whole flow and always removes what it created.
 * @param ports - External effects.
 * @param projectRoot - Prepared project.
 * @param runId - Unique suffix of the Worker, queue and database names.
 * @returns Timings of each phase, in seconds from the start.
 */
export async function runCloudflareNewcomerDeploy(
  ports: CloudflareNewcomerPorts,
  projectRoot: string,
  runId: string,
) {
  const started = ports.now();
  const timings: Record<string, number> = {};
  const mark = (phase: string) => {
    timings[phase] = Math.round((ports.now() - started) / 1000);
    ports.log(`${phase} after ${timings[phase]} s`);
  };
  if (!(await ports.cloudflare.authenticated()))
    throw new Error(
      "Cloudflare credentials are missing: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, or run wrangler login.",
    );
  const name = `relkit-test-${runId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, "-")
    .slice(0, 40);
  const databaseName = name.replaceAll("-", "_");
  const databaseUrl = await ports.database.create(databaseName);
  let queue: string | undefined;
  let deployed = false;
  let backend: BackendReader | undefined;
  try {
    const workQueue = await ports.cloudflare.configure(projectRoot, name);
    await ports.cloudflare.createQueue(workQueue);
    queue = workQueue;
    // A failed deploy may still have created the Worker, so it is deleted either way.
    deployed = true;
    const origin = (await ports.cloudflare.deploy(projectRoot)).replace(/\/$/u, "");
    await ports.cloudflare.putSecrets(projectRoot, { DATABASE_URL: databaseUrl });
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
    for (const [path, key] of [
      ["jobs", "cloudflare-job"],
      ["events", "cloudflare-event"],
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
        runs.get("cloudflare-job") === "completed" &&
        runs.get("event-cloudflare-event") === "completed"
      );
    });
    mark("jobs-and-events");
    // Cloudflare documents that a new Cron Trigger can take up to 15 minutes to propagate.
    await until(ports, "the Cron Trigger claims two schedule occurrences", 900, async () => {
      const occurrences = await opened.occurrences();
      return occurrences.length >= 2 && occurrences.every((occurrence) => occurrence.runs >= 1);
    });
    mark("scheduled");
    const duplicated = (await opened.occurrences()).filter((occurrence) => occurrence.runs !== 1);
    if (duplicated.length > 0)
      throw new Error(
        `Schedule occurrences without exactly one run: ${JSON.stringify(duplicated)}`,
      );
    mark("exactly-once");
    return timings;
  } finally {
    await backend?.close().catch(() => undefined);
    if (deployed && queue !== undefined)
      await ports.cloudflare.detachConsumer(queue, name).catch((error) => ports.log(String(error)));
    if (deployed)
      await ports.cloudflare.deleteWorker(name).catch((error) => ports.log(String(error)));
    if (queue !== undefined)
      await ports.cloudflare.deleteQueue(queue).catch((error) => ports.log(String(error)));
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
  ports: CloudflareNewcomerPorts,
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
