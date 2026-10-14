/** Supplies deterministic authored source mutations for native watcher and incremental-versus-clean compiler acceptance. */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Ordered current-source states; native writes are joined by the fixture's owning Effect adapter. */
export const layoutDevelopmentMutations = [
  { name: "grouped move", apply: moveServices },
  { name: "boundary addition", apply: addBoundary },
  { name: "boundary deletion", apply: removeBoundary },
  { name: "helper addition", apply: addHelper },
  { name: "helper edit", apply: editHelper },
  { name: "asset edit", apply: editAsset },
  { name: "explicit Platform config", apply: platformConfig },
  { name: "environment edit", apply: editEnvironment },
  { name: "inherited alias", apply: inheritedAlias },
] as const;

/** Moves the complete domain and its assets, retaining the original descriptor identities.
 * @param root - Exclusive source root.
 * @returns Joined original directory move and resolved route rewrite.
 */
async function moveServices(root: string): Promise<void> {
  await mkdir(join(root, "src/services"));
  await rename(join(root, "src/hello"), join(root, "src/services/hello"));
  const route = join(root, "src/routes/route.ts");
  await writeFile(
    route,
    (await readFile(route, "utf8")).replace("../hello/", "../services/hello/"),
  );
}

/** Adds one valid native boundary without evaluating an unused helper.
 * @param root - Exclusive source root.
 * @returns Joined declaration writes.
 */
export async function addBoundary(root: string): Promise<void> {
  await mkdir(join(root, "src/services/other/helpers"), { recursive: true });
  await mkdir(join(root, "src/services/other/functions"));
  await writeFile(
    join(root, "src/services/other/functions/probe.function.ts"),
    '/** Supplies one useful original descriptor to the added domain. */\nimport { defineFunction } from "@relkit/app/functions";\nimport { z } from "@relkit/app/schema";\nexport default defineFunction({ input: z.object({}), output: z.string(), handler: async () => "native other" });\n',
  );
  await writeFile(
    join(root, "src/services/other/service.ts"),
    '/** Declares the added native boundary without acquiring clients. */\nimport { defineService } from "@relkit/app/services";\nimport probe from "./functions/probe.function.js";\nexport default defineService({ functions: { probe } });\n',
  );
  await writeFile(
    join(root, "src/services/other/helpers/unused.ts"),
    'throw new Error("Unused helper must not be evaluated");\nexport {};\n',
  );
}

/** Deletes only the boundary owned by the preceding mutation.
 * @param root - Exclusive source root.
 * @returns Joined removal before the next compilation begins.
 */
async function removeBoundary(root: string): Promise<void> {
  await rm(join(root, "src/services/other"), { recursive: true });
}

/** Adds an ordinary same-service dependency and points the original handler at it.
 * @param root - Exclusive source root.
 * @returns Joined helper and original handler edits.
 */
async function addHelper(root: string): Promise<void> {
  await mkdir(join(root, "src/services/hello/helpers"));
  await writeFile(
    join(root, "src/services/hello/helpers/message.ts"),
    'export const message = "native helper first";\n',
  );
  const path = join(root, "src/services/hello/functions/hello.function.ts");
  const source = await readFile(path, "utf8");
  await writeFile(
    path,
    'import { message } from "../helpers/message.js";\n' +
      source.replace('async () => "hello"', "async () => message"),
  );
}

/** Changes the ordinary dependency while preserving its native export contract.
 * @param root - Exclusive source root.
 * @returns Joined helper replacement.
 */
async function editHelper(root: string): Promise<void> {
  await writeFile(
    join(root, "src/services/hello/helpers/message.ts"),
    'export const message = "native helper latest";\n',
  );
}

/** Changes an existing service asset and a real public build asset.
 * @param root - Exclusive source root.
 * @returns Joined byte writes checked against clean materialization.
 */
async function editAsset(root: string): Promise<void> {
  await writeFile(join(root, "src/services/hello/assets/message.bin"), "native asset latest");
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "public/message.txt"), "native public latest");
}

/** Composes an explicit native Platform fragment and environment contract.
 * @param root - Exclusive source root.
 * @returns Joined ordinary config and explicit root imports.
 */
async function platformConfig(root: string): Promise<void> {
  await mkdir(join(root, "src/platform"));
  await writeFile(join(root, "src/platform/server.ts"), "export const server = { port: 3009 };\n");
  await writeFile(
    join(root, "relkit.config.ts"),
    'import { defineApp, defineEnv, env } from "@relkit/app";\nimport { server } from "./src/platform/server.js";\nexport default defineApp({ id: "layout-migration-test", server, env: defineEnv({ LABEL: env.string().default("native default") }) });\n',
  );
}

/** Updates dotenv input without changing private credential sentinels or using example-file fallback.
 * @param root - Exclusive source root.
 * @returns Joined actual and informational environment inputs.
 */
async function editEnvironment(root: string): Promise<void> {
  const path = join(root, ".env.local");
  await writeFile(path, (await readFile(path, "utf8")) + "\nLABEL=native-current\n");
  await writeFile(join(root, ".env.example"), "LABEL=informational-only\n");
}

/** Resolves the same ordinary helper through effective inherited TypeScript options.
 * @param root - Exclusive source root.
 * @returns Joined alias witness and literal import replacement.
 */
async function inheritedAlias(root: string): Promise<void> {
  await writeFile(
    join(root, "tsconfig.layout-base.json"),
    JSON.stringify({ compilerOptions: { paths: { "@hello/*": ["./src/services/hello/*"] } } }),
  );
  const config = join(root, "tsconfig.json");
  await writeFile(
    config,
    '{"extends":"./tsconfig.layout-base.json",' + (await readFile(config, "utf8")).slice(1),
  );
  const path = join(root, "src/services/hello/functions/hello.function.ts");
  await writeFile(
    path,
    (await readFile(path, "utf8")).replace("../helpers/message.js", "@hello/helpers/message.js"),
  );
}
