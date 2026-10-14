/** Owns contained checker-input fixtures for native prepared-reuse tests. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { SnapshotFiles } from "../../src/dev-snapshot/snapshot-files.service.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import { captureSnapshotTypecheckInputs } from "../../src/dev-snapshot/snapshot-typecheck-inputs.js";
/** Acquires and removes only this test's physical fixture, after every read completes. */
export const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-snapshot-checker-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

/**
 * Supplies one consumed declaration with unchanged-version package identity.
 * @param root - Acquired project root.
 * @returns Captured declaration and missing shadow-module evidence through the live adapter.
 */
export function capture(root: string) {
  return Effect.gen(function* () {
    const text = "export declare const value: number;";
    yield* Effect.promise(async () => {
      await mkdir(join(root, "node_modules/fixture"), { recursive: true });
      await writeFile(join(root, "node_modules/fixture/index.d.ts"), "\uFEFF" + text);
    });
    const files = yield* SnapshotFiles;
    return yield* captureSnapshotTypecheckInputs(files, root, [
      { kind: "read", path: "node_modules/fixture/index.d.ts", hash: snapshotDigest(text) },
      { kind: "fileExists", path: "node_modules/fixture/index.d.ts", exists: true },
      { kind: "directoryExists", path: "node_modules/fixture", exists: true },
      { kind: "fileExists", path: "node_modules/fixture.ts", exists: false },
      { kind: "fileExists", path: "node:fs.ts", exists: false },
      { kind: "directoryExists", path: "node_modules/absent", exists: false },
      { kind: "fileExists", path: "node_modules/absent/index.d.ts", exists: false },
      { kind: "directories", path: "node_modules/@types", entries: [] },
    ]);
  });
}
