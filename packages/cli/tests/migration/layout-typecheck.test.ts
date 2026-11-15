/** `relkit migrate layout` type checks the staged project with the project's own package manager. */
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageManagerCommands, projectPackageManager } from "create-relkit/package-manager";
import { typecheckRequest } from "../../src/migration/layout-validation.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/**
 * Creates a project root that declares a package manager.
 * @param packageManager - `packageManager` field value.
 * @returns Project root.
 */
async function projectRoot(packageManager: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-layout-typecheck-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "app", packageManager }));
  return root;
}

test.each(["bun@1.3.10", "npm@11.19.1", "pnpm@11.1.0"])(
  "the layout type check runs the project's typecheck script with %s",
  async (field) => {
    const manager = projectPackageManager(await projectRoot(field));
    const request = typecheckRequest("/staged", manager);
    expect(request).toEqual({
      command: field.split("@")[0],
      args: ["run", "typecheck"],
      cwd: "/staged",
    });
    // The argv is the text the next steps print, so the two cannot drift apart.
    expect([request.command, ...request.args].join(" ")).toBe(
      packageManagerCommands(manager).run("typecheck"),
    );
  },
);
