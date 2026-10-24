/** Retires only Next's temporary writes after the owning browser/server groups
 * have joined. Exact resulting files remain in the run's retained evidence root.
 */
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { snapshotFile, restoreFile } from "./preserve-build-state.js";
import { scaffoldNative } from "./scaffold-native.js";

/** Captures the existing Next-written files before any native child starts.
 * @param application - Exact application root whose files Next may regenerate.
 * @param artifacts - This invocation's retained evidence directory.
 * @returns Scope ownership restoring original bytes after inner children retire.
 */
export const preserveBrowserState = Effect.fn("Browser.preserveSource")(function* (
  application: string,
  artifacts: string,
) {
  for (const name of ["next-env.d.ts", "tsconfig.json"] as const)
    yield* Effect.acquireRelease(
      scaffoldNative("browser.source.snapshot", () => snapshotFile(join(application, name))),
      (snapshot) =>
        scaffoldNative("browser.source.restore", async () => {
          try {
            await copyFile(snapshot.path, join(artifacts, `${name}.after`));
          } finally {
            await restoreFile(snapshot);
          }
        }).pipe(Effect.orDie),
    );
});
