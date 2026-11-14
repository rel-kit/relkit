import { ArrowUpRight, Plug } from "lucide-react";
import Link from "next/link";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import type { InspectorObject } from "../lib/api-types";
import { provenance } from "../lib/provider-provenance";

export interface ProviderItem {
  readonly id: string;
  readonly capability: string;
  readonly profile: string;
  readonly adapter: string;
  readonly integration: string;
  /** The binding's `providerSource.kind`: where it comes from, not whether it is healthy. */
  readonly source: string;
  /** The state the runtime reports for the resources that use this binding. */
  readonly health: string | undefined;
  readonly features: readonly string[];
  readonly references: number;
  readonly sensitive: number;
  readonly roles: number;
  readonly local: boolean;
}

/** One capability binding: its provenance, the health the runtime reports, and its adapter. */
export function ProviderCard({ item }: { readonly item: ProviderItem }) {
  const href = `/providers/${encodeURIComponent(item.id)}`;
  const source = provenance(item.source);
  return (
    <li className="group relative flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors focus-within:border-ring hover:border-foreground/25">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground"
          >
            <Plug className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[13px] font-semibold">
              <Link
                href={href}
                className="text-foreground no-underline outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:underline"
              >
                {item.capability}
              </Link>
            </h2>
            <p className="m-0 truncate font-mono text-[11px] text-muted-foreground" title={item.id}>
              {item.id}
            </p>
          </div>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge tone="neutral" label={source.label} title={source.text} />
          {item.health === undefined ? (
            <span className="font-mono text-[10.5px] text-muted-foreground">
              health not reported
            </span>
          ) : (
            <StatusBadge tone={statusTone(item.health)} label={item.health} />
          )}
        </span>
      </div>
      <div className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <Row label="Adapter" value={item.adapter} />
        <Row label="Integration" value={item.integration} />
        <Row label="Profile" value={item.profile} />
      </div>
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-1 border-t border-border/70 pt-2.5">
        {item.features.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">No optional features</span>
        ) : (
          item.features.map((feature) => (
            <span
              key={feature}
              className="rounded-sm bg-muted px-1.5 py-px font-mono text-[10.5px] text-foreground/80"
            >
              {feature}
            </span>
          ))
        )}
        <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {item.local ? <span title="Declares a local service recipe">local</span> : null}
          <span title="Required binding values">
            {item.references} value{item.references === 1 ? "" : "s"}
            {item.sensitive > 0 ? ` · ${item.sensitive} secret` : ""}
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>
      </div>
    </li>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className="m-0 min-w-0 truncate text-right font-mono text-[11px] text-foreground/90"
        title={value}
      >
        {value}
      </span>
    </>
  );
}

/** One provider node of the graph as a card. */
export function providerItem(
  value: InspectorObject,
  health: (capability: string, profile: string) => string | undefined,
): ProviderItem {
  const adapter = record(value.adapter);
  const source = record(value.providerSource);
  const named = Array.isArray(value.namedValues) ? value.namedValues : [];
  const capability = text(value.capability);
  const profile = text(value.profile);
  return {
    id: text(value.id),
    capability,
    profile,
    adapter: text(adapter?.adapterId),
    integration: text(adapter?.integrationId),
    source: typeof source?.kind === "string" ? source.kind : "",
    health: health(capability, profile),
    features: Array.isArray(adapter?.features)
      ? adapter.features.filter((item): item is string => typeof item === "string")
      : [],
    references: named.length,
    sensitive: named.filter((item) => record(item)?.sensitive === true).length,
    roles: Array.isArray(value.deploymentRoles) ? value.deploymentRoles.length : 0,
    local: record(value.local) !== undefined,
  };
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "Unavailable";
}
