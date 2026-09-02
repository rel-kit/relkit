import {
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
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
  activationFingerprint: {
    graphHash: "sha256:current",
    manifestHash: "sha256:manifest",
    runtimeIntegrationsPlanHash: "sha256:runtime-integrations",
  },
  runtimeIntegrationsPlan: {
    version: RUNTIME_INTEGRATION_PLAN_VERSION,
    fileName: RUNTIME_INTEGRATION_PLAN_FILE,
    graphHash: "sha256:current",
  },
  functions: {},
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
  activationFingerprint: {
    graphHash: "sha256:stale",
    manifestHash: "sha256:manifest",
    runtimeIntegrationsPlanHash: "sha256:runtime-integrations",
  },
  runtimeIntegrationsPlan: {
    version: RUNTIME_INTEGRATION_PLAN_VERSION,
    fileName: RUNTIME_INTEGRATION_PLAN_FILE,
    graphHash: "sha256:stale",
  },
  functions: {},
  middleware: {},
  requestTransforms: {},
};

void [graph, manifest, staleGraph, staleManifest];
