/**
 * Builds the packaged development boundary and traces its emitted ESM imports.
 * The unchanged-start closure may reach the prepared cohort, while the ordinary
 * parser, compiler and local-service compiler remain behind dynamic miss edges.
 */
import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const repository = resolve(import.meta.dir, "../../..");
const snapshotDirectory = join(repository, "packages/cli/dist/dev-snapshot");

test("packaged snapshot hits keep checking and bundling behind dynamic miss imports", async () => {
  await mkdir(snapshotDirectory, { recursive: true });
  const child = Bun.spawn([process.execPath, "run", "scripts/package-dev-bootstrap.ts"], {
    cwd: repository,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);

  const executable = await imports(join(repository, "packages/cli/dist/bin.js"));
  expect(executable).toEqual([
    { kind: "dynamic-import", path: "./dev-snapshot/snapshot-preparation-entry.js" },
    { kind: "dynamic-import", path: "./dev-snapshot/snapshot-command-entry.js" },
    { kind: "dynamic-import", path: "./main.js" },
  ]);

  const entry = join(snapshotDirectory, "snapshot-command-entry.js");
  const entryImports = await imports(entry);
  const hitImports = entryImports.filter(
    (item) => item.kind === "dynamic-import" && item.path.startsWith("./prepared-hit-"),
  );
  expect(hitImports).toHaveLength(1);
  const entryTrace = await staticClosure(entry);
  const hitTrace = await staticClosure(resolve(dirname(entry), hitImports[0]!.path));
  // The ordinary source watcher imports TypeScript. Prepared sessions own a
  // separate epoch watch, so that compiler must remain outside their eager graph.
  expect(entryTrace.bytes + hitTrace.bytes).toBeLessThan(1_000_000);
  expect(
    [...entryTrace.staticPaths, ...hitTrace.staticPaths].some((path) =>
      /compiler|local-capabilities/.test(path),
    ),
  ).toBe(false);
  expect(
    hitTrace.dynamicPaths.filter((path) => !path.startsWith("./prepared-hit-")).sort(),
  ).toEqual([
    "../commands/dev-local-compiler.js",
    "../services/local-capabilities.js",
    "./dev-telemetry-native.service.js",
    "./dev-telemetry-operation.js",
  ]);
  expect(hitTrace.dynamicPaths.filter((path) => path.startsWith("./prepared-hit-"))).toHaveLength(
    1,
  );
});

async function staticClosure(entry: string): Promise<{
  readonly staticPaths: readonly string[];
  readonly dynamicPaths: readonly string[];
  readonly bytes: number;
}> {
  const pending = [entry];
  const visited = new Set<string>();
  const staticPaths: string[] = [];
  const dynamicPaths: string[] = [];
  let bytes = 0;
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    bytes += Buffer.byteLength(await readFile(file, "utf8"));
    for (const imported of await imports(file)) {
      if (imported.kind === "dynamic-import") {
        dynamicPaths.push(imported.path);
        continue;
      }
      staticPaths.push(imported.path);
      if (imported.path.startsWith(".")) pending.push(resolve(dirname(file), imported.path));
    }
  }
  return { staticPaths, dynamicPaths, bytes };
}

async function imports(path: string): Promise<readonly Bun.Import[]> {
  const source = await readFile(path, "utf8");
  return new Bun.Transpiler({ loader: "js" }).scan(source).imports;
}
