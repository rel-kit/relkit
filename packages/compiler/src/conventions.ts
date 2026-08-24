import {
  isDescriptor,
  isDescriptorKind,
  normalizeSourcePath,
  type DescriptorAny,
  type DescriptorKind,
  type SourceLocation,
} from "@zsys/contracts";
import { createDiagnostic, type Diagnostic } from "@zsys/diagnostics";

export const CONVENTION_CODES = Object.freeze({
  directory: "ZSYS_CONVENTION_DIRECTORY",
  suffix: "ZSYS_CONVENTION_SUFFIX",
  export: "ZSYS_CONVENTION_EXPORT",
  multipleKinds: "ZSYS_CONVENTION_MULTIPLE_KINDS",
  idStyle: "ZSYS_CONVENTION_ID_STYLE",
} as const);

export type ConventionCode = (typeof CONVENTION_CODES)[keyof typeof CONVENTION_CODES];

export interface ConventionExport {
  readonly name?: string;
  readonly isDefault?: boolean;
  readonly defaultExport?: boolean;
}

export interface ConventionCheckInput {
  readonly descriptor: unknown;
  readonly sourcePath: string;
  readonly projectRoot?: string;
  readonly location?: Pick<SourceLocation, "line" | "column">;
  readonly exportName?: string;
  readonly exportKind?: "default" | "named" | "none";
  readonly isDefaultExport?: boolean;
  readonly defaultExport?: boolean;
  readonly exports?: readonly ConventionExport[];
  readonly fileDescriptors?: readonly unknown[];
  readonly fileKinds?: readonly unknown[];
}

export type ConventionCheckOptions = Omit<ConventionCheckInput, "descriptor" | "sourcePath">;

type KindRule = {
  readonly directory: string;
  readonly suffix: string;
};

const rules: Readonly<Record<DescriptorKind, KindRule>> = {
  app: { directory: "src", suffix: "app.ts" },
  function: { directory: "src/functions", suffix: ".function.ts" },
  service: { directory: "src/services", suffix: ".service.ts" },
  route: { directory: "src/routes", suffix: "route.ts" },
  middleware: { directory: "src/middleware", suffix: ".middleware.ts" },
  job: { directory: "src/jobs", suffix: ".job.ts" },
  event: { directory: "src/events", suffix: ".event.ts" },
  "event-trigger": { directory: "src/events", suffix: ".event.ts" },
  bucket: { directory: "src/buckets", suffix: ".bucket.ts" },
  cache: { directory: "src/cache", suffix: ".cache.ts" },
  tool: { directory: "src/tools", suffix: ".tool.ts" },
  agent: { directory: "src/agents", suffix: ".agent.ts" },
};

export function checkConventions(input: ConventionCheckInput): readonly Diagnostic[];
export function checkConventions(
  descriptor: unknown,
  sourcePath: string,
  options?: ConventionCheckOptions,
): readonly Diagnostic[];
export function checkConventions(
  inputOrDescriptor: ConventionCheckInput | unknown,
  sourcePath?: string,
  options: ConventionCheckOptions = {},
): readonly Diagnostic[] {
  const input = readInput(inputOrDescriptor, sourcePath, options);
  if (input === undefined || !isDescriptor(input.descriptor)) return Object.freeze([]);

  const path = normalizePath(input.sourcePath, input.projectRoot);
  const descriptor = input.descriptor;
  const rule = rules[descriptor.kind];
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
  if (descriptor.kind !== "route" && !path.startsWith(`${rule.directory}/`)) {
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
}

function readInput(
  value: ConventionCheckInput | unknown,
  sourcePath: string | undefined,
  options: ConventionCheckOptions,
): ConventionCheckInput | undefined {
  if (sourcePath !== undefined) {
    return { ...options, descriptor: value, sourcePath };
  }
  if (!isRecord(value) || typeof value.descriptor === "undefined") return undefined;
  return value as unknown as ConventionCheckInput;
}

function normalizePath(value: string, projectRoot: string | undefined): string {
  try {
    return normalizeSourcePath(value, projectRoot);
  } catch {
    return value.replaceAll("\\", "/").replace(/^\.\//, "");
  }
}

function diagnosticLocation(path: string, input: ConventionCheckInput): SourceLocation | undefined {
  if (path === "" || /^(?:\/|[A-Za-z]:\/|\/\/)/.test(path)) return undefined;
  return {
    file: path,
    line: input.location?.line ?? 1,
    column: input.location?.column ?? 1,
  };
}

function recommendedPattern(rule: KindRule): string {
  return rule.directory === "src" ? "src/app.ts" : `${rule.directory}/**/*${rule.suffix}`;
}

function hasExportWarning(input: ConventionCheckInput): boolean {
  if (input.exports !== undefined) {
    return !input.exports.some(
      (entry) => entry.isDefault ?? entry.defaultExport ?? entry.name === "default",
    );
  }
  if (input.isDefaultExport !== undefined) return !input.isDefaultExport;
  if (input.defaultExport !== undefined) return !input.defaultExport;
  if (input.exportKind !== undefined) return input.exportKind !== "default";
  if (input.exportName !== undefined) return input.exportName !== "default";
  return false;
}

function descriptorKinds(input: ConventionCheckInput, descriptor: DescriptorAny): DescriptorKind[] {
  const kinds = new Set<DescriptorKind>([descriptor.kind]);
  for (const kind of input.fileKinds ?? []) {
    if (isDescriptorKind(kind)) kinds.add(kind);
  }
  for (const candidate of input.fileDescriptors ?? []) {
    if (isDescriptor(candidate)) kinds.add(candidate.kind);
  }
  return [...kinds].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
