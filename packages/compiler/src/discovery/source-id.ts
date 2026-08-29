import { normalizeId, normalizeSourcePath } from "@relkit/contracts";
import { encodeRouteId } from "./source-id-route.js";
import type { ExportFact, SourceFactoryKind } from "./source-facts-types.js";

export { encodeRouteId } from "./source-id-route.js";

export interface SourceIdInput {
  readonly kind: SourceFactoryKind;
  readonly source: string;
  readonly projectRoot?: string;
  readonly explicitId?: unknown;
  readonly exportName?: string;
  readonly exportKind?: "default" | "named";
  readonly binding?: string;
  readonly serviceId?: string;
  readonly member?: string;
  readonly method?: string;
  readonly path?: string;
}

export interface ExportIdInput {
  readonly source: string;
  readonly projectRoot?: string;
  readonly kind: SourceFactoryKind;
  readonly exportName: string;
  readonly exportKind: "default" | "named";
  readonly binding?: string;
  readonly explicitId?: unknown;
  readonly exportFact?: ExportFact;
}

const KIND_RULES: Readonly<
  Record<SourceFactoryKind, { readonly category?: string; readonly suffixes: readonly string[] }>
> = {
  app: { suffixes: ["relkit.config"] },
  function: { category: "functions", suffixes: ["function"] },
  service: { suffixes: ["service"] },
  route: { suffixes: ["route"] },
  job: { category: "jobs", suffixes: ["job"] },
  event: { category: "events", suffixes: ["event"] },
  "event-trigger": { category: "events", suffixes: ["event"] },
  bucket: { category: "buckets", suffixes: ["bucket"] },
  cache: { category: "cache", suffixes: ["cache"] },
  tool: { category: "tools", suffixes: ["tool"] },
  agent: { category: "agents", suffixes: ["agent"] },
  constants: { category: "constants", suffixes: ["constants"] },
  prompt: { category: "prompts", suffixes: ["prompt"] },
  error: { category: "errors", suffixes: ["error"] },
  middleware: { category: "middleware", suffixes: ["middleware"] },
  transform: { category: "transforms", suffixes: ["transform"] },
};

/** Returns the normalized source hierarchy after conventional path stripping. */
export function encodeSourceHierarchy(
  source: string,
  kind: SourceFactoryKind,
  projectRoot?: string,
): string | undefined {
  const parts = sourceParts(source, kind, projectRoot);
  return join(parts);
}

/** Encodes a named/default export, returning undefined when syntax cannot identify it. */
export function encodeExportId(input: ExportIdInput): string | undefined {
  if (input.explicitId !== undefined) return normalizeId(input.explicitId);
  const binding = input.binding ?? input.exportFact?.binding;
  const parts = sourceParts(input.source, input.kind, input.projectRoot);
  if (input.exportKind === "default") return finish(parts);
  const name = kebab(binding);
  if (name === undefined) return undefined;
  return finish(parts.length === 0 ? [name] : [...parts.slice(0, -1), name]);
}

/** Encodes a source-local declared error while retaining its binding spelling. */
export function encodeErrorId(
  source: string,
  binding: string,
  explicitId?: unknown,
  projectRoot?: string,
): string | undefined {
  if (explicitId !== undefined) return normalizeId(explicitId);
  if (binding.trim() === "") return undefined;
  return finish([...sourceParts(source, "error", projectRoot), binding]);
}

/** Encodes a service member identity from the already-resolved service identity. */
export function encodeMemberId(
  serviceId: string,
  member: string,
  explicitId?: unknown,
): string | undefined {
  if (explicitId !== undefined) return normalizeId(explicitId);
  const service = normalizeId(serviceId);
  const name = kebab(member);
  return name === undefined ? undefined : finish([service, name]);
}

/** Selects explicit identity first, then the applicable source/member/route encoder. */
export function encodeSourceId(input: SourceIdInput): string | undefined {
  if (input.explicitId !== undefined) return normalizeId(input.explicitId);
  if (input.kind === "route") {
    if (input.method === undefined || input.path === undefined) return undefined;
    return encodeRouteId(input.method, input.path);
  }
  if (input.serviceId !== undefined && input.member !== undefined)
    return encodeMemberId(input.serviceId, input.member);
  if (input.kind === "error" && input.binding !== undefined)
    return encodeErrorId(input.source, input.binding, undefined, input.projectRoot);
  if (input.exportKind === undefined) return undefined;
  return encodeExportId({
    source: input.source,
    kind: input.kind,
    exportName: input.exportName ?? "",
    exportKind: input.exportKind,
    ...(input.binding === undefined ? {} : { binding: input.binding }),
    ...(input.projectRoot === undefined ? {} : { projectRoot: input.projectRoot }),
  });
}

function sourceParts(
  source: string,
  kind: SourceFactoryKind,
  projectRoot: string | undefined,
): readonly string[] {
  const normalized = relativeSource(source, projectRoot);
  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] === "src") parts.shift();
  const rule = KIND_RULES[kind];
  if (kind === "route" && parts[0] === "routes") parts.shift();
  if ((kind === "middleware" || kind === "transform") && parts[0] === "routes") {
    parts.shift();
    if (parts[0] === rule.category) parts.shift();
  } else if (kind !== "app" && kind !== "route" && kind !== "service") {
    if (parts[1] === rule.category) parts.splice(1, 1);
  }
  const last = parts.at(-1);
  if (last === undefined) return [];
  const stem = last.replace(/\.(?:[cm]?[jt]sx?)$/i, "");
  parts[parts.length - 1] = stripSuffix(stem, rule.suffixes);
  if (parts.at(-1) === "index") parts.pop();
  return parts.flatMap((part) => {
    const value = kebab(part);
    return value === undefined ? [] : [value];
  });
}

function stripSuffix(value: string, suffixes: readonly string[]): string {
  for (const suffix of suffixes) {
    if (value.endsWith(`.${suffix}`)) return value.slice(0, -suffix.length - 1);
    if (value === suffix) return "";
  }
  return value;
}

function kebab(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
  return normalized === "" ? undefined : normalized;
}

function finish(parts: readonly string[]): string | undefined {
  const value = join(parts);
  return value === undefined ? undefined : normalizeId(value);
}

function join(parts: readonly string[]): string | undefined {
  const value = parts.filter((part) => part !== "").join(".");
  return value === "" ? undefined : value;
}

function relativeSource(source: string, projectRoot: string | undefined): string {
  try {
    return normalizeSourcePath(source, projectRoot);
  } catch {
    return source
      .replaceAll("\\", "/")
      .replace(/^\/+/, "")
      .replace(/^\.\/+/, "");
  }
}
