import { Effect, Layer, Schema } from "effect";
import { GeneratorPaths } from "create-relkit";
import { ContributorManifest } from "../../src/contributor.schemas.js";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliProcess } from "../../src/services/process.service.js";
import { cliAdapterError } from "../../src/cli-errors.js";
import { contributorWorkspaceLive } from "../../src/contributor-workspace.service.js";
import { testFiles } from "../read-services/test-files.js";

/**
 * Creates an isolated native-boundary fixture.
 * @param beforeRead - Controlled work admitted before each manifest read.
 * @returns The live workspace domain with substitutable native authority.
 */
export function workspaceFixture(beforeRead: () => Effect.Effect<void> = () => Effect.void) {
  const manifests = new Map<string, unknown>([
    ["/repo/package.json", { catalog: { effect: "4.0.1" } }],
    [
      "/repo/packages/a/package.json",
      { name: "@relkit/a", dependencies: { "@relkit/b": "workspace:*", effect: "catalog:" } },
    ],
    [
      "/repo/packages/b/package.json",
      { name: "@relkit/b", dependencies: { "@relkit/a": "workspace:*" } },
    ],
    [
      "/repo/packages/cli/package.json",
      { name: "@relkit/cli", dependencies: { next: "catalog:" } },
    ],
    ["/shared/effect/package.json", { version: "4.0.1" }],
    [
      "/app/package.json",
      {
        name: "application",
        private: true,
        custom: { keep: [1] },
        dependencies: { "@relkit/a": "0.6.0", effect: "catalog:" },
        devDependencies: { "@relkit/cli": "0.6.0" },
      },
    ],
  ]);
  const commands: string[] = [];
  const unlinked: string[] = [];
  let failAt: string | undefined;
  const files = Layer.succeed(
    CliFileSystem,
    testFiles({
      files: () =>
        Effect.succeed(
          [...manifests.keys()]
            .filter((path) => path.startsWith("/repo/packages/"))
            .map((path) => path.slice("/repo/".length)),
        ),
      readText: (path) =>
        beforeRead().pipe(
          Effect.andThen(
            Effect.suspend(() =>
              manifests.has(path)
                ? Effect.succeed(JSON.stringify(manifests.get(path)))
                : Effect.fail(cliAdapterError("read", new Error("Missing fixture: " + path))),
            ),
          ),
        ),
      writeText: (path, text) =>
        Effect.sync(() => {
          manifests.set(path, JSON.parse(text));
        }),
      unlink: (path) =>
        Effect.sync(() => {
          unlinked.push(path);
        }),
    }),
  );
  const paths = Layer.succeed(GeneratorPaths, {
    metadata: () => Effect.succeed({ kind: "symlink", mode: 0o755 }),
    entries: () => Effect.succeed([]),
    realpath: () => Effect.succeed("/shared/effect"),
    cwd: () => Effect.succeed("/repo"),
    home: () => Effect.succeed("/home"),
    temporaryRoot: () => Effect.succeed("/tmp"),
  });
  const process = Layer.succeed(CliProcess, {
    run: (request) =>
      Effect.sync(() => {
        commands.push(request.cwd);
        return { exitCode: request.cwd === failAt ? 7 : 0, stdout: "out", stderr: "err" };
      }),
  });
  return {
    manifests,
    commands,
    unlinked,
    fail: (path: string) => {
      failAt = path;
    },
    project: () =>
      Schema.decodeUnknownSync(ContributorManifest)(manifests.get("/app/package.json")),
    layer: contributorWorkspaceLive("/repo").pipe(
      Layer.provide(Layer.mergeAll(files, paths, process)),
    ),
  };
}
