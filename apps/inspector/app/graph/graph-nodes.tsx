"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { Reply, ShieldAlert, Table2 } from "lucide-react";
import { NODE_CATEGORIES } from "../../lib/graph-semantics";
import type { ViewNode } from "../../lib/graph-views";
import { AccessMark, CATEGORY_ICONS, Icon, Ports, cardProps } from "./graph-node-parts";

export { CATEGORY_ICONS };

export interface ExplorerNodeData extends Record<string, unknown> {
  readonly view: ViewNode;
  readonly selected: boolean;
  readonly dimmed: boolean;
}

export interface StageNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly note?: string;
  readonly orientation: "column" | "row";
}

export type ExplorerNode = Node<
  ExplorerNodeData,
  "service" | "group" | "item" | "table" | "stub" | "response"
>;
export type StageNode = Node<StageNodeData, "stage">;

export function ServiceNode({ data }: NodeProps<ExplorerNode>) {
  const { view } = data;
  return (
    <article
      {...cardProps(data, "service")}
      aria-label={`${NODE_CATEGORIES[view.category].label} ${view.title}`}
    >
      <Ports />
      <header className="explorer-card__head">
        <Icon category={view.category} />
        <div className="explorer-card__text">
          <strong className="explorer-card__title">{view.title}</strong>
          {view.subtitle && <span className="explorer-card__subtitle">{view.subtitle}</span>}
        </div>
        <AccessMark view={view} />
      </header>
      {view.counts && view.counts.length > 0 && (
        <ul className="explorer-card__counts" aria-label="Contents">
          {view.counts.map((count) => (
            <li key={count.label}>
              <b>{count.value}</b> {count.label}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function GroupNode({ data }: NodeProps<ExplorerNode>) {
  const { view } = data;
  return (
    <section
      className="explorer-group"
      data-selected={data.selected ? "true" : undefined}
      data-dimmed={data.dimmed ? "true" : undefined}
      aria-label={`${view.title} domain`}
      style={
        { "--node-color": `var(${NODE_CATEGORIES[view.category].token})` } as React.CSSProperties
      }
    >
      <Ports />
      <header className="explorer-card__head explorer-group__head">
        <Icon category={view.category} />
        <div className="explorer-card__text">
          <span className="explorer-group__eyebrow">Domain</span>
          <strong className="explorer-card__title">{view.title}</strong>
          {view.subtitle && <span className="explorer-card__subtitle">{view.subtitle}</span>}
        </div>
      </header>
    </section>
  );
}

export function ItemNode({ data }: NodeProps<ExplorerNode>) {
  const { view } = data;
  const label = [NODE_CATEGORIES[view.category].label, ...(view.badges ?? []), view.title].join(
    " ",
  );
  return (
    <article {...cardProps(data, "item")} aria-label={label}>
      <Ports />
      <div className="explorer-card__text">
        <span className="explorer-card__row">
          <Icon category={view.category} />
          {view.badges?.map((badge) => (
            <span key={badge} className="explorer-chip">
              {badge}
            </span>
          ))}
          <strong className="explorer-card__title">{view.title}</strong>
          <AccessMark view={view} />
        </span>
        {view.subtitle && <span className="explorer-card__subtitle">{view.subtitle}</span>}
      </div>
    </article>
  );
}

export function TableNode({ data }: NodeProps<ExplorerNode>) {
  const { view } = data;
  return (
    <article {...cardProps(data, "table")} aria-label={`Table ${view.title}`}>
      <Ports />
      <div className="explorer-card__text">
        <span className="explorer-card__row">
          <Table2 aria-hidden="true" className="explorer-card__icon" />
          <strong className="explorer-card__title">{view.title}</strong>
        </span>
        {view.subtitle && <span className="explorer-card__subtitle">{view.subtitle}</span>}
      </div>
    </article>
  );
}

export function StubNode({ data }: NodeProps<ExplorerNode>) {
  const { view } = data;
  return (
    <article
      {...cardProps(data, "stub")}
      aria-label={`${NODE_CATEGORIES[view.category].label} ${view.title}${view.domainId ? ` in ${view.domainId}` : ""}`}
    >
      <Ports />
      <div className="explorer-card__text">
        <span className="explorer-card__row">
          <Icon category={view.category} />
          <strong className="explorer-card__title">{view.title}</strong>
        </span>
        {view.domainId && <span className="explorer-card__subtitle">{view.domainId}</span>}
      </div>
    </article>
  );
}

export function ResponseNode({ data }: NodeProps<ExplorerNode>) {
  const { view } = data;
  return (
    <article {...cardProps(data, "response")} aria-label={`Response ${view.title}`}>
      <Ports />
      <div className="explorer-card__text">
        <span className="explorer-card__row">
          {view.category === "error" ? (
            <ShieldAlert aria-hidden="true" className="explorer-card__icon" />
          ) : (
            <Reply aria-hidden="true" className="explorer-card__icon" />
          )}
          {view.badges?.map((badge) => (
            <span key={badge} className="explorer-chip">
              {badge}
            </span>
          ))}
          <strong className="explorer-card__title">{view.title}</strong>
        </span>
        {view.subtitle && <span className="explorer-card__subtitle">{view.subtitle}</span>}
      </div>
    </article>
  );
}

export function StageHeaderNode({ data }: NodeProps<StageNode>) {
  return (
    <div className="explorer-stage" data-orientation={data.orientation} aria-hidden="true">
      <span className="explorer-stage__label">{data.label}</span>
      {data.note && <span className="explorer-stage__note">{data.note}</span>}
    </div>
  );
}

export const explorerNodeTypes = {
  service: ServiceNode,
  group: GroupNode,
  item: ItemNode,
  table: TableNode,
  stub: StubNode,
  response: ResponseNode,
  stage: StageHeaderNode,
};
