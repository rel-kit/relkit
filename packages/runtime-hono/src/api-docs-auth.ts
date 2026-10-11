/**
 * Combines application and mounted auth metadata for the shared API document.
 * Application servers/security remain authoritative; conflicting paths or
 * component names throw before publishing a misleading document.
 */
import { assertJsonValue, type JsonValue } from "@relkit/contracts";
import type { OpenApiDocument } from "@relkit/openapi";

/**
 * Merges mounted native auth routes without changing application servers or security.
 * @param document - Application document whose policy and description are preserved.
 * @param auth - Mounted auth paths and namespaced components.
 * @returns A detached document with authentication instructions and deduplicated tags.
 * @throws TypeError When JSON metadata is invalid or path/component names collide.
 */
export function mergeAuthDocument(
  document: OpenApiDocument | JsonValue,
  auth: JsonValue,
): JsonValue {
  assertJsonValue(document);
  if (!isRecord(document) || !isRecord(auth) || !isRecord(auth.paths))
    throw new TypeError("Cannot merge an invalid authentication OpenAPI document");
  const paths = isRecord(document.paths) ? document.paths : {};
  for (const path of Object.keys(auth.paths)) {
    if (Object.hasOwn(paths, path))
      throw new TypeError(`Duplicate authentication OpenAPI path: ${path}`);
  }
  const info = isRecord(document.info) ? document.info : {};
  const tags = [
    ...(Array.isArray(document.tags) ? document.tags : []),
    ...(Array.isArray(auth.tags) ? auth.tags : []),
  ];
  return {
    ...document,
    info: {
      ...info,
      description: [
        typeof info.description === "string" ? info.description : "",
        authInstructions(auth.paths),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    paths: { ...paths, ...auth.paths },
    components: mergeComponents(document.components, auth.components),
    tags: tags.filter(
      (tag, index) =>
        !isRecord(tag) ||
        tags.findIndex((entry) => isRecord(entry) && entry.name === tag.name) === index,
    ),
  };
}

/**
 * Preserves application components while rejecting ambiguous native names.
 * @param application - Optional application component categories.
 * @param auth - Optional namespaced native component categories.
 * @returns Categories merged without overwriting application schemas.
 */
function mergeComponents(
  application: JsonValue | undefined,
  auth: JsonValue | undefined,
): JsonValue {
  const components = isRecord(application) ? application : {};
  const authComponents = isRecord(auth) ? auth : {};
  const merged = { ...components };
  for (const [category, entries] of Object.entries(authComponents)) {
    const existing = isRecord(components[category]) ? components[category] : {};
    if (!isRecord(entries)) continue;
    for (const name of Object.keys(entries)) {
      if (Object.hasOwn(existing, name))
        throw new TypeError(`Duplicate authentication component: ${name}`);
    }
    merged[category] = { ...existing, ...entries };
  }
  return merged;
}

/**
 * Describes only the login/signup endpoints present in the native document.
 * @param paths - Already mounted authentication endpoint paths.
 * @returns Markdown instructions for same-origin browser-session requests.
 */
function authInstructions(paths: Record<string, JsonValue>): string {
  const signIn = Object.keys(paths).find((path) => path.endsWith("/sign-in/email"));
  const signUp = Object.keys(paths).find((path) => path.endsWith("/sign-up/email"));
  return [
    "### Authentication",
    signUp === undefined
      ? ""
      : `For a new account, send **POST ${signUp}** with name, email and password.`,
    signIn === undefined
      ? "Use the Authentication endpoints to sign in."
      : `Send **POST ${signIn}** with email and password to log in.`,
    "Use **Test Request** in this reference. The browser stores the session cookie and sends it with subsequent requests to protected endpoints. Keep this reference and requests on the same origin; no token copying is needed.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Recognizes validated JSON objects before component/path projection. */
function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
