/** Stages an owned maintained minimal application with exact borrowed SDK dependencies and controlled offline browser descriptors. */
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { scaffoldNative } from "../../scripts/scaffold-native.js";
import { linkWorkspacePackages } from "../../packages/cli/test-workspace.js";
import { prepareProjectDependencyPatch } from "../../packages/create-relkit/src/dependency-patches.js";
import { generatedBrowserSources } from "./generated-host.sources.js";

const repository = resolve(import.meta.dir, "../..");

/**
 * Acquires and populates only an exclusive temporary root; providers stay lazy until the actual dev host starts.
 * @returns Owned application root whose cleanup follows native dev/browser process settlement.
 */
export const generatedBrowserProject = Effect.gen(function* () {
  const parent = yield* Effect.acquireRelease(
    scaffoldNative("browser.host.root", () => mkdtemp(join(tmpdir(), "relkit-generated-browser-"))),
    (root) =>
      scaffoldNative("browser.host.release", () => rm(root, { recursive: true, force: true })).pipe(
        Effect.orDie,
      ),
  );
  const root = join(parent, "app");
  yield* scaffoldNative("browser.host.stage", async () => {
    await cp(join(repository, "templates/default/v1/minimal"), root, { recursive: true });
    await prepareProjectDependencyPatch(root);
    await linkWorkspacePackages(root);
    for (const [name, target] of [
      ["langchain", join(repository, "integrations/packages/langchain/node_modules/langchain")],
      ["langsmith", join(repository, "integrations/packages/langchain/node_modules/langsmith")],
      [
        "@langchain/core",
        join(repository, "integrations/packages/langchain/node_modules/@langchain/core"),
      ],
      [
        "@langchain/langgraph",
        join(repository, "integrations/packages/langchain/node_modules/@langchain/langgraph"),
      ],
      ["@ag-ui/core", join(repository, "packages/runtime-hono/node_modules/@ag-ui/core")],
      ["@types/bun", join(repository, "node_modules/@types/bun")],
    ]) {
      await mkdir(dirname(join(root, "node_modules", name)), { recursive: true });
      await symlink(target, join(root, "node_modules", name));
    }
    for (const [file, source] of Object.entries(generatedBrowserSources)) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), source);
    }
  });
  return root;
});
