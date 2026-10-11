/**
 * Audits generated public-authoring imports and source layout. This native test
 * adapter reads only published fixture bytes and returns concrete violations;
 * it neither modifies output nor evaluates application source.
 */
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { projectFiles } from "./option-matrix-fixture.js";

const forbiddenImport =
  /(?:from|import)\s*["'](?:effect|hono|@pulumi\/[^"']|@aws-sdk\/[^"']|@relkit\/(?:compiler|contracts|deploy|deploy-pulumi|diagnostics|engine|graph|inspector-api|openapi|providers-local|runtime-effect|runtime-hono|supervisor))["']/;
const forbiddenApis = [
  ["define", "Sub", "scription"].join(""),
  ["define", "Per", "sistence"].join(""),
  ["create", "Iden", "tity"].join(""),
  ["define", "Work", "flow"].join(""),
  ["define", "Know", "ledge", "Store"].join(""),
  ["define", "Plu", "gin"].join(""),
  ["create", "Market", "place"].join(""),
];
const forbiddenScopeNames = [
  ["persist", "ence"].join(""),
  ["ident", "ity"].join(""),
  ["work", "flow"].join(""),
  ["know", "ledge", "-store"].join(""),
  ["plug", "in"].join(""),
  ["market", "place"].join(""),
  ["sub", "scription"].join(""),
];
const forbiddenInfrastructureNames = [
  ["terra", "form"].join(""),
  ["open", "tofu"].join(""),
  ["cloud", "formation"].join(""),
  ["c", "dk"].join(""),
  ["s", "st"].join(""),
  ["al", "chemy"].join(""),
  ["server", "less"].join(""),
  ["bi", "cep"].join(""),
];
const forbiddenScope = new RegExp(
  `\\b(?:${forbiddenApis.join("|")})\\b|@relkit/(?:${forbiddenScopeNames.join("|")})\\b|(?:^|[/.])(?:${[
    ...forbiddenScopeNames,
    ...forbiddenInfrastructureNames,
  ].join("|")}|[^/]+\\.rs)(?:[/.]|$)`,
  "i",
);
const legacyApplicationRoot =
  /^src\/(?:env\.ts|(?:functions|events|services|agents|jobs|cache|buckets|tools|middleware|transforms|shared)(?:\/|$))/;

/** Scans fixture files for forbidden public APIs and application-relative imports.
 * @param root - Published project under the test-owned temporary root.
 * @returns Ordered violations, with native read failures rejecting the test.
 */
export async function scanGeneratedProject(root: string): Promise<string[]> {
  const violations: string[] = [];
  const sourceRoot = join(root, "src");
  for (const path of await projectFiles(root)) {
    if (legacyApplicationRoot.test(path)) violations.push(`${path}:legacy-application-root`);
    if (forbiddenScope.test(path)) violations.push(`${path}:out-of-scope`);
    if (!/\.(?:ts|tsx|js|json|md|toml|yaml|yml)$/.test(path)) continue;
    const text = await readFile(join(root, path), "utf8");
    if (forbiddenImport.test(text)) violations.push(`${path}:forbidden-import`);
    if (forbiddenScope.test(text)) violations.push(`${path}:out-of-scope`);
    for (const match of text.matchAll(/(?:from\s+|import\s*\()\s*["'](\.\.?\/[^"']+)["']/g)) {
      const target = resolve(dirname(join(root, path)), match[1]!);
      const sourcePath = relative(sourceRoot, target);
      if (!sourcePath.startsWith("..") && !isAbsolute(sourcePath)) {
        violations.push(`${path}:relative-app-import`);
      }
    }
  }
  return violations.sort();
}
