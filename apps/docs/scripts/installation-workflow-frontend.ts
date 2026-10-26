/** Checks the frontend guide against a separate packed backend using only pulled public contracts and selected browser leaves. */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { buildCatalogDependency } from "create-relkit/internal/build-catalog";
import { inspectionNative } from "../../../scripts/consumer-installation-native.js";
import {
  installWorkflowGuide,
  workflowCommand,
  verifyWorkflowClosure,
} from "./installation-workflow-project.js";
import { startWorkflowDev } from "./installation-workflow-runtime.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";

/** Starts with ordinary frontend type tooling, installs the guide's leaves, and compiles its pulled contract.
 * @param context - Exact candidate owner.
 * @param backend - Separate minimal app used only through public HTTP.
 * @returns Completion after real contract pull/check and strict frontend source compilation.
 */
export const frontendWorkflow = Effect.fn("DocsInstallation.frontend")(function* (
  context: InstallationWorkflow,
  backend: string,
) {
  const app = join(context.temporary, "frontend");
  yield* createFrontend(app);
  yield* installWorkflowGuide(context, app, "client-react");
  yield* installWorkflowGuide(context, app, "client-cli");
  yield* Effect.scoped(
    Effect.gen(function* () {
      const server = yield* startWorkflowDev(context, backend);
      yield* Effect.forEach(
        ["pull", "check"],
        (command) =>
          workflowCommand(context, app, [
            "run",
            "relkit",
            "client",
            command,
            server.origin,
            "--out",
            ".relkit/generated",
          ]),
        { concurrency: 1 },
      );
    }),
  );
  yield* writeFrontendConsumer(app);
  yield* workflowCommand(context, app, ["run", "tsc", "--noEmit"]);
  yield* verifyWorkflowClosure(
    context,
    app,
    /^(?:next|langchain|deepagents|@langchain\/.*|@relkit\/(?:langchain|drizzle|better-auth|inspector))$/,
  );
});

/** Creates ordinary frontend type tooling independently of the RELKIT installation recipe.
 * @param app - Fresh outside-workspace frontend root.
 * @returns Finite creation of its baseline package manifest.
 */
const createFrontend = (app: string) =>
  inspectionNative("docs.frontend-tooling", async () => {
    await mkdir(app);
    await writeFile(
      join(app, "package.json"),
      JSON.stringify({
        name: "docs-react-consumer",
        private: true,
        type: "module",
        devDependencies: {
          typescript: buildCatalogDependency("typescript"),
          "@types/react": buildCatalogDependency("@types/react"),
        },
      }),
    );
  });

/** Adds a browser-only consumer of the pulled registry, without importing backend source.
 * @param app - Frontend root containing the public contract output.
 * @returns Finite source and strict compiler setup.
 */
const writeFrontendConsumer = (app: string) =>
  inspectionNative("docs.frontend-source", async () => {
    const examples = join(import.meta.dir, "../examples/frontend");
    await mkdir(join(app, "src"));
    await copyFile(join(examples, "app.tsx"), join(app, "src/App.tsx"));
    await copyFile(join(examples, "tsconfig.app.json"), join(app, "tsconfig.json"));
  });
