/**
 * The newcomer deploy flow against Railway: create a throwaway project, deploy the prepared app,
 * prove HTTPS reachability, then prove jobs, events and schedules before and after a restart and
 * with two instances, reading outcomes from the Postgres backend's tables. The project is deleted
 * in a `finally` block whatever happens. Every external effect goes through a port, so the same flow
 * runs against a stub.
 */
import type { RailwayDriver } from "./railway.js";

/** Reads the Postgres backend's tables. */
export interface BackendReader {
  /** @returns Run status by operation ID for the probe job. */
  runs(): Promise<ReadonlyMap<string, string>>;
  /** @returns Completed event deliveries for the probe consumer. */
  completedDeliveries(): Promise<number>;
  /** @returns Claimed schedule occurrences, oldest first, with how many runs each produced. */
  occurrences(): Promise<readonly { readonly at: string; readonly runs: number }[]>;
  /** Closes the connection. */
  close(): Promise<void>;
}

/** Ports the flow needs. */
export interface NewcomerPorts {
  readonly railway: RailwayDriver;
  readonly fetch: typeof fetch;
  /** Opens the backend reader. @param url - Public Postgres URL. */
  readonly backend: (url: string) => Promise<BackendReader>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (message: string) => void;
}

/** Timings of a run, in seconds from the start. */
export type NewcomerTimings = Record<string, number>;

const SERVICE = "web";

/**
 * Runs the whole flow and always deletes the project it created.
 * @param ports - External effects.
 * @param runId - Unique suffix of the project name.
 * @returns Timings of each phase.
 */
export async function runNewcomerDeploy(ports: NewcomerPorts, runId: string) {
  const started = ports.now();
  const timings: NewcomerTimings = {};
  const mark = (phase: string) => {
    timings[phase] = Math.round((ports.now() - started) / 1000);
    ports.log(`${phase} after ${timings[phase]} s`);
  };
  if (!(await ports.railway.authenticated()))
    throw new Error("Railway credentials are missing: set RAILWAY_API_TOKEN or run railway login.");
  const projectId = await ports.railway.createProject(`relkit-test-${runId}`);
  let backend: BackendReader | undefined;
  try {
    await ports.railway.addPostgres();
    await ports.railway.addService(SERVICE, { DATABASE_URL: "${{Postgres.DATABASE_URL}}" });
    await ports.railway.up(SERVICE);
    mark("deployed");
    const host = await ports.railway.domain(SERVICE);
    const origin = `https://${host}`;
    await until(ports, "HTTPS /healthz answers 200", 300, async () =>
      ports.fetch(`${origin}/healthz`).then(
        (response) => response.status === 200,
        () => false,
      ),
    );
    mark("reachable");
    const opened = await ports.backend(await ports.railway.publicDatabaseUrl());
    backend = opened;
    await until(ports, "the database proxy answers", 240, () =>
      opened.runs().then(
        () => true,
        () => false,
      ),
    );
    const probe = probeClient(ports, origin);
    await exercise(ports, backend, probe, "first", 1);
    mark("first-instance");

    await probe("jobs", "before-restart");
    await ports.railway.redeploy(SERVICE);
    await until(ports, "the redeployed service is ready", 300, () => probe.ready());
    await exercise(ports, backend, probe, "restart", 1, ["before-restart"]);
    mark("after-restart");

    await ports.railway.scale(SERVICE, 2);
    await until(ports, "Railway runs two instances", 300, async () => {
      return (await ports.railway.runningInstances(SERVICE)) >= 2;
    });
    await until(ports, "both instances are ready", 300, () => probe.ready());
    await exercise(ports, backend, probe, "two-instances", 5);
    mark("two-instances");
    return timings;
  } finally {
    await backend?.close().catch(() => undefined);
    await ports.railway.deleteProject(projectId);
    mark("deleted");
  }
}

/** Sends probe requests to the deployed app. */
type ProbeClient = ((path: "jobs" | "events", key: string) => Promise<void>) & {
  ready(): Promise<boolean>;
};

/**
 * Creates the probe client for one origin.
 * @param ports - External effects.
 * @param origin - HTTPS origin of the deployment.
 * @returns The client; unsafe requests carry the origin, as production servers require.
 */
function probeClient(ports: NewcomerPorts, origin: string): ProbeClient {
  const send = async (path: "jobs" | "events", key: string) => {
    const response = await ports.fetch(`${origin}/probe/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ key }),
    });
    if (!response.ok)
      throw new Error(`POST /probe/${path} answered ${response.status}: ${await response.text()}`);
  };
  return Object.assign(send, {
    ready: () =>
      ports.fetch(`${origin}/healthz`).then(
        (response) => response.status === 200,
        () => false,
      ),
  });
}

/**
 * Submits jobs and events and waits until each ran exactly once, and until a new schedule
 * occurrence was claimed, with exactly one run per occurrence.
 * @param ports - External effects.
 * @param backend - Backend reader.
 * @param probe - Probe client.
 * @param phase - Key prefix.
 * @param count - Jobs and events to submit.
 * @param carried - Job keys submitted before this phase that must also complete.
 */
async function exercise(
  ports: NewcomerPorts,
  backend: BackendReader,
  probe: ProbeClient,
  phase: string,
  count: number,
  carried: readonly string[] = [],
): Promise<void> {
  const keys = Array.from({ length: count }, (_, index) => `${phase}-${index}`);
  const before = (await backend.occurrences()).length;
  const deliveries = await backend.completedDeliveries();
  await Promise.all(keys.flatMap((key) => [probe("jobs", key), probe("events", key)]));
  const expected = [...carried, ...keys, ...keys.map((key) => `event-${key}`)];
  await until(ports, `${phase}: jobs and events complete`, 240, async () => {
    const runs = await backend.runs();
    return expected.every((key) => runs.get(key) === "completed");
  });
  await until(ports, `${phase}: every delivery completes`, 120, async () => {
    return (await backend.completedDeliveries()) >= deliveries + count;
  });
  await until(ports, `${phase}: a new schedule occurrence is claimed`, 150, async () => {
    return (await backend.occurrences()).length > before;
  });
  const duplicated = (await backend.occurrences()).filter((occurrence) => occurrence.runs !== 1);
  if (duplicated.length > 0)
    throw new Error(`Schedule occurrences without exactly one run: ${JSON.stringify(duplicated)}`);
}

/**
 * Polls a condition once every five seconds.
 * @param ports - External effects.
 * @param what - Description for the timeout error.
 * @param seconds - Deadline.
 * @param check - Condition.
 */
async function until(
  ports: NewcomerPorts,
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
