/**
 * Command steps of the Node creation smoke: add a database, migrate it from `.env`, `check`, the
 * diagnostic for a Bun-only import, and `start` before any build. Each is one named step; none may
 * need Bun on `PATH`.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertCandidateInstalled, type Candidate } from "./node-creation-candidate.js";
import {
  commands,
  expectOutput,
  mustFail,
  mustSucceed,
  step,
  type Project,
  type StepResult,
} from "./node-creation-steps.js";

/** Manifest fields npm ignores without saying so; a generated npm project must not carry them. */
const SILENTLY_IGNORED_BY_NPM = [
  "patchedDependencies",
  "trustedDependencies",
  "catalog",
  "catalogs",
];

/** The database added to a project and the `.env` that points it at a database. */
export interface DatabaseSetup {
  readonly dialect: "sqlite" | "postgresql";
  /** Contents of `.env`; the connection value lives only there, never in the process environment. */
  readonly dotenv: string;
  /** File the database lives in, relative to the project, when it is a file. */
  readonly file?: string;
}

/**
 * Adds a database, installs and checks the manifest and the install output.
 * @param candidate - The prepared candidate.
 * @param project - The project.
 * @param results - Step collector.
 * @param setup - Database to add.
 */
export async function addDatabase(
  candidate: Candidate,
  project: Project,
  results: StepResult[],
  setup: DatabaseSetup,
): Promise<void> {
  const run = commands(project);
  await step(results, `add database (${setup.dialect}) and install`, async () => {
    const add = run.relkit(["add", "database", "--dialect", setup.dialect]);
    const added = await mustSucceed(project, add);
    const manifest = JSON.parse(await readFile(join(project.directory, "package.json"), "utf8"));
    for (const name of ["@relkit/drizzle", "drizzle-orm"])
      if (manifest.dependencies?.[name] === undefined) throw new Error(`${name} was not added.`);
    if (manifest.devDependencies?.["drizzle-kit"] === undefined)
      throw new Error("drizzle-kit was not added.");
    for (const name of ["db:generate", "db:migrate"])
      if (manifest.scripts?.[name] === undefined) throw new Error(`Script ${name} was not added.`);
    for (const field of SILENTLY_IGNORED_BY_NPM)
      if (field in manifest)
        throw new Error(`package.json has \`${field}\`, which ${project.manager} ignores.`);
    if (project.manager === "npm" && manifest.allowScripts?.esbuild !== true)
      throw new Error('An npm project needs `"allowScripts": { "esbuild": true }`.');
    if (project.manager === "pnpm") {
      const workspace = await readFile(join(project.directory, "pnpm-workspace.yaml"), "utf8");
      if (!workspace.includes("patchedDependencies"))
        throw new Error("pnpm-workspace.yaml has no patchedDependencies for Drizzle.");
    }
    if (/not yet covered by allowScripts/i.test(added.output))
      throw new Error(`The install warned about allowScripts:\n${added.output.slice(-3000)}`);
    await assertCandidateInstalled(candidate, project, ["@relkit/drizzle"]);
  });
}

/**
 * Generates and applies the first migration with the connection only in `.env`, then again.
 * @param project - The project.
 * @param results - Step collector.
 * @param setup - Database added to the project.
 */
export async function migrateFromDotenv(
  project: Project,
  results: StepResult[],
  setup: DatabaseSetup,
): Promise<void> {
  const run = commands(project);
  await step(results, "db:generate and db:migrate read .env", async () => {
    await writeFile(join(project.directory, ".env"), setup.dotenv);
    await mustSucceed(project, run.script("db:generate"));
    const migrate = run.script("db:migrate");
    const first = await mustSucceed(project, migrate);
    expectOutput(migrate, first, /Applied 1 migration/, "The first migration did not apply");
    const second = await mustSucceed(project, migrate);
    expectOutput(migrate, second, /up to date/, "The second migration was not a no-op");
    if (setup.file !== undefined && !existsSync(join(project.directory, setup.file)))
      throw new Error(`${setup.file}, named only in .env, was not created.`);
  });
}

/**
 * Runs `check`, which loads the scaffolded database service on Node.
 * @param project - The project.
 * @param results - Step collector.
 */
export async function checkPasses(project: Project, results: StepResult[]): Promise<void> {
  await step(results, "check exits 0", async () => {
    await mustSucceed(project, commands(project).script("check"));
  });
}

/**
 * Proves the diagnostic exists: a service importing `bun:sqlite` fails `check` at its import.
 * @param project - The project.
 * @param results - Step collector.
 */
export async function bunImportIsDiagnosed(project: Project, results: StepResult[]): Promise<void> {
  await step(results, "check names a bun:sqlite import", async () => {
    const directory = join(project.directory, "src/services/scratch");
    const check = commands(project).script("check");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "service.ts"),
      [
        'import { Database } from "bun:sqlite";',
        'import { defineService } from "relkit/services";',
        "",
        'export const database = new Database(":memory:");',
        "export default defineService({ functions: {} });",
        "",
      ].join("\n"),
    );
    try {
      const finished = await mustFail(project, check);
      expectOutput(
        check,
        finished,
        /src[\\/]services[\\/]scratch[\\/]service\.ts:1:1 .*RELKIT_EVALUATOR_BUN_RUNTIME_REQUIRED/,
        "The Bun-only import was not diagnosed at its line",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

/**
 * Runs `start` before any build: it must fail with the coded diagnostic that names `relkit build`.
 * @param project - The project.
 * @param results - Step collector.
 */
export async function startWithoutBuildFails(
  project: Project,
  results: StepResult[],
): Promise<void> {
  await step(results, "start before build is RELKIT_START_BUILD_MISSING", async () => {
    if (existsSync(join(project.directory, ".relkit/build/application.graph.json")))
      throw new Error("A build exists.");
    const start = commands(project).script("start");
    const finished = await mustFail(project, start);
    expectOutput(start, finished, "RELKIT_START_BUILD_MISSING", "The coded diagnostic is missing");
    expectOutput(start, finished, "relkit build", "The diagnostic does not name `relkit build`");
  });
}
