import type { HttpTriggerRegistration } from "@relkit/graph";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import { assertManifestCohort, RuntimeHonoManifestError } from "./manifest-validation.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";

export function assertHttpManifest(options: RouteMaterializationOptions): void {
  const { manifest, plan } = options;
  assertManifestCohort(manifest);
  if (manifest.graphHash !== plan.graphHash)
    throw new RuntimeHonoManifestError(
      "RELKIT_GRAPH_MANIFEST_MISMATCH",
      `Manifest hash ${JSON.stringify(manifest.graphHash)} does not match plan hash ${JSON.stringify(plan.graphHash)}.`,
    );
  for (const middleware of plan.middlewares) {
    const entry = getEntry(manifest.middleware, middleware.id);
    if (!isRecord(entry) || entry.path !== middleware.path || typeof entry.handler !== "function")
      throw new RuntimeHonoManifestError(
        entry === undefined
          ? "RELKIT_MANIFEST_MIDDLEWARE_MISSING"
          : "RELKIT_MANIFEST_MIDDLEWARE_MISMATCH",
        `Manifest middleware "${middleware.id}" is missing or does not match its graph node.`,
        middleware.id,
      );
  }
  for (const trigger of plan.httpTriggers) {
    if (trigger.config.rawHandler === true) {
      const route = getEntry(manifest.routes ?? {}, trigger.id);
      if (!isRecord(route) || typeof route.handler !== "function")
        throw new RuntimeHonoManifestError(
          "RELKIT_MANIFEST_RAW_ROUTE_MISSING",
          `Manifest raw route "${trigger.id}" is missing its handler.`,
          trigger.id,
        );
      continue;
    }
    for (const transform of trigger.config.transforms) {
      if (getEntry(manifest.requestTransforms, transform.id) === undefined)
        throw new RuntimeHonoManifestError(
          "RELKIT_MANIFEST_TRANSFORM_MISSING",
          `Manifest request transform "${transform.id}" is missing.`,
          transform.id,
        );
    }
  }
}
