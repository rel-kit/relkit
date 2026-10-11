/**
 * Verifies one creation tuple's decoded metadata, dispatch and publication.
 * Fake subprocess authority records the finite preparation command; complete
 * output bytes still come from the real generator and its owned sibling stage.
 */
import { expect } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import { generateProject } from "../../packages/create-relkit/src/generate.js";
import appManifest from "../../packages/app/package.json" with { type: "json" };
import workspaceManifest from "../../package.json" with { type: "json" };
import { createOptions, contextFor } from "./option-matrix-fixture.js";
import { GeneratedManifest, GeneratedTsconfig } from "./option-matrix.schemas.js";
import { scanGeneratedProject } from "./option-matrix-scan.js";
import type { CreationTuple, GeneratedManifestValue } from "./option-matrix.types.js";

/** Generates and verifies one explicit combination.
 * @param root - Test-owned temporary parent.
 * @param selection - Template/examples/install/Git tuple under test.
 * @returns Completion after actual publication and all assertions; failures reject the test.
 */
export async function verifyCreationTuple(root: string, selection: CreationTuple): Promise<void> {
  const { template, examples, install, git } = selection;
  const name = `${template}-${examples ? "examples" : "plain"}-${install ? "install" : "no-install"}-${git ? "git" : "no-git"}`;
  const commands: string[][] = [];
  const result = await generateProject(createOptions(name, selection), contextFor(root, commands));
  const manifest = Schema.decodeUnknownSync(GeneratedManifest)(
    JSON.parse(await readFile(join(result.destination, "package.json"), "utf8")),
  );
  const tsconfig = Schema.decodeUnknownSync(GeneratedTsconfig)(
    JSON.parse(await readFile(join(result.destination, "tsconfig.json"), "utf8")),
  );
  expect(result.template).toBe(template);
  expect(result.installed).toBe(install);
  expect(result.gitInitialized).toBe(git);
  verifyGeneratedManifest(manifest, template);
  expect(tsconfig.compilerOptions).toMatchObject({ baseUrl: ".", paths: { "@app/*": ["src/*"] } });
  expect(result.files.some((path) => path.startsWith("src/hello/functions/"))).toBe(true);
  expect(result.files.some((path) => path.startsWith("tests/"))).toBe(examples);
  expect(await scanGeneratedProject(result.destination)).toEqual([]);
  verifyCreationCommands(commands, selection);
  if (!install)
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "validation-skipped" }));
  expect((await readdir(root)).some((entry) => entry.startsWith(`.${name}-relkit-`))).toBe(false);
}

/** Checks exact runtime dependency selection without accepting workspace aliases.
 * @param manifest - Decoded package metadata.
 * @param template - Selected starter controlling optional dependencies.
 * @returns Nothing; mismatched versions or dependencies fail the test.
 */
function verifyGeneratedManifest(
  manifest: GeneratedManifestValue,
  template: CreationTuple["template"],
): void {
  expect(manifest).toMatchObject({ packageManager: "bun@1.3.10" });
  expect(manifest.dependencies).toEqual({
    ...(["agent", "fullstack"].includes(template)
      ? {
          "@langchain/langgraph": workspaceManifest.catalog["@langchain/langgraph"],
          "@relkit/local": appManifest.version,
          langchain: workspaceManifest.catalog.langchain,
        }
      : {}),
    "@relkit/app": appManifest.version,
    effect: workspaceManifest.catalog.effect,
    ...(template === "fullstack"
      ? {
          "@relkit/client": appManifest.version,
          "@tanstack/react-query": workspaceManifest.catalog["@tanstack/react-query"],
          next: workspaceManifest.catalog.next,
          react: workspaceManifest.catalog.react,
          "react-dom": workspaceManifest.catalog["react-dom"],
        }
      : {}),
  });
  expect(manifest.devDependencies).toMatchObject({
    "@types/bun": workspaceManifest.catalog["@types/bun"],
    "@relkit/cli": appManifest.version,
    "@relkit/testing": appManifest.version,
    typescript: workspaceManifest.catalog.typescript,
  });
}

/** Checks exactly the native steps authorized by this tuple.
 * @param commands - Captured literal subprocess command vectors.
 * @param selection - Install and Git choices for this creation.
 * @returns Nothing; unexpected validation repeats or native steps fail the test.
 */
function verifyCreationCommands(commands: readonly string[][], selection: CreationTuple): void {
  expect(
    commands.filter(([executable, action]) => executable === "bun" && action === "install").length,
  ).toBe(selection.install ? 1 : 0);
  expect(
    commands.filter(([executable, action]) => executable === "git" && action === "init").length,
  ).toBe(selection.git ? 1 : 0);
  expect(
    commands
      .filter(([executable]) => executable === "relkit")
      .map((command) => command.slice(0, 2)),
  ).toEqual(
    selection.install
      ? [
          ["relkit", "doctor"],
          ["relkit", "dev"],
        ]
      : [],
  );
  if (selection.install) {
    expect(commands.at(-2)).toContain("--no-ports");
    expect(commands.at(-2)).toContain("--no-pulumi");
    expect(commands.at(-1)?.slice(1, 4)).toEqual(["dev", "--prepare", "--project-root"]);
  }
}
