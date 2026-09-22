import { join, resolve } from "node:path";
import { restoreFile, snapshotFile } from "./preserve-build-state.ts";

const root = resolve(import.meta.dir, "..");
const inspectorNextEnv = await snapshotFile(join(root, "apps/inspector/next-env.d.ts"));
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
}
if (exitCode !== 0) throw new Error(`Workspace build failed with exit code ${exitCode}.`);

console.log("Workspace build passed.");
