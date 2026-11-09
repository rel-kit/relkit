/**
 * Bundles the CLI's private TypeScript 5.9 compiler API into `dist/typescript-parser.js`,
 * replacing the module `tsc` emitted, which still imports the private `relkit-typescript`
 * workspace package. The
 * published CLI therefore carries the parser itself and installs no second `typescript` package
 * (or `tsc` executable) beside the application's own TypeScript, which may be 5.9 or 7.
 *
 * TypeScript finds its default library (`lib.es2022.d.ts` and the rest) beside its own module
 * file, which it reads from CommonJS `__filename`. Bun's bundler inlines that as the absolute path
 * on the building machine, so a CLI built in one checkout and run anywhere else (a container, a
 * published install) loaded no default library: every global type was missing, route descriptors
 * degraded to `any`, and `relkit build` rejected every route. The bundle therefore carries the
 * library files in `dist/typescript-lib/` and resolves that directory from its own location.
 */
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const dist = resolve(root, "packages/cli/dist");
const compiler = Bun.resolveSync("typescript", resolve(root, "tools/typescript-api"));
const library = dirname(compiler);

const result = await Bun.build({
  entrypoints: [resolve(root, "packages/cli/src/typescript-parser.ts")],
  // The CLI runs on Bun and Node; a Node-target bundle runs on both.
  target: "node",
  format: "esm",
});
if (!result.success || result.outputs.length !== 1)
  throw new AggregateError(result.logs, "TypeScript parser bundle failed.");

const bundle = relocate(await result.outputs[0]!.text());
await Bun.write(join(dist, "typescript-parser.js"), bundle);
await copyLibrary(join(dist, "typescript-lib"));

/**
 * Replaces the inlined build-machine module paths with ones resolved from the bundle's location.
 * @param text - Bundled parser source.
 * @returns Source that names no path of this machine.
 */
function relocate(text: string): string {
  const file = JSON.stringify(compiler);
  const directory = JSON.stringify(library);
  if (!text.includes(file) || !text.includes(directory))
    throw new Error("The TypeScript parser bundle no longer inlines its module paths; recheck.");
  const relocated = [
    'import { fileURLToPath as __relkitFileURLToPath } from "node:url";',
    'const __relkitTypescriptLib = __relkitFileURLToPath(new URL("./typescript-lib", import.meta.url));',
    'const __relkitTypescriptFile = __relkitFileURLToPath(new URL("./typescript-lib/typescript.js", import.meta.url));',
    text.replaceAll(file, "__relkitTypescriptFile").replaceAll(directory, "__relkitTypescriptLib"),
  ].join("\n");
  for (const local of [root, library])
    if (relocated.includes(local))
      throw new Error(`The TypeScript parser bundle still names a local path: ${local}`);
  return relocated;
}

/**
 * Copies the default library declarations the parser loads, and nothing else of the package.
 * @param target - Directory beside the bundle.
 * @returns Completion.
 */
async function copyLibrary(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const files = (await readdir(library)).filter((name) => /^lib\.(?:.+\.)?d\.ts$/.test(name));
  if (!files.includes("lib.d.ts")) throw new Error(`No TypeScript library found in ${library}`);
  for (const name of files) await copyFile(join(library, name), join(target, name));
}
