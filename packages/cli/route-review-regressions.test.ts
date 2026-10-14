/** Exercises actual CLI route type admission against an owned grouped application, retaining the last valid manifest on rejection. */
import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  routeReviewFixture as fixture,
  checkRouteReview as check,
} from "../../tests/fixtures/cli/route-review-fixture.js";
import {
  routeReviewFunction,
  routeReviewService,
  routeReviewPrefix,
} from "../../tests/fixtures/cli/route-review-sources.js";
import { assertReviewedRouteGraph } from "../../tests/fixtures/cli/route-review-graph.js";
import { registerAddCleanup } from "../../tests/generator/add-acceptance-fixture.js";

registerAddCleanup();

test("the real CLI accepts annotated explicit path mappings and still rejects missing inferred inputs", async () => {
  const root = await fixture();
  await mkdir(join(root, "src/services/users/functions"), { recursive: true });
  await mkdir(join(root, "src/routes/users/[id]"), { recursive: true });
  await writeFile(
    join(root, "src/services/users/functions/example.function.ts"),
    routeReviewFunction,
  );
  await writeFile(join(root, "src/services/users/service.ts"), routeReviewService);
  const route = join(root, "src/routes/users/[id]/route.ts");
  const prefix = routeReviewPrefix;
  await writeFile(
    route,
    `${prefix}
const mapped: ServiceRouteOptions<"example", typeof service.example> = {
  member: "example", request: http.input({ value: http.path("id") })
};
export const { GET } = defineServiceRoutes(service, { GET: mapped });`,
  );
  const accepted = await check(root);
  expect(accepted.exitCode, accepted.errors || JSON.stringify(accepted.result.diagnostics)).toBe(0);
  expect(accepted.result).toMatchObject({ ok: true, activatable: true, diagnostics: [] });
  await assertReviewedRouteGraph(root);
  const manifestPath = join(root, ".relkit/generated/runtime.manifest.ts");
  const manifest = await readFile(manifestPath, "utf8");
  await writeFile(
    route,
    `${prefix}
export const { GET } = defineServiceRoutes(service, { GET: "example" });`,
  );
  const rejected = await check(root);
  expect(rejected.exitCode).toBe(1);
  expect(rejected.result).toMatchObject({ ok: false, activatable: false });
  expect(rejected.result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_MAPPING_INCOMPATIBLE",
      message: expect.stringContaining('"id"'),
    }),
  );
  expect(await readFile(manifestPath, "utf8")).toBe(manifest);
}, 60_000);

test("the real CLI ignores excluded route fixtures without suppressing invalid application routes", async () => {
  const root = await fixture();
  const original = await check(root);
  expect(original.exitCode, original.errors || JSON.stringify(original.result.diagnostics)).toBe(0);
  const fixtureFiles = ["src/routes/__fixtures__/route.ts", "src/routes/users/__tests__/route.ts"];
  for (const file of fixtureFiles) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), 'export const GET = "fixture data";\n');
  }
  const accepted = await check(root);
  expect(accepted.exitCode, accepted.errors || JSON.stringify(accepted.result.diagnostics)).toBe(0);
  expect(accepted.result).toMatchObject({ ok: true, activatable: true, diagnostics: [] });
  expect(accepted.result.graphHash).toBe(original.result.graphHash);
  const checks = await readFile(join(root, ".relkit/generated/route-module-checks.ts"), "utf8");
  for (const file of fixtureFiles) expect(checks).not.toContain(file);
  const manifestPath = join(root, ".relkit/generated/runtime.manifest.ts");
  const manifest = await readFile(manifestPath, "utf8");
  const route = join(root, "src/routes/invalid/route.ts");
  await mkdir(join(root, "src/routes/invalid"), { recursive: true });
  await writeFile(route, 'export const GET = "invalid application route";\n');
  const rejected = await check(root);
  expect(rejected.exitCode).toBe(1);
  expect(rejected.result).toMatchObject({ ok: false, activatable: false });
  expect(rejected.result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_ROUTE_MODULE_TYPE",
      file: "src/routes/invalid/route.ts",
    }),
  );
  expect(await readFile(manifestPath, "utf8")).toBe(manifest);
}, 60_000);
