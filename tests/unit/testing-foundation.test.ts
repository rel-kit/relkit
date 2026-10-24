/** Checks the real Turbo dependency closure and keeps foundation metadata outside published output. */
import { expect, test } from "bun:test";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));

for (const task of ["build", "typecheck"]) {
  test(`LangChain ${task} first compiles the standalone testing foundation`, () => {
    const result = Bun.spawnSync(
      ["./node_modules/.bin/turbo", "run", task, "--filter=@relkit/langchain", "--dry=json"],
      { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 10_000 },
    );
    expect(result.exitCode).toBe(0);
    const plan: { tasks: { taskId: string; dependencies: string[] }[] } = JSON.parse(
      result.stdout.toString(),
    );
    const tasks = new Map(plan.tasks.map((entry) => [entry.taskId, entry.dependencies]));
    const foundation = `@relkit/testing#${task}:foundation`;
    expect(tasks.get(`@relkit/langchain#${task}`)).toContain(foundation);
    expect(tasks.has(`@relkit/testing#${task}`)).toBe(false);
    expect(tasks.has(`@relkit/runtime-hono#${task}`)).toBe(false);
    const ancestors = new Set<string>();
    const pending = [...(tasks.get(foundation) ?? [])];
    while (pending.length > 0) {
      const id = pending.pop();
      if (id === undefined || ancestors.has(id)) continue;
      expect(tasks.has(id)).toBe(true);
      ancestors.add(id);
      pending.push(...(tasks.get(id) ?? []));
    }
    for (const owner of [
      "buckets",
      "cache",
      "config",
      "contracts",
      "engine",
      "graph",
      "jobs",
      "providers-local",
      "runtime-effect",
      "schema",
    ])
      expect(ancestors.has(`@relkit/${owner}#${task}`)).toBe(true);
  });
}

test("foundation incremental metadata stays outside every published directory", async () => {
  const directory = resolve(root, "packages/testing");
  const configPath = resolve(directory, "tsconfig.foundation.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  expect(parsed.errors).toEqual([]);
  expect(parsed.options.incremental).toBe(true);
  const metadata = parsed.options.tsBuildInfoFile;
  expect(metadata).toBeString();
  if (metadata === undefined) throw new Error("Foundation incremental metadata is not configured");
  const manifest: { files: string[] } = await Bun.file(resolve(directory, "package.json")).json();
  for (const published of manifest.files) {
    const path = relative(resolve(directory, published), metadata);
    expect(path.startsWith(`..${sep}`)).toBe(true);
  }
});
