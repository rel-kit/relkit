"use client";

import { Plug } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { DetailList } from "../components/blocks/details";
import { Section } from "../components/blocks/section";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import type { InspectorObject } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { normalizeGraphResponse } from "../lib/graph-model";
import { integrationFor } from "../lib/graph-topology-model";
import { DetailLayout } from "./detail-layout";
import { SourceLink } from "./source-link";

interface ProviderState {
  readonly node: InspectorObject;
  readonly packageLabel?: string;
}

export function ProviderDetail() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [state, setState] = useState<ProviderState>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (id === "") return;
    const client = createInspectorClient();
    void Promise.all([client.detail<InspectorObject>("providers", id), client.graph()]).then(
      ([detail, graph]) => {
        const node = record(detail.node) ?? record(detail.descriptor);
        if (node === undefined) throw new Error("Provider unavailable");
        const adapter = record(node.adapter);
        const integration = integrationFor(
          normalizeGraphResponse(graph).integrations,
          text(node.capability),
          text(adapter?.integrationId),
          text(adapter?.adapterId),
        );
        setState({
          node,
          ...(integration === undefined
            ? {}
            : { packageLabel: `${integration.packageName}@${integration.packageVersion}` }),
        });
      },
      () => setFailed(true),
    );
  }, [id]);
  if (state === undefined)
    return failed ? (
      <div className="route-page">
        <FailedState
          title="Provider unavailable."
          description="The binding is not part of the active generation."
        />
      </div>
    ) : (
      <div className="route-page rounded-lg border border-border bg-card">
        <LoadingRows label="Loading provider…" rows={6} />
      </div>
    );
  const { node } = state;
  const adapter = record(node.adapter);
  const providerSource = record(node.providerSource);
  const local = record(node.local);
  const features = strings(adapter?.features);
  const namedValues = records(node.namedValues);
  const deploymentRoles = records(node.deploymentRoles);
  const sourceKind = label(providerSource?.kind);
  return (
    <DetailLayout
      header={{
        kicker: "Provider binding",
        title: label(node.capability),
        icon: <Plug />,
        badges: (
          <>
            <StatusBadge tone={statusTone(sourceKind)} label={sourceKind} />
            <StatusBadge tone="neutral" label={label(node.profile)} />
          </>
        ),
        meta: (
          <>
            <span>{label(node.id)}</span>
            <SourceLink source={record(node.source)} />
          </>
        ),
      }}
      aside={
        <>
          <section
            className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
            aria-labelledby="provider-local-heading"
          >
            <SectionHead
              id="provider-local-heading"
              title="Service recipe"
              label="LOCAL LIFECYCLE"
            />
            <div className="p-4">
              {local === undefined ? (
                <p className="m-0 text-xs text-muted-foreground">
                  No local service recipe declared.
                </p>
              ) : (
                <DetailList
                  items={[
                    { label: "Integration", value: label(local.integrationId), mono: true },
                    { label: "Recipe", value: label(local.recipeId), mono: true },
                    {
                      label: "Recipe version",
                      value: String(local.recipeVersion ?? "Unavailable"),
                      mono: true,
                    },
                  ]}
                />
              )}
            </div>
          </section>
          <ProviderListSection
            id="provider-deployment-ownership"
            label="DEPLOYMENT OWNERSHIP"
            title="Integration roles"
            empty="No deployment integration roles declared."
            items={deploymentRoles.map((value) => ({
              id: `${label(value.role)}:${label(value.integrationId)}`,
              label: label(value.role),
              detail: `${label(value.integrationId)} · protocol ${String(value.protocolVersion ?? "Unavailable")}`,
            }))}
          />
        </>
      }
    >
      <section
        className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
        aria-labelledby="provider-topology-heading"
      >
        <SectionHead
          id="provider-topology-heading"
          title="Provider profile"
          label="BINDING TOPOLOGY"
        />
        <div className="p-4">
          <DetailList
            columns={2}
            items={[
              { label: "Capability", value: label(node.capability), mono: true },
              { label: "Profile", value: label(node.profile), mono: true },
              { label: "Adapter", value: label(adapter?.adapterId), mono: true },
              { label: "Integration", value: label(adapter?.integrationId), mono: true },
              { label: "Package", value: state.packageLabel ?? "Unavailable", mono: true },
              {
                label: "Binding source",
                value: <StatusBadge tone={statusTone(sourceKind)} label={sourceKind} />,
              },
              { label: "Definition", value: <SourceLink source={record(node.source)} /> },
            ]}
          />
        </div>
      </section>
      <section
        className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
        aria-labelledby="provider-declared-features"
      >
        <SectionHead
          id="provider-declared-features"
          title="Adapter capabilities"
          label="DECLARED FEATURES"
          count={features.length}
        />
        <div className="p-4">
          {features.length === 0 ? (
            <p className="m-0 text-xs text-muted-foreground">
              No optional adapter features declared.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {features.map((feature) => (
                <li
                  key={feature}
                  className="rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <ProviderListSection
        id="provider-required-binding-values"
        label="REQUIRED BINDING VALUES"
        title="Named values"
        empty="No runtime binding values required."
        items={namedValues.map((value) => ({
          id: label(value.name),
          label: label(value.name),
          detail: [label(value.field), label(value.type)].join(" · "),
          badge: value.sensitive === true ? "Sensitive" : "Plain",
        }))}
      />
    </DetailLayout>
  );
}

/** Section header bar with the small uppercase contract label the topology panels keep. */
function SectionHead({
  id,
  title,
  label: kicker,
  count,
}: {
  readonly id: string;
  readonly title: string;
  readonly label: string;
  readonly count?: number;
}) {
  return (
    <header className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-4 py-2">
      <div className="min-w-0">
        <p className="m-0 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
          {kicker}
        </p>
        <h2 id={id} className="truncate text-[13px] font-semibold text-foreground">
          {title}
        </h2>
      </div>
      {count === undefined ? null : (
        <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </header>
  );
}

function ProviderListSection({
  id,
  label: kicker,
  title,
  empty,
  items,
}: {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly empty: string;
  readonly items: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail?: string;
    readonly badge?: string;
  }[];
}) {
  return (
    <section
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
      aria-labelledby={id}
    >
      <SectionHead id={id} title={title} label={kicker} count={items.length} />
      {items.length === 0 ? (
        <p className="m-0 px-4 py-3.5 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <li
              className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
              key={item.id}
            >
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate font-mono text-xs font-medium">{item.label}</span>
                {item.detail && (
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {item.detail}
                  </span>
                )}
              </span>
              {item.badge && (
                <StatusBadge
                  tone={item.badge === "Sensitive" ? "warning" : "neutral"}
                  label={item.badge}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function records(value: unknown): InspectorObject[] {
  return Array.isArray(value) ? value.flatMap((item) => (record(item) ? [record(item)!] : [])) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const label = (value: unknown): string => text(value) || "Unavailable";
