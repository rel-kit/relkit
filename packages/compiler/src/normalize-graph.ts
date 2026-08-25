import { GRAPH_VERSION } from "@zsys/contracts";
import { canonicalizeGraph, hashGraph as hashCanonicalGraph } from "@zsys/graph";
import { buildGraphEdges } from "./normalize-graph-edges.js";
import { buildGraphNodes } from "./normalize-graph-nodes.js";
import type { NormalizedGraph, NormalizationWork } from "./normalize-types.js";

export function buildGraph(work: NormalizationWork): NormalizedGraph {
  const app = work.descriptors.find((descriptor) => descriptor.kind === "app");
  const nodes = buildGraphNodes(work);
  work.nodes = nodes;
  const edges = buildGraphEdges(work);
  work.edges = edges;
  return canonicalizeGraph(
    {
      contractVersion: GRAPH_VERSION,
      ...(app === undefined ? {} : { appId: app.id }),
      nodes,
      edges,
    },
    work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot },
  ) as NormalizedGraph;
}

export function hashGraph(graph: NormalizedGraph): string {
  return hashCanonicalGraph(graph);
}
