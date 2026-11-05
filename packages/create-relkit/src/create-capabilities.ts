/**
 * Packaged creation evidence records which combinations CI has measured. Creation offers every
 * valid combination; one without matching evidence produces a coded warning, or, in strict mode,
 * a refusal before any file is written.
 */

import { createHash } from "node:crypto";
import manifest from "../package.json";
import { CREATE_OPTION_DEFAULTS, type CreateOptions, type CreateTemplate } from "./options.js";

import type {
  CreateCapabilityTuple,
  CreateCapabilityIdentity,
  CreateCapabilityEvidence,
  CreateCapabilityWarning,
  PartialCreateCapability,
} from "./create-capabilities.types.js";
export type {
  CreateCapabilityTuple,
  CreateCapabilityIdentity,
  CreateCapabilityEvidence,
  CreateCapabilityWarning,
} from "./create-capabilities.types.js";

/** Stable code for a combination without current CI evidence. */
export const CREATE_UNTESTED_CODE = "RELKIT_CREATE_UNTESTED" as const;
/** Docs page for {@link CREATE_UNTESTED_CODE}. */
export const CREATE_UNTESTED_DOCS =
  "https://relkit.dev/docs/modules/cli/relkit-create-untested" as const;

const entries: readonly CreateCapabilityEvidence[] = Object.freeze([
  Object.freeze({
    template: "minimal",
    cloud: "none",
    deploy: "none",
    examples: true,
    identity: Object.freeze({
      release: "0.8.8",
      bun: "1.3.10",
      typescript: "5.9.3",
      packageCatalogDigest: "65e80e9cc47098b66504ba3590269ca56b12c94d597305cc2f20d997aeae8755",
      template: "default/v1/minimal",
      snapshotProtocol: 1,
    }),
    templateDigest: "a56d4bab48e5d8bebf587aec5c9fce2aa869f92ea0b644cdd77403b7e2d804c7",
    freshEvidence: "create-capabilities/0.8.8/fresh.json",
    restartEvidence: "create-capabilities/0.8.8/restart.json",
  }),
]);

export const CREATE_CAPABILITY_TABLE = Object.freeze({
  version: 1,
  entries,
});

/** Strict-mode refusal of a combination without current CI evidence. */
export class CreateUntestedError extends Error {
  /** Stable code shared with the untested warning. */
  readonly code = CREATE_UNTESTED_CODE;
  /** Usage exit status. */
  readonly exitCode = 2 as const;
  /**
   * Creates the strict-mode refusal.
   * @param message - User-facing diagnostic.
   */
  constructor(message: string) {
    super(message);
    this.name = "CreateUntestedError";
  }
}

/**
 * Reads the executing SDK's release and pinned dependency catalog without acquiring application clients.
 * @param template - Template whose source identity is reported.
 * @returns The identity that packaged evidence is compared against.
 */
export function currentCreateCapabilityIdentity(
  template: CreateTemplate = CREATE_OPTION_DEFAULTS.template,
): CreateCapabilityIdentity {
  const catalog = manifest.relkit.buildCatalog;
  return {
    release: manifest.version,
    bun: Bun.version,
    typescript: catalog.dependencies.typescript,
    packageCatalogDigest: createHash("sha256").update(JSON.stringify(catalog)).digest("hex"),
    template: templateIdentity(template),
    snapshotProtocol: 1,
  };
}

/**
 * Checks a complete combination before destination planning or installation.
 * @param options - Complete public creation choice.
 * @param settings - Strict refusal and an explicit identity used by compatibility checks.
 * @returns A coded warning when the combination is untested, or undefined when it is tested.
 * @throws CreateUntestedError when strict mode is set and the combination is untested.
 */
