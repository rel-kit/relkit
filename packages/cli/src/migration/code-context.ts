/**
 * Gathers the read-only facts codemod rules consult for one project: its source texts, the
 * names the installed `relkit` root exports (read from its declaration file), the export maps
 * of the 0.9 packages the CLI can resolve, the CLI's own version for added dependencies, and
 * the client route names from a client contract. Everything is read from disk without running
 * application code; facts that cannot be read are left out and rules report what they need.
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clientApiPaths } from "relkit/contracts";
import { codeSyntax as ts, parseCodeSource } from "./code-parser.js";
import type { CodeFile, CodeRuleContext } from "./code-migration.types.js";

const packages = ["relkit", "@relkit/cli", "@relkit/inspector", "@relkit/pulumi"];

/**
 * Builds the rule context for a project.
 * @param root - Absolute project root.
 * @param files - The project's authored text files.
 * @param contract - Optional client contract path; defaults to the project's generated one.
 * @returns Rule context; missing optional facts are omitted.
 */
export async function loadCodeContext(
  root: string,
  files: readonly CodeFile[],
  contract?: string,
): Promise<CodeRuleContext> {
  const sources = new Map(
    files.filter((file) => /\.[cm]?[jt]sx?$/.test(file.path)).map((file) => [file.path, file.text]),
  );
  const manifests = new Map<string, { version?: string; exports?: Record<string, string> }>();
  for (const name of packages) {
    const manifest = await packageManifest(name);
    if (manifest !== undefined) manifests.set(name, manifest);
  }
  const cli = await ownManifest();
  const clientRoutes = await readClientRoutes(
    resolve(root, contract ?? ".relkit/generated/client-contract.json"),
    contract !== undefined,
  );
  return {
    sources,
    root,
    rootExports: await rootExportNames(),
    packageExports: new Map(
      [...manifests].map(([name, manifest]) => [
        name,
        new Set(Object.keys(manifest.exports ?? { ".": "" })),
      ]),
    ),
    ...(clientRoutes === undefined ? {} : { clientRoutes }),
    version: cli.version ?? "0.9.0",
  };
}

/**
 * Reads the names the installed `relkit` root declaration exports.
 * @returns Value and type names from its `export { … }` lists.
 */
async function rootExportNames(): Promise<Set<string>> {
  const names = new Set<string>();
  let path: string;
  try {
    path = fileURLToPath(import.meta.resolve("relkit")).replace(/\.js$/, ".d.ts");
  } catch {
    // Without a resolvable relkit, every @relkit/app root import is reported instead of moved.
    return names;
  }
  const source = parseCodeSource(path, await readFile(path, "utf8"));
  for (const statement of source.statements)
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    )
      for (const element of statement.exportClause.elements) names.add(element.name.text);
  return names;
}

/**
 * Finds and reads an installed package's manifest by walking up from its resolved entry.
 * @param name - Package name.
 * @returns The manifest, or undefined when the CLI cannot resolve the package.
 */
async function packageManifest(name: string) {
  let entry: string;
  try {
    entry = fileURLToPath(import.meta.resolve(name));
  } catch {
    return undefined;
  }
  for (
    let directory = dirname(entry);
    directory !== dirname(directory);
    directory = dirname(directory)
  ) {
    const manifest = await readJson(join(directory, "package.json"));
    if (manifest?.name === name) return manifest;
  }
  return undefined;
}

/**
 * Reads the CLI's own manifest.
 * @returns The `@relkit/cli` manifest.
 */
async function ownManifest() {
  for (
    let directory = dirname(fileURLToPath(import.meta.url));
    directory !== dirname(directory);
    directory = dirname(directory)
  ) {
    const manifest = await readJson(join(directory, "package.json"));
    if (manifest?.name === "@relkit/cli") return manifest;
  }
  return {};
}

/**
 * Maps a client contract's route IDs and selectors to `api` paths.
 * @param path - Contract file.
 * @param required - Whether a missing file is an error (an explicit `--contract`).
 * @returns The key-to-path map, or undefined when no contract exists.
 * @throws Error When an explicit contract is missing or unreadable.
 */
async function readClientRoutes(path: string, required: boolean) {
  const contract = await readJson(path);
  if (contract === undefined) {
    if (required) throw new Error(`The client contract ${path} could not be read.`);
    return undefined;
  }
  const routes = (Array.isArray(contract.routes) ? contract.routes : []).flatMap(
    (route: ContractRoute) => {
      const [method, routePath] = route.selector.split(" ");
      return method && routePath
        ? [
            {
              id: route.routeId,
              method,
              path: routePath,
              targetFunctionId: route.functionId,
              selector: route.selector,
            },
          ]
        : [];
    },
  );
  const paths = clientApiPaths(routes);
  const keys = new Map<string, string>();
  for (const route of routes) {
    const apiPath = paths.get(route.id)?.join(".");
    if (apiPath === undefined) continue;
    keys.set(route.id, apiPath);
    keys.set(route.selector, apiPath);
  }
  return keys;
}

/** One route entry of a client contract document. */
interface ContractRoute {
  readonly routeId: string;
  readonly selector: string;
  readonly functionId: string;
}

/**
 * Reads a JSON file.
 * @param path - File path.
 * @returns The parsed manifest-like record, or undefined when missing or malformed.
 */
async function readJson(path: string): Promise<JsonRecord | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as JsonRecord;
  } catch {
    return undefined;
  }
}

/** The fields this module reads from package manifests and client contracts. */
interface JsonRecord {
  readonly name?: string;
  readonly version?: string;
  readonly exports?: Record<string, string>;
  readonly routes?: readonly ContractRoute[];
}
