import { LOCAL_SERVICE_PLAN_VERSION } from "@relkit/local-service";

/** Retains version mismatch diagnostics before production startup.
 * @param actual - Authored contract value.
 * @param expected - Installed contract version.
 * @param label - Artifact diagnostic label.
 * @returns Void for the current version.
 * @throws Error when a rebuild is required.
 */
export function expectVersion(actual: unknown, expected: number, label: string): void {
  if (actual !== expected)
    throw new Error(
      `${label} version ${String(actual)} is unsupported; expected ${expected}. Rebuild with \`relkit build\`.`,
    );
}

/** Parses untrusted artifact bytes without asserting their domain structure.
 * @param source - JSON source.
 * @param label - Artifact diagnostic label.
 * @returns An unknown boundary candidate.
 * @throws Error for malformed JSON with the established rebuild hint.
 */
export function parseArtifact(source: string, label: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error(`Built ${label} is invalid JSON; rebuild with \`relkit build\`.`);
  }
}

/** Selects an optional version from the metadata object boundary.
 * @param value - Parsed artifact candidate.
 * @returns Version field or undefined.
 */
export function versionOf(value: unknown): unknown {
  return isRecord(value) ? value.version : undefined;
}

/** Validates that auxiliary artifacts belong to the built graph cohort.
 * @param value - Parsed auxiliary artifact.
 * @param graphHash - Current graph identity.
 * @param label - Artifact diagnostic label.
 * @returns Void for the matching cohort.
 * @throws Error when regeneration is required.
 */
export function expectGraphHash(value: unknown, graphHash: string, label: string): void {
  if (!isRecord(value) || value.graphHash !== graphHash)
    throw new Error(`${label} does not match the built graph; rebuild with \`relkit build\`.`);
}

/** Validates the optional local-service artifact's version and graph identity.
 * @param source - JSON source.
 * @param graphHash - Current graph identity.
 * @returns Void for the current matching cohort.
 * @throws Error for malformed, stale or foreign cohort data.
 */
export function validateLocalServices(source: string, graphHash: string): void {
  const value = parseArtifact(source, "local-service plan");
  expectVersion(versionOf(value), LOCAL_SERVICE_PLAN_VERSION, "Built local-service plan");
  expectGraphHash(value, graphHash, "Built local-service plan");
}

/** Narrows artifact object boundaries before reading identity fields.
 * @param value - Parsed candidate.
 * @returns Whether it is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
