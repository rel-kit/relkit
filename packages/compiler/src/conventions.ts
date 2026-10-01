import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import {
  readInput,
  normalizePathEffect,
  ruleFor,
  diagnosticLocation,
  recommendedPattern,
  hasExportWarning,
  descriptorKinds,
} from "./conventions-support.js";
import type {
  ConventionCode,
  ConventionCheckInput,
  ConventionCheckOptions,
  KindRule,
} from "./conventions.types.js";
export type {
  ConventionCode,
  ConventionExport,
  ConventionCheckInput,
  ConventionCheckOptions,
} from "./conventions.types.js";
import { isDescriptor, type DescriptorKind } from "@relkit/contracts";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
export const CONVENTION_CODES = Object.freeze({
  directory: "RELKIT_CONVENTION_DIRECTORY",
  suffix: "RELKIT_CONVENTION_SUFFIX",
  export: "RELKIT_CONVENTION_EXPORT",
  multipleKinds: "RELKIT_CONVENTION_MULTIPLE_KINDS",
  idStyle: "RELKIT_CONVENTION_ID_STYLE",
} as const);
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
 * Checks source naming conventions without evaluating executable descriptor members.
 * @param inputOrDescriptor - Structured convention input or positional descriptor.
 * @param sourcePath - Source filename for the positional form.
 * @param options - Project root and source export evidence.
 * @returns A lazy effect yielding immutable warning diagnostics; metadata access defects propagate.
 * @see {@link normalizeCompilationEffect} for the compiler execution boundary.
 */
export const checkConventionsEffect = Effect.fn("Compiler.checkConventions")(
  function* (
    inputOrDescriptor: ConventionCheckInput | unknown,
    sourcePath?: string,
    options: ConventionCheckOptions = {},
  ) {
    const input = readInput(inputOrDescriptor, sourcePath, options);
    if (input === undefined || !isDescriptor(input.descriptor)) return Object.freeze([]);
    const path = yield* normalizePathEffect(input.sourcePath, input.projectRoot);
    const descriptor = input.descriptor;
    const rule = ruleFor(rules[descriptor.kind], descriptor.kind, path);
    const diagnostics: Diagnostic[] = [];
    const add = (code: ConventionCode, message: string, suggestion: string): void => {
      const location = diagnosticLocation(path, input);
      diagnostics.push(
        createDiagnostic(
          {
            code,
            severity: "warning",
            message,
            descriptorId: descriptor.id,
            ...(location === undefined ? {} : { location }),
            suggestion,
          },
          input.projectRoot === undefined ? {} : { projectRoot: input.projectRoot },
        ),
      );
    };
    const fileName = path.split("/").pop() ?? "";
    const pattern = recommendedPattern(rule);
    if (
      descriptor.kind !== "route" &&
      descriptor.kind !== "app" &&
      !path.startsWith(`${rule.directory}/`)
    ) {
      add(
        CONVENTION_CODES.directory,
        `Descriptor "${descriptor.id}" has kind "${descriptor.kind}" outside its recommended directory.`,
        `Move the descriptor under ${pattern}`,
      );
    }
    if (descriptor.kind !== "route" && !fileName.endsWith(rule.suffix)) {
      add(
        CONVENTION_CODES.suffix,
        `Descriptor "${descriptor.id}" does not use the recommended "${rule.suffix}" suffix.`,
        `Rename the file to use ${rule.suffix}`,
      );
    }
    if (descriptor.kind !== "route" && hasExportWarning(input)) {
      add(
        CONVENTION_CODES.export,
        `Descriptor file should default-export "${descriptor.id}".`,
        `Export "${descriptor.id}" as the file's default descriptor`,
      );
    }
    const kinds = descriptorKinds(input, descriptor);
    if (kinds.length > 1) {
      add(
        CONVENTION_CODES.multipleKinds,
        `File contains descriptors of multiple kinds: ${kinds.join(", ")}.`,
        "Keep unrelated descriptor kinds in separate files",
      );
    }
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(descriptor.id)) {
      add(
        CONVENTION_CODES.idStyle,
        `Descriptor ID "${descriptor.id}" is not in the recommended lower-case dot/kebab style.`,
        "Use lower-case alphanumeric segments separated by dots or hyphens",
      );
    }
    return Object.freeze(diagnostics);
  },
  (effect) => observeCompiler("normalization", "checkConventions", effect),
);

export function checkConventions(input: ConventionCheckInput): readonly Diagnostic[];

export function checkConventions(
  descriptor: unknown,
  sourcePath: string,
  options?: ConventionCheckOptions,
): readonly Diagnostic[];

/**
 * Checks descriptor filename, directory, export, and identity style.
 * @param inputOrDescriptor - Structured convention input or positional descriptor.
 * @param sourcePath - Authored source filename.
 * @param options - Caller-supplied configuration for this operation.
 * @returns Frozen filename, directory, export, and ID-style warning diagnostics.
 */
export function checkConventions(
  inputOrDescriptor: ConventionCheckInput | unknown,
  sourcePath?: string,
  options: ConventionCheckOptions = {},
): readonly Diagnostic[] {
  return runCompilerSync(checkConventionsEffect(inputOrDescriptor, sourcePath, options));
}
