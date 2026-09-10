import { EventType, RunAgentInputSchema } from "@ag-ui/core";
import { AGENT_CAPABILITY_HEADER, AGENT_CAPABILITY_VALUE } from "@relkit/contracts";
import type { Context, Hono } from "hono";
import { acceptAgentRun } from "./agent-rpc-write.js";
import { loadAgent } from "./agent-rpc-read.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RpcContext } from "./rpc.js";
import { requireAgentThreadId } from "./agent-rpc-support.js";
import { agUiFrames } from "./agent-protocol-encoding.js";
import { agentProtocolFrames } from "./agent-protocol-stream.js";
import {
  encodeAgentCursor,
  eventStream,
  isRecord,
  latestUserText,
  operationId,
  parseAgentCursor,
  protocolEndpoint,
  serverSentEvent,
} from "./agent-protocol-support.js";
import { assertAgentCapabilities } from "./agent-capability-negotiation.js";

const AGENT_STREAM_HEADERS = { [AGENT_CAPABILITY_HEADER]: AGENT_CAPABILITY_VALUE };

export function installAgentProtocolEndpoints(
  app: Hono,
  options: RouteMaterializationOptions,
): void {
  if (options.agentRuntime === undefined || options.clientIdentity === undefined) return;
  app.post("/_relkit/v1/agents/:agentId/ag-ui", (context) =>
    protocolEndpoint(context, () => agUi(context, options)),
  );
}

async function agUi(context: Context, options: RouteMaterializationOptions): Promise<Response> {
  assertAgentCapabilities(context.req.raw);
  const body = await context.req.json().catch(() => undefined);
  if (context.req.header("x-relkit-agent-observe") === "1") {
    return observeAgUi(context, options, body);
  }
  const parsed = RunAgentInputSchema.safeParse(body);
  if (!parsed.success) return context.json({ error: "invalid-agent-request" }, 422);
  const rpc = rpcContext(context, options);
  const agentId = requiredAgentId(context);
  const after = parseAgentCursor(context.req.header("last-event-id"));
  const receipt = await acceptAgentRun(
    {
      agentId,
      threadId: parsed.data.threadId,
      kind: "run",
      operationId: operationId(context),
      payload: latestUserText(parsed.data.messages) ?? parsed.data.state,
    },
    rpc,
    options,
  );
  return eventStream(async function* (signal) {
    if (after === undefined) {
      yield serverSentEvent({
        type: EventType.RUN_STARTED,
        threadId: receipt.threadId,
        runId: receipt.runId,
      });
    }
    for await (const emission of agentProtocolFrames(
      rpc,
      options,
      agentId,
      receipt,
      after,
      signal,
    )) {
      const frames = [...agUiFrames(emission.frame)];
      for (let index = 0; index < frames.length; index += 1) {
        const cursor =
          index === frames.length - 1 && emission.checkpoint !== undefined
            ? encodeAgentCursor(emission.checkpoint)
            : undefined;
        yield serverSentEvent(
          index === frames.length - 1
            ? withObservation(frames[index], emission.observation)
            : frames[index],
          cursor,
        );
      }
    }
  }, AGENT_STREAM_HEADERS);
}

async function observeAgUi(
  context: Context,
  options: RouteMaterializationOptions,
  body: unknown,
): Promise<Response> {
  if (!isRecord(body)) return context.json({ error: "invalid-agent-request" }, 422);
  const threadId = requireAgentThreadId(body.threadId);
  const rpc = rpcContext(context, options);
  const agentId = requiredAgentId(context);
  const snapshot = await loadAgent({ agentId, threadId }, rpc, options);
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  if (runId === "" && snapshot.currentRuns.length === 0) {
    return eventStream(async function* () {});
  }
  if (runId === "") throw new TypeError("runId is required for a thread with runs.");
  if (!snapshot.currentRuns.some((run) => run.runId === runId)) {
    throw new TypeError("runId does not belong to the requested thread.");
  }
  const after = parseAgentCursor(context.req.header("last-event-id"));
  return eventStream(async function* (signal) {
    for await (const emission of agentProtocolFrames(
      rpc,
      options,
      agentId,
      { threadId, runId },
      after,
      signal,
      true,
    )) {
      const frames = [...agUiFrames(emission.frame)];
      for (let index = 0; index < frames.length; index += 1) {
        const last = index === frames.length - 1;
        yield serverSentEvent(
          last ? withObservation(frames[index], emission.observation) : frames[index],
          last && emission.checkpoint !== undefined
            ? encodeAgentCursor(emission.checkpoint)
            : undefined,
        );
      }
    }
  }, AGENT_STREAM_HEADERS);
}

function withObservation(frame: unknown, observation: unknown): unknown {
  if (!isRecord(frame) || observation === undefined) return frame;
  const metadata = isRecord(frame.metadata) ? frame.metadata : {};
  const relkit = isRecord(metadata.relkit) ? metadata.relkit : {};
  return { ...frame, metadata: { ...metadata, relkit: { ...relkit, observation } } };
}

function rpcContext(context: Context, options: RouteMaterializationOptions): RpcContext {
  return { hono: context, auth: options.auth?.contextFor(context.req.raw) };
}

function requiredAgentId(context: Context): string {
  const value = context.req.param("agentId");
  if (value === undefined || value === "") throw new TypeError("Agent ID is required.");
  return value;
}
