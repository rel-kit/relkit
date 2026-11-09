/** Bun build plugin that applies {@link narrowEffectImports} while Bun loads each module. */
import { readFile } from "node:fs/promises";
import { narrowEffectImports } from "./narrow-effect-imports.js";

/**
 * Supplies a finite native loader transform to Bun's owned packaging operation.
 * @returns Plugin whose asynchronous reads settle before the enclosing build returns.
 */
export function narrowEffectImportPlugin(): Bun.BunPlugin {
  return {
    name: "relkit-prepared-effect-owners",
    setup(builder) {
      builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async ({ path }) => {
        const source = await readFile(path, "utf8");
        const contents = narrowEffectImports(source, path);
        if (contents === source) return undefined;
        const loader = effectImportLoader(path);
        return { contents, loader };
      });
    },
  };
}

/**
 * Retains the input language after the finite import-only transform.
 * @param path - Native module filename supplied by Bun's loader.
 * @returns Exact supported loader; extensions outside TypeScript retain JavaScript behavior.
 */
function effectImportLoader(path: string): "tsx" | "jsx" | "ts" | "js" {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".ts")) return "ts";
  return "js";
}
