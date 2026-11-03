/**
 * Maps normalized authored paths to fixed service roots and logical identity
 * paths. These pure calculations neither inspect folders nor infer declarations;
 * the layout selection supplied by the compiler determines actual ownership.
 */
import type {
  ApplicationLayout,
  ApplicationSourceLayer,
  ServiceSource,
} from "./application-layout.types.js";

/** Removed layer-first directories; services is now a container, never a domain. */
export const LEGACY_SERVICE_ROOTS: ReadonlySet<string> = new Set([
  "functions",
  "events",
  "errors",
  "jobs",
  "buckets",
  "cache",
  "tools",
  "agents",
  "middleware",
  "transforms",
  "data",
  "constants",
  "prompts",
]);

/**
 * Classifies the physical service shape of one normalized source path.
 * @param file - Canonical project-relative path with portable separators.
 * @returns Service shape, or undefined for reserved layers and the grouping container.
 * @example serviceSource("src/services/orders/service.ts")?.name === "orders";
 */
export function serviceSource(file: string): ServiceSource | undefined {
  const parts = file.split("/");
  if (parts[0] !== "src" || parts[1] === "routes" || parts[1] === "platform") return undefined;
  const grouped = parts[1] === "services";
  const index = grouped ? 2 : 1;
  const name = parts[index];
  if (!name || parts.length <= index + 1) return undefined;
  const root = parts.slice(0, index + 1).join("/");
  return {
    layout: grouped ? "grouped" : "flat",
    name,
    root,
    boundary: `${root}/service.ts`,
    relative: parts.slice(index + 1).join("/"),
  };
}

/**
 * Removes only the recognized grouping segment from a service identity path.
 * @param file - Normalized authored source, retaining its physical provenance elsewhere.
 * @returns Flat-equivalent identity path, leaving deeper services-named folders intact.
 * @example serviceIdentityPath("src/services/orders/functions/get.function.ts") === "src/orders/functions/get.function.ts";
 */
export function serviceIdentityPath(file: string): string {
  const source = serviceSource(file);
  if (source?.layout !== "grouped") return file;
  return `src/${source.name}/${source.relative}`;
}

/**
 * Looks up ownership from declarations rather than every folder under src.
 * @param layout - Shared immutable layout interpretation.
 * @param file - Canonical project-relative authored source path.
 * @returns Its evidenced owner or reserved application/tooling layer.
 */
export function applicationSourceLayer(
  layout: ApplicationLayout,
  file: string,
): ApplicationSourceLayer {
  if (file === "relkit.config.ts") return { kind: "config" };
  if (file.startsWith("src/routes/")) return { kind: "routes" };
  if (file.startsWith("src/platform/")) return { kind: "platform" };
  const service = layout.services.find((candidate) => file.startsWith(`${candidate.root}/`));
  if (service) return { kind: "service", service };
  return { kind: file.startsWith("src/") ? "unowned" : "tooling" };
}
