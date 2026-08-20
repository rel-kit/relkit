"use client";

import { useCallback, useEffect, useState } from "react";
import type { InspectorPage, InspectorQuery } from "../lib/api-types";
import { createInspectorBackendStream, createInspectorClient } from "../lib/client";
import { normalizeEnvironment, type EnvironmentFieldView } from "../lib/env-diagnostics-model";
import { ResourceTable, type ResourceTableItem } from "./resource-table";
import { SourceLink } from "./source-link";

interface EnvironmentItem extends ResourceTableItem {
  readonly type: string;
  readonly requirement: string;
  readonly defaultState: string;
  readonly sensitivity: string;
  readonly description: string;
  readonly field: EnvironmentFieldView;
}

const types = ["string", "secret-string", "number", "boolean", "json"].map((id) => ({
  id,
  label: id,
}));

export function EnvironmentClient() {
  const [revision, setRevision] = useState(0);
  const [liveState, setLiveState] = useState("connecting");
  useEffect(() => {
    const stream = createInspectorBackendStream({
      onStateChange: (snapshot) => setLiveState(snapshot.state),
      onInvalidate: (tags) => tags.includes("env") && setRevision((value) => value + 1),
    });
    stream.start();
    return () => stream.stop();
  }, []);
  const load = useCallback(
    async (query: InspectorQuery): Promise<InspectorPage<EnvironmentItem>> => {
      void revision;
      const payload = await createInspectorClient().env(query);
      const fields = normalizeEnvironment(payload).fields.map(environmentItem);
      return {
        items: fields,
        ...(payload.nextCursor === undefined ? {} : { nextCursor: payload.nextCursor }),
      };
    },
    [revision],
  );
  return (
    <ResourceTable
      title="Environment"
      description={`Value-free environment metadata from the active graph. Live connection: ${liveState}.`}
      noun="environment variables"
      load={load}
      kindOptions={types}
      columns={[
        { key: "type", label: "Type", render: (item) => item.type },
        { key: "requirement", label: "Requirement", render: (item) => item.requirement },
        {
          key: "safety",
          label: "Safety",
          render: (item) => `${item.defaultState} · ${item.sensitivity}`,
        },
        {
          key: "source",
          label: "Source",
          render: (item) =>
            item.field.source ? <SourceLink source={item.field.source} /> : "Unavailable",
        },
      ]}
      details={(item) => (
        <div>
          <p className="supporting-copy">{item.description}</p>
          <dl className="identity-grid">
            <div>
              <dt>Type</dt>
              <dd>{item.type}</dd>
            </div>
            <div>
              <dt>Requirement</dt>
              <dd>{item.requirement}</dd>
            </div>
            <div>
              <dt>Default</dt>
              <dd>{item.defaultState}</dd>
            </div>
            <div>
              <dt>Sensitivity</dt>
              <dd>{item.sensitivity}</dd>
            </div>
          </dl>
        </div>
      )}
    />
  );
}

function environmentItem(field: EnvironmentFieldView): EnvironmentItem {
  return {
    id: field.name,
    type: field.type,
    requirement:
      field.requiredIn.length > 0
        ? `Required in ${field.requiredIn.join(", ")}`
        : field.optional
          ? "Optional"
          : "Required by default",
    defaultState: field.hasDefault ? "Default declared" : "No default",
    sensitivity: field.sensitive ? "Sensitive" : "Non-sensitive",
    description: field.description ?? "No description provided.",
    field,
  };
}
