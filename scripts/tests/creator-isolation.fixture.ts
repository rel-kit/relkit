/** Finite source-level runner fixtures; packed consumer certification remains separate. */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Schema } from "effect";
export const root = resolve(import.meta.dirname, "../..");
const manifest = Schema.decodeUnknownSync(
  Schema.Struct({ name: Schema.String, version: Schema.String }),
)(JSON.parse(readFileSync(join(root, "packages/relkit/package.json"), "utf8")));
export const version = manifest.version;

export async function withFixture<A>(run: (directory: string) => Promise<A>): Promise<A> {
  const directory = await mkdtemp(join(tmpdir(), "relkit-creator-isolation-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function templateFixture(directory: string): Promise<string> {
  const target = join(directory, "templates/minimal");
  await cp(join(root, "templates/default/v1/minimal"), target, { recursive: true });
  const marker = join(directory, "evaluated");
  const source = await readFile(join(target, "relkit.config.ts"), "utf8");
  await writeFile(
    join(target, "relkit.config.ts"),
    source +
      `\nawait Bun.write(${JSON.stringify(marker)}, "unexpected");\nthrow new Error("template source evaluated");\n`,
  );
  return join(directory, "templates");
}

export async function wrapperFixture(directory: string): Promise<string> {
  await mkdir(join(directory, "wrapper"));
  // One bundled file keeps the launcher's own modules without the workspace's node_modules.
  const bundle = join(directory, "wrapper/launcher.mjs");
  const built = spawnSync(
    "bun",
    [
      "build",
      join(root, "packages/relkit/src/launcher/index.ts"),
      "--target=node",
      "--format=esm",
      "--outfile",
      bundle,
    ],
    { encoding: "utf8" },
  );
  if (built.status !== 0) throw new Error(`Launcher bundle failed: ${built.stderr}`);
  const entry = join(directory, "wrapper/index.mjs");
  await writeFile(
    entry,
    'import { main } from "./launcher.mjs";\nprocess.exitCode = await main();\n',
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ devDependencies: { "@relkit/cli": version } }),
  );
  await installedEntry(directory, "create-relkit", "create", version);
  await installedEntry(directory, "@relkit/cli", "project", version);
  return entry;
}

export async function installedEntry(
  directory: string,
  name: string,
  kind: string,
  selectedVersion: string,
): Promise<void> {
  const target = join(directory, "node_modules", name);
  await mkdir(target, { recursive: true });
  await writeFile(
    join(target, "package.json"),
    JSON.stringify({
      name,
      version: selectedVersion,
      type: "module",
      exports: { "./cli": "./entry.mjs" },
      bin: { relkit: "./entry.mjs" },
    }),
  );
  await writeFile(
    join(target, "entry.mjs"),
    `process.stdout.write(JSON.stringify({ kind: ${JSON.stringify(kind)}, args: process.argv.slice(2) }));\n`,
  );
}

export function runWrapper(
  entry: string,
  args: readonly string[],
  directory: string,
  executable = process.execPath,
) {
  return spawnSync(executable, [entry, ...args], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10_000,
  });
}
