import { cp, mkdir, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { packedTemplates } from "./release-templates.js";
import { buildCatalog, drizzlePatchPath } from "./build-catalog.js";

const root = resolve(import.meta.dir, "..");
const source = join(root, "templates", "default");
const target = join(root, "packages", "create-relkit", "dist", "templates", "default");
const rootManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packageManifest = JSON.parse(
  await readFile(join(root, "packages/create-relkit/package.json"), "utf8"),
);
const catalog = await buildCatalog(root, rootManifest);
if (JSON.stringify(packageManifest.relkit?.buildCatalog) !== JSON.stringify(catalog))
  throw new Error("Generator build catalog is stale; run bun run release:sync.");
const patchTarget = join(root, "packages/create-relkit/dist", drizzlePatchPath);
await mkdir(join(root, "packages/create-relkit/dist/patches"), { recursive: true });
await cp(join(root, drizzlePatchPath), patchTarget);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
for (const template of packedTemplates)
  await rename(
    join(target, "v1", template, ".gitignore"),
    join(target, "v1", template, "gitignore"),
  );
