import type { CSSProperties } from "react";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import { Field } from "../../components/ui/field";
import { graphKindColor, type GraphSnapshot } from "../../lib/graph-model";
import { GraphExecutionControls } from "./graph-execution-controls";

export function GraphToolbar({
  graph,
  filteredCount,
  search,
  kind,
  domain,
  kinds,
  domains,
  agents,
  onSearch,
  onKind,
  onDomain,
  onOverlay,
}: {
  readonly graph: GraphSnapshot;
  readonly filteredCount: number;
  readonly search: string;
  readonly kind: string;
  readonly domain: string;
  readonly kinds: readonly string[];
  readonly domains: readonly string[];
  readonly agents: readonly string[];
  readonly onSearch: (value: string) => void;
  readonly onKind: (value: string) => void;
  readonly onDomain: (value: string) => void;
  readonly onOverlay: (agentId: string, value: unknown) => void;
}) {
  return (
    <Card className="graph-toolbar" aria-label="Graph filters">
      <Field
        label="Search graph"
        value={search}
        onChange={onSearch}
        placeholder="Node ID or kind"
      />
      <Tabs
        label="Filter graph by node kind"
        active={kind}
        items={["all", ...kinds]}
        count={(id) =>
          id === "all" ? graph.nodes.length : graph.nodes.filter((node) => node.kind === id).length
        }
        onSelect={onKind}
      />
      <Tabs
        label="Filter graph by domain"
        active={domain}
        items={["all", ...domains]}
        count={(id) =>
          id === "all"
            ? graph.nodes.length
            : graph.nodes.filter((node) => node.domainId === id).length
        }
        onSelect={onDomain}
      />
      <Badge>
        {filteredCount} of {graph.nodes.length} nodes
      </Badge>
      <GraphExecutionControls agents={agents} onOverlay={onOverlay} />
    </Card>
  );
}

function Tabs({
  label,
  active,
  items,
  count,
  onSelect,
}: {
  readonly label: string;
  readonly active: string;
  readonly items: readonly string[];
  readonly count: (id: string) => number;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <div className="graph-kind-tabs" role="group" aria-label={label}>
      {items.map((id) => (
        <button
          key={id}
          type="button"
          className="graph-kind-tab"
          data-active={active === id}
          aria-pressed={active === id}
          style={
            { "--kind-color": id === "all" ? "var(--accent)" : graphKindColor(id) } as CSSProperties
          }
          onClick={() => onSelect(id)}
        >
          <span
            className="graph-kind-swatch"
            style={{ background: id === "all" ? "var(--accent)" : graphKindColor(id) }}
          />
          {readable(id)} <span className="graph-kind-count">{count(id)}</span>
        </button>
      ))}
    </div>
  );
}

function readable(value: string): string {
  return value === "all"
    ? "All"
    : value.replace(/[._-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}
