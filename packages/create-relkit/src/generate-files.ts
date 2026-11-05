import { join } from "node:path";
import { Effect } from "effect";
import { observeExecution } from "relkit/contracts/operation";
import { GenerateProjectError } from "./generate-types.js";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { domainError } from "./generator-errors.js";
import type { GeneratorDomainError, GeneratorIoError } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import type { CreateOptions } from "./options.js";
import { customizeDeploymentEffect } from "./generate-deployment.js";
import { creationPackageManager, packageManagerFromUserAgent } from "./package-manager.js";
import {
  compareNames,
  projectId,
  removeExamplesEffect,
  replaceOnceEffect,
} from "./generate-files-utilities.js";
export {
  EXAMPLE_PATH_PREFIXES,
  cleanupStagedProject,
  cleanupStagedProjectEffect,
  listProjectFiles,
  listProjectFilesEffect,
  projectId,
  removeExamples,
  removeExamplesEffect,
  replaceOnce,
  replaceOnceEffect,
  requireFiles,
  requireFilesEffect,
  requireTemplate,
  requireTemplateEffect,
  type StageCleanupResult,
} from "./generate-files-utilities.js";

/**
 * Copies template entries in order and rejects unsupported entries before publication.
 * @param source - Template directory copied without executing its source files.
 * @param target - Owned staging directory receiving the copied files.
 * @returns Completion after supported template files/directories are copied with deterministic modes.
 */
export const copyTemplateEffect = Effect.fn("ProjectFiles.copy")(
  function* (
    source: string,
    target: string,
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const fs = yield* GeneratorFileSystem;
    yield* fs.mkdir(target, { recursive: true, mode: 0o755 });
    yield* fs.chmod(target, 0o755);
    for (const entry of [...(yield* fs.entries(source))].sort(compareNames)) {
      const from = join(source, entry.name);
      const to = join(target, entry.name === "gitignore" ? ".gitignore" : entry.name);
      if (entry.kind === "directory") yield* copyTemplateEffect(from, to);
      else if (entry.kind === "file") {
        yield* fs.write(to, yield* fs.readBytes(from), { mode: 0o644 });
        yield* fs.chmod(to, 0o644);
      } else
        return yield* Effect.fail(
          domainError(
            new GenerateProjectError(
              "RELKIT_CREATE_TEMPLATE_INVALID",
              "Template contains an unsupported entry.",
            ),
          ),
        );
    }
  },
  (effect) => observeExecution("generator", "generation.copy", effect),
);

/**
 * Applies name, application identity, deployment and example choices inside the owned stage.
 * @param root - Absolute project or owned resource root.
 * @param options - Explicit options retaining existing defaults.
 * @returns Completion after project name, ID, deployment choices and example selection are materialized.
 */
export const customizeProjectEffect = Effect.fn("ProjectFiles.customize")(
  function* (root: string, options: CreateOptions) {
    yield* replaceOnceEffect(
      join(root, "package.json"),
      '"name": "my-app"',
      `"name": ${JSON.stringify(options.name)}`,
    );
    yield* replaceOnceEffect(join(root, "README.md"), "# my-app", `# ${options.name}`);
    yield* replaceOnceEffect(
      join(root, "relkit.config.ts"),
      "export default defineApp({",
      `export default defineApp({\n  id: ${JSON.stringify(projectId(options.name))},`,
    );
    yield* customizePackageManagerEffect(root, options);
    yield* customizeDeploymentEffect(root, options);
    if (!options.examples) yield* removeExamplesEffect(root);
  },
  (effect) => observeExecution("generator", "generation.customize", effect),
);

/**
 * Lets pnpm run esbuild's install script, which pnpm 10 skips with a warning and pnpm 11 refuses
 * without approval; `@relkit/cli` uses esbuild to run TypeScript on Node. `allowBuilds` is pnpm
 * 11's setting and `onlyBuiltDependencies` pnpm 10's.
 */
const PNPM_WORKSPACE = `allowBuilds:
  esbuild: true
onlyBuiltDependencies:
  - esbuild
`;

/**
 * Records the selected package manager in `packageManager`. Templates pin Bun; for npm and pnpm
 * the field names the invoking manager's version, or is removed when that version is unknown.
 * pnpm projects also get the `pnpm-workspace.yaml` above.
 * @param root - Staged project root.
 * @param options - Creation options carrying `--package-manager`.
 * @returns Completion after `package.json` is rewritten.
 */
const customizePackageManagerEffect = Effect.fn("ProjectFiles.packageManager")(function* (
  root: string,
  options: CreateOptions,
) {
  const manager = creationPackageManager(options.packageManager);
  if (manager === "bun") return;
  const fs = yield* GeneratorFileSystem;
  if (manager === "pnpm") yield* fs.write(join(root, "pnpm-workspace.yaml"), PNPM_WORKSPACE);
  const path = join(root, "package.json");
  const content = yield* fs.readText(path);
  const agent = packageManagerFromUserAgent();
  const version = agent?.name === manager ? agent.version : undefined;
  const field = version === undefined ? "" : `$1"packageManager": "${manager}@${version}",\n`;
  yield* fs.write(path, content.replace(/^(\s*)"packageManager": "bun@[^"]*",\n/m, field));
});

/**
 * Preserves ordered template copy's Promise API.
 * @param source - Template directory copied without executing its source files.
 * @param target - Owned staging directory receiving the copied files.
 * @returns Completion after the existing contract has been applied.
 */
export function copyTemplate(source: string, target: string): Promise<void> {
  return runGeneratorPromise(copyTemplateEffect(source, target));
}

/**
 * Preserves project customization's Promise API.
 * @param root - Absolute project or owned resource root.
 * @param options - Explicit options retaining existing defaults.
 * @returns Completion after the existing contract has been applied.
 */
export function customizeProject(root: string, options: CreateOptions): Promise<void> {
  return runGeneratorPromise(customizeProjectEffect(root, options));
}
