import { ORPCError } from "@orpc/server";
import { API_BASE_PATH, REALTIME_RUNTIME_LIMITS, type JsonValue } from "@relkit/contracts";
import type { JournalCheckpoint, JournalRecord } from "@relkit/agents";
import type { Context, Hono } from "hono";
import { agentContext, requireAgentThreadId } from "./agent-rpc-support.js";
import type { InternalEndpointOptions } from "./internal-endpoints.js";
import { isAuthorized, jsonResponse } from "./internal-endpoints-utils.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import {
  inspectedRunIds,
  inspectorAttempts,
  inspectorExecutions,
  inspectorRuns,
  inspectorTransitions,
} from "./agent-inspector-projection.js";

export function installAgentInspectorEndpoints(
  app: Hono,
  options: RouteMaterializationOptions,
  internal: InternalEndpointOptions,
): void {
  const mode = internal.environment ?? internal.mode ?? "development";
  if (!(internal.enabled ?? mode !== "production")) return;
  app.get(`${API_BASE_PATH}/agents/:agentId/workflow`, async (context) => {
    if (!(await isAuthorized(context.req.raw, internal))) return unauthorized();
    const node = options.plan.agents.find((agent) => agent.id === context.req.param("agentId"));
    if (node === undefined) return jsonResponse({ error: "RELKIT_INSPECTOR_NOT_FOUND" }, 404);
    return jsonResponse({
      agentId: node.id,
      execution: node.execution ?? "agent",
      ...(node.workflow === undefined ? {} : { workflow: node.workflow }),
      ...(node.workflowTopology === undefined ? {} : { workflowTopology: node.workflowTopology }),
      subagents: node.subagents ?? [],
      resourceDependencies: node.resourceDependencies ?? [],
    } as unknown as JsonValue);
  });
  app.get(`${API_BASE_PATH}/runtime/agents/:agentId/executions`, async (context) => {
    if (!(await isAuthorized(context.req.raw, internal))) return unauthorized();
    try {
      return await executionResponse(context, options);
    } catch (error) {
      if (error instanceof ORPCError) return jsonResponse({ error: error.code }, rpcStatus(error));
      if (error instanceof TypeError) return jsonResponse({ error: "INVALID_REQUEST" }, 400);
      return jsonResponse({ error: "RELKIT_INSPECTOR_RUNTIME_UNAVAILABLE" }, 503);
    }
  });
}

async function executionResponse(
  context: Context,
  options: RouteMaterializationOptions,
): Promise<Response> {
  const threadId = requireAgentThreadId(context.req.query("threadId"));
  const mode = executionMode(context.req.query("mode"));
  const agentId = context.req.param("agentId");
  if (agentId === undefined || agentId === "") throw new TypeError("agentId is required");
  const rpc = { hono: context, auth: options.auth?.contextFor(context.req.raw) };
  const resolved = await agentContext({ agentId, threadId }, rpc, options, "inspect");
  const snapshot = await resolved.provider.loadThread({
    ...resolved.scope,
    threadId,
    maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
  });
  const history = await structuralHistory(resolved.provider, resolved.scope, snapshot.checkpoint);
  const runIds = inspectedRunIds(snapshot, mode);
  return jsonResponse({
    agentId,
    threadId,
    mode,
    truncated: history.truncated,
    runs: inspectorRuns(snapshot).filter((run) => runIds.has(String(run.runId))),
    executions: inspectorExecutions(snapshot),
    attempts: inspectorAttempts(history.records, runIds),
    transitions: inspectorTransitions(history.records, runIds),
  } as unknown as JsonValue);
}

async function structuralHistory(
  provider: Awaited<ReturnType<typeof agentContext>>["provider"],
  scope: Awaited<ReturnType<typeof agentContext>>["scope"],
  checkpoint: JournalCheckpoint,
): Promise<{ records: JournalRecord[]; truncated: boolean }> {
  let after = { ...checkpoint, sequence: "0" };
  const records: JournalRecord[] = [];
  for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
    const page = await provider.readJournal({
      ...scope,
      threadId: checkpoint.threadId,
      after,
      limit: 100,
      maxEncodedBytes: 1_048_576,
    });
    if (page.gap !== undefined) return { records, truncated: true };
    records.push(...page.records.filter((record) => record.kind === "event"));
    after = page.checkpoint;
    if (!page.hasMore) return { records, truncated: false };
  }
  return { records, truncated: true };
}

function executionMode(value: string | undefined): "live" | "history" {
  if (value === undefined || value === "live") return "live";
  if (value === "history") return value;
  throw new TypeError("mode is invalid");
}

function rpcStatus(error: ORPCError<string, unknown>): 401 | 403 | 404 | 409 {
  if (error.code === "UNAUTHORIZED") return 401;
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "IDENTITY_PRECONDITION_FAILED") return 409;
  return 403;
}

function unauthorized(): Response {
  return jsonResponse({ error: "RELKIT_INSPECTOR_UNAUTHORIZED" }, 401, {
    "www-authenticate": "Bearer",
  });
}
