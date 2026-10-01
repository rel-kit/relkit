import { expect, test } from "bun:test";
import ts from "typescript";
import { generateRouteModuleChecks } from "../../packages/compiler/src/route-module-checks.js";
import { routeModuleFindings } from "../../packages/compiler/src/route-module-diagnostics.js";
import {
  isRouteModule,
  routeSourceFindings,
} from "../../packages/compiler/src/route-source-checks.js";
import { prefilterSources } from "../../packages/compiler/src/discovery/ast-prefilter.js";

const excluded = [
  "src/routes/__fixtures__/route.ts",
  "src/routes/__fixtures__/users/[id]/route.ts",
  "src/routes/users/__tests__/route.ts",
];

test("generated route contracts omit discovery's excluded test and fixture modules", () => {
  const files = [...excluded, "src/routes/users/route.ts", "src/examples/src/routes/demo/route.ts"];
  expect(
    prefilterSources(
      excluded.map((fileName) => ({ fileName, text: 'export const GET = "fixture";' })),
    ).skipped,
  ).toEqual(excluded.map((fileName) => ({ fileName, reason: "excluded" })));
  const checks = generateRouteModuleChecks(files, "/app");
  expect(checks.match(/export type CheckRoute/g)).toHaveLength(1);
  for (const file of excluded) expect(checks).not.toContain(file);
  expect(checks).not.toContain("src/examples/src/routes/demo/route.ts");
  expect(checks).toContain("// src/routes/users/route.ts");
});

test("shared route findings skip excluded files while preserving errors in application routes", () => {
  const text = `import { defineServiceRoutes } from "@relkit/app/routes";
export const GET = defineServiceRoutes(service, { GET: "example" });`;
  const files = [...excluded, "src/routes/users/route.ts"];
  const sources = new Map(
    files.map((file) => [file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)]),
  );
  const host = ts.createCompilerHost({ noLib: true });
  host.getSourceFile = (file) => sources.get(file);
  const program = ts.createProgram(files, { noLib: true }, host);
  for (const file of excluded) {
    const source = program.getSourceFile(file)!;
    expect(routeSourceFindings(source)).toEqual([]);
    expect(routeModuleFindings(program, source)).toEqual([]);
  }
  const route = program.getSourceFile("src/routes/users/route.ts")!;
  expect(routeSourceFindings(route)).toHaveLength(1);
  expect(routeModuleFindings(program, route)).toHaveLength(1);
});

test("route eligibility ignores excluded folders only beneath the source route directory", () => {
  for (const file of excluded) {
    expect(isRouteModule(file)).toBe(false);
    expect(isRouteModule(`/app/${file}`)).toBe(false);
    expect(isRouteModule(`C:\\app\\${file.replaceAll("/", "\\")}`)).toBe(false);
  }
  expect(isRouteModule("/app/__fixtures__/src/routes/users/route.ts")).toBe(true);
  expect(isRouteModule("src/routes/users/__fixtures__-example/route.ts")).toBe(true);
  expect(isRouteModule("src/routes/users/__tests__-example/route.ts")).toBe(true);
  expect(isRouteModule("src/users/route.ts")).toBe(false);
});
