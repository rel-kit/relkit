import { join, resolve } from "node:path";
import { restoreFile, snapshotFile } from "./preserve-build-state.ts";

const root = resolve(import.meta.dir, "..");
const metadata = Bun.spawn([process.execPath, "run", "scripts/sync-release.ts"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if ((await metadata.exited) !== 0)
  throw new Error("Workspace build metadata is stale; run bun run release:sync.");
const inspectorNextEnv = await snapshotFile(join(root, "apps/inspector/next-env.d.ts"));
const docsNextEnv = await snapshotFile(join(root, "apps/docs/next-env.d.ts"));
const child = Bun.spawn([process.execPath, "x", "turbo", "run", "build"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
let exitCode: number;
try {
  exitCode = await child.exited;
} finally {
  await restoreFile(inspectorNextEnv);
  await restoreFile(docsNextEnv);
}
if (exitCode !== 0) throw new Error(`Workspace build failed with exit code ${exitCode}.`);

console.log("Workspace build passed.");
