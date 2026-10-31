"use client";

/** What the Details panel shows when nothing is selected: a summary of the current view. */
import type { AppHierarchy } from "../../lib/graph-hierarchy";
import type { GraphView } from "../../lib/graph-views";
import { NodeButton, Section } from "./graph-inspector-parts";

export function ViewSummary({
  hierarchy,
  view,
  onSelect,
}: {
  readonly hierarchy: AppHierarchy;
  readonly view: GraphView;
  readonly onSelect: (id: string) => void;
}) {
  if (view.mode === "architecture") {
    return (
      <div className="explorer-inspector__body">
        <header className="explorer-inspector__head">
          <span className="explorer-kind">Application</span>
          <h2 className="explorer-inspector__title">{hierarchy.appId}</h2>
          <p className="explorer-inspector__description">
            Route groups sit on top and point to the domain that handles them. Each domain card is a
            service with its functions, events and channels; arrows show which domains call, publish
            to, or read from each other.
          </p>
        </header>
        <Section title="Domains" hint={String(hierarchy.domains.length)}>
          <ul className="explorer-relations">
            {hierarchy.domains.map((domain) => (
              <NodeButton
                key={domain.id}
                hierarchy={hierarchy}
                id={domain.id}
                onSelect={onSelect}
                hint={`${domain.functions.length} fn`}
              />
            ))}
          </ul>
        </Section>
        <Section title="Platform">
          <ul className="explorer-relations">
            {hierarchy.platform.database && (
              <NodeButton
                hierarchy={hierarchy}
                id={hierarchy.platform.database.id}
                onSelect={onSelect}
                hint={`${hierarchy.platform.tables.length} tables`}
              />
            )}
            {hierarchy.platform.auth && (
              <NodeButton
                hierarchy={hierarchy}
                id={hierarchy.platform.auth.id}
                onSelect={onSelect}
              />
            )}
          </ul>
        </Section>
      </div>
    );
  }
  if (view.mode === "flow") {
    return (
      <div className="explorer-inspector__body">
        <header className="explorer-inspector__head">
          <span className="explorer-kind">Request flow</span>
          <h2 className="explorer-inspector__title">{view.title}</h2>
          <p className="explorer-inspector__description">
            Read stage by stage: the request, the function that handles it, what that function
            calls, the tables it touches, the events it publishes, who listens, what gets pushed to
            clients, and finally what the caller gets back.
          </p>
        </header>
        <Section title="Stages">
          <ol className="explorer-stages">
            {(view.stages ?? []).map((stage) => (
              <li key={stage.id}>
                <b>{stage.label}</b>
                <span>{view.nodes.filter((node) => node.stage === stage.id).length}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    );
  }
  return (
    <div className="explorer-inspector__body">
      <header className="explorer-inspector__head">
        <span className="explorer-kind">Domain</span>
        <h2 className="explorer-inspector__title">{view.title}</h2>
        <p className="explorer-inspector__description">
          Routes call the functions that handle them; functions publish events and push to channels.
          Dashed cards belong to other domains.
        </p>
      </header>
    </div>
  );
}
