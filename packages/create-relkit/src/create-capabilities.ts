/**
 * Packaged creation support is an allow-list backed by reference-host evidence.
 * Candidate literals remain parseable so explicit unsupported requests can return
 * a precise pre-staging diagnostic instead of masquerading as syntax errors.
 */
import { createHash } from "node:crypto";
import manifest from "../package.json";
import { CreateOptionsError, type CreateOptions, type CreateTemplate } from "./options.js";

export interface CreateCapabilityTuple {
  readonly template: CreateOptions["template"];
  readonly cloud: CreateOptions["cloud"];
  readonly deploy: CreateOptions["deploy"];
  readonly jobs?: CreateOptions["jobs"];
  readonly examples: boolean;
}

export interface CreateCapabilityIdentity {
  readonly release: string;
  readonly bun: string;
  readonly typescript: string;
  readonly packageCatalogDigest: string;
  readonly template: string;
  readonly snapshotProtocol: number;
}

export interface CreateCapabilityEvidence extends CreateCapabilityTuple {
  readonly identity: CreateCapabilityIdentity;
  readonly templateDigest: string;
  readonly freshEvidence: string;
  readonly restartEvidence: string;
}

type PartialCreateCapability = Readonly<{
  template?: string;
  cloud?: string;
  deploy?: string;
  jobs?: string | undefined;
  examples?: boolean;
}>;

const entries: readonly CreateCapabilityEvidence[] = Object.freeze([
  Object.freeze({
    template: "minimal",
    cloud: "none",
    deploy: "none",
    examples: true,
    identity: Object.freeze({
      release: "0.7.2",
      bun: "1.3.10",
      typescript: "5.9.3",
      packageCatalogDigest: "ac7c2f56e61fca5ab890775cf4c483722cb590e488ee7fc4741224cbb4f50ccd",
      template: "default/v1/minimal",
      snapshotProtocol: 1,
    }),
    templateDigest: "b6f8bab8acf86d4cd557a37df262eb23fda316de22517ec003b38415164df620",
    freshEvidence: "certification-default-fresh.json",
    restartEvidence: "certification-default-restarts.json",
  }),
]);

export const CREATE_CAPABILITY_TABLE = Object.freeze({
  version: 1,
  entries,
});

/** Returns the runtime identity that packaged evidence must match exactly. */
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

/** Rejects missing or stale runtime tuples before destination planning or installation. */
export function assertCreateCapability(
  options: Pick<CreateOptions, "template" | "cloud" | "deploy" | "jobs" | "examples">,
  identity: CreateCapabilityIdentity = currentCreateCapabilityIdentity(),
): void {
  if (supported(options, identity)) return;
  throw new CreateOptionsError(
    `Creation combination is not certified: ${formatTuple(options)}. Supported: ${supportedTuples(identity).join(", ") || "none for this tool identity"}.`,
  );
}

/** Filters interactive template choices through the same evidence allow-list. */
export function supportedCreateTemplates(
  options: PartialCreateCapability,
  identity: CreateCapabilityIdentity = currentCreateCapabilityIdentity(),
): readonly CreateTemplate[] {
  return CREATE_CAPABILITY_TABLE.entries
    .filter((entry) => current(entry.identity, identity) && matchesPartial(entry, options))
    .map((entry) => entry.template);
}

/** True only when a complete tuple and every evidence identity field match. */
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

function supportedTuples(identity: CreateCapabilityIdentity): readonly string[] {
  return CREATE_CAPABILITY_TABLE.entries
    .filter((entry) => current(entry.identity, identity))
    .map(formatTuple);
}

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

function matchesPartial(entry: CreateCapabilityTuple, options: PartialCreateCapability): boolean {
  return (
    (options.template === undefined || entry.template === options.template) &&
    (options.cloud === undefined || entry.cloud === options.cloud) &&
    (options.deploy === undefined || entry.deploy === options.deploy) &&
    (options.jobs === undefined || entry.jobs === options.jobs) &&
    (options.examples === undefined || entry.examples === options.examples)
  );
}

function formatTuple(options: PartialCreateCapability): string {
  return [
    `template=${options.template ?? "*"}`,
    `jobs=${options.jobs ?? "none"}`,
    `cloud=${options.cloud ?? "*"}`,
    `deploy=${options.deploy ?? "*"}`,
    `examples=${options.examples === undefined ? "*" : options.examples ? "on" : "off"}`,
  ].join("/");
}
