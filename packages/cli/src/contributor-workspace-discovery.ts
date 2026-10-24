/** Decodes contributor manifests and discovers workspace roots through the invocation's captured filesystem. */
import { Context, Effect } from "effect";
import { dirname, join } from "node:path";
import { CliFileSystem } from "./services/filesystem.service.js";
import { cliTry } from "./cli-errors.js";
import { observeCli } from "./cli-runtime.js";
import { Schema } from "effect";
import { ContributorManifest } from "./contributor.schemas.js";
import type { ContributorRead, ContributorWorkspaceCapabilities } from "./contributor.types.js";
export function makeContributorRead(
  files: Context.Service.Shape<typeof CliFileSystem>,
): ContributorRead {
  const read = Effect.fn("Contributor.read")((path: string) =>
    files
      .readText(path)
      .pipe(
        Effect.flatMap((text) =>
          cliTry("contributor.manifest", () =>
            Schema.decodeUnknownSync(ContributorManifest)(JSON.parse(text)),
          ),
        ),
      ),
  );
  return read;
}
export function makeContributorRoots(
  files: Context.Service.Shape<typeof CliFileSystem>,
  read: ContributorRead,
): ContributorWorkspaceCapabilities["roots"] {
  const roots: ContributorWorkspaceCapabilities["roots"] = Effect.fn("Contributor.roots")(
    (root: string) =>
      observeCli(
        "contributor.roots",
        Effect.gen(function* () {
          const manifests = yield* files.files(root, [
            "packages/*/package.json",
            "integrations/packages/*/package.json",
            "integrations/catalog/package.json",
          ]);
          const entries = yield* Effect.forEach(
            manifests,
            (path) =>
              Effect.gen(function* () {
                const file = join(root, path);
                const manifest = yield* read(file);
                if (manifest.name === undefined)
                  return yield* cliTry("contributor.name", () => {
                    throw new Error(`Workspace package has no name: ${file}`);
                  });
                return [manifest.name, dirname(file)] as const;
              }),
            { concurrency: 4 },
          );
          return new Map(entries);
        }),
      ),
  );
  return roots;
}
export function missing(name: string) {
  return cliTry("contributor.workspace", () => {
    throw new Error(`Workspace package not found: ${name}`);
  });
}
