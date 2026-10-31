"use client";

/** The explorer's top bar: panel toggles, breadcrumb title, search and layout direction. */
import type { RefObject } from "react";
import {
  ArrowDownFromLine,
  ArrowRightFromLine,
  CornerLeftUp,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { type buildHierarchy, PLATFORM_OWNER } from "../../lib/graph-hierarchy";
import { nodeTitle } from "../../lib/graph-node-meta";
import { domainLocation, type GraphLocation, type resolveView } from "../../lib/graph-url-state";

export function ExplorerBar({
  hierarchy,
  location,
  view,
  direction,
  query,
  onQuery,
  searchRef,
  outlineOpen,
  onToggleOutline,
  inspectorOpen,
  onToggleInspector,
  onUp,
  navigate,
}: {
  readonly hierarchy: ReturnType<typeof buildHierarchy>;
  readonly location: GraphLocation;
  readonly view: ReturnType<typeof resolveView>;
  readonly direction: NonNullable<GraphLocation["dir"]>;
  readonly query: string;
  readonly onQuery: (value: string) => void;
  readonly searchRef: RefObject<HTMLInputElement | null>;
  readonly outlineOpen: boolean;
  readonly onToggleOutline: () => void;
  readonly inspectorOpen: boolean;
  readonly onToggleInspector: () => void;
  readonly onUp: () => void;
  readonly navigate: (next: GraphLocation) => void;
}) {
  const crumbs = breadcrumbs(hierarchy, location, view);
  return (
    <header className="explorer__bar">
      <div className="explorer__title">
        <Button
          variant="ghost"
          size="icon"
          aria-label={outlineOpen ? "Hide outline" : "Show outline"}
          aria-pressed={outlineOpen}
          onPress={onToggleOutline}
        >
          {outlineOpen ? (
            <PanelLeftClose aria-hidden="true" className="size-4" />
          ) : (
            <PanelLeftOpen aria-hidden="true" className="size-4" />
          )}
        </Button>
        {view.mode !== "architecture" && (
          <Button variant="ghost" size="icon" aria-label="Up one level (Esc)" onPress={onUp}>
            <CornerLeftUp aria-hidden="true" className="size-4" />
          </Button>
        )}
        <div className="explorer__title-text">
          <h2 id="explorer-heading">
            {crumbs.length > 1 && (
              <span className="explorer__title-context">
                {crumbs
                  .slice(0, -1)
                  .map((crumb) => crumb.label)
                  .join(" › ")}{" "}
                ›{" "}
              </span>
            )}
            {view.title}
          </h2>
          <p>{view.subtitle}</p>
        </div>
      </div>
      <div className="explorer__tools">
        <label className="explorer__search">
          <Search aria-hidden="true" className="size-4" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Find a route, function, table…"
            aria-label="Find in application"
          />
          <kbd>/</kbd>
        </label>
        <div className="explorer__direction" role="group" aria-label="Layout direction">
          <button
            type="button"
            aria-pressed={direction === "down"}
            title="Top to bottom"
            onClick={() => navigate({ ...location, dir: "down" })}
          >
            <ArrowDownFromLine aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Top to bottom</span>
          </button>
          <button
            type="button"
            aria-pressed={direction === "right"}
            title="Left to right"
            onClick={() => navigate({ ...location, dir: "right" })}
          >
            <ArrowRightFromLine aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Left to right</span>
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={inspectorOpen ? "Hide details" : "Show details"}
          aria-pressed={inspectorOpen}
          onPress={onToggleInspector}
        >
          {inspectorOpen ? (
            <PanelRightClose aria-hidden="true" className="size-4" />
          ) : (
            <PanelRightOpen aria-hidden="true" className="size-4" />
          )}
        </Button>
      </div>
    </header>
  );
}

interface Crumb {
  readonly label: string;
  readonly location?: GraphLocation;
}

function breadcrumbs(
  hierarchy: ReturnType<typeof buildHierarchy>,
  location: GraphLocation,
  view: ReturnType<typeof resolveView>,
): readonly Crumb[] {
  const platform: GraphLocation = location.platform === true ? { platform: true } : {};
  const root: Crumb =
    view.mode === "architecture"
      ? { label: hierarchy.appId }
      : { label: hierarchy.appId, location: platform };
  if (view.mode === "architecture") return [root];
  if (view.mode === "domain") return [root, { label: location.scope ?? view.title }];
  const scope = location.scope === undefined ? undefined : hierarchy.nodes.get(location.scope);
  const owner = location.scope === undefined ? undefined : hierarchy.ownerOf.get(location.scope);
  const crumbs: Crumb[] = [root];
  if (owner !== undefined && owner !== PLATFORM_OWNER)
    crumbs.push({ label: owner, location: domainLocation(owner, location) });
  crumbs.push({ label: scope === undefined ? view.title : nodeTitle(scope) });
  return crumbs;
}
