/**
 * Validates native schema JSON, prefixes mounted paths and component identities,
 * and removes token requirements from browser-session documentation. This pure
 * projection is called by AuthOpenApi; malformed metadata throws at that adapter.
 */
import { assertJsonValue, type JsonValue } from "@relkit/contracts";

/**
 * Detaches and projects one native OpenAPI document without changing SDK metadata.
 * @typeParam Input - Foreign JSON result narrowed before projection.
 * @param document - Native generator output, validated as JSON before property access.
 * @param basePath - Configured mount; defaults to the SDK's `/api/auth` path.
 * @returns Mounted paths, renamed components and the Authentication tag.
 * @throws TypeError When the metadata is not JSON or lacks paths.
 */
export function projectAuthOpenApi<Input>(document: Input, basePath = "/api/auth"): JsonValue {
  assertJsonValue(document);
  if (!isRecord(document) || !isRecord(document.paths))
    throw new TypeError("Better Auth generated an invalid OpenAPI document");
  const names = new Map<string, string>();
  const components = renameComponents(document.components, names);
  const paths = Object.fromEntries(
    Object.entries(document.paths).map(([path, item]) => [
      `${basePath.replace(/\/$/, "")}${path}`,
      projectPath(item, path),
    ]),
  );
  return rewriteReferences(
    {
      paths,
      components,
      tags: [{ name: "Authentication", description: "Better Auth core and plugin endpoints." }],
    },
    names,
  );
}

/**
 * Renames component keys and records their JSON pointer substitutions.
 * @param components - Optional native component categories.
 * @param names - Map populated before any references are rewritten.
 * @returns Component categories excluding the SDK's token security scheme.
 */
function renameComponents(
  components: JsonValue | undefined,
  names: Map<string, string>,
): JsonValue {
  if (!isRecord(components)) return {};
  return Object.fromEntries(
    Object.entries(components)
      .filter(([category]) => category !== "securitySchemes")
      .map(([category, entries]) => [
        category,
        !isRecord(entries)
          ? entries
          : Object.fromEntries(
              Object.entries(entries).map(([name, schema]) => {
                const key = `BetterAuth${name}`;
                names.set(`#/components/${category}/${name}`, `#/components/${category}/${key}`);
                return [key, schema];
              }),
            ),
      ]),
  );
}

/**
 * Retains path metadata while explicitly overriding inherited token security.
 * @param item - Native path item, including any non-operation metadata.
 * @param path - Original endpoint path used for a stable fallback operation ID.
 * @returns Operations grouped under Authentication with browser-session policy.
 */
function projectPath(item: JsonValue, path: string): JsonValue {
  if (!isRecord(item)) return item;
  const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
  return Object.fromEntries(
    Object.entries(item).map(([method, operation]) => {
      if (!methods.has(method) || !isRecord(operation)) return [method, operation];
      return [
        method,
        {
          ...operation,
          // An absent field inherits application-level security, even for signup.
          security: [],
          operationId: `betterAuth.${String(operation.operationId ?? `${method}.${path}`)}`,
          tags: [
            "Authentication",
            ...(Array.isArray(operation.tags)
              ? operation.tags.filter((tag) => tag !== "Default" && tag !== "Authentication")
              : []),
          ],
        },
      ];
    }),
  );
}

/**
 * Rewrites references while retaining identical strings in descriptions/examples.
 * @param value - Detached document subtree.
 * @param names - Complete component pointer substitutions.
 * @returns Recursively copied JSON with only reference values replaced.
 */
function rewriteReferences(value: JsonValue, names: ReadonlyMap<string, string>): JsonValue {
  if (Array.isArray(value)) return value.map((entry) => rewriteReferences(entry, names));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === "$ref" && typeof entry === "string") return [key, names.get(entry) ?? entry];
      if (key === "discriminator" && isRecord(entry))
        return [key, rewriteDiscriminator(entry, names)];
      return [key, rewriteReferences(entry, names)];
    }),
  );
}

/**
 * Projects schema discriminator mappings, whose values are references without a $ref key.
 * @param discriminator - Native discriminator metadata.
 * @param names - Complete component pointer substitutions.
 * @returns Detached discriminator with namespaced mapping targets.
 */
function rewriteDiscriminator(
  discriminator: Record<string, JsonValue>,
  names: ReadonlyMap<string, string>,
): JsonValue {
  if (!isRecord(discriminator.mapping)) return discriminator;
  return {
    ...discriminator,
    mapping: Object.fromEntries(
      Object.entries(discriminator.mapping).map(([tag, target]) => [
        tag,
        typeof target === "string" ? (names.get(target) ?? target) : target,
      ]),
    ),
  };
}

/** Recognizes JSON objects before reading their properties. */
function isRecord(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
