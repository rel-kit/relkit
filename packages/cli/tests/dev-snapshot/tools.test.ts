/**
 * Verifies installed tool identities through logical aliases of the project root.
 * Resolution may return physical paths, while bounded file authority still belongs
 * to the supplied root. Escaped installed packages remain rejected through aliases.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { vi } from "vitest";
import { Effect, Exit } from "effect";
import { snapshotFilesLive } from "../../src/dev-snapshot/snapshot-files.service.js";
import { readSnapshotTools } from "../../src/dev-snapshot/snapshot-tools.js";

/** Acquires a fixture whose recursive cleanup is joined by the enclosing test scope. */
const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-snapshot-tools-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

/**
 * Installs minimal non-executable package manifests for native resolution.
 * @param root - Physical fixture directory.
 * @returns Completion once both tool identities are available.
 */
function install(root: string) {
  return Effect.promise(async () => {
    for (const { name, version } of [
      { name: "effect", version: "4.0.1" },
      { name: "typescript", version: "5.9.3" },
    ]) {
      const path = join(root, "node_modules", name);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "package.json"), JSON.stringify({ name, version }));
    }
  });
}

it.effect("resolves installed tool versions through a logical project-root alias", () =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => vi.stubGlobal("Bun", { version: "1.3.10" })),
        () => Effect.sync(() => vi.unstubAllGlobals()),
      );
      const owner = yield* directory;
      const project = join(owner, "project");
      const alias = join(owner, "alias");
      yield* install(project);
      yield* Effect.promise(() => symlink(project, alias, "dir"));
      expect(yield* readSnapshotTools(alias)).toMatchObject({
        effect: "4.0.1",
        typescript: "5.9.3",
      });
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("rejects installed tool resolution outside an aliased project root", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* directory;
      const external = yield* directory;
      const project = join(owner, "project");
      yield* install(external);
      yield* Effect.promise(async () => {
        await mkdir(project);
        await symlink(join(external, "node_modules"), join(project, "node_modules"), "dir");
        await symlink(project, join(owner, "alias"), "dir");
      });
      expect(Exit.isFailure(yield* Effect.exit(readSnapshotTools(join(owner, "alias"))))).toBe(
        true,
      );
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);
