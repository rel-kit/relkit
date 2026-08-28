import { cp, mkdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const source = join(root, "templates", "default");
const target = join(root, "packages", "create-relkit", "dist", "templates", "default");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
for (const template of ["agent", "api", "minimal"])
  await rename(
    join(target, "v1", template, ".gitignore"),
    join(target, "v1", template, "gitignore"),
  );
