/**
 * Newcomer deploy test against Railway. Opt-in: it runs only with `RELKIT_TEST_RAILWAY=1` and
 * Railway credentials (`RAILWAY_API_TOKEN`, or a `railway login` session locally), and otherwise
 * prints why it skipped. It packs this checkout, creates the `api` template from the candidate,
 * adds the Postgres backend and a probe service, runs `relkit deploy init railway`, deploys a
 * throwaway project named `relkit-test-<run id>` with the Railway CLI, proves HTTPS, jobs, events
 * and schedules across a restart and with two instances, and deletes the project in a `finally`.
 *
 *   RELKIT_TEST_RAILWAY=1 bun scripts/railway-newcomer.ts [--runtime bun|node]
 *     [--artifacts <packed release directory>] [--workspace <Railway workspace>]
 *     [--project <project prepared by an earlier run>]
 */
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { SQL } from "bun";
import type { BackendReader } from "./railway-newcomer/flow.js";
import { runNewcomerDeploy } from "./railway-newcomer/flow.js";
import { prepareNewcomerProject } from "./railway-newcomer/project.js";
import { railwayCli } from "./railway-newcomer/railway.js";

const root = resolve(import.meta.dir, "..");

/**
 * Reads one `--name value` option.
 * @param name - Option name.
 * @returns The value, if given.
 */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

/**
 * Opens the backend reader on the public Postgres URL.
 * @param url - `DATABASE_PUBLIC_URL` of the Railway Postgres service.
 * @returns Queries over the backend's own tables.
 */
async function postgresBackend(url: string): Promise<BackendReader> {
  const sql = new SQL(url, { max: 1 });
  return {
    runs: async () => {
      const rows: { operation_id: string; status: string }[] =
        await sql`select operation_id, status from relkit_job_runs where job_id = 'probe.record-job'`;
      return new Map(rows.map((row) => [row.operation_id, row.status]));
    },
    completedDeliveries: async () => {
      const [row]: { count: string }[] =
        await sql`select count(*) from relkit_event_deliveries where status = 'completed'`;
      return Number(row?.count ?? 0);
    },
    occurrences: async () => {
      const rows: { at: Date; runs: string }[] = await sql`
        select o.occurrence_at as at, count(r.run_id) as runs
        from relkit_schedule_occurrences o
        left join relkit_job_runs r on r.operation_id = 'schedule:' || o.schedule_id || '@' ||
          to_char(o.occurrence_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        group by o.occurrence_at order by o.occurrence_at`;
      return rows.map((row) => ({ at: new Date(row.at).toISOString(), runs: Number(row.runs) }));
    },
    close: () => sql.close(),
  };
}

async function main(): Promise<void> {
  if (process.env.RELKIT_TEST_RAILWAY !== "1") {
    console.log("Skipped the Railway newcomer deploy test: set RELKIT_TEST_RAILWAY=1 to run it.");
    return;
  }
  const runtime = option("runtime") === "node" ? "node" : "bun";
  const runId = process.env.GITHUB_RUN_ID ?? `${Date.now().toString(36)}`;
  const started = Date.now();
  const reused = option("project");
  const project =
    reused === undefined
      ? await prepareNewcomerProject(root, runtime, option("artifacts"))
      : { projectRoot: resolve(reused), temporary: undefined, runtime };
  const prepared = Math.round((Date.now() - started) / 1000);
  console.log(`Prepared ${project.projectRoot} in ${prepared} s`);
  try {
    const timings = await runNewcomerDeploy(
      {
        railway: railwayCli(
          project.projectRoot,
          option("workspace") ?? process.env.RAILWAY_WORKSPACE,
        ),
        fetch,
        backend: postgresBackend,
        sleep: (ms) => Bun.sleep(ms),
        now: () => Date.now(),
        log: (message) => console.log(message),
      },
      runId,
    );
    console.log(JSON.stringify({ result: "passed", runtime, prepared, timings }));
  } finally {
    if (project.temporary !== undefined)
      await rm(project.temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
