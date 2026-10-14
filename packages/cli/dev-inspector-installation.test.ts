/** Verifies physical Inspector installation selection and explicit configuration port overrides. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "bun:test";

import {
  configuredInspectorOptions,
  resolveInspectorInstallation,
} from "./src/commands/dev-inspector.js";

import { makeRoot, options } from "../../tests/fixtures/cli/dev-fixture.js";
import { registerDevCleanup } from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test("prefers production when a compiled CLI also contains inspector source", async () => {
  const root = await makeRoot();
  const source = join(root, "apps", "inspector");
  const compiled = join(root, "packages", "cli", "dist", "commands");
  await mkdir(source, { recursive: true });
  await mkdir(join(compiled, "..", "inspector"), { recursive: true });
  await writeFile(join(source, "package.json"), "{}\n");
  await writeFile(join(compiled, "..", "inspector", "server.js"), "\n");

  const options = resolveInspectorInstallation(compiled, {});
  expect(options.command).toEqual(["node", "server.js"]);
  expect(options.root).toBe(join(compiled, "..", "inspector"));
});

test("reads the inspector port from relkit.config.ts unless the CLI overrides it", async () => {
  const root = await makeRoot();
  await writeFile(
    join(root, "relkit.config.ts"),
    "export default { inspector: { port: 4210 } };\n",
  );
  expect((await configuredInspectorOptions(root)).port).toBe(4210);
  expect((await configuredInspectorOptions(root, 4211)).port).toBe(4211);
});
