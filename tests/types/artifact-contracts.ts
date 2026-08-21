import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { ApplicationGraph } from "../../packages/graph/src/index.ts";
import type { RuntimeManifest } from "../../packages/runtime-effect/src/index.ts";

const graph: ApplicationGraph = {
  contractVersion: GRAPH_VERSION,
  nodes: [],
  edges: [],
};

const manifest: RuntimeManifest = {
  contractVersion: MANIFEST_VERSION,
  generatorVersion: GENERATOR_VERSION,
  graphHash: "sha256:current",
  functions: {},
  providers: {},
  middleware: {},
  requestTransforms: {},
};

const staleGraph: ApplicationGraph = {
  // @ts-expect-error stale graph contracts are not current application graphs
  contractVersion: 1,
  nodes: [],
  edges: [],
};

const staleManifest: RuntimeManifest = {
  // @ts-expect-error stale manifests are not current generated runtime manifests
  contractVersion: 1,
  generatorVersion: GENERATOR_VERSION,
  graphHash: "sha256:stale",
  functions: {},
  providers: {},
  middleware: {},
  requestTransforms: {},
};

void [graph, manifest, staleGraph, staleManifest];
