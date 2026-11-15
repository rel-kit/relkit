/**
 * Optional PostgreSQL leg of the Node creation smoke (`--postgres <admin-url>`): a second project
 * with `relkit add database --dialect postgresql`, `DATABASE_URL` only in `.env`, pointing at a
 * throwaway database the leg creates and drops, then generate, migrate, `check` and one query
 * through `dev`. It is off by default and not run in CI.
 */
import type { Candidate } from "./node-creation-candidate.js";
import {
  addDatabase,
  checkPasses,
  migrateFromDotenv,
  type DatabaseSetup,
} from "./node-creation-commands.js";
import { devReadsDatabase } from "./node-creation-dev.js";
import { runCaptured } from "./node-creation-process.js";
import { fail, step, type Project, type StepResult } from "./node-creation-steps.js";

/**
 * Runs one statement against the admin database with the project's own `pg` driver, so the leg
 * needs no `psql` binary.
 * @param project - Project that has `pg` installed.
 * @param adminUrl - Connection URL of the server's admin database.
 * @param statement - SQL to run.
 */
async function runSql(project: Project, adminUrl: string, statement: string): Promise<void> {
  const script = [
    'const { Client } = require("pg");',
    "(async () => {",
    "  const client = new Client({ connectionString: process.env.RELKIT_G19_ADMIN_URL });",
    "  await client.connect();",
    "  await client.query(process.env.RELKIT_G19_SQL);",
    "  await client.end();",
    "})().catch((error) => { console.error(error); process.exit(1); });",
  ].join("\n");
  const command = ["node", "--input-type=commonjs", "-e", script];
  const finished = await runCaptured(command, project.directory, {
    ...project.env,
    RELKIT_G19_ADMIN_URL: adminUrl,
    RELKIT_G19_SQL: statement,
  });
  if (finished.code !== 0)
    fail(`node -e <sql: ${statement}>`, finished, "The SQL statement failed.");
}

/**
 * Runs the PostgreSQL leg and always drops its database.
 * @param candidate - The prepared candidate.
 * @param project - A freshly created project.
 * @param results - Step collector of the whole run.
 * @param adminUrl - Connection URL of an admin database such as `postgres://localhost:5432/postgres`.
 * @param runtime - Runtime description printed by the dev step.
 */
export async function postgresLeg(
  candidate: Candidate,
  project: Project,
  results: StepResult[],
  adminUrl: string,
  runtime: string,
): Promise<void> {
  const name = `relkit_g19_${process.pid}_${Date.now()}`;
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const setup: DatabaseSetup = { dialect: "postgresql", dotenv: `DATABASE_URL=${url.href}\n` };
  const own: StepResult[] = [];
  let created = false;
  let failed = false;
  try {
    await addDatabase(candidate, project, own, setup);
    await step(own, `create database ${name}`, async () => {
      await runSql(project, adminUrl, `create database "${name}"`);
      created = true;
    });
    await migrateFromDotenv(project, own, setup);
    await checkPasses(project, own);
    await devReadsDatabase(project, own, runtime);
  } catch (cause) {
    failed = true;
    throw cause;
  } finally {
    // A database that cannot be dropped is a failure of its own, reported after the step list.
    const leak = created
      ? await step(own, `drop database ${name}`, () =>
          runSql(project, adminUrl, `drop database if exists "${name}" with (force)`),
        ).then(
          () => undefined,
          (cause: unknown) => cause,
        )
      : undefined;
    results.push(...own.map((result) => ({ ...result, name: `[postgresql] ${result.name}` })));
    if (leak !== undefined) {
      console.error(`Database ${name} was not dropped; drop it by hand.`);
      if (!failed) throw leak;
    }
  }
}
