"use client";

/** Category icons and the pieces every canvas card shares: ports, card attributes, access mark. */
import { Handle, Position } from "@xyflow/react";
import {
  Bot,
  Boxes,
  KeyRound,
  Lock,
  ShieldCheck,
  Waves,
  Database,
  Globe2,
  type LucideIcon,
  Radio,
  RadioTower,
  Route,
  ShieldAlert,
  SquareFunction,
  Table2,
  Wrench,
  Zap,
} from "lucide-react";
import { NODE_CATEGORIES, type NodeCategory } from "../../lib/graph-semantics";
import type { ViewNode } from "../../lib/graph-views";
import type { ExplorerNodeData } from "./graph-nodes";

export const CATEGORY_ICONS: Readonly<Record<NodeCategory, LucideIcon>> = {
  app: Boxes,
  service: Boxes,
  route: Route,
  stream: Waves,
  middleware: ShieldCheck,
  auth: KeyRound,
  database: Database,
  function: SquareFunction,
  listener: Zap,
  event: Radio,
  channel: RadioTower,
  table: Table2,
  agent: Bot,
  tool: Wrench,
  error: ShieldAlert,
  platform: Globe2,
};

/** Invisible handles on every side; the canvas picks the pair that suits each edge. */
export function Ports() {
  return (
    <>
      <Handle
        type="target"
        id="top"
        position={Position.Top}
        className="explorer-port"
        isConnectable={false}
      />
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        className="explorer-port"
        isConnectable={false}
      />
      <Handle
        type="target"
        id="bottom"
        position={Position.Bottom}
        className="explorer-port"
        isConnectable={false}
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="explorer-port"
        isConnectable={false}
      />
      <Handle
        type="source"
        id="down"
        position={Position.Bottom}
        className="explorer-port"
        isConnectable={false}
      />
      <Handle
        type="source"
        id="up"
        position={Position.Top}
        className="explorer-port"
        isConnectable={false}
      />
      <Handle
        type="source"
        id="left-out"
        position={Position.Left}
        className="explorer-port"
        isConnectable={false}
      />
      <Handle
        type="target"
        id="right-in"
        position={Position.Right}
        className="explorer-port"
        isConnectable={false}
      />
    </>
  );
}

export function cardProps(data: ExplorerNodeData, type: string) {
  return {
    className: "explorer-card",
    "data-type": type,
    "data-category": data.view.category,
    "data-selected": data.selected ? "true" : undefined,
    "data-dimmed": data.dimmed ? "true" : undefined,
    style: {
      "--node-color": `var(${NODE_CATEGORIES[data.view.category].token})`,
    } as React.CSSProperties,
  };
}

export function Icon({ category }: { readonly category: NodeCategory }) {
  const Component = CATEGORY_ICONS[category];
  return <Component aria-hidden="true" className="explorer-card__icon" />;
}

/** Lock on routes (and route groups) that pass through middleware; a count when there are several. */
export function AccessMark({ view }: { readonly view: ViewNode }) {
  const guards = view.guards ?? [];
  if (guards.length === 0) return null;
  const label = view.guardNote ?? `Passes through ${guards.join(" → ")}`;
  return (
    <span className="explorer-lock" title={label}>
      <Lock aria-hidden="true" />
      {guards.length > 1 && <span className="explorer-lock__count">{guards.length}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}
