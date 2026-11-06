/**
 * Node module hooks that let `relkit dev`, `relkit check` and the evaluator run application
 * TypeScript on Node the way Bun runs it: `.ts`/`.tsx`/`.mts` files are transpiled with esbuild
 * (types removed, nothing type-checked), a `.js` specifier that names a TypeScript source
 * resolves to it, extensionless relative specifiers find `.ts` and `index.ts`, and the nearest
 * `tsconfig.json`'s `paths` aliases (such as `@app/*`) resolve. Registered by
 * `typescript-register.ts` through `node --import`.
 */
import { readFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";
import { loaderConfig, pathCandidates } from "./tsconfig-lookup.js";

/** Resolution context Node passes to a resolve hook. */
interface ResolveContext {
  readonly parentURL?: string;
  readonly conditions?: readonly string[];
  readonly importAttributes?: Readonly<Record<string, string>>;
}

/** Result of a resolve hook. */
interface ResolveResult {
  readonly url: string;
  readonly format?: string | null;
  readonly shortCircuit?: boolean;
}

/** Result of a load hook. */
interface LoadResult {
  readonly format: string;
  readonly source?: string | ArrayBuffer | Uint8Array | null;
  readonly shortCircuit?: boolean;
}

type NextResolve = (specifier: string, context?: ResolveContext) => Promise<ResolveResult>;
type NextLoad = (url: string, context?: { readonly format?: string | null }) => Promise<LoadResult>;

const TYPESCRIPT: Readonly<Record<string, "ts" | "tsx">> = {
  ".ts": "ts",
  ".mts": "ts",
  ".tsx": "tsx",
};
const JS_TO_TS: Readonly<Record<string, readonly string[]>> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
};
const EXTENSIONLESS = [".ts", ".tsx", "/index.ts", "/index.tsx", ".js", "/index.js"];

/**
 * Resolves with Node first, then through the TypeScript fallbacks.
 * @param specifier - Import specifier.
 * @param context - Importing module and conditions.
 * @param nextResolve - Node's resolver.
 * @returns The resolved module.
 */
export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): Promise<ResolveResult> {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    for (const candidate of candidates(specifier, context.parentURL))
      try {
        return await nextResolve(candidate, context);
      } catch {
        continue;
      }
    throw error;
  }
}

/**
 * Transpiles TypeScript sources; every other module loads unchanged.
 * @param url - Resolved module URL.
 * @param context - Load context.
 * @param nextLoad - Node's loader.
 * @returns The module source and format.
 */
export async function load(
  url: string,
  context: { readonly format?: string | null },
  nextLoad: NextLoad,
): Promise<LoadResult> {
  if (!url.startsWith("file:")) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const loader = TYPESCRIPT[extname(file)];
  if (loader === undefined || file.endsWith(".d.ts")) return nextLoad(url, context);
  const source = await readFile(file, "utf8");
  const config = loaderConfig(dirname(file));
  const result = await transform(source, {
    loader,
    format: "esm",
    target: "node22",
    sourcefile: file,
    sourcemap: "inline",
    tsconfigRaw: { compilerOptions: config?.transformOptions ?? {} },
  });
  return { format: "module", source: result.code, shortCircuit: true };
}

/**
 * Lists the specifiers to try after Node's own resolution failed.
 * @param specifier - Original specifier.
 * @param parentURL - Importing module URL.
 * @returns Absolute file URLs in priority order.
 */
function candidates(specifier: string, parentURL: string | undefined): string[] {
  if (parentURL === undefined || !parentURL.startsWith("file:")) return [];
  const parent = dirname(fileURLToPath(parentURL));
  if (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/"))
    return fileCandidates(new URL(specifier, parentURL).href);
  if (specifier.startsWith("file:")) return fileCandidates(specifier);
  if (parent.includes("/node_modules/")) return [];
  const config = loaderConfig(parent);
  if (config === undefined) return [];
  return pathCandidates(specifier, config).flatMap((path) => {
    const url = pathToFileURL(path).href;
    return [url, ...fileCandidates(url)];
  });
}

/**
 * Lists TypeScript alternatives for one file URL.
 * @param url - Absolute file URL that did not resolve.
 * @returns Alternatives with a TypeScript or index extension.
 */
function fileCandidates(url: string): string[] {
  const extension = extname(new URL(url).pathname);
  const alternatives = JS_TO_TS[extension];
  if (alternatives !== undefined)
    return alternatives.map((replacement) => url.slice(0, -extension.length) + replacement);
  if (extension === "" || !/^\.[a-z]+$/i.test(extension))
    return EXTENSIONLESS.map((suffix) => url + suffix);
  return [];
}
