import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import ts from "typescript";
import { generateRouteModuleChecks } from "../../packages/compiler/src/route-module-checks.js";
import { routeModuleFindings } from "../../packages/compiler/src/route-module-diagnostics.js";

const repository = resolve(import.meta.dir, "../..");
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("built declarations and editor findings reject missing inferred input while accepting explicit mappings", async () => {
  await mkdir(join(repository, ".relkit"), { recursive: true });
  const root = await mkdtemp(join(repository, ".relkit/path-types-"));
  roots.push(root);
  await mkdir(join(root, "src/routes/users/[id]"), { recursive: true });
  await mkdir(join(root, "src/users"), { recursive: true });
  await mkdir(join(root, ".relkit/generated"), { recursive: true });
  await symlink(join(repository, "node_modules"), join(root, "node_modules"));
  await writeFile(
    join(root, "src/users/service.ts"),
    `
import { defineFunction } from "@relkit/app/functions";
import { defineService } from "@relkit/app/services";
import { z } from "@relkit/app/schema";
const example = defineFunction({ input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }), handler: async ({ value }) => ({ value }) });
export default defineService({ functions: { example } });`,
  );
  const route = join(root, "src/routes/users/[id]/route.ts");
  const prefix = `import service from "../../../users/service.js";
import { defineServiceRoutes, http, type ServiceRouteOptions } from "@relkit/app/routes";`;
  await writeFile(
    join(root, ".relkit/generated/route-module-checks.ts"),
    generateRouteModuleChecks(["src/routes/users/[id]/route.ts"], root),
  );
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: ["bun"],
  };
  for (const [entry, invalid, binding] of [
    ['"example"', true, ""],
    ['{ member: "example", request: http.input({ value: http.path("id") }) }', false, ""],
    [
      "mapped",
      false,
      `const mapped: ServiceRouteOptions<"example", typeof service.example> = {
  member: "example", request: http.input({ value: http.path("id") })
};`,
    ],
    ['{ member: "example", request: undefined }', true, ""],
  ] as const) {
    await writeFile(
      route,
      `${prefix}\n${binding}\nexport const { GET } = defineServiceRoutes(service, { GET: ${entry} });`,
    );
    const program = ts.createProgram(
      [route, join(root, ".relkit/generated/route-module-checks.ts")],
      options,
    );
    const errors = ts.getPreEmitDiagnostics(program);
    const findings = routeModuleFindings(program, program.getSourceFile(route)!);
    if (invalid) {
      expect(errors.some((error) => error.code === 2344)).toBe(true);
      expect(findings).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('"id"') }),
      );
    } else {
      expect(
        errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")),
      ).toEqual([]);
      expect(findings).toEqual([]);
    }
  }
}, 60_000);
