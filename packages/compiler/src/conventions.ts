/**
 * Runs observable convention checks against physical flat/grouped source paths.
 * Descriptor values are guarded and provenance decoded before pure warning
 * calculations; all recommendations retain their established nonfatal severity.
 */
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { readInput, normalizePathEffect, ruleFor } from "./conventions-support.js";
import { conventionFindings } from "./convention-findings.js";
import type {
  ConventionCheckInput,
  ConventionCheckOptions,
  KindRule,
} from "./conventions.types.js";
import type { DescriptorKind } from "@relkit/contracts";
import type { Diagnostic } from "@relkit/diagnostics";

export { CONVENTION_CODES } from "./convention-findings.js";
export type {
  ConventionCode,
  ConventionExport,
  ConventionCheckInput,
  ConventionCheckOptions,
} from "./conventions.types.js";

const rules: Readonly<Record<DescriptorKind, KindRule>> = {
  app: { directory: ".", suffix: "relkit.config.ts" },
  function: { directory: "functions", suffix: ".function.ts" },
  service: { directory: "", suffix: "service.ts" },
  route: { directory: "src/routes", suffix: "route.ts" },
  middleware: { directory: "src/routes/middleware", suffix: ".middleware.ts" },
  task: { directory: "tasks", suffix: ".task.ts" },
  job: { directory: "jobs", suffix: ".job.ts" },
  event: { directory: "events", suffix: ".event.ts" },
  "event-trigger": { directory: "events", suffix: ".event.ts" },
  bucket: { directory: "buckets", suffix: ".bucket.ts" },
  cache: { directory: "cache", suffix: ".cache.ts" },
  tool: { directory: "tools", suffix: ".tool.ts" },
  agent: { directory: "agents", suffix: ".agent.ts" },
  channel: { directory: "channels", suffix: ".channel.ts" },
  constants: { directory: "constants", suffix: ".constants.ts" },
  prompt: { directory: "prompts", suffix: ".prompt.ts" },
};

/**
 * Checks authoring conventions without evaluating executable descriptor members.
 * @typeParam Input - Caller descriptor or structured input narrowed before use.
 * @param inputOrDescriptor - Structured provenance or positional descriptor.
 * @param sourcePath - Physical filename for positional calls.
 * @param options - Source/export metadata for positional calls.
 * @returns Lazy immutable nonfatal warnings; unexpected descriptor getter defects propagate.
 */
export const checkConventionsEffect = Effect.fn("Compiler.checkConventions")(
  function* <Input>(
    inputOrDescriptor: Input,
    sourcePath?: string,
    options: ConventionCheckOptions = {},
  ) {
    const input = readInput(inputOrDescriptor, sourcePath, options);
    if (!input) return Object.freeze([]);
    const path = yield* normalizePathEffect(input.sourcePath, input.projectRoot);
    const rule = ruleFor(rules[input.descriptor.kind], input.descriptor.kind, path);
    return conventionFindings(input, path, rule);
  },
  (effect) => observeCompiler("normalization", "checkConventions", effect),
);

/** Checks a descriptor using its structured source and export provenance.
 * @typeParam Descriptor - Caller descriptor type narrowed by runtime validation.
 * @param input - Complete descriptor/provenance input.
 * @returns Immutable nonfatal convention diagnostics with physical source locations. */
export function checkConventions<Descriptor>(
  input: ConventionCheckInput<Descriptor>,
): readonly Diagnostic[];

/** Checks a descriptor using the positional compatibility API.
 * @typeParam Descriptor - Caller descriptor type narrowed by runtime validation.
 * @param descriptor - Candidate authoring descriptor.
 * @param sourcePath - Physical source filename in either supported layout.
 * @param options - Optional source, export and project-root provenance.
 * @returns Immutable nonfatal convention diagnostics with stable warning codes. */
export function checkConventions<Descriptor>(
  descriptor: Descriptor,
  sourcePath: string,
  options?: ConventionCheckOptions,
): readonly Diagnostic[];

/**
 * Executes the existing synchronous convention compatibility boundary.
 * @typeParam Input - Caller descriptor/input type, preserved until runtime validation.
 * @param inputOrDescriptor - Structured provenance or positional descriptor.
 * @param sourcePath - Physical filename when using the positional form.
 * @param options - Root/location/export metadata for positional callers.
 * @returns Frozen warning diagnostics with accurate physical paths and stable codes.
 */
export function checkConventions<Input>(
  inputOrDescriptor: Input,
  sourcePath?: string,
  options: ConventionCheckOptions = {},
): readonly Diagnostic[] {
  return runCompilerSync(checkConventionsEffect(inputOrDescriptor, sourcePath, options));
}
