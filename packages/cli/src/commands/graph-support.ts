import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GRAPH_VERSION } from "@relkit/contracts";
import {
  canonicalGraphJson,
  canonicalizeGraph,
  diffGraph as diffCanonicalGraph,
  hashGraph,
  validateGraphShape,
  type ApplicationGraph,
  type GraphDiff,
} from "@relkit/graph";

const GRAPH_FILE = "application.graph.json";
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export class GraphCommandError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GraphCommandError";
    this.code = code;
  }
}

export interface GraphFileOptions {
  readonly projectRoot?: string;
  readonly graphPath?: string;
}
export interface GraphPrintResult {
  readonly ok: true;
  readonly command: "print";
  readonly graphPath: string;
  readonly graphHash: string;
  readonly graph: ApplicationGraph;
}
export interface GraphCheckResult {
  readonly ok: true;
  readonly command: "check";
  readonly graphPath: string;
  readonly graphHash: string;
  readonly expectedHash?: string;
}
export interface GraphDiffResult extends GraphDiff {
  readonly ok: true;
  readonly command: "diff";
  readonly beforePath: string;
  readonly afterPath: string;
  readonly beforeHash: string;
  readonly afterHash: string;
}

/** Reads and canonicalizes a graph artifact without loading source or runtime code. */
export async function readGraphFile(options: GraphFileOptions = {}) {
  const root = resolve(options.projectRoot ?? process.cwd());
  const path = resolve(root, options.graphPath ?? join(".relkit", "generated", GRAPH_FILE));
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && error.code === "ENOENT"
        ? "RELKIT_GRAPH_NOT_FOUND"
        : "RELKIT_GRAPH_INVALID";
    const detail = code === "RELKIT_GRAPH_NOT_FOUND" ? "was not found" : "is not valid JSON";
    throw new GraphCommandError(code, `Graph file ${detail}: ${path}`);
  }
  if (!isRecord(value)) invalid(path, "the root must be an object");
  if (value.contractVersion !== GRAPH_VERSION) {
    throw new GraphCommandError(
      "RELKIT_GRAPH_VERSION_UNSUPPORTED",
      `Graph contract version ${String(value.contractVersion)} is unsupported; expected ${GRAPH_VERSION}. Regenerate with \`relkit check\`: ${path}`,
    );
  }
  try {
    validateGraphShape(value, root);
  } catch (error) {
    invalid(path, error instanceof Error ? error.message : String(error));
  }
  const graph = canonicalizeGraph(value as unknown as ApplicationGraph, { projectRoot: root });
  return Object.freeze({ path, graph, hash: hashGraph(graph), json: canonicalGraphJson(graph) });
}

export async function printGraph(options: GraphFileOptions = {}): Promise<GraphPrintResult> {
  const loaded = await readGraphFile(options);
  return Object.freeze({
    ok: true,
    command: "print",
    graphPath: loaded.path,
    graphHash: loaded.hash,
    graph: loaded.graph,
  });
}

export async function checkGraph(
  options: GraphFileOptions & { readonly expectedHash?: string } = {},
): Promise<GraphCheckResult> {
  const loaded = await readGraphFile(options);
  if (options.expectedHash !== undefined) {
    assertHash(options.expectedHash, "expected graph hash");
    if (options.expectedHash !== loaded.hash)
      throw new GraphCommandError(
        "RELKIT_GRAPH_HASH_MISMATCH",
        `Expected graph hash ${JSON.stringify(options.expectedHash)} but calculated ${JSON.stringify(loaded.hash)}.`,
      );
  }
  return Object.freeze({
    ok: true,
    command: "check",
    graphPath: loaded.path,
    graphHash: loaded.hash,
    ...(options.expectedHash === undefined ? {} : { expectedHash: options.expectedHash }),
  });
}

export async function diffGraphFiles(
  beforePath: string,
  afterPath: string,
  options: Omit<GraphFileOptions, "graphPath"> = {},
): Promise<GraphDiffResult> {
  const before = await readGraphFile({ ...options, graphPath: beforePath });
  const after = await readGraphFile({ ...options, graphPath: afterPath });
  const diff = diffCanonicalGraph(before.graph, after.graph);
  return Object.freeze({
    ok: true,
    command: "diff",
    beforePath: before.path,
    afterPath: after.path,
    beforeHash: before.hash,
    afterHash: after.hash,
    ...diff,
  });
}

function assertHash(value: string, label: string): void {
  if (!HASH_PATTERN.test(value))
    throw new GraphCommandError(
      "RELKIT_GRAPH_HASH_INVALID",
      `${label} must use sha256:<64 lowercase hex>.`,
    );
}

function invalid(path: string, detail: string): never {
  throw new GraphCommandError("RELKIT_GRAPH_INVALID", `Invalid graph ${path}: ${detail}`);
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
