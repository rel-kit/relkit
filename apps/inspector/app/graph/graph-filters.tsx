"use client";

import { Globe2, type LucideIcon, X } from "lucide-react";
import { FILTERS, type FilterId, NODE_CATEGORIES } from "../../lib/graph-semantics";
import { CATEGORY_ICONS } from "./graph-nodes";

/** Visual groups in the bar: entry points, application, async and AI, data and failure. */
const GROUPS: readonly (readonly FilterId[])[] = [
  ["routes", "streams", "middleware", "auth"],
  ["services", "functions", "listeners"],
  ["events", "channels"],
  ["agents", "tools"],
  ["data", "errors"],
];

function iconFor(id: FilterId): LucideIcon {
  const filter = FILTERS.find((item) => item.id === id);
  const category = filter?.categories[0];
  return category === undefined ? Globe2 : CATEGORY_ICONS[category];
}

function tokenFor(id: FilterId): string {
  const category = FILTERS.find((item) => item.id === id)?.categories[0];
  return category === undefined ? "--muted" : NODE_CATEGORIES[category].token;
}

/**
 * Icon-only kind selector. Nothing selected shows everything; selecting kinds shows only those,
 * and deselecting the last one goes back to everything. A kind with nothing to show in the
 * current view is disabled rather than hidden, so the bar keeps its shape between views.
 */
export function GraphFilters({
  selected,
  available,
  platform,
  onToggle,
  onClear,
  onPlatform,
}: {
  readonly selected: ReadonlySet<FilterId>;
  readonly available: Readonly<Partial<Record<FilterId, number>>>;
  readonly platform: boolean;
  readonly onToggle: (id: FilterId) => void;
  readonly onClear: () => void;
  readonly onPlatform: () => void;
}) {
  const filtering = selected.size > 0;
  return (
    <div
      className="explorer-filters"
      role="toolbar"
      aria-label="Show only these kinds"
      data-filtering={filtering ? "true" : undefined}
    >
      {GROUPS.map((group) => (
        <div key={group.join("-")} className="explorer-filters__group">
          {group.map((id) => {
            const filter = FILTERS.find((item) => item.id === id)!;
            const count = available[id] ?? 0;
            const on = selected.has(id);
            const Icon = iconFor(id);
            const name =
              id === "middleware" ? "routes behind middleware" : filter.label.toLowerCase();
            const label =
              count === 0 && !on
                ? `${filter.label}: none in this view`
                : on
                  ? `Stop showing only ${name}`
                  : filtering
                    ? `Also show ${name} (${count})`
                    : `Show only ${name} (${count})`;
            return (
              <button
                key={id}
                type="button"
                className="explorer-filter"
                aria-pressed={on}
                aria-label={label}
                title={label}
                disabled={count === 0 && !on}
                onClick={() => onToggle(id)}
                style={{ "--node-color": `var(${tokenFor(id)})` } as React.CSSProperties}
              >
                <Icon aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ))}
      <div className="explorer-filters__group">
        <button
          type="button"
          className="explorer-filter"
          aria-pressed={platform}
          aria-label={platform ? "Hide providers" : "Show providers"}
          title={platform ? "Hide providers" : "Show providers"}
          onClick={onPlatform}
          style={{ "--node-color": "var(--kind-platform)" } as React.CSSProperties}
        >
          <Globe2 aria-hidden="true" />
        </button>
      </div>
      {filtering && (
        <div className="explorer-filters__group">
          <button type="button" className="explorer-filters__clear" onClick={onClear}>
            <X aria-hidden="true" />
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
