/**
 * Newcomer deploy test against Vercel. Opt-in: it runs only with `RELKIT_TEST_VERCEL=1`, a Vercel
 * token (`VERCEL_TOKEN`, or a `vercel login` session locally) and a Postgres server the deployment
 * can reach (`RELKIT_TEST_VERCEL_DATABASE_URL`, whose role may create databases), and otherwise
 * prints why it skipped. It packs this checkout, creates the `api` template from the candidate, adds
 * the Postgres backend and a probe service, runs `relkit deploy init vercel`, deploys a throwaway
 * project named `relkit-test-<run id>` to its production target (Vercel Cron runs only there) with
 * its own database, proves HTTPS, jobs, events and exactly-once schedules through Vercel Cron, and
 * deletes the project and the database in a `finally`. The probe's schedule runs every minute,
 * which needs a Vercel plan with per-minute cron jobs; `VERCEL_TEAM_ID` selects that team.
 *
 *   RELKIT_TEST_VERCEL=1 bun scripts/vercel-newcomer.ts [--artifacts <packed release directory>]
 *     [--project <project prepared by an earlier run>]
 */
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { SQL } from "bun";
import type { BackendReader } from "./railway-newcomer/flow.js";
import { runVercelNewcomerDeploy, type DatabaseAdmin } from "./vercel-newcomer/flow.js";
import { prepareVercelNewcomerProject } from "./vercel-newcomer/project.js";
import { vercelDriver, vercelToken } from "./vercel-newcomer/vercel.js";

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
 * Creates and drops per-run databases on the test's Postgres server.
 * @param adminUrl - URL of a role that may create databases.
 * @returns The admin port.
 */
export function databaseAdmin(adminUrl: string): DatabaseAdmin {
  const withDatabase = (name: string) => {
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    return url.toString();
  };
  const admin = () => new SQL(adminUrl, { max: 1 });
  return {
    create: async (name) => {
      const sql = admin();
      await sql.unsafe(`create database "${name}"`);
      await sql.close();
      return withDatabase(name);
    },
    drop: async (name) => {
      const sql = admin();
      await sql.unsafe(`drop database if exists "${name}" with (force)`);
      await sql.close();
    },
  };
}

/**
 * Opens the backend reader.
 * @param url - Database URL of the run.
 * @returns Queries over the backend's own tables.
 */
export async function postgresBackend(url: string): Promise<BackendReader> {
  const sql = new SQL(url, { max: 1 });
  return {
    runs: async () => {
      const rows: { operation_id: string; status: string }[] =
        await sql`select operation_id, status from relkit_job_runs where job_id = 'probe.record-job'`.catch(
          () => [],
        );
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
        group by o.occurrence_at order by o.occurrence_at`.catch(() => []);
      return rows.map((row) => ({ at: new Date(row.at).toISOString(), runs: Number(row.runs) }));
    },
    close: () => sql.close(),
  };
}

async function main(): Promise<void> {
  if (process.env.RELKIT_TEST_VERCEL !== "1") {
    console.log("Skipped the Vercel newcomer deploy test: set RELKIT_TEST_VERCEL=1 to run it.");
    return;
  }
  const token = await vercelToken();
  const adminUrl = process.env.RELKIT_TEST_VERCEL_DATABASE_URL;
  if (token === undefined) throw new Error("Set VERCEL_TOKEN or run vercel login.");
  if (adminUrl === undefined)
    throw new Error("Set RELKIT_TEST_VERCEL_DATABASE_URL to a Postgres server Vercel can reach.");
  const runId = process.env.GITHUB_RUN_ID ?? Date.now().toString(36);
  const started = Date.now();
  const reused = option("project");
  const project =
    reused === undefined
      ? await prepareVercelNewcomerProject(root, option("artifacts"))
      : { projectRoot: resolve(reused), temporary: undefined };
  const prepared = Math.round((Date.now() - started) / 1000);
  console.log(`Prepared ${project.projectRoot} in ${prepared} s`);
  try {
    const timings = await runVercelNewcomerDeploy(
      {
        vercel: vercelDriver(token, process.env.VERCEL_TEAM_ID || undefined),
        database: databaseAdmin(adminUrl),
        fetch,
        backend: postgresBackend,
        secret: () => randomBytes(24).toString("base64url"),
        sleep: (ms) => Bun.sleep(ms),
        now: () => Date.now(),
        log: (message) => console.log(message),
      },
      project.projectRoot,
      runId,
    );
    console.log(JSON.stringify({ result: "passed", prepared, timings }));
  } finally {
    if (project.temporary !== undefined)
      await rm(project.temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
