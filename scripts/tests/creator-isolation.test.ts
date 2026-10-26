/** Preserves creator transactions while checking the isolated launcher and catalog boundaries. */
import { describe, expect, it } from "vitest";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { generateProject, planCreate } from "create-relkit";
import { prepareProjectDependencyPatch } from "create-relkit/internal/dependency-patches";
import {
  root,
  withFixture,
  templateFixture,
  wrapperFixture,
  installedEntry,
  runWrapper,
} from "./creator-isolation.fixture.js";

describe("creator isolation", () => {
  it("no_install_no_fetch_or_eval", caseNoInstallNoFetchOrEval);
  it("wrapper_create_no_cli_install", caseWrapperCreateNoCliInstall);
  it("project_cli_version_mismatch", caseProjectCliVersionMismatch);

  it("wrapper_no_recursion", caseWrapperNoRecursion);

  it(
    "Bun and Node package-runner bootstraps select the same project entry",
    caseBunAndNodePackageRunnerBootstrapsSelect,
  );

  it("missing_bun_diagnostic", caseMissingBunDiagnostic);

  it("catalog_no_executable_exports", caseCatalogNoExecutableExports);

  it("drizzle_patch_only_selected", caseDrizzlePatchOnlySelected);
});

/** Verifies that no_install_no_fetch_or_eval.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseNoInstallNoFetchOrEval() {
  return withFixture(async (directory) => {
    const templateRoot = await templateFixture(directory);
    const options = {
      name: "isolated-app",
      template: "minimal",
      cloud: "none",
      deploy: "none",
      install: false,
      git: false,
      examples: true,
      forceEmptyDirectory: false,
      json: false,
    } as const;
    const context = {
      cwd: directory,
      templateRoot,
      commandRunner: async () => {
        throw new Error("No-install invoked a subprocess");
      },
    };
    const preview = await planCreate(options, context);
    const result = await generateProject(options, context);
    expect(result.installed).toBe(false);
    expect(preview.profiles).toEqual([]);
    await expect(access(join(directory, "evaluated"))).rejects.toThrow();
    await expect(access(join(result.destination, "node_modules"))).rejects.toThrow();
    await expect(access(join(result.destination, "patches"))).rejects.toThrow();
    expect(await readFile(join(result.destination, ".gitignore"), "utf8")).toContain(".relkit/");
  });
}

/** Verifies that wrapper_create_no_cli_install.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseWrapperCreateNoCliInstall() {
  return withFixture(async (directory) => {
    const entry = await wrapperFixture(directory);
    await rm(join(directory, "node_modules/@relkit/cli"), { recursive: true });
    const result = runWrapper(entry, ["create", "sample", "--no-install", "--no-git"], directory);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      kind: "create",
      args: ["sample", "--no-install", "--no-git"],
    });
  });
}

/** Verifies that project_cli_version_mismatch.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseProjectCliVersionMismatch() {
  return withFixture(async (directory) => {
    const entry = await wrapperFixture(directory);
    await installedEntry(directory, "@relkit/cli", "wrong", "999.0.0");
    const result = runWrapper(entry, ["check"], directory);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("RELKIT_PROJECT_CLI_VERSION");
    expect(result.stdout).toBe("");
  });
}

/** Verifies that wrapper_no_recursion.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseWrapperNoRecursion() {
  return withFixture(async (directory) => {
    const entry = await wrapperFixture(directory);
    const result = runWrapper(entry, ["check", "--json"], directory);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ kind: "project", args: ["check", "--json"] });
  });
}

/** Verifies that Bun and Node package-runner bootstraps select the same project entry.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseBunAndNodePackageRunnerBootstrapsSelect() {
  return withFixture(async (directory) => {
    const entry = await wrapperFixture(directory);
    const bun = runWrapper(entry, ["graph", "print"], directory, "bun");
    const nodeResult = runWrapper(entry, ["graph", "print"], directory, process.execPath);
    expect(bun.status).toBe(0);
    expect(nodeResult.status).toBe(0);
    expect(JSON.parse(nodeResult.stdout)).toEqual(JSON.parse(bun.stdout));
  });
}

/** Verifies that missing_bun_diagnostic.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseMissingBunDiagnostic() {
  return withFixture(async (directory) => {
    const entry = await wrapperFixture(directory);
    const result = spawnSync(process.execPath, [entry, "create", "sample"], {
      cwd: directory,
      env: { ...process.env, PATH: directory },
      encoding: "utf8",
      timeout: 10000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("RELKIT_BUN_REQUIRED");
    expect(result.stdout).toBe("");
  });
}

/** Verifies that catalog_no_executable_exports.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseCatalogNoExecutableExports() {
  const manifest = JSON.parse(
    await readFile(join(root, "integrations/catalog/package.json"), "utf8"),
  );
  expect(Object.keys(manifest.exports)).toEqual(["."]);
  expect(manifest.dependencies ?? {}).toEqual({});
  expect(manifest.relkit.catalog["./langchain"]).toBe("@relkit/langchain");
  expect((await readFile(join(root, "integrations/catalog/src/index.ts"), "utf8")).trim()).toBe(
    "export {};",
  );
}

/** Verifies that drizzle_patch_only_selected.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
async function caseDrizzlePatchOnlySelected() {
  return withFixture(async (directory) => {
    await writeFile(join(directory, "package.json"), JSON.stringify({ dependencies: {} }));
    await prepareProjectDependencyPatch(directory);
    await expect(access(join(directory, "patches"))).rejects.toThrow();
    const creator = JSON.parse(
      await readFile(join(root, "packages/create-relkit/package.json"), "utf8"),
    );
    const patch = creator.relkit.buildCatalog.patches["drizzle-orm"];
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ dependencies: { "drizzle-orm": patch.version } }),
    );
    await prepareProjectDependencyPatch(directory);
    const bytes = await readFile(join(directory, "patches", patch.key + ".patch"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(patch.hash);
    expect(bytes.equals(await readFile(join(root, "patches/drizzle-orm.patch")))).toBe(true);
  });
}
