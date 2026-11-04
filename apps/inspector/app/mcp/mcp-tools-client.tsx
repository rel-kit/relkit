"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Section } from "../../components/blocks/section";
import { FailedState, LoadingRows } from "../../components/blocks/block-state";
import { CodeBlock } from "../../components/blocks/code-block";
import { PageHeader } from "../../components/blocks/page-header";
import { StatusBadge } from "../../components/neon/status-badge";
import { Button } from "../../components/ui/button";
import type { InspectorGraph } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { invokeFunction, type FunctionInvocationResult } from "../../lib/function-invocation";
import { actionFailure, parseJsonInput, type ActionIdentity } from "../../lib/inspector-actions";
import { callableWithoutApproval, mcpToolViews, type McpToolView } from "../../lib/mcp-tools-model";
import { cn } from "../../lib/utils";
import { fieldControlClass, fieldTextareaClass } from "../schema-form";
import { SchemaPanel } from "../schema-panel";

/** Lists the tools on the application's `/mcp` endpoint and calls them. */
export function McpToolsClient() {
  const api = useMemo(() => createInspectorClient(), []);
  const [graph, setGraph] = useState<InspectorGraph>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void api
      .graph()
      .then(setGraph)
      .catch(() => setFailed(true));
  }, [api]);
  if (failed)
    return (
      <div className="route-page">
        <FailedState
          title="The graph API is unavailable."
          description="MCP tools come from the graph."
        />
      </div>
    );
  if (graph === undefined)
    return (
      <div className="route-page">
        <LoadingRows label="Loading MCP tools…" rows={4} />
      </div>
    );
  const tools = mcpToolViews(graph);
  const identity =
    graph.generationId !== undefined && graph.graphHash !== undefined
      ? { generationId: graph.generationId, graphHash: graph.graphHash }
      : undefined;
  return (
    <div className="route-page grid gap-4">
      <PageHeader
        title="MCP tools"
        description="Tools the application exposes on its /mcp endpoint. A call runs the tool's function through the engine, and its trace opens from the result."
        badges={<StatusBadge tone="neutral" label={`${tools.length} tools`} />}
      />
      {tools.length === 0 ? (
        <p className="m-0 text-xs text-muted-foreground">
          No tool sets <code>mcp: true</code>, so the /mcp endpoint exposes no tools.
        </p>
      ) : (
        tools.map((tool) => <McpToolCard key={tool.id} tool={tool} identity={identity} />)
      )}
    </div>
  );
}

function McpToolCard({
  tool,
  identity,
}: {
  readonly tool: McpToolView;
  readonly identity: ActionIdentity | undefined;
}) {
  const [input, setInput] = useState("{}");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<FunctionInvocationResult>();
  const callable = callableWithoutApproval(tool) && identity !== undefined;
  const fieldId = `mcp-input-${tool.id}`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (identity === undefined) return;
    const parsed = parseJsonInput(input);
    if (!parsed.ok) return setStatus(parsed.error);
    setPending(true);
    setStatus("");
    try {
      const next = await invokeFunction(createInspectorClient(), {
        functionId: tool.targetFunctionId,
        ...identity,
        input: parsed.value,
        idempotencyKey: crypto.randomUUID(),
      });
      setResult(next);
      setStatus(`Called ${tool.id}.`);
    } catch (error) {
      setStatus(actionFailure(error));
    } finally {
      setPending(false);
    }
  };

  const traceId = typeof result?.traceId === "string" ? result.traceId : undefined;
  return (
    <Section
      id={`mcp-tool-${tool.id}`}
      aria-label={`MCP tool ${tool.id}`}
      title={<span className="font-mono">{tool.id}</span>}
      description={tool.description || "No description"}
      actions={
        <span className="flex gap-1">
          <StatusBadge tone="neutral" label={tool.sideEffect} />
          <StatusBadge
            tone={tool.approval === "never" ? "neutral" : "warning"}
            label={`approval ${tool.approval}`}
          />
        </span>
      }
    >
      <p className="m-0 mb-2 text-xs text-muted-foreground">
        Target function{" "}
        <Link
          href={`/functions/${encodeURIComponent(tool.targetFunctionId)}`}
          className="font-mono underline-offset-2 hover:underline"
        >
          {tool.targetFunctionId}
        </Link>
      </p>
      <SchemaPanel title="Input schema" value={tool.input} />
      <form className="mt-3 grid gap-2" onSubmit={(event) => void submit(event)}>
        <label className="text-xs font-medium" htmlFor={fieldId}>
          Arguments for {tool.id} (JSON)
        </label>
        <textarea
          id={fieldId}
          className={cn(fieldControlClass, fieldTextareaClass, "font-mono text-xs")}
          rows={3}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <div>
          <Button type="submit" disabled={pending || !callable}>
            Call {tool.id}
          </Button>
        </div>
        {callable ? null : (
          <p className="m-0 text-xs text-muted-foreground">
            This tool needs approval for each call; run it from an agent to approve it.
          </p>
        )}
      </form>
      <p className="m-0 mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
        {status}
      </p>
      {result === undefined ? null : (
        <div className="mt-2 grid gap-2">
          <CodeBlock value={result.output ?? null} label={`${tool.id} result`} />
          {traceId === undefined ? null : (
            <a
              href={`/traces/${encodeURIComponent(traceId)}`}
              className="text-xs underline-offset-2 hover:underline"
            >
              Open trace {traceId}
            </a>
          )}
        </div>
      )}
    </Section>
  );
}
