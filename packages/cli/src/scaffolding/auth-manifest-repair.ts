/** Applies the official Better Auth fetch repair only when native auth is selected. */
import { ADD_FAILURE_CODES, AddScaffoldError } from "create-relkit/internal/add-types";
import { buildCatalogDependency } from "create-relkit/internal/build-catalog";
import type { ScaffoldManifest } from "./plan-manifest.types.js";
import { Schema } from "effect";

/** Keeps existing manager-specific settings and refuses conflicting authored repairs.
 * @param manifest - Invocation-owned, decoded project manifest.
 * @returns Nothing; only selected auth's override maps are copied and updated.
 */
export function repairSelectedAuthManifest(manifest: ScaffoldManifest): void {
  const dependencies = { ...manifest.devDependencies, ...manifest.dependencies };
  if (
    dependencies["better-auth"] === undefined &&
    dependencies["@relkit/better-auth"] === undefined
  )
    return;
  manifest.overrides = repairOverrides(manifest.overrides, "overrides");
  const pnpm = objectField(manifest.pnpm, "pnpm");
  manifest.pnpm = { ...pnpm, overrides: repairOverrides(pnpm.overrides, "pnpm.overrides") };
}

function repairOverrides(
  value: Schema.Json | undefined,
  field: string,
): Readonly<Record<string, Schema.Json>> {
  const overrides = objectField(value, field);
  const name = "@better-fetch/fetch";
  const version = buildCatalogDependency(name);
  if (overrides[name] !== undefined && overrides[name] !== version)
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.collision,
      `package.json ${field} already declares a conflicting ${name} override.`,
    );
  return { ...overrides, [name]: version };
}

function objectField(
  value: Schema.Json | undefined,
  field: string,
): Readonly<Record<string, Schema.Json>> {
  if (value === undefined) return {};
  if (!Schema.is(Schema.Record(Schema.String, Schema.Json))(value))
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.invalidProject,
      `package.json ${field} must be an object.`,
    );
  return value;
}
