/**
 * Packaged creation support is an allow-list backed by exact packed readiness evidence.
 * Candidate literals remain parseable so explicit unsupported requests can return
 * a precise pre-staging diagnostic instead of masquerading as syntax errors.
 */

import { createHash } from "node:crypto";
import manifest from "../package.json";
import { CreateOptionsError, type CreateOptions, type CreateTemplate } from "./options.js";

import type {
  CreateCapabilityTuple,
  CreateCapabilityIdentity,
  CreateCapabilityEvidence,
  PartialCreateCapability,
} from "./create-capabilities.types.js";
export type {
  CreateCapabilityTuple,
  CreateCapabilityIdentity,
  CreateCapabilityEvidence,
} from "./create-capabilities.types.js";

const entries: readonly CreateCapabilityEvidence[] = Object.freeze([
  Object.freeze({
    template: "minimal",
    cloud: "none",
    deploy: "none",
    examples: true,
    identity: Object.freeze({
      release: "0.8.0",
      bun: "1.3.10",
      typescript: "5.9.3",
      packageCatalogDigest: "00d9ec06b68bd25482a38e7e39c10f4898dc4937a54178ba3e768733c073e084",
      template: "default/v1/minimal",
      snapshotProtocol: 1,
    }),
    templateDigest: "24e2b2db8d5bd35ed99f6e98ea1047ad3b8fe37aee4b2c9cec02c5f05196348f",
    freshEvidence: "docs/evidence/create-capabilities/0.8.0/fresh.json",
    restartEvidence: "docs/evidence/create-capabilities/0.8.0/restart.json",
  }),
]);

export const CREATE_CAPABILITY_TABLE = Object.freeze({
  version: 1,
  entries,
});

/**
 * Reads the executing SDK's release and pinned dependency catalog without acquiring application clients.
 * @returns The complete identity that packaged evidence must match exactly.
 */
export function currentCreateCapabilityIdentity(): CreateCapabilityIdentity {
  const catalog = manifest.relkit.buildCatalog;
  return {
    release: manifest.version,
    bun: Bun.version,
    typescript: catalog.dependencies.typescript,
    packageCatalogDigest: createHash("sha256").update(JSON.stringify(catalog)).digest("hex"),
    template: "default/v1/minimal",
    snapshotProtocol: 1,
  };
}

/**
 * Rejects missing or stale tuples before destination planning or installation.
 * @param options - Complete public creation choice.
 * @param identity - Executing tool identity, or an explicit identity used by compatibility checks.
 * @returns When a current evidence entry admits the complete tuple.
 */
export function assertCreateCapability(
  options: Pick<CreateOptions, "template" | "cloud" | "deploy" | "jobs" | "examples">,
  identity: CreateCapabilityIdentity = currentCreateCapabilityIdentity(),
): void {
  if (supported(options, identity)) return;
  throw new CreateOptionsError(
    `Creation combination is not certified: ${formatTuple(options)}. Supported: ${supportedTuples(identity).join(", ") || "none for this tool identity"}.`,
  );
}

/**
 * Filters interactive template choices through the same evidence allow-list.
 * @param options - Choices resolved so far by the native prompt flow.
 * @param identity - Executing tool identity.
 * @returns Only templates admitted by current complete evidence entries.
 */
export function supportedCreateTemplates(
  options: PartialCreateCapability,
  identity: CreateCapabilityIdentity = currentCreateCapabilityIdentity(),
): readonly CreateTemplate[] {
  return CREATE_CAPABILITY_TABLE.entries
    .filter((entry) => current(entry.identity, identity) && matchesPartial(entry, options))
    .map((entry) => entry.template);
}

/**
 * Checks every field of a complete tuple and its exact tool identity.
 * @param options - Complete creation choice.
 * @param identity - Executing tool identity.
 * @returns Whether a current complete evidence entry admits this choice.
 */
export function supported(
  options: Pick<CreateOptions, "template" | "cloud" | "deploy" | "jobs" | "examples">,
  identity: CreateCapabilityIdentity = currentCreateCapabilityIdentity(),
): boolean {
  return CREATE_CAPABILITY_TABLE.entries.some(
    (entry) =>
      current(entry.identity, identity) &&
      entry.template === options.template &&
      entry.cloud === options.cloud &&
      entry.deploy === options.deploy &&
      entry.jobs === options.jobs &&
      entry.examples === options.examples,
  );
}

/**
 * Formats the current complete choices for a public refusal diagnostic.
 * @param identity - Executing tool identity.
 * @returns Deterministic native option descriptions.
 */
function supportedTuples(identity: CreateCapabilityIdentity): readonly string[] {
  return CREATE_CAPABILITY_TABLE.entries
    .filter((entry) => current(entry.identity, identity))
    .map(formatTuple);
}

/**
 * Compares all mandatory tool identity fields without ignoring patch versions.
 * @param left - Recorded certification identity.
 * @param right - Current executing identity.
 * @returns Whether every mandatory field matches.
 */
function current(left: CreateCapabilityIdentity, right: CreateCapabilityIdentity): boolean {
  return (
    left.release === right.release &&
    left.bun === right.bun &&
    left.typescript === right.typescript &&
    left.packageCatalogDigest === right.packageCatalogDigest &&
    left.template === right.template &&
    left.snapshotProtocol === right.snapshotProtocol
  );
}

/**
 * Preserves unresolved native prompt choices while filtering complete certified entries.
 * @param entry - Complete recorded tuple.
 * @param options - Choices already supplied by the user.
 * @returns Whether the entry agrees with every resolved choice.
 */
function matchesPartial(entry: CreateCapabilityTuple, options: PartialCreateCapability): boolean {
  return (
    (options.template === undefined || entry.template === options.template) &&
    (options.cloud === undefined || entry.cloud === options.cloud) &&
    (options.deploy === undefined || entry.deploy === options.deploy) &&
    (options.jobs === undefined || entry.jobs === options.jobs) &&
    (options.examples === undefined || entry.examples === options.examples)
  );
}

/**
 * Describes native options using the public no-jobs and wildcard semantics.
 * @param options - Complete or partially resolved tuple.
 * @returns One portable diagnostic string.
 */
function formatTuple(options: PartialCreateCapability): string {
  let examples = "*";
  if (options.examples !== undefined) examples = options.examples ? "on" : "off";
  return [
    `template=${options.template ?? "*"}`,
    `jobs=${options.jobs ?? "none"}`,
    `cloud=${options.cloud ?? "*"}`,
    `deploy=${options.deploy ?? "*"}`,
    `examples=${examples}`,
  ].join("/");
}
