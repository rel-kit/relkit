import { existsSync } from "node:fs";
import { mkdir, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { workspacePackageDirectories } from "../workspace-packages.js";

const sandboxRoot = process.cwd();
const sourceRoot = resolve(sandboxRoot, "../..");
const directories = [
  ".",
  ...workspacePackageDirectories(sourceRoot).map((directory) => relative(sourceRoot, directory)),
];

for (const directory of directories) {
  const source = join(sourceRoot, directory, "node_modules");
  if (!existsSync(source)) continue;
  const target = join(sandboxRoot, directory, "node_modules");
  if (existsSync(target)) continue;
  await mkdir(dirname(target), { recursive: true });
  await symlink(source, target, "junction");
}
