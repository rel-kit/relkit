/** Loads optional modules exclusively from the selected application's dependency graph. */
import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Schema } from "effect";
import { MigrationConfig, MigrationFailure } from "./migration.schemas.js";

/** Rejects non-app roots before evaluating authored migration configuration. */
export async function loadMigrationConfig(
  root: string,
  configPath: string,
): Promise<MigrationConfig> {
  try {
    for (const path of ["package.json", "relkit.config.ts"]) {
      if (!(await stat(resolve(root, path))).isFile()) throw new Error("Missing file");
    }
  } catch {
    throw usage(
      "Run from the application root with package.json, relkit.config.ts and the selected Drizzle config.",
    );
  }
  let value: unknown;
  try {
    const module: unknown = await import(pathToFileURL(configPath).href);
    value = record(module) ? module.default : undefined;
  } catch {
    throw usage(
      "Could not load Drizzle configuration. Check its required environment and installed dependencies.",
    );
  }
  const config = Schema.decodeUnknownOption(MigrationConfig)(value);
  if (config._tag === "None")
    throw usage(
      "Configure dialect sqlite/postgresql/mysql, out and dbCredentials in the selected Drizzle config.",
    );
  const selected = config.value;
  if (!selected.out.trim() || Object.values(selected.migrations ?? {}).some((v) => !v.trim())) {
    throw usage("Migration output and configured log names must be nonempty.");
  }
  const credentials = selected.dbCredentials;
  if (typeof credentials.url === "string") {
    if (!credentials.url.trim()) throw usage("Configure an explicit persistent database target.");
  } else if (
    selected.dialect === "sqlite" ||
    !["host", "database", "user"].every(
      (key) => typeof credentials[key] === "string" && credentials[key].trim(),
    )
  ) {
    throw usage("Configure database connection credentials in the selected Drizzle config.");
  }
  return selected;
}

/** Resolves a declared consumer dependency, never relative to the installed CLI. */
export async function consumerPath(root: string, specifier: string): Promise<string> {
  const name = specifier.split("/")[0];
  try {
    const manifest: unknown = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    if (
      !record(manifest) ||
      !["dependencies", "devDependencies", "optionalDependencies"].some(
        (field) => record(manifest[field]) && typeof manifest[field][name ?? ""] === "string",
      )
    )
      throw new Error("Undeclared dependency");
    return createRequire(resolve(root, "package.json")).resolve(specifier);
  } catch {
    throw new MigrationFailure({
      code: "RELKIT_DB_DEPENDENCY",
      exitCode: 2,
      message: `Install ${name === "drizzle-kit" ? "drizzle-kit" : "drizzle-orm"} in this application with bun add before migrating.`,
    });
  }
}

/** Imports a resolved consumer namespace as untrusted integration data. */
export async function consumerModule(
  root: string,
  specifier: string,
): Promise<Record<string, unknown>> {
  const value: unknown = await import(pathToFileURL(await consumerPath(root, specifier)).href);
  if (!record(value)) throw usage("Installed database tooling has an unsupported module shape.");
  return value;
}

/** Creates a controlled configuration diagnostic without carrying authored error contents. */
export function usage(message: string): MigrationFailure {
  return new MigrationFailure({ code: "RELKIT_DB_CONFIG", exitCode: 2, message });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
