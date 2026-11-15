/**
 * Node creation smoke, run with Node and no Bun: serves the prepared candidate from a local
 * registry, creates a project with `npx create-relkit` (npm) or `pnpm dlx create-relkit` (pnpm),
 * then exercises the commands a project uses, each as a named step: `relkit add database`,
 * `db:generate` and `db:migrate` reading `.env`, `check`, the diagnostic for a Bun-only import,
 * `start` before a build, `dev` reading the database and stopping on SIGINT, and the Inspector.
 * The prepare step of `node-creation-smoke.ts` bundles this file to `smoke.mjs` next to the
 * registry it serves.
 *
 *   node smoke.mjs --package-manager npm|pnpm [--template minimal] [--require-no-bun] [--keep]
 *                  [--postgres <admin-url>]
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCandidateInstalled, type Candidate } from "./node-creation-candidate.js";
import {
  addDatabase,
  bunImportIsDiagnosed,
  checkPasses,
  migrateFromDotenv,
  startWithoutBuildFails,
  type DatabaseSetup,
} from "./node-creation-commands.js";
import { devReadsDatabase } from "./node-creation-dev.js";
import { inspectorListens } from "./node-creation-inspector.js";
import { flag, option, runCaptured } from "./node-creation-process.js";
import { postgresLeg } from "./node-creation-postgres.js";
import { startPreparedRegistry, type PreparedRegistryIndex } from "./node-creation-registry.js";
import { step, summarize, type Project, type StepResult } from "./node-creation-steps.js";

const SQLITE: DatabaseSetup = {
  dialect: "sqlite",
  // A path other than the scaffold's default proves `.env` is read.
  dotenv: "DATABASE_PATH=./.relkit/state/node-smoke.sqlite\n",
  file: ".relkit/state/node-smoke.sqlite",
};

/**
 * Creates a project with `npx create-relkit` or `pnpm dlx create-relkit`.
 * @param candidate - The prepared candidate.
 * @param manager - Package manager creating and installing the project.
 * @param env - Environment of every command.
 * @param parent - Directory the project is created in.
 * @param name - Project directory name.
 * @param results - Step collector.
 * @returns The project.
 */
async function createProject(
  candidate: Candidate,
  manager: "npm" | "pnpm",
  env: NodeJS.ProcessEnv,
  parent: string,
  name: string,
  results: StepResult[],
): Promise<Project> {
  const version = candidate.index.packages.find((entry) => entry.manifest.name === "create-relkit")
    ?.manifest.version;
  if (version === undefined) throw new Error("The prepared registry has no create-relkit.");
  const project: Project = { manager, directory: join(parent, name), env };
  await step(results, `create ${name} with ${manager === "npm" ? "npx" : "pnpm dlx"}`, async () => {
    const create = [
      `create-relkit@${version}`,
      name,
      "--template",
      option("template") ?? "minimal",
      "--no-git",
    ];
    const command = manager === "npm" ? ["npx", "--yes", ...create] : ["pnpm", "dlx", ...create];
    const finished = await runCaptured(command, parent, env);
    if (finished.code !== 0) throw new Error(`${command.join(" ")} exited with ${finished.code}`);
    const lockfile = manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
    if (!existsSync(join(project.directory, lockfile)))
      throw new Error(`The project was not installed with ${manager} (no ${lockfile}).`);
    await assertCandidateInstalled(candidate, project, ["relkit", "@relkit/cli"]);
  });
  return project;
}

async function main(): Promise<void> {
  const manager = option("package-manager");
  if (manager !== "npm" && manager !== "pnpm") throw new Error("--package-manager npm|pnpm");
  if (flag("require-no-bun") && spawnSync("bun", ["--version"]).error === undefined)
    throw new Error("bun is on PATH; this smoke must run without Bun.");
  const directory = dirname(fileURLToPath(import.meta.url));
  const index = JSON.parse(
    await readFile(join(directory, "index.json"), "utf8"),
  ) as PreparedRegistryIndex;
  const registry = await startPreparedRegistry(directory);
  const candidate: Candidate = { directory, index, registryUrl: registry.url };
  const temporary = await mkdtemp(join(tmpdir(), `relkit-node-${manager}-`));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
    NO_COLOR: "1",
    npm_config_registry: registry.url,
    npm_config_cache: join(temporary, "npm-cache"),
    // Fresh caches: the candidate shares its version with the published release.
    npm_config_store_dir: join(temporary, "pnpm-store"),
    npm_config_cache_dir: join(temporary, "pnpm-cache"),
    npm_config_update_notifier: "false",
  };
  // pnpm 11 reads `pnpm_config_*`; earlier releases read `npm_config_*`.
  for (const name of ["registry", "store_dir", "cache_dir"])
    env[`pnpm_config_${name}`] = env[`npm_config_${name}`];
  // The connection lives only in `.env`, never in the process environment.
  for (const name of ["npm_config_user_agent", "FORCE_COLOR", "DATABASE_PATH", "DATABASE_URL"])
    delete env[name];
  const results: StepResult[] = [];
  const runtime = `Node ${process.version}`;
  try {
    const project = await createProject(candidate, manager, env, temporary, "smoke-app", results);
    await addDatabase(candidate, project, results, SQLITE);
    await migrateFromDotenv(project, results, SQLITE);
    await checkPasses(project, results);
    await bunImportIsDiagnosed(project, results);
    await startWithoutBuildFails(project, results);
    await devReadsDatabase(project, results, runtime);
    await inspectorListens(candidate, project, results);
    const admin = option("postgres");
    if (admin !== undefined) {
      const second = await createProject(
        candidate,
        manager,
        env,
        temporary,
        "smoke-pg-app",
        results,
      );
      await postgresLeg(candidate, second, results, admin, runtime);
    }
    console.log(
      `\nAll ${results.length} steps passed on ${runtime} with ${manager}:\n${summarize(results)}`,
    );
  } catch (cause) {
    console.error(`\nSteps before the failure:\n${summarize(results)}`);
    throw cause;
  } finally {
    await registry.close();
    if (!flag("keep")) await rm(temporary, { recursive: true, force: true });
    else console.log(`kept ${temporary}`);
  }
}

await main();
