import { Schema } from "effect";
import { JsonObject, ScaffoldManifestSchema } from "./project-manifest.schemas.js";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import { SCAFFOLD_DEPENDENCIES, type ScaffoldDependencyName } from "./scaffold-catalog.js";
import type { ScaffoldManifest, ScaffoldManifestMerge } from "./plan-manifest.types.js";

/**
 * Merges supported dependencies and scripts while retaining compatible authored specifications.
 * @param source - Existing project manifest bytes.
 * @param dependencies - Supported dependency names needed by the scaffold.
 * @param plannedScripts - Script commands owned by the requested scaffold.
 * @param resolvedDependencies - Project-owned catalog values used only for compatibility checks.
 * @returns Sorted manifest bytes and concrete versions of newly introduced dependencies.
 */
export function mergeScaffoldManifest(
  source: string,
  dependencies: ReadonlySet<ScaffoldDependencyName>,
  plannedScripts: ReadonlyMap<string, string>,
  resolvedDependencies: Readonly<Record<string, string>> = {},
): ScaffoldManifestMerge {
  const manifest = parseManifest(source);
  const added: Record<string, string> = {};
  for (const name of [...dependencies].sort()) {
    const wanted = SCAFFOLD_DEPENDENCIES[name];
    const current = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
    const compared = resolvedDependencies[name] ?? current;
    if (
      current !== undefined &&
      compared !== wanted.version &&
      current !== "workspace:*" &&
      current !== `link:${name}`
    ) {
      collision(`package.json already declares ${name}@${current}.`);
    }
    if (current !== undefined) continue;
    const section =
      wanted.section === "dependencies"
        ? (manifest.dependencies ??= {})
        : (manifest.devDependencies ??= {});
    section[name] = wanted.version;
    added[name] = wanted.version;
  }
  const scripts = (manifest.scripts ??= {});
  for (const [name, command] of plannedScripts) {
    if (scripts[name] !== undefined && scripts[name] !== command) {
      collision(`package.json script ${name} already exists.`);
    }
    scripts[name] = command;
  }
  if (manifest.dependencies) manifest.dependencies = sort(manifest.dependencies);
  if (manifest.devDependencies) manifest.devDependencies = sort(manifest.devDependencies);
  manifest.scripts = sort(scripts);
  return { content: `${JSON.stringify(manifest, null, 2)}\n`, added };
}

/**
 * Selects declarations using the same dependency-section precedence as scaffold merging.
 * @param source - Existing or already-planned project manifest bytes.
 * @returns Runtime declarations overriding duplicate development declarations.
 */
export function scaffoldManifestDependencies(source: string): Readonly<Record<string, string>> {
  const manifest = parseManifest(source);
  return { ...manifest.devDependencies, ...manifest.dependencies };
}

/**
 * Validates mutable manifest sections before any scaffold plan is committed.
 * @param source - JSON manifest bytes supplied by project discovery or planning.
 * @returns A manifest preserving unrelated fields while exposing validated owned sections.
 */
function parseManifest(source: string): ScaffoldManifest {
  const value: unknown = JSON.parse(source);
  try {
    const original = Schema.decodeUnknownSync(JsonObject)(value);
    const manifest = Schema.decodeUnknownSync(ScaffoldManifestSchema)(original);
    return {
      ...original,
      ...(manifest.dependencies === undefined
        ? {}
        : { dependencies: { ...manifest.dependencies } }),
      ...(manifest.devDependencies === undefined
        ? {}
        : { devDependencies: { ...manifest.devDependencies } }),
      ...(manifest.scripts === undefined ? {} : { scripts: { ...manifest.scripts } }),
    };
  } catch (error) {
    if (!Schema.isSchemaError(error)) throw error;
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.invalidProject,
      "package.json dependencies and scripts must contain string values.",
    );
  }
}

/**
 * Orders owned manifest string records by key.
 * @param value - Owned dependency or script record.
 * @returns A new record whose entries use deterministic sorted keys.
 */
function sort(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort());
}

/**
 * Rejects an existing declaration that conflicts with planned output.
 * @param message - Diagnostic explaining the conflicting declaration.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_COLLISION.
 */
function collision(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.collision, message);
}
