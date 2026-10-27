/** Executes no SDK code: parses generated guide actions, preserves authored manifest fields, and proves installed packages stay inside a fresh consumer. */
import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { Effect, Schema } from "effect";
import { inspectInstallation } from "../../../scripts/consumer-installation.js";
import { inspectionNative } from "../../../scripts/consumer-installation-native.js";
import { GuideRepair } from "./installation-workflows.schemas.js";
import type {
  GuideManifest,
  GuideStep,
  GuideRepair as Repair,
} from "./installation-workflows.types.js";
import type { InstallationDeclarations } from "./installation-catalog.types.js";

/** Native agents do not select a rich Inspector, history store or unrelated integrations; the starter's own Scalar reference is selected. */
export const agentForbiddenPackages =
  /^(?:next|@duckdb\/.*|deepagents|@modelcontextprotocol\/server|@relkit\/(?:inspector|drizzle|better-auth))$/;

/** Reads runnable blocks in their actual documentation order, rejecting arbitrary manifest replacement.
 * @param source - Generated installation fragment.
 * @returns Literal commands and strictly decoded repair fields.
 */
export function guideSteps(source: string): readonly GuideStep[] {
  return [...source.matchAll(/```(sh|json)\n([\s\S]*?)```/g)].map((match) => {
    const body = match[2];
    assert(body !== undefined, "Guide block has no body");
    if (match[1] === "sh") return { kind: "command", source: body.trim() };
    return {
      kind: "repair",
      fields: Schema.decodeUnknownSync(Schema.fromJsonString(GuideRepair), {
        onExcessProperty: "error",
      })(body),
    };
  });
}

/** Preserves existing overrides, patches, scripts and package identity while applying a selected repair.
 * @param manifest - Existing application manifest.
 * @param repair - Whitelisted generated guide fields.
 * @returns A merged manifest without dependency synthesis.
 */
export function mergeGuideRepair(manifest: GuideManifest, repair: Repair): GuideManifest {
  const merged = { ...manifest };
  for (const key of ["overrides", "patchedDependencies"] as const) {
    if (repair[key] !== undefined) merged[key] = { ...record(manifest[key]), ...repair[key] };
  }
  if (repair.pnpm !== undefined) {
    const pnpm = record(manifest.pnpm);
    merged.pnpm = { ...pnpm, overrides: { ...record(pnpm.overrides), ...repair.pnpm.overrides } };
  }
  return merged;
}

/** Checks the actual native install rather than accepting a broad example manifest or replacement dependency set.
 * @param baseline - Creator-produced manifest with only the guide's explicit repairs merged.
 * @param actual - Manifest after the literal install commands finish.
 * @param selected - Only requirements selected by this guide's metadata.
 * @returns Normally when selections and all unrelated authored fields are preserved.
 */
export function assertGuideManifest(
  baseline: GuideManifest,
  actual: GuideManifest,
  selected: InstallationDeclarations,
): void {
  for (const key of ["dependencies", "devDependencies"] as const) {
    const existing = stringRecord(baseline[key]);
    const expected = { ...existing, ...selected[key] };
    const installed = stringRecord(actual[key]);
    assert.deepEqual(
      Object.keys(installed).sort(),
      Object.keys(expected).sort(),
      `Unexpected ${key} selection`,
    );
    for (const [name, version] of Object.entries(expected)) {
      const value = installed[name];
      assert(
        value === version || (selected[key][name] !== undefined && value === `^${version}`),
        `Incompatible declaration: ${name}@${value}`,
      );
    }
  }
  const metadata = (manifest: GuideManifest) =>
    Object.fromEntries(
      Object.entries(manifest).filter(
        ([key]) => key !== "dependencies" && key !== "devDependencies",
      ),
    );
  assert.deepEqual(
    metadata(actual),
    metadata(baseline),
    "Installation replaced authored manifest settings",
  );
}

/** Rejects workspace links before traversing the real importer-context dependency graph.
 * @param root - Outside-workspace installed consumer.
 * @param repository - Workspace that must supply no runtime packages.
 * @param forbidden - Packages outside the selected capability's allowed closure.
 * @returns The actual contained inventory; missing required edges fail visibly.
 */
export const verifyConsumerIsolation = Effect.fn("DocsInstallation.isolation")(function* (
  root: string,
  repository: string,
  forbidden = /^$/,
) {
  const physical = yield* inspectionNative("docs.root", () => realpath(root));
  const modules = yield* inspectionNative("docs.node-modules", () =>
    realpath(join(root, "node_modules")),
  );
  assert(!contains(repository, physical), "Consumer must be outside the repository");
  assert(
    contains(physical, modules),
    "Workspace node_modules links cannot establish installation proof",
  );
  const installation = yield* inspectInstallation(physical, { development: true });
  assert.deepEqual(
    installation.missing.filter((item) => !item.optional),
    [],
    "Selected dependency is missing",
  );
  assert.deepEqual(
    installation.instances.filter((item) => forbidden.test(item.name)),
    [],
    "Unselected dependency entered the consumer",
  );
  return installation;
});

/** Narrows one native manifest object without manufacturing a replacement shape.
 * @param value - JSON field, absent for an unselected section.
 * @returns Its decoded object fields.
 */
function record(value: Schema.Json | undefined) {
  return Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(value ?? {});
}

/** Narrows a package declaration section.
 * @param value - Existing JSON manifest field.
 * @returns Validated package specifiers, or an empty absent section.
 */
function stringRecord(value: Schema.Json | undefined) {
  return Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(value ?? {});
}

/** Compares canonical paths without accepting sibling paths with a shared prefix.
 * @param parent - Owning directory.
 * @param child - Candidate physical path.
 * @returns Whether the path is contained by that owner.
 */
function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== ".." && !path.startsWith("../") && !isAbsolute(path);
}
