import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const child = Bun.spawn([process.execPath, "x", "turbo", "run", "build"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await child.exited;
if (exitCode !== 0) throw new Error(`Workspace build failed with exit code ${exitCode}.`);

console.log("Workspace build passed.");
