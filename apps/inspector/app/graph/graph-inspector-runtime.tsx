"use client";

/** Details for agents (with live execution), tools, errors, environment variables and providers. */
import { useMemo, useState } from "react";
import { Badge } from "../../components/ui/badge";
import type { GraphNode, GraphSnapshot } from "../../lib/graph-model";
import {
  agentModel,
  agentToolIds,
  envOptional,
  envSensitive,
  envType,
  errorRetry,
  errorStatus,
  functionInput,
  functionOutput,
  providerAdapter,
  providerCapability,
  toolApproval,
  toolSideEffect,
} from "../../lib/graph-node-meta";
import { withExecutionOverlay } from "../../lib/graph-execution-model";
import { GraphExecutionControls } from "./graph-execution-controls";
import { Relations } from "./graph-inspector-connections";
import { type DetailProps, Facts, SchemaDisclosure, Section } from "./graph-inspector-parts";

export function AgentDetails({
  hierarchy,
  graph,
  node,
  onSelect,
}: DetailProps & { readonly graph: GraphSnapshot }) {
  const [execution, setExecution] = useState<{ agentId: string; value: unknown }>();
  const overlay = useMemo(
    () =>
      execution === undefined
        ? undefined
        : withExecutionOverlay(graph, execution.agentId, execution.value),
    [execution, graph],
  );
  const runs = overlay?.nodes.filter((item) => item.observed && item.parentId === node.id) ?? [];
  return (
    <>
      <Section title="Agent">
        <Facts
          items={[
            ["Model", agentModel(node)],
            ["Tools", agentToolIds(node).join(", ")],
          ]}
        />
        <SchemaDisclosure title="Input" schema={functionInput(node)} />
        <SchemaDisclosure title="Output" schema={functionOutput(node)} />
      </Section>
      <Relations hierarchy={hierarchy} node={node} onSelect={onSelect} />
      <Section title="Live execution">
        <GraphExecutionControls
          agents={[node.id]}
          onOverlay={(agentId, value) => setExecution({ agentId, value })}
        />
        {runs.length > 0 && (
          <ul className="explorer-runs">
            {runs.map((run) => (
              <li key={run.id}>
                <span>{run.label ?? run.id}</span>
                <Badge>{run.status ?? run.kind}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

export function ToolDetails({ hierarchy, node, onSelect }: DetailProps) {
  return (
    <>
      <Section title="Tool">
        <Facts
          items={[
            ["Side effect", toolSideEffect(node)],
            ["Approval", toolApproval(node)],
          ]}
        />
      </Section>
      <Relations hierarchy={hierarchy} node={node} onSelect={onSelect} />
    </>
  );
}

export function ErrorDetails({ hierarchy, node, onSelect }: DetailProps) {
  const status = errorStatus(node);
  return (
    <>
      <Section title="Error">
        <Facts
          items={[
            ["HTTP status", status === undefined ? undefined : String(status)],
            ["Retry", errorRetry(node)],
          ]}
        />
        <SchemaDisclosure title="Data" schema={node.meta?.data} />
      </Section>
      <Relations hierarchy={hierarchy} node={node} onSelect={onSelect} />
    </>
  );
}

export function EnvDetails({ node }: { readonly node: GraphNode }) {
  return (
    <Section title="Variable">
      <Facts
        items={[
          ["Type", envType(node)],
          ["Sensitive", envSensitive(node) ? "yes" : "no"],
          ["Required", envOptional(node) ? "optional" : "yes"],
        ]}
      />
    </Section>
  );
}

export function ProviderDetails({ hierarchy, node, onSelect }: DetailProps) {
  return (
    <>
      <Section title="Provider">
        <Facts
          items={[
            ["Capability", providerCapability(node)],
            ["Adapter", providerAdapter(node)],
          ]}
        />
      </Section>
      <Relations hierarchy={hierarchy} node={node} onSelect={onSelect} />
    </>
  );
}
