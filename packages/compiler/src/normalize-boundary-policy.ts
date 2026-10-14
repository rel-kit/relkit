/**
 * Enforces application dependency direction against declaration-owned roots.
 * Ordinary helpers inherit their owning layer; tests/scripts and unowned source
 * folders cannot serve as an intermediate route into another service's internals.
 */
import type { ApplicationSourceLayer } from "@relkit/contracts";

/**
 * Checks one resolved authored edge against fixed application boundary rules.
 * @param from - Importing module's evidenced owner or reserved layer.
 * @param target - Resolved dependency's real owner or reserved layer.
 * @param targetFile - Physical target path used to recognize its public boundary.
 * @returns Whether the application dependency is permitted.
 */
export function allowedSourceDependency(
  from: ApplicationSourceLayer,
  target: ApplicationSourceLayer,
  targetFile: string,
): boolean {
  if (from.kind === "tooling" || from.kind === "unowned") return true;
  if (target.kind === "tooling" || target.kind === "unowned" || target.kind === "config")
    return false;
  if (from.kind === "platform" || from.kind === "config") return target.kind === "platform";
  if (from.kind === "routes")
    return (
      target.kind === "platform" ||
      target.kind === "routes" ||
      (target.kind === "service" && targetFile === target.service.boundary)
    );
  if (from.kind !== "service") return false;
  return (
    target.kind === "platform" ||
    (target.kind === "service" &&
      (target.service.root === from.service.root || targetFile === target.service.boundary))
  );
}
