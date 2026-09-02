"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { InspectorObject } from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { normalizeGraphResponse } from "../lib/graph-model";
import { integrationFor } from "../lib/graph-topology-model";
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
    return (
      <section className="panel route-state">
        {failed ? "Provider unavailable." : "Loading provider…"}
      </section>
    );
  const { node } = state;
  const adapter = record(node.adapter);
  const providerSource = record(node.providerSource);
  const local = record(node.local);
  const features = strings(adapter?.features);
  const namedValues = records(node.namedValues);
  const deploymentRoles = records(node.deploymentRoles);
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Provider binding</h1>
        </div>
        <span className="badge">{label(node.id)}</span>
      </header>
      <section className="panel" aria-labelledby="provider-topology-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BINDING TOPOLOGY</p>
            <h2 id="provider-topology-heading">Provider profile</h2>
          </div>
        </div>
        <dl className="route-meta">
          <Meta label="Capability" value={label(node.capability)} />
          <Meta label="Profile" value={label(node.profile)} />
          <Meta label="Adapter" value={label(adapter?.adapterId)} />
          <Meta label="Integration" value={label(adapter?.integrationId)} />
          <Meta label="Package" value={state.packageLabel ?? "Unavailable"} />
          <Meta label="Binding source" value={label(providerSource?.kind)} />
          <Meta label="Definition" value={<SourceLink source={record(node.source)} />} />
        </dl>
      </section>
      <ProviderListSection
        eyebrow="DECLARED FEATURES"
        title="Adapter capabilities"
        empty="No optional adapter features declared."
        items={features.map((feature) => ({ id: feature, label: feature }))}
      />
      <ProviderListSection
        eyebrow="REQUIRED BINDING VALUES"
        title="Named values"
        empty="No runtime binding values required."
        items={namedValues.map((value) => ({
          id: label(value.name),
          label: label(value.name),
          detail: [label(value.field), label(value.type)].join(" · "),
          badge: value.sensitive === true ? "Sensitive" : "Plain",
        }))}
      />
      <section className="panel" aria-labelledby="provider-local-heading">
        <p className="eyebrow">LOCAL LIFECYCLE</p>
        <h2 id="provider-local-heading">Service recipe</h2>
        {local === undefined ? (
          <p className="supporting-copy">No local service recipe declared.</p>
        ) : (
          <dl className="route-meta">
            <Meta label="Integration" value={label(local.integrationId)} />
            <Meta label="Recipe" value={label(local.recipeId)} />
            <Meta label="Recipe version" value={String(local.recipeVersion ?? "Unavailable")} />
          </dl>
        )}
      </section>
      <ProviderListSection
        eyebrow="DEPLOYMENT OWNERSHIP"
        title="Integration roles"
        empty="No deployment integration roles declared."
        items={deploymentRoles.map((value) => ({
          id: `${label(value.role)}:${label(value.integrationId)}`,
          label: label(value.role),
          detail: `${label(value.integrationId)} · protocol ${String(value.protocolVersion ?? "Unavailable")}`,
        }))}
      />
    </div>
  );
}
function ProviderListSection({
  eyebrow,
  title,
  empty,
  items,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly empty: string;
  readonly items: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail?: string;
    readonly badge?: string;
  }[];
}) {
  const headingId = `provider-${eyebrow.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="panel" aria-labelledby={headingId}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={headingId}>{title}</h2>
      {items.length === 0 ? (
        <p className="supporting-copy">{empty}</p>
      ) : (
        <ul className="request-list">
          {items.map((item) => (
            <li className="request-row" key={item.id}>
              <span>
                <strong>{item.label}</strong>
                {item.detail && (
                  <>
                    <br />
                    <small>{item.detail}</small>
                  </>
                )}
              </span>
              {item.badge && <span className="badge">{item.badge}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function Meta({ label: name, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
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
