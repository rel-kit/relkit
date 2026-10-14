/** Finds native service declarations through the shared, syntax-only layout model. */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { discoverApplicationLayoutEffect } from "@relkit/compiler";
import {
  isDescriptor,
  selectApplicationLayout,
  serviceSource,
  type DescriptorAny,
} from "@relkit/contracts";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { nativeServiceError } from "./application-service-auth.js";
import type { AuthDeclaration, DatabaseDeclaration } from "./application-services.types.js";

/**
 * Loads only evidenced boundaries, in deterministic order, without activating clients.
 * @param root - Project root containing authored sources.
 * @returns Native declarations; invalid layouts fail before evaluation.
 */
export const loadApplicationServices = Effect.fn("Testing.services.load")(
  function* (root: string) {
    const files = yield* Effect.try({
      try: () => [...new Bun.Glob("src/**/*.ts").scanSync({ cwd: root, onlyFiles: true })].sort(),
      catch: nativeServiceError,
    });
    const modules = yield* Effect.forEach(
      files,
      (fileName) =>
        Effect.tryPromise({
          try: () => Bun.file(join(root, fileName)).text(),
          catch: nativeServiceError,
        }).pipe(Effect.map((text) => ({ fileName, text }))),
      { concurrency: 4 },
    );
    const layout = yield* discoverApplicationLayoutEffect(modules, root);
    if (layout.issues.length > 0)
      return yield* Effect.fail(new Error(layout.issues.map((issue) => issue.message).join("\n")));
    const services: DescriptorAny[] = [];
    const evidence: { file: string; kind: string }[] = [];
    // Native test fixtures may re-export declarations; inspect their fixed boundaries only.
    for (const file of files.filter((file) => serviceSource(file)?.relative === "service.ts")) {
      const exports = yield* Effect.tryPromise({
        try: () => import(pathToFileURL(join(root, file)).href),
        catch: nativeServiceError,
      });
      const declarations = Object.values(exports).filter(isService);
      services.push(...declarations);
      evidence.push(...declarations.map(() => ({ file, kind: "service" })));
    }
    const selected = selectApplicationLayout(root, evidence);
    if (selected.issues.length > 0)
      return yield* Effect.fail(
        new Error(selected.issues.map((issue) => issue.message).join("\n")),
      );
    return services;
  },
  (effect) => observeExecution("testing", "services.load", effect),
);

/**
 * Checks branding before interpreting a loaded module value.
 * @typeParam Value - Inferred foreign module value.
 * @param value - A module export.
 * @returns Whether the export is a branded service declaration.
 */
function isService<Value>(value: Value): value is Value & DescriptorAny {
  return isDescriptor(value, "service");
}

/**
 * Selects the sole native declaration by its capability discriminator.
 * @typeParam Kind - Existing supported native capability.
 * @param services - Branded service declarations.
 * @param kind - Native capability to select.
 * @returns The native SDK declaration, or undefined; native activation validates its metadata.
 * @throws Error When more than one declaration owns the capability.
 */
export function soleNativeService<Kind extends "drizzle" | "better-auth">(
  services: readonly DescriptorAny[],
  kind: Kind,
): (Kind extends "drizzle" ? DatabaseDeclaration : AuthDeclaration) | undefined {
  const matches = services.filter(
    (service) =>
      "capability" in service &&
      service.capability !== null &&
      typeof service.capability === "object" &&
      "kind" in service.capability &&
      service.capability.kind === kind,
  );
  if (matches.length > 1) throw new Error(`Test application has multiple ${kind} services`);
  // Branding and capability choose the SDK boundary; activation checks hidden native metadata.
  return matches[0] as (Kind extends "drizzle" ? DatabaseDeclaration : AuthDeclaration) | undefined;
}
