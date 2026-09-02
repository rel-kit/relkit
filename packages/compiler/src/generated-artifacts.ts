import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
import { LOCAL_SERVICE_PLAN_FILE, LOCAL_SERVICE_PLAN_VERSION } from "@relkit/local-service";
import type { GeneratedOutputs } from "./normalize-types.js";

export const GENERATED_ARTIFACT_FILES = Object.freeze({
  graph: "application.graph.json",
  manifest: "runtime.manifest.ts",
  runtimeActivation: "runtime-activation.json",
  runtimeIntegrations: RUNTIME_INTEGRATION_PLAN_FILE,
  runtimeIntegrationImports: "runtime-integrations.ts",
  localServices: LOCAL_SERVICE_PLAN_FILE,
  diagnostics: "diagnostics.json",
  contract: "contract.ts",
  clientContract: "client-contract.json",
} as const);

export const GENERATED_ARTIFACT_VERSIONS = Object.freeze({
  graph: GRAPH_VERSION,
  manifest: MANIFEST_VERSION,
  runtimeActivation: GENERATOR_VERSION,
  runtimeIntegrations: RUNTIME_INTEGRATION_PLAN_VERSION,
  runtimeIntegrationImports: GENERATOR_VERSION,
  localServices: LOCAL_SERVICE_PLAN_VERSION,
  diagnostics: CONTRACT_VERSION,
  contract: CONTRACT_VERSION,
  clientContract: CONTRACT_VERSION,
  generator: GENERATOR_VERSION,
} as const);

const GENERATED_ARTIFACT_KINDS = [
  "graph",
  "manifest",
  "runtimeActivation",
  "runtimeIntegrations",
  "runtimeIntegrationImports",
  "localServices",
  "diagnostics",
  "contract",
  "clientContract",
] as const;

export const GENERATED_EXTENSION_VERSIONS = Object.freeze({
  openapi: Object.freeze({ fileName: "openapi.json", version: 1 }),
  client: Object.freeze({ fileName: "client.ts", version: 1 }),
  deploymentPlan: Object.freeze({ fileName: "deployment.plan.json", version: 1 }),
} as const);

export type GeneratedExtensionKind = keyof typeof GENERATED_EXTENSION_VERSIONS;

/** A future generator's versioned artifact input. Deployment is opt-in by passing it. */
export interface GeneratedOutputExtension {
  readonly kind: GeneratedExtensionKind;
  readonly version: number;
  readonly content: string;
}

export interface GeneratedArtifact {
  readonly fileName: string;
  readonly content: string;
  readonly version: number;
}

export interface ArtifactWriteResult {
  readonly fileName: string;
  readonly path: string;
  readonly changed: boolean;
  readonly bytes: number;
}

export interface GeneratedArtifactsWriteOptions {
  readonly directory: string;
  readonly extensions?: readonly GeneratedOutputExtension[];
}

export interface GeneratedArtifactsWriteReport {
  readonly writes: readonly ArtifactWriteResult[];
  readonly changed: boolean;
}

/** Builds compiler-owned artifacts without adding time or process metadata. */
export function generatedArtifacts(outputs: GeneratedOutputs): readonly GeneratedArtifact[] {
  return Object.freeze(
    GENERATED_ARTIFACT_KINDS.map((kind) =>
      artifact(GENERATED_ARTIFACT_FILES[kind], outputs[kind], GENERATED_ARTIFACT_VERSIONS[kind]),
    ),
  );
}

/** Creates the future OpenAPI/client/deployment extension seam with its pinned version. */
export function createGeneratedOutputExtension(
  kind: GeneratedExtensionKind,
  content: string,
): GeneratedOutputExtension {
  if (typeof content !== "string") throw new TypeError("Generated artifact content must be text.");
  return Object.freeze({ kind, version: GENERATED_EXTENSION_VERSIONS[kind].version, content });
}

/** Writes changed bytes only; the unchanged path is never opened for writing. */
export async function writeIfChanged(
  filePath: string,
  content: string,
): Promise<ArtifactWriteResult> {
  const next = Buffer.from(content, "utf8");
  let unchanged = false;
  try {
    unchanged = (await readFile(filePath)).equals(next);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  if (!unchanged) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, next, { flag: "wx" });
      await rename(temporary, filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return Object.freeze({
    fileName: basename(filePath),
    path: filePath,
    changed: !unchanged,
    bytes: next.byteLength,
  });
}

/** Writes compiler artifacts plus content-aware OpenAPI/client and explicit extensions. */
export async function writeGeneratedArtifacts(
  outputs: GeneratedOutputs,
  options: GeneratedArtifactsWriteOptions,
): Promise<GeneratedArtifactsWriteReport> {
  const explicitExtensions = options.extensions ?? [];
  const extensionKinds = new Set<GeneratedExtensionKind>();
  for (const extension of explicitExtensions) {
    if (extensionKinds.has(extension.kind)) {
      throw new TypeError(`Generated ${extension.kind} extension was supplied more than once.`);
    }
    extensionKinds.add(extension.kind);
  }
  const contentExtensions = (
    await Promise.all(
      (["openapi", "client"] as const).map(async (kind) => {
        if (extensionKinds.has(kind)) return undefined;
        const content = outputs[kind];
        const filePath = join(options.directory, GENERATED_EXTENSION_VERSIONS[kind].fileName);
        if (content === "" && !(await Bun.file(filePath).exists())) return undefined;
        return createGeneratedOutputExtension(kind, content);
      }),
    )
  ).filter((extension): extension is GeneratedOutputExtension => extension !== undefined);
  const artifacts = [
    ...generatedArtifacts(outputs),
    ...contentExtensions.map(extensionArtifact),
    ...explicitExtensions.map(extensionArtifact),
  ].sort((left, right) => left.fileName.localeCompare(right.fileName));
  const results = await Promise.all(
    artifacts.map((entry) =>
      writeIfChanged(join(options.directory, entry.fileName), entry.content),
    ),
  );
  return Object.freeze({
    writes: Object.freeze(results),
    changed: results.some((result) => result.changed),
  });
}

function artifact(fileName: string, content: string, version: number): GeneratedArtifact {
  return Object.freeze({ fileName, content, version });
}

function extensionArtifact(extension: GeneratedOutputExtension): GeneratedArtifact {
  const expected = GENERATED_EXTENSION_VERSIONS[extension.kind];
  if (extension.version !== expected.version) {
    throw new TypeError(
      `Generated ${extension.kind} version ${extension.version} is unsupported; expected ${expected.version}. Regenerate with \`relkit check\`.`,
    );
  }
  if (typeof extension.content !== "string") {
    throw new TypeError(`Generated ${extension.kind} content must be text.`);
  }
  return artifact(expected.fileName, extension.content, extension.version);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
