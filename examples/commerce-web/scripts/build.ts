import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const nextEnv = join(root, "next-env.d.ts");
const nextEnvSource = await readFile(nextEnv, "utf8");
const child = Bun.spawn([join(root, "node_modules/.bin/next"), "build"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});

try {
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`Commerce web build failed with exit code ${exitCode}.`);
} finally {
  await writeFile(nextEnv, nextEnvSource, "utf8");
}
