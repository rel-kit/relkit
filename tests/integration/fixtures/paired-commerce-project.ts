/** Copies and projects only private authored commerce inputs, retaining native provider, configuration and executable identity. */
import { cp, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { flatCommerceImports } from "./paired-commerce-layout.js";
import { commercePlatformFragments } from "./paired-commerce-platform.js";
import { commerceEventSources } from "./paired-commerce-events.sources.js";
const repository = resolve(import.meta.dir, "../../..");
const copies = [
  "examples/commerce",
  "tests/integration/http",
  "tests/integration/agents",
  "tests/integration/commerce-example-consistency.test.ts",
] as const;
const excluded = new Set(["node_modules", ".relkit", "dist", ".next", ".turbo"]);

/**
 * Copies only authored application/test inputs and borrows the installed native dependency identity.
 * @param root - Newly acquired private fixture tree.
 * @returns Completion after all original source inputs and SDK links are present.
 */
export async function copyCommerce(root: string): Promise<void> {
  await mkdir(join(root, "native-tmp"));
  for (const path of copies) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(repository, path), join(root, path), {
      recursive: true,
      filter: (path) =>
        !path.split(/[\\/]/).some((part) => excluded.has(part)) &&
        !/\.(?:d\.ts|js)(?:\.map)?$/.test(path),
    });
  }
  for (const path of [
    "packages",
    "integrations",
    "scripts",
    "node_modules",
    "tests/compiler",
    "tests/integration/runtime-cohort.ts",
  ])
    await symlink(join(repository, path), join(root, path));
  await symlink(
    join(repository, "examples/commerce/node_modules"),
    join(root, "examples/commerce/node_modules"),
  );
  await copyCapabilities(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
}

/**
 * Installs explicitly composed native Platform fragments and receiver-owned event sources in the private fixture.
 * @param root - Newly acquired private fixture tree.
 * @returns Completion after every authored acceptance input is present.
 */
async function copyCapabilities(root: string): Promise<void> {
  const configuration = commercePlatformFragments(
    await readFile(join(root, "examples/commerce/relkit.config.ts"), "utf8"),
  );
  for (const [path, text] of Object.entries(configuration.fragments)) {
    const destination = join(root, "examples/commerce", path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, text);
  }
  await writeFile(join(root, "examples/commerce/relkit.config.ts"), configuration.root);
  for (const [path, text] of Object.entries(commerceEventSources)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  await mkdir(join(root, "tests/integration/fixtures"), { recursive: true });
  await cp(
    join(repository, "tests/integration/fixtures/commerce-layout-events.native.ts"),
    join(root, "tests/integration/fixtures/commerce-layout-events.test.ts"),
  );
  await cp(
    join(repository, "tests/integration/fixtures/commerce-layout-tasks.native.ts"),
    join(root, "tests/integration/fixtures/commerce-layout-tasks.test.ts"),
  );
  await cp(
    join(repository, "tests/integration/fixtures/commerce-layout-task-run.ts"),
    join(root, "tests/integration/fixtures/commerce-layout-task-run.ts"),
  );
}

/**
 * Moves complete source boundaries and adjusts only resolved module references in owned copies.
 * @param root - Private grouped fixture tree.
 * @returns Completion after native relative imports, aliases and whole-service moves settle.
 */
export async function flattenCommerce(root: string): Promise<void> {
  for (const path of new Bun.Glob("{examples,tests}/**/*.ts").scanSync({
    cwd: root,
    onlyFiles: true,
    followSymlinks: false,
  })) {
    const text = await readFile(join(root, path), "utf8");
    await writeFile(join(root, path), flatCommerceImports(text, path));
  }
  const services = join(root, "examples/commerce/src/services");
  for (const entry of await readdir(services, { withFileTypes: true })) {
    if (!entry.isDirectory())
      throw new Error("Unexpected grouping entry in controlled commerce fixture");
    const destination = join(root, "examples/commerce/src", entry.name);
    const residue = [...new Bun.Glob("**/*").scanSync({ cwd: destination, onlyFiles: true })];
    if (residue.length > 0)
      throw new Error("Controlled flat destination contains authored content");
    await rm(destination, { recursive: true, force: true });
    await rename(join(services, entry.name), destination);
  }
}
