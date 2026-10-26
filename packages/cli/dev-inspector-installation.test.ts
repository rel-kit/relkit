/** Configured inspection needs no UI installation, source lookup or Node process. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { configuredInspectorOptions } from "./src/commands/dev-inspector.js";

import { makeRoot, options } from "../../tests/fixtures/cli/dev-fixture.js";
import { registerDevCleanup } from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test("inspection remains disabled without an explicit application selection", async () => {
  const root = await makeRoot();
  await writeFile(join(root, "relkit.config.ts"), "export default {};\n");
  expect(
    await configuredInspectorOptions(root, undefined, { RELKIT_INSPECTOR_ROOT: "/missing" }),
  ).toBe(false);
});

test("selects the configured bridge and rejects the retired dev UI flag", async () => {
  const root = await makeRoot();
  await writeFile(
    join(root, "relkit.config.ts"),
    "export default { inspector: { enabled: true, connection: { port: 4210 } } };\n",
  );
  expect(await configuredInspectorOptions(root, undefined, {})).toEqual({
    host: "127.0.0.1",
    port: 4210,
  });
  await expect(configuredInspectorOptions(root, 4211)).rejects.toThrow("standalone inspector");
});
