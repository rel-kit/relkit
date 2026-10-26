/** Owns native docgen scratch files, checked examples and child completion; every exit removes owned output. */
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { basename, delimiter, join, resolve } from "node:path";
import { Schema } from "effect";

const root = resolve(import.meta.dir, "../../..");

/** Generates native module Markdown while preserving each nested source path.
 * @param directory - Source package directory relative to the repository.
 * @param examples - Example compiler configuration. @param selected - Optional public source files.
 * @returns Module sources after native example checking and complete scratch cleanup. */
export async function nativeDocgen(
  directory: string,
  examples: string,
  selected?: readonly string[],
) {
  await mkdir(resolve(root, ".relkit"), { recursive: true });
  const cwd = await mkdtemp(resolve(root, ".relkit/docgen-cwd-"));
  const output = resolve(root, ".relkit", `docgen-output-${basename(cwd)}`);
  try {
    await prepare(cwd, output, directory, selected);
    await execute(cwd, directory, examples);
    const files = (await markdownFiles(output)).filter((file) => file.includes("/modules/"));
    return await Promise.all(
      files.map(async (file) => ({
        sourcePath: file.split("/modules/")[1]!.replace(/\.md$/, ""),
        markdown: await readFile(file, "utf8"),
      })),
    );
  } finally {
    await Promise.all([
      rm(output, { recursive: true, force: true }),
      rm(cwd, { recursive: true, force: true }),
    ]);
  }
}

/** Configures isolated output and restores extracted examples to their real source module.
 * @param cwd - Owned working directory. @param output - Owned native output directory.
 * @param directory - Source package. @param selected - Optional public source file selection.
 * @returns Completion after all configuration and module resolution are ready. */
async function prepare(
  cwd: string,
  output: string,
  directory: string,
  selected?: readonly string[],
): Promise<void> {
  await mkdir(output, { recursive: true });
  await symlink(resolve(root, directory, "node_modules"), resolve(output, "node_modules"));
  const checker = resolve(cwd, "check-examples.ts");
  await writeFile(
    checker,
    `#!/usr/bin/env bun\nimport { checkDocgenExamples } from ${JSON.stringify(resolve(root, "apps/docs/scripts/check-docgen-examples.ts"))};\nprocess.exitCode = await checkDocgenExamples(process.argv.slice(2), process.env.RELKIT_DOCGEN_SOURCE_ROOT!, process.env.RELKIT_DOCGEN_TSC!);\n`,
  );
  await chmod(checker, 0o755);
  const config = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(
    await readFile(resolve(root, "docgen.json"), "utf8"),
  );
  const files = selected
    ? [
        ...new Bun.Glob("**/*.{ts,tsx,mts,cts}").scanSync({
          cwd: resolve(root, directory, "src"),
          absolute: true,
        }),
      ]
    : [];
  await Promise.all([
    writeFile(resolve(cwd, "package.json"), await readFile(resolve(root, "package.json"))),
    writeFile(
      resolve(cwd, "docgen.json"),
      JSON.stringify({
        ...config,
        outDir: `../${basename(output)}`,
        tscExecutable: checker,
        ...(selected
          ? { exclude: files.filter((file) => !selected.includes(file.slice(root.length + 1))) }
          : {}),
      }),
    ),
  ]);
}

/** Awaits native generation and reports both output streams on failure.
 * @param cwd - Owned working directory. @param directory - Source package.
 * @param examples - Example compiler configuration. @returns Successful native completion. */
async function execute(cwd: string, directory: string, examples: string): Promise<void> {
  const child = Bun.spawn(
    [
      resolve(root, "apps/docs/node_modules/.bin/docgen"),
      "--src",
      resolve(root, directory, "src"),
      "--homepage",
      "https://github.com/rel-kit/relkit",
      "--srcLink",
      `https://github.com/rel-kit/relkit/blob/main/${directory}/src/`,
      "--no-enforce-version",
      "--run-examples",
      "--examples-tsconfig-file",
      examples,
      "--parse-tsconfig-file",
      resolve(root, directory, "tsconfig.json"),
    ],
    {
      cwd,
      env: {
        ...process.env,
        RELKIT_DOCGEN_SOURCE_ROOT: resolve(root, directory, "src"),
        RELKIT_DOCGEN_TSC: resolve(root, "node_modules/.bin/tsc"),
        PATH: `${resolve(root, "apps/docs/node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`docgen failed for ${directory}:\n${stdout}${stderr}`);
}

/** Lists generated module Markdown deterministically.
 * @param directory - Owned output root. @returns Sorted generated Markdown paths. */
export async function markdownFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith(".md")) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}
