import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
} from "@relkit/contracts";
import type { Diagnostic } from "@relkit/diagnostics";
import type { GeneratedOutputs, NormalizedGraph } from "./normalize-types.js";

export const GENERATED_ARTIFACT_FILES = Object.freeze({
  graph: "application.graph.json",
  manifest: "runtime.manifest.ts",
  diagnostics: "diagnostics.json",
  contract: "contract.ts",
  clientContract: "client-contract.json",
} as const);

export const GENERATED_ARTIFACT_VERSIONS = Object.freeze({
  graph: GRAPH_VERSION,
  manifest: MANIFEST_VERSION,
  diagnostics: CONTRACT_VERSION,
  generator: GENERATOR_VERSION,
} as const);

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

/** Builds the three compiler-owned artifacts without adding time or process metadata. */
export function generatedArtifacts(outputs: GeneratedOutputs): readonly GeneratedArtifact[] {
  return Object.freeze([
    artifact(GENERATED_ARTIFACT_FILES.graph, outputs.graph, GENERATED_ARTIFACT_VERSIONS.graph),
    artifact(
      GENERATED_ARTIFACT_FILES.manifest,
      outputs.manifest,
      GENERATED_ARTIFACT_VERSIONS.manifest,
    ),
    artifact(
      GENERATED_ARTIFACT_FILES.diagnostics,
      outputs.diagnostics,
      GENERATED_ARTIFACT_VERSIONS.diagnostics,
    ),
    artifact(GENERATED_ARTIFACT_FILES.contract, outputs.contract, CONTRACT_VERSION),
    artifact(GENERATED_ARTIFACT_FILES.clientContract, outputs.clientContract, CONTRACT_VERSION),
  ]);
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
        if (content === "" && !(await fileExists(filePath))) return undefined;
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
      `Generated ${extension.kind} version ${extension.version} is unsupported; expected ${expected.version}.`,
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

export interface GeneratedOutputExtensionContext {
  readonly graph: NormalizedGraph;
  readonly graphHash: string;
  readonly diagnostics: readonly Diagnostic[];
}
