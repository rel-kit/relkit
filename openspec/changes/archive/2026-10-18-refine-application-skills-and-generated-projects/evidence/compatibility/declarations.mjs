/** Bounded negative gate: check repaired declarations directly, never claim full-package acceptance. */
import ts from "typescript";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(parsed.fileNames, parsed.options);
const paths = [
  "pg-core/policies.d.ts",
  "pg-core/roles.d.ts",
  "cockroach-core/policies.d.ts",
  "cockroach-core/roles.d.ts",
  "pg-core/effect/db.d.ts",
  "pg-core/effect/session.d.ts",
  "effect-postgres/session.d.ts",
];
let failed = false;
for (const name of paths) {
  const path = resolve("node_modules/drizzle-orm", name);
  const source = program.getSourceFile(path);
  if (!existsSync(path) || !source) {
    console.log(`MISSING required declaration: ${name}`);
    failed = true;
    continue;
  }
  const diagnostics = program.getSemanticDiagnostics(source);
  console.log(`${name}: ${diagnostics.length} diagnostics`);
  for (const diagnostic of diagnostics) {
    console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  }
  failed ||= diagnostics.length > 0;
}
process.exitCode = failed ? 2 : 0;
