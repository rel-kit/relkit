/** Follows the manual database/auth guide with real installs, migration/data controls and authenticated production HTTP. */
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Exit, Schema } from "effect";
import { inspectionNative } from "../../../scripts/consumer-installation-native.js";
import { applyTutorial } from "./orders-tutorial-project.js";
import { verifyTutorialProduction } from "./orders-tutorial-http.js";
import { workflowTutorial } from "./installation-workflow-runtime.js";
import {
  checkWorkflowBackend,
  headlessForbiddenPackages,
} from "./installation-workflow-backend.js";
import {
  createWorkflowProject,
  copyWorkflowSource,
  installWorkflowGuide,
  workflowCommand,
  verifyWorkflowClosure,
  workflowManifest,
} from "./installation-workflow-project.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";

/** Follows manual database/auth installation while retaining pre-auth data and applied migration source bytes.
 * @param context - Shared exact packed cohort.
 * @returns Completion after native authenticated production HTTP and restart.
 */
export const ordersWorkflow = Effect.fn("DocsInstallation.orders")(function* (
  context: InstallationWorkflow,
) {
  const app = yield* createWorkflowProject(context, "relkit-orders");
  const project = workflowTutorial(context, app);
  yield* Effect.forEach(
    ["src/services/orders", "src/routes/orders"],
    (path) => copyWorkflowSource(context, app, `templates/default/v1/api/${path}`, path),
    { concurrency: 1 },
  );
  yield* applyTutorial(project, "endpoint");
  yield* installWorkflowGuide(context, app, "database");
  yield* applyTutorial(project, "database");
  yield* migrateOrders(context, app, "initial");
  yield* workflowCommand(context, app, [
    "--eval",
    'import { Database } from "bun:sqlite"; const db=new Database(process.env.DATABASE_PATH); db.run("INSERT INTO orders VALUES (?, ?, ?, ?, ?)", ["before-auth", "preserved", 1, 1000, null]); db.close();',
  ]);
  yield* checkWorkflowBackend(context, app);
  const appliedSql = yield* migrationSql(app);
  assert(Object.keys(appliedSql).length > 0, "Initial migration source is absent");
  yield* installWorkflowGuide(context, app, "auth");
  yield* applyTutorial(project, "auth");
  yield* migrateOrders(context, app, "auth");
  const retainedSql = yield* migrationSql(app);
  for (const [path, sql] of Object.entries(appliedSql))
    assert.equal(retainedSql[path], sql, "Auth rewrote applied SQL");
  yield* workflowCommand(context, app, ["run", "relkit", "db", "migrate"]);
  yield* workflowCommand(context, app, [
    "--eval",
    'import assert from "node:assert/strict"; import { Database } from "bun:sqlite"; const db=new Database(process.env.DATABASE_PATH); assert.deepEqual(db.query("SELECT sku FROM orders WHERE orderId = ?").get("before-auth"), {sku:"preserved"}); db.close();',
  ]);
  yield* applyTutorial(project, "tests");
  yield* checkWorkflowBackend(context, app);
  yield* verifyWorkflowClosure(context, app, headlessForbiddenPackages);
  yield* verifyTutorialProduction(project);
  yield* incompatibleDeclaration(context, app);
});

/** Uses the guide's actual migration commands and retains their source receipts for the next stage.
 * @param context - Candidate command environment.
 * @param app - Owned SQLite app.
 * @param name - Guide's initial/auth migration label.
 * @returns Completion after native migration and descriptor checking.
 */
const migrateOrders = Effect.fn("DocsInstallation.migrate")(function* (
  context: InstallationWorkflow,
  app: string,
  name: string,
) {
  yield* workflowCommand(context, app, ["--bun", "drizzle-kit", "generate", `--name=${name}`]);
  yield* workflowCommand(context, app, ["run", "relkit", "db", "migrate"]);
  yield* workflowCommand(context, app, ["run", "check"]);
});

/** Confirms native add refuses an incompatible authored adapter without overwriting that manifest.
 * @param context - Candidate command owner.
 * @param app - Owned consumer whose successful auth journey has finished.
 * @returns Completion after a real collision diagnostic and exact-byte restoration.
 */
const incompatibleDeclaration = Effect.fn("DocsInstallation.collision")(function* (
  context: InstallationWorkflow,
  app: string,
) {
  const path = join(app, "package.json");
  const original = yield* inspectionNative("docs.collision-read", () => readFile(path, "utf8"));
  const manifest = yield* workflowManifest(app);
  const broken = {
    ...manifest,
    dependencies: {
      ...installationDependencies(manifest.dependencies),
      "@relkit/drizzle": "0.0.5",
    },
  };
  yield* inspectionNative("docs.collision-write", () => writeFile(path, JSON.stringify(broken)));
  const result = yield* Effect.exit(
    workflowCommand(context, app, [
      "run",
      "relkit",
      "add",
      "auth",
      "--adapter",
      "better-auth",
      "--database-dialect",
      "sqlite",
      "--no-install",
    ]),
  );
  assert(Exit.isFailure(result), "Incompatible authored declaration was silently accepted");
  assert(
    JSON.stringify(result).includes("RELKIT_ADD_COLLISION"),
    "Expected the native dependency collision diagnostic",
  );
  assert.equal(
    yield* inspectionNative("docs.collision-retained", () => readFile(path, "utf8")),
    JSON.stringify(broken),
  );
  yield* inspectionNative("docs.collision-restore", () => writeFile(path, original));
});

/** Narrows the known native dependency section for the deliberately incompatible control.
 * @param value - JSON manifest section.
 * @returns Native string dependency declarations.
 */
function installationDependencies(value: Schema.Json | undefined) {
  return Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(value ?? {});
}

/** Captures only applied SQL bytes; Drizzle may append its journal and new snapshots.
 * @param app - Owned tutorial database application.
 * @returns Initial migration file paths mapped to their exact authored SQL.
 */
const migrationSql = (app: string) =>
  inspectionNative("docs.migration-sql", async () => {
    const root = join(app, "src/services/database/migrations");
    const paths = (await readdir(root, { recursive: true, encoding: "utf8" })).filter((path) =>
      path.endsWith(".sql"),
    );
    return Object.fromEntries(
      await Promise.all(
        paths.map(async (path) => [path, await readFile(join(root, path), "utf8")]),
      ),
    );
  });
