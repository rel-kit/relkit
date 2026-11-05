/**
 * Newcomer deploy test against Cloudflare. Opt-in: it runs only with `RELKIT_TEST_CLOUDFLARE=1`,
 * Cloudflare credentials (`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, or a `wrangler login`
 * session locally) and a Postgres server the Worker can reach (`RELKIT_TEST_CLOUDFLARE_DATABASE_URL`,
 * whose role may create databases), and otherwise prints why it skipped. It packs this checkout,
 * creates the `api` template from the candidate, adds the Postgres backend, Durable Object realtime
 * and a probe service, deploys a throwaway Worker named `relkit-test-<run id>` with its own queue
 * and database, proves HTTPS, jobs and events through Cloudflare Queues and exactly-once schedules
 * through the Cron Trigger, and deletes the Worker, the queue and the database in a `finally`.
 *
 *   RELKIT_TEST_CLOUDFLARE=1 bun scripts/cloudflare-newcomer.ts [--artifacts <packed release>]
 *     [--project <project prepared by an earlier run>]
 */
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { runCloudflareNewcomerDeploy } from "./cloudflare-newcomer/flow.js";
import { cloudflareDriver } from "./cloudflare-newcomer/cloudflare.js";
import { prepareCloudflareNewcomerProject } from "./cloudflare-newcomer/project.js";
import { databaseAdmin, postgresBackend } from "./vercel-newcomer.js";

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

async function main(): Promise<void> {
  if (process.env.RELKIT_TEST_CLOUDFLARE !== "1") {
    console.log(
      "Skipped the Cloudflare newcomer deploy test: set RELKIT_TEST_CLOUDFLARE=1 to run it.",
    );
    return;
  }
  const adminUrl = process.env.RELKIT_TEST_CLOUDFLARE_DATABASE_URL;
  if (adminUrl === undefined)
    throw new Error(
      "Set RELKIT_TEST_CLOUDFLARE_DATABASE_URL to a Postgres server Cloudflare can reach.",
    );
  const runId = process.env.GITHUB_RUN_ID ?? Date.now().toString(36);
  const started = Date.now();
  const reused = option("project");
  const project =
    reused === undefined
      ? await prepareCloudflareNewcomerProject(root, option("artifacts"))
      : { projectRoot: resolve(reused), temporary: undefined };
  const prepared = Math.round((Date.now() - started) / 1000);
  console.log(`Prepared ${project.projectRoot} in ${prepared} s`);
  try {
    const timings = await runCloudflareNewcomerDeploy(
      {
        cloudflare: cloudflareDriver(),
        database: databaseAdmin(adminUrl),
        fetch,
        backend: postgresBackend,
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
