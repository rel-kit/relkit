import { observeExecution } from "@relkit/contracts/operation";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { GeneratorPaths } from "./generator-paths.js";
import { runGeneratorSync } from "./generator-runtime.js";
import type { GenerateProjectContext } from "./generate-types.js";

/**
 * Finds explicit, packed or source-owned templates through read-only path authority.
 * @param context - Caller-owned settings and cancellation.
 * @returns The supported explicit, bundled or source-owned template root path.
 */
export const resolveTemplateRootEffect = Effect.fn("TemplateCatalog.root")(
  function* (context: Pick<GenerateProjectContext, "cwd" | "templateRoot">) {
    if (context.templateRoot !== undefined) return resolve(context.templateRoot);
    const paths = yield* GeneratorPaths;
    const packaged = fileURLToPath(new URL("./templates/default/v1", import.meta.url));
    if ((yield* paths.metadata(packaged)) !== undefined) return resolve(packaged);
    const source = fileURLToPath(new URL("../../../templates/default/v1", import.meta.url));
    if ((yield* paths.metadata(source)) !== undefined) return resolve(source);
    return resolve(context.cwd ?? (yield* paths.cwd()), "templates/default/v1");
  },
  (effect) => observeExecution("generator", "TemplateCatalog.root", effect),
);

/**
 * Preserves synchronous template-root resolution without a hidden filesystem dependency.
 * @param context - Caller-owned settings and cancellation.
 * @returns The supported source or bundled template root path.
 */
export function resolveTemplateRoot(
  context: Pick<GenerateProjectContext, "cwd" | "templateRoot">,
): string {
  return runGeneratorSync(resolveTemplateRootEffect(context));
}
