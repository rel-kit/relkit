import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import { SCAFFOLD_DEPENDENCIES, type ScaffoldDependencyName } from "./scaffold-catalog.js";

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  readonly [key: string]: unknown;
}

export function mergeScaffoldManifest(
  source: string,
  dependencies: ReadonlySet<ScaffoldDependencyName>,
  plannedScripts: ReadonlyMap<string, string>,
): { readonly content: string; readonly added: Record<string, string> } {
  const manifest = JSON.parse(source) as Manifest;
  const added: Record<string, string> = {};
  for (const name of [...dependencies].sort()) {
    const wanted = SCAFFOLD_DEPENDENCIES[name];
    const current = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
    if (current !== undefined && current !== wanted.version && current !== "workspace:*") {
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

function sort(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort());
}

function collision(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.collision, message);
}