export function checkCreateCapability(
  options: Pick<CreateOptions, "template" | "cloud" | "deploy" | "jobs" | "examples">,
  settings: { readonly strict?: boolean; readonly identity?: CreateCapabilityIdentity } = {},
): CreateCapabilityWarning | undefined {
  const identity = settings.identity ?? currentCreateCapabilityIdentity(options.template);
  if (supported(options, identity)) return undefined;
  const subject = `${formatTuple(options)} has not been tested with RelKit ${identity.release} on Bun ${runtimeLine(identity.bun)}`;
  if (settings.strict === true) {
    const tested = testedTuples(identity).join(", ") || "none for this RelKit and Bun version";
    throw new CreateUntestedError(
      `${subject}, and --strict refuses untested combinations. Tested: ${tested}. See ${CREATE_UNTESTED_DOCS}`,
    );
  }
  return Object.freeze({
    code: CREATE_UNTESTED_CODE,
    message: `${subject}. Creation continues; pass --strict to refuse untested combinations.`,
    docs: CREATE_UNTESTED_DOCS,
  });
}

/**
 * Refuses a combination without current evidence, as strict creation does.
 * @param options - Complete public creation choice.
 * @param identity - Executing tool identity, or an explicit identity used by compatibility checks.
 * @returns When current evidence covers the complete combination.
 */
export function assertCreateCapability(
  options: Pick<CreateOptions, "template" | "cloud" | "deploy" | "jobs" | "examples">,
  identity: CreateCapabilityIdentity = currentCreateCapabilityIdentity(options.template),
): void {
  checkCreateCapability(options, { strict: true, identity });
}

/**
 * Lists templates with current evidence for the choices resolved so far.
 * @param options - Choices resolved so far by the native prompt flow.
 * @param identity - Executing tool identity; defaults to each entry's own template identity.
 * @returns Templates that creation reports as tested.
 */
export function supportedCreateTemplates(
  options: PartialCreateCapability,
  identity?: CreateCapabilityIdentity,
): readonly CreateTemplate[] {
  return CREATE_CAPABILITY_TABLE.entries
    .filter(
      (entry) =>
        current(entry.identity, identity ?? currentCreateCapabilityIdentity(entry.template)) &&
        matchesPartial(entry, options),
    )
    .map((entry) => entry.template);
}

/**
 * Checks every field of a complete tuple against evidence for the running tool.
 * @param options - Complete creation choice.
 * @param identity - Executing tool identity.
 * @returns Whether current evidence covers this choice.
 */
export function supported(
  options: Pick<CreateOptions, "template" | "cloud" | "deploy" | "jobs" | "examples">,
  identity: CreateCapabilityIdentity = currentCreateCapabilityIdentity(options.template),
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
 * Formats the tested choices for a strict refusal.
 * @param identity - Executing tool identity.
 * @returns Deterministic native option descriptions.
 */
function testedTuples(identity: CreateCapabilityIdentity): readonly string[] {
  return CREATE_CAPABILITY_TABLE.entries
    .filter((entry) =>
      current(entry.identity, { ...identity, template: templateIdentity(entry.template) }),
    )
    .map(formatTuple);
}

/**
 * Compares release and template identity plus the runtime's major and minor version.
 * @param left - Recorded evidence identity.
 * @param right - Current executing identity.
 * @returns Whether the evidence applies to the running tool.
 */
function current(left: CreateCapabilityIdentity, right: CreateCapabilityIdentity): boolean {
  return (
    left.release === right.release &&
    left.template === right.template &&
    runtimeLine(left.bun) === runtimeLine(right.bun)
  );
}

/**
 * Drops the patch and any pre-release suffix from a runtime version.
 * @param version - Semantic runtime version.
 * @returns The major.minor release line.
 */
function runtimeLine(version: string): string {
  return version.split(".", 2).join(".");
}

/**
 * Names the packaged template directory evidence was measured from.
 * @param template - Public template choice.
 * @returns Template identity recorded in evidence.
 */
function templateIdentity(template: CreateTemplate): string {
  return `default/v1/${template}`;
}

/**
 * Preserves unresolved native prompt choices while filtering complete tested entries.
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
