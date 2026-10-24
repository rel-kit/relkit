/** Combines the maintained auth sample and durable production probe only inside an owned fixture. */
import { strict as assert } from "node:assert";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as ts from "typescript";

/**
 * Keeps the original auth environment while selecting and copying the real local task.
 * @param root - Private auth developer fixture, before its candidate installation and build.
 * @returns After copying unchanged probe descriptors and adding the explicit jobs selection.
 */
export async function prepareAuthJobs(root: string): Promise<void> {
  const source = resolve(
    import.meta.dirname,
    "../../../packages/cli/tests/server-runtime/production-app/src",
  );
  for (const relativePath of ["services/probe", "routes/run"]) {
    await cp(join(source, relativePath), join(root, "src", relativePath), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  const path = join(root, "relkit.config.ts");
  const config = await readFile(path, "utf8");
  const parsed = ts.createSourceFile(path, config, ts.ScriptTarget.Latest, true);
  const exported = parsed.statements.find(ts.isExportAssignment);
  assert(exported && ts.isCallExpression(exported.expression));
  const options = exported.expression.arguments[0];
  assert(options && ts.isObjectLiteralExpression(options));
  assert(
    !options.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        ["jobs", "defaults"].includes(property.name.getText(parsed)),
    ),
  );
  const start = options.getStart(parsed) + 1;
  await writeFile(
    path,
    'import { localJob } from "@relkit/local";\n' +
      config.slice(0, start) +
      '\n  jobs: { default: localJob() },\n  defaults: { jobs: "default" },' +
      config.slice(start),
  );
}
