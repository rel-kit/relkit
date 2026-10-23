/** Owns synthetic package fixtures for collector correctness, never SDK acceptance. */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A real runtime/types package whose source and manifest can intentionally differ. */
async function fixturePackage(
  root: string,
  name: string,
  dependencies: Record<string, string>,
  source: string,
  declarations: string,
) {
  const directory = join(root, "node_modules", name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      type: "module",
      dependencies,
      exports: { ".": { types: "./index.d.ts", import: "./index.js" } },
    }),
  );
  await writeFile(join(directory, "index.js"), source);
  await writeFile(join(directory, "index.d.ts"), declarations);
}

/** App imports a hoisted SDK that only the CLI declares: module tracing must expose it. */
export async function consumerProbeFixture() {
  const root = await mkdtemp(join(tmpdir(), "relkit-consumer-probe-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "consumer",
      version: "1.0.0",
      type: "module",
      dependencies: { "fixture-app": "1.0.0", "fixture-cli": "1.0.0" },
    }),
  );
  await fixturePackage(
    root,
    "fixture-sdk",
    {},
    "export function answer(){return 42;}",
    "export declare function answer(): 42;",
  );
  await fixturePackage(
    root,
    "fixture-cli",
    { "fixture-sdk": "1.0.0" },
    'export {answer} from "fixture-sdk";',
    'export {answer} from "fixture-sdk";',
  );
  await fixturePackage(
    root,
    "fixture-app",
    {},
    'export {answer} from "fixture-sdk";',
    'export {answer} from "fixture-sdk";',
  );
  await writeFile(
    join(root, "entry.ts"),
    'import {answer} from "fixture-app"; import {answer as other} from "fixture-cli"; const value: 42 = answer(); if(value!==42||other()!==42)throw new Error("native contract failed"); console.log("native-ok");',
  );
  return root;
}

/** Creates conflicting real ambient packages to distinguish consumer and tool resolution.
 * @param root - Owned consumer fixture receiving the selected ambient declaration.
 * @returns A tool working directory with a different declaration under the same package name.
 */
export async function consumerAmbientFixture(root: string): Promise<string> {
  const toolRoot = join(root, "tool");
  for (const [directory, value] of [
    [root, "consumerValue"],
    [toolRoot, "toolValue"],
  ] as const) {
    const types = join(directory, "node_modules/@types/consumer-owned");
    await mkdir(types, { recursive: true });
    await writeFile(
      join(types, "package.json"),
      JSON.stringify({ name: "@types/consumer-owned", version: "1.0.0", types: "index.d.ts" }),
    );
    await writeFile(join(types, "index.d.ts"), `declare const ${value}: 42;`);
  }
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "consumer", dependencies: { "@types/consumer-owned": "1.0.0" } }),
  );
  await writeFile(join(root, "ambient.ts"), "const exact: 42 = consumerValue; export {};");
  return toolRoot;
}
