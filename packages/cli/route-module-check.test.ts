/** Verifies grouped route export failures preserve the current native manifest and recover only after the actual source export is fixed. */
import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { routeReviewFixture } from "../../tests/fixtures/cli/route-review-fixture.js";
import { checkProject } from "./src/commands/check.js";
import { registerAddCleanup } from "../../tests/generator/add-acceptance-fixture.js";

registerAddCleanup();

test("route type failures retain the last valid manifest and recover after the export is fixed", async () => {
  const root = await routeReviewFixture();
  const initial = await checkProject({ projectRoot: root });
  expect(initial.ok, JSON.stringify(initial.diagnostics)).toBe(true);
  const manifest = join(root, ".relkit/generated/runtime.manifest.ts");
  const original = await readFile(manifest, "utf8");
  const route = join(root, "src/routes/users/route.ts");
  await mkdir(join(root, "src/routes/users"));
  const source = `import hello from "@app/services/hello/service.js";
import { defineServiceRoutes as expose } from "@relkit/app/routes";
export const GET = expose(hello, { GET: "hello" });\n`;
  await writeFile(route, source);
  const failed = await checkProject({ projectRoot: root });
  expect(failed.ok).toBe(false);
  expect(failed.activatable).toBe(false);
  expect(failed.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_ROUTE_EXPORT_METHOD",
      file: "src/routes/users/route.ts",
      line: 3,
      column: 14,
    }),
  );
  expect(failed.diagnostics.some((entry) => entry.code === "RELKIT_ROUTE_MODULE_TYPE")).toBe(true);
  expect(await readFile(manifest, "utf8")).toBe(original);
  expect(await readFile(join(root, ".relkit/generated/route-module-checks.ts"), "utf8")).toContain(
    "src/routes/users/route.ts",
  );
  await writeFile(route, source.replace("export const GET", "export const { GET }"));
  const recovered = await checkProject({ projectRoot: root });
  expect(recovered.ok, JSON.stringify(recovered.diagnostics)).toBe(true);
  expect(recovered.activatable).toBe(true);
  expect(await readFile(manifest, "utf8")).not.toBe(original);
}, 60_000);
