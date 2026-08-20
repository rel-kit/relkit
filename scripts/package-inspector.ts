import { access, cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const inspector = join(root, "apps/inspector");
const distName = ".next-packaged";
const build = join(inspector, distName);
const standalone = join(build, "standalone");
const standaloneApp = join(standalone, "apps/inspector");
const output = join(root, "packages/cli/dist/inspector");

const child = Bun.spawn([process.execPath, "run", "build"], {
  cwd: inspector,
  env: { ...process.env, ZSYS_INSPECTOR_DIST_DIR: distName },
  stdout: "inherit",
  stderr: "inherit",
});
const exitCode = await child.exited;
if (exitCode !== 0) throw new Error(`Inspector build failed with exit code ${exitCode}.`);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ["package.json", "server.js"])
  await cp(join(standaloneApp, file), join(output, file));
await cp(join(standaloneApp, distName), join(output, distName), { recursive: true });
await cp(join(build, "static"), join(output, distName, "static"), { recursive: true });
try {
  await access(join(inspector, "public"));
  await cp(join(inspector, "public"), join(output, "public"), { recursive: true });
} catch {}

console.log("Packaged inspector server in packages/cli/dist/inspector.");
