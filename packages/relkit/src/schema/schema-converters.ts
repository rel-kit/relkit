/**
 * Converts third-party Standard Schemas that have no `~standard.jsonSchema` hook, using each
 * library's own converter. Converters are optional peers, loaded on first use with a synchronous
 * `require` where the runtime has one (Bun and Node); browsers simply have none.
 */
import type { LoadedConverter, SchemaConverter, SchemaLibrary } from "./schema-converters.types.js";
import type { JsonValue, StandardSchemaV1 } from "./standard-schema.types.js";

export type { SchemaConverter, SchemaLibrary } from "./schema-converters.types.js";

/** JSON Schema dialect RelKit asks converters for. */
export const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema" as const;

/** Libraries RelKit recognizes by `~standard.vendor`, with the package that converts them. */
export const SCHEMA_LIBRARIES: Readonly<Record<string, SchemaLibrary>> = Object.freeze({
  zod: { package: "zod" },
  arktype: { package: "arktype" },
  valibot: { package: "valibot", converter: "@valibot/to-json-schema" },
  effect: { package: "effect", converter: "effect" },
});

const loaded = new Map<string, LoadedConverter>();

/**
 * Finds a converter for a schema whose library has no `~standard.jsonSchema` hook.
 * @param schema - Standard Schema to convert.
 * @returns A converter, or undefined when the library is unknown or its converter is not installed.
 * @example schemaConverter(v.string())?.(v.string(), "input");
 */
export function schemaConverter(schema: StandardSchemaV1): SchemaConverter | undefined {
  const vendor = schema["~standard"]?.vendor;
  if (vendor === "arktype") return arkTypeConverter(schema);
  if (vendor !== "valibot" && vendor !== "effect") return undefined;
  if (!loaded.has(vendor)) loaded.set(vendor, loadConverter(vendor));
  return loaded.get(vendor)?.convert;
}

/**
 * Explains why a schema has no converter, for the unavailable reason.
 * @param schema - Standard Schema without a projection.
 * @returns A sentence naming the missing package, or undefined for unknown libraries.
 * @example missingConverterReason(v.string()); // "Install @valibot/to-json-schema …"
 */
export function missingConverterReason(schema: StandardSchemaV1): string | undefined {
  const vendor = schema["~standard"]?.vendor;
  const entry = vendor === undefined ? undefined : loaded.get(vendor);
  if (entry?.convert !== undefined || entry?.error === undefined) return undefined;
  return entry.error;
}

/**
 * Reads the installed version of the library that made a schema.
 * @param vendor - The schema's `~standard.vendor`.
 * @param from - Directory to resolve from, usually the project root.
 * @returns The version, or undefined for unknown libraries or runtimes without `require`.
 * @example schemaLibraryVersion("zod", process.cwd()); // "4.6.7"
 */
export function schemaLibraryVersion(vendor: string, from?: string): string | undefined {
  const library = SCHEMA_LIBRARIES[vendor];
  if (library === undefined) return undefined;
  for (const require of requirers(from)) {
    try {
      const manifest = require(`${library.package}/package.json`) as { version?: unknown };
      if (typeof manifest.version === "string") return manifest.version;
    } catch {
      const version = versionNearEntry(require, library.package);
      if (version !== undefined) return version;
    }
  }
  return undefined;
}

function arkTypeConverter(schema: StandardSchemaV1): SchemaConverter | undefined {
  const type = schema as unknown as ArkType;
  const whole = type.toJsonSchema;
  if (typeof whole !== "function") return undefined;
  return (_schema, direction) => {
    const side = direction === "input" ? type.in : type.out;
    return (side === undefined ? whole.call(type) : side.toJsonSchema()) as JsonValue;
  };
}

function loadConverter(vendor: "valibot" | "effect"): LoadedConverter {
  const specifier = SCHEMA_LIBRARIES[vendor]!.converter!;
  for (const require of requirers()) {
    try {
      const module = require(specifier) as Record<string, unknown>;
      const convert = vendor === "valibot" ? valibotConverter(module) : effectConverter(module);
      if (convert !== undefined) return { convert };
    } catch {
      // Try the next resolution root.
    }
  }
  return {
    error:
      vendor === "valibot"
        ? "Valibot schemas need @valibot/to-json-schema; install it in the project."
        : "Effect Schema conversion needs the effect package with Schema.toStandardJSONSchemaV1.",
  };
}

function valibotConverter(module: Record<string, unknown>): SchemaConverter | undefined {
  const toStandard = module.toStandardJsonSchema;
  if (typeof toStandard !== "function") return undefined;
  return (schema, direction) => standardHook(toStandard(schema), direction);
}

function effectConverter(module: Record<string, unknown>): SchemaConverter | undefined {
  const schemaModule = module.Schema as Record<string, unknown> | undefined;
  const toStandard = schemaModule?.toStandardJSONSchemaV1;
  if (typeof toStandard !== "function") return undefined;
  return (schema, direction) => standardHook(toStandard(schema), direction);
}

function standardHook(value: unknown, direction: "input" | "output"): JsonValue {
  const hooks = (value as { "~standard"?: { jsonSchema?: Record<string, unknown> } })["~standard"]
    ?.jsonSchema;
  const hook = hooks?.[direction];
  if (typeof hook !== "function") throw new TypeError(`No ${direction} JSON Schema converter`);
  return hook({ target: "draft-2020-12" }) as JsonValue;
}

/** Synchronous `require` functions rooted at the project and at this package, in that order. */
function requirers(from?: string): ((id: string) => unknown)[] {
  const process = (globalThis as { process?: NodeProcess }).process;
  const nodeModule = process?.getBuiltinModule?.("node:module") as NodeModule | undefined;
  if (nodeModule === undefined) return [];
  const roots = [`${from ?? process!.cwd()}/package.json`, import.meta.url];
  return roots.map((root) => nodeModule.createRequire(root));
}

function versionNearEntry(require: (id: string) => unknown, name: string): string | undefined {
  const process = (globalThis as { process?: NodeProcess }).process;
  const fs = process?.getBuiltinModule?.("node:fs") as NodeFs | undefined;
  const resolve = (require as { resolve?: (id: string) => string }).resolve;
  if (fs === undefined || resolve === undefined) return undefined;
  try {
    let directory = resolve(name).replace(/[/\\][^/\\]*$/u, "");
    for (let depth = 0; depth < 8; depth += 1) {
      const path = `${directory}/package.json`;
      if (fs.existsSync(path)) {
        const manifest = JSON.parse(fs.readFileSync(path, "utf8")) as {
          name?: string;
          version?: string;
        };
        if (manifest.name === name) return manifest.version;
      }
      directory = directory.replace(/[/\\][^/\\]*$/u, "");
    }
  } catch {
    return undefined;
  }
  return undefined;
}

interface ArkType {
  readonly toJsonSchema?: () => unknown;
  readonly in?: { readonly toJsonSchema: () => unknown };
  readonly out?: { readonly toJsonSchema: () => unknown };
}
interface NodeProcess {
  readonly cwd: () => string;
  readonly getBuiltinModule?: (id: string) => unknown;
}
interface NodeModule {
  readonly createRequire: (path: string) => (id: string) => unknown;
}
interface NodeFs {
  readonly existsSync: (path: string) => boolean;
  readonly readFileSync: (path: string, encoding: "utf8") => string;
}
