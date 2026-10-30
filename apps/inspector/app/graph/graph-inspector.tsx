"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { GraphNode, GraphSnapshot } from "../../lib/graph-model";
import { type AppHierarchy, domainOf } from "../../lib/graph-hierarchy";
import {
  isListener,
  isRoute,
  nodeDescription,
  nodeSource,
  nodeTitle,
} from "../../lib/graph-node-meta";
import { CATEGORY_ICONS as icons } from "./graph-nodes";
import { NODE_CATEGORIES, nodeCategory, nodeKindLabel } from "../../lib/graph-semantics";
import type { GraphView } from "../../lib/graph-views";
import { SourceLink } from "../source-link";
import { Relations } from "./graph-inspector-connections";
import {
  ChannelDetails,
  EventDetails,
  FunctionDetails,
  ServiceDetails,
  TableDetails,
} from "./graph-inspector-details";
import { ListenerDetails, RouteDetails, RouteGroupDetails } from "./graph-inspector-routes";
import {
  AgentDetails,
  EnvDetails,
  ErrorDetails,
  ProviderDetails,
  ToolDetails,
} from "./graph-inspector-runtime";
import { ViewSummary } from "./graph-inspector-summary";

export function GraphInspector({
  hierarchy,
  graph,
  view,
  nodeId,
  canFollow,
  onSelect,
  onFollow,
  onOpenDomain,
}: {
  readonly hierarchy: AppHierarchy;
  readonly graph: GraphSnapshot;
  readonly view: GraphView;
  readonly nodeId: string | undefined;
  readonly canFollow: (id: string) => boolean;
  readonly onSelect: (id: string) => void;
  readonly onFollow: (id: string) => void;
  readonly onOpenDomain: (id: string) => void;
}) {
  const node = nodeId === undefined ? undefined : hierarchy.nodes.get(nodeId);
  if (node === undefined)
    return <ViewSummary hierarchy={hierarchy} view={view} onSelect={onSelect} />;
  const category = nodeCategory(node);
  const Icon = icons[category];
  const domain = domainOf(hierarchy, node.id);
  const description = nodeDescription(node);
  const source = nodeSource(node);
  return (
    <div className="explorer-inspector__body">
      <header className="explorer-inspector__head">
        <span
          className="explorer-kind"
          style={
            { "--node-color": `var(${NODE_CATEGORIES[category].token})` } as React.CSSProperties
          }
        >
          <Icon aria-hidden="true" />
          {nodeKindLabel(node)}
        </span>
        <h2 className="explorer-inspector__title">{nodeTitle(node)}</h2>
        <p className="explorer-inspector__id">
          <code>{node.id}</code>
        </p>
        <div className="explorer-inspector__meta">
          {domain && (
            <button type="button" className="explorer-link" onClick={() => onOpenDomain(domain.id)}>
              {domain.id} domain
            </button>
          )}
          {source && <SourceLink source={source} />}
        </div>
        {description && <p className="explorer-inspector__description">{description}</p>}
      </header>
      <div className="explorer-inspector__actions">
        {canFollow(node.id) && (
          <Button size="sm" onPress={() => onFollow(node.id)}>
            Follow request
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Button>
        )}
        {node.kind === "service" && hierarchy.domains.some((item) => item.id === node.id) && (
          <Button size="sm" onPress={() => onOpenDomain(node.id)}>
            Open domain
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Button>
        )}
        <DetailPageLink node={node} />
      </div>
      <NodeDetails hierarchy={hierarchy} graph={graph} node={node} onSelect={onSelect} />
    </div>
  );
}

function DetailPageLink({ node }: { readonly node: GraphNode }) {
  const href = detailHref(node);
  if (href === undefined) return null;
  return (
    <Link href={href} className="explorer-link explorer-link--page">
      Open page
      <ExternalLink aria-hidden="true" className="size-3" />
    </Link>
  );
}

function detailHref(node: GraphNode): string | undefined {
  const id = encodeURIComponent(node.id);
  if (isRoute(node)) return `/routes/${id}`;
  if (node.kind === "route-group") return "/routes";
  if (node.kind === "function") return `/functions/${id}`;
  if (node.kind === "service") return `/domains/${id}`;
  if (node.kind === "event") return `/events`;
  if (node.kind === "channel") return `/channels`;
  if (node.kind === "agent") return `/agents`;
  if (node.kind === "graph") return `/graphs/${id}`;
  if (node.kind === "tool") return `/tools`;
  if (node.kind === "error") return `/errors`;
  if (node.kind === "env") return `/env`;
  if (node.kind === "provider") return `/providers`;
  if (node.kind === "job") return `/jobs`;
  return undefined;
}

function NodeDetails({
  hierarchy,
  graph,
  node,
  onSelect,
}: {
  readonly hierarchy: AppHierarchy;
  readonly graph: GraphSnapshot;
  readonly node: GraphNode;
  readonly onSelect: (id: string) => void;
}) {
  if (isRoute(node)) return <RouteDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
  if (node.kind === "route-group")
    return <RouteGroupDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
  if (isListener(node))
    return <ListenerDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
  switch (node.kind) {
    case "function":
      return <FunctionDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
    case "service":
      return <ServiceDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
    case "table":
      return <TableDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
    case "event":
      return <EventDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
    case "channel":
      return <ChannelDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
    case "agent":
    case "graph":
      return <AgentDetails hierarchy={hierarchy} graph={graph} node={node} onSelect={onSelect} />;
    case "tool":
      return <ToolDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
    case "error":
      return <ErrorDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
    case "env":
      return <EnvDetails node={node} />;
    case "provider":
      return <ProviderDetails hierarchy={hierarchy} node={node} onSelect={onSelect} />;
    default:
      return <Relations hierarchy={hierarchy} node={node} onSelect={onSelect} />;
  }
}
