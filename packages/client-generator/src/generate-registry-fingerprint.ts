import type {
  JsonValue,
  ApplicationGraph,
  ClientRoute,
} from "./generate-registry-fingerprint.types.js";
import { createHash } from "node:crypto";
import { canonicalJson } from "@relkit/contracts";
import { Effect } from "effect";
import { makeGraphOperation } from "./generator-graph-operation.js";
import { manifestCalculations } from "./generate-public-manifest.js";
/** Hashes the canonical public manifest so equivalent graphs share a fingerprint.
 * @param graph - Validated application graph.
 * @param routes - Resolved public routes.
 * @returns An Effect yielding the SHA-256 fingerprint; it has no expected failure.
 * @example Effect.runSync(registryCalculations.fingerprintEffect(graph, routes));
 */
function publicFingerprintCore(
  graph: ApplicationGraph,
  routes: readonly ClientRoute[],
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const manifest = yield* manifestCalculations.buildEffect(graph, routes);
    const source = canonicalJson(manifest as JsonValue);
    return `sha256:${createHash("sha256").update(source).digest("hex")}`;
  });
}
/** Serializes the public manifest together with its fingerprint.
 * @param graph - Validated application graph.
 * @param routes - Resolved public routes.
 * @returns An Effect yielding canonical JSON; it has no expected failure.
 * @example Effect.runSync(generateClientManifestCore(graph, routes));
 */
function generateClientManifestCore(
  graph: ApplicationGraph,
  routes: readonly ClientRoute[],
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const manifest = yield* manifestCalculations.buildEffect(graph, routes);
    const publicFingerprint = yield* publicFingerprintCore(graph, routes);
    return `${canonicalJson({ ...manifest, publicFingerprint } as JsonValue)}\n`;
  });
}
const publicFingerprintOperation = makeGraphOperation("publicFingerprint", publicFingerprintCore);
/** Hashes the canonical public client manifest in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the fingerprint or MissingRouteTarget.
 * @example Effect.runSync(publicFingerprintEffect(graph));
 */
export const publicFingerprintEffect = publicFingerprintOperation.effect;
/** Hashes the public client manifest for synchronous compiler callers.
 * @param graph - Application graph to inspect.
 * @returns The fingerprint.
 * @throws TypeError for a missing route target; otherwise a defect for malformed trusted input.
 * @example publicFingerprint(graph);
 */
export const publicFingerprint = publicFingerprintOperation.run;
const generateClientManifestOperation = makeGraphOperation(
  "generateClientManifest",
  generateClientManifestCore,
);
/** Serializes the public client manifest with its fingerprint in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value or MissingRouteTarget.
 * @example Effect.runSync(generateClientManifestEffect(graph));
 */
export const generateClientManifestEffect = generateClientManifestOperation.effect;
/** Serializes the public client manifest for synchronous compiler callers.
 * @param graph - Application graph to inspect.
 * @returns The canonical JSON document.
 * @throws TypeError for a missing route target; otherwise a defect for malformed trusted input.
 * @example generateClientManifest(graph);
 */
export const generateClientManifest = generateClientManifestOperation.run;
/** Fingerprint calculations for composition within other generator Effects. @internal */
export const registryCalculations = {
  fingerprintEffect: publicFingerprintCore,
} as const;
