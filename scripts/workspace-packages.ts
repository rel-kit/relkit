import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

function childDirectories(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(path, entry.name));
}

export function workspacePackageDirectories(root: string): string[] {
  return [
    ...childDirectories(join(root, "packages")),
    join(root, "integrations", "catalog"),
    ...childDirectories(join(root, "integrations", "packages")),
  ]
    .filter((path) => existsSync(join(path, "package.json")))
    .sort();
}
