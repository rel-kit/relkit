/**
 * A project still on the final `@relkit/app` passes `relkit check`. The package's import-time
 * deprecation notice reaches the check as a `RELKIT_DEPRECATED_APP_PACKAGE` warning through the
 * `relkit/diagnostics` reporter, not as terminal output that the evaluator would count as a
 * `RELKIT_EVALUATOR_SIDE_EFFECT`.
 */
import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { checkProjectEffect } from "../src/commands/check.js";
import { projectCapabilitiesLayer } from "../src/services/project-capabilities.js";
import {
  copyProject,
  registerCommandCleanup,
} from "../../../tests/fixtures/cli/commands-core-fixture.js";

registerCommandCleanup();

const sources = [
  "relkit.config.ts",
  "src/hello/service.ts",
  "src/hello/functions/hello.function.ts",
  "src/routes/hello/[name]/route.ts",
];

/**
 * Copies the minimal application and moves every import to the final `@relkit/app`.
 * @returns The project root.
 */
async function legacyProject(): Promise<string> {
  const root = await copyProject("tests/compiler/fixtures/valid-minimal");
  for (const file of sources) {
    const path = join(root, file);
    const source = await readFile(path, "utf8");
    await writeFile(
      path,
      source
        .replaceAll('from "relkit/schema"', 'from "@relkit/app/schema"')
        .replaceAll('from "relkit"', 'from "@relkit/app"'),
    );
  }
  return root;
}

test("a project on the final @relkit/app passes check with a deprecation warning", async () => {
  const root = await legacyProject();
  expect(await readFile(join(root, "relkit.config.ts"), "utf8")).toContain('from "@relkit/app"');
  const result = await Effect.runPromise(
    checkProjectEffect({ projectRoot: root, typecheck: false }).pipe(
      Effect.provide(projectCapabilitiesLayer),
    ),
  );
  const codes = result.diagnostics.map(({ code }) => code);
  expect(codes).not.toContain("RELKIT_EVALUATOR_SIDE_EFFECT");
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  const warnings = result.diagnostics.filter(
    ({ code }) => code === "RELKIT_DEPRECATED_APP_PACKAGE",
  );
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatchObject({ severity: "warning" });
  expect(warnings[0]!.message).toContain("relkit migrate");
  expect(sources).toContain(warnings[0]!.file);
});
