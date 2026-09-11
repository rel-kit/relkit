import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SqliteSaver } from "../../packages/agents/node_modules/@langchain/langgraph-checkpoint-sqlite/dist/index.js";
import { invokeAgent } from "../../packages/agents/src/index.ts";
import { createClient } from "../../packages/client/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { createRegistrationPlan } from "../../packages/graph/src/index.ts";
import { createLocalAgentStateProvider } from "../../packages/providers-local/src/index.ts";
import { createOperationId } from "../../packages/realtime/src/index.ts";
import { createApp, type RuntimeManifest } from "../../packages/runtime-hono/src/index.ts";
import { digest } from "../../packages/runtime-hono/src/agent-rpc-support.ts";
import { runtimeCohort } from "../../packages/runtime-hono/test-cohort.ts";
import { createRestartGraph, waitForAgentStatus } from "./agent-graph-fixture.ts";
import { resolveRestartStateRoot } from "./state-root.ts";

if (typeof Bun === "undefined") {
  Object.defineProperty(globalThis, "Bun", {
    value: { sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)) },
  });
}

const [mode, requestedRoot, expectedRevision, contender] = process.argv.slice(2);
if (
  (mode !== "pause" && mode !== "inspect" && mode !== "resume") ||
  requestedRoot === undefined ||
  (mode === "resume" &&
    (expectedRevision === undefined || (contender !== "one" && contender !== "two")))
) {
  throw new Error(
    "Usage: agent-graph-worker.ts <pause|inspect|resume> <state-root> [revision] [one|two]",
  );
}

const root = resolveRestartStateRoot(requestedRoot);
const resumeReadyPath =
  contender === "one"
    ? join(root, "resume-ready-one")
    : contender === "two"
      ? join(root, "resume-ready-two")
      : undefined;
if (mode === "resume" && contender === "two") {
  while (!(await exists(join(root, "resume-ready-one")))) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const saver = SqliteSaver.fromConnString(join(root, "checkpoints.sqlite"));
saver.db.pragma("busy_timeout = 5000");
await saver.getTuple({ configurable: { thread_id: "__relkit_setup__" } });

try {
  await run();
} finally {
  saver.db.close();
}

async function run(): Promise<void> {
  const graph = createRestartGraph(root, saver);
  const normalized = normalizeCompilation({ descriptors: [graph] });
  if (normalized.graph === undefined || normalized.diagnostics.length > 0) {
    throw new Error(`Graph compilation failed: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const plan = createRegistrationPlan(normalized.graph);
  const provider = createLocalAgentStateProvider(join(root, "agent-state"), { pollingMs: 50 });
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      agents: { [graph.id]: graph },
    } as RuntimeManifest,
    engine: {
      invoke: (request) => {
        const trigger = request.trigger as {
          readonly threadId: string;
          readonly resume?: boolean;
          readonly contentSink?: Parameters<typeof invokeAgent>[0]["contentSink"];
        };
        return invokeAgent({
          agent: graph,
          input: request.input,
          threadId: trigger.threadId,
          resume: trigger.resume,
          contentSink: trigger.contentSink,
          tools: {},
          engine: { invoke: () => Promise.reject(new Error("unused")) },
        });
      },
    },
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    agentRuntime: {
      applicationId: "fixture",
      environment: "test",
      generationId: `generation-${mode}-${process.pid}`,
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  const threadId = "order:restart";
  if (mode === "pause") {
    const receipt = await client["relkit.agent.run"]({
      agentId: graph.id,
      threadId,
      operationId: createOperationId(),
      kind: "run",
      payload: { orderId: "42" },
    });
    const snapshot = await waitForAgentStatus(client, graph.id, threadId, "waiting");
    write({ outcome: "waiting", revision: snapshot.waiting.revision, runId: receipt.runId });
    return;
  }
  if (mode === "inspect") {
    const snapshot = await client["relkit.agent.load"]({ agentId: graph.id, threadId });
    const journal = await provider.readJournal({
      applicationId: "fixture",
      environment: "test",
      profile: "default",
      providerEpoch: snapshot.providerEpoch,
      agentId: graph.id,
      ownerScope: "viewer",
      authorizationGrantId: digest({
        identity: { identityScope: "viewer", sessionEpoch: "session" },
        agentId: graph.id,
      }),
      threadId,
      after: { ...snapshot.checkpoint, sequence: "0" },
      limit: 100,
      maxEncodedBytes: 1024 * 1024,
    });
    write({
      outcome: "snapshot",
      status: snapshot.thread.status,
      revision: snapshot.waiting?.revision,
      runs: snapshot.currentRuns.map((value: { readonly status: string }) => value.status),
      assistant: snapshot.currentMessages.filter(
        (value: { readonly role: string }) => value.role === "assistant",
      ),
      terminal: journal.records
        .filter((value) => value.kind === "terminal")
        .map((value) => value.publicValue),
    });
    return;
  }
  await compete(client, graph.id, threadId);
}

async function compete(client: any, agentId: string, threadId: string): Promise<void> {
  if (resumeReadyPath === undefined) throw new Error("Resume contender is required");
  const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
  if (snapshot.waiting?.revision !== expectedRevision) {
    throw new Error("Waiting revision changed before the competing resume");
  }
  await writeFile(resumeReadyPath, "ready");
  while (!(await exists(join(root, "resume-go")))) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  try {
    const receipt = await client["relkit.agent.run"]({
      agentId,
      threadId,
      operationId: createOperationId(),
      kind: "run",
      resume: true,
      waitingRevision: expectedRevision,
      payload: true,
      requestDigest: digest({ payload: true, waitingRevision: expectedRevision }),
    });
    await waitForAgentStatus(client, agentId, threadId, "idle");
    write({ outcome: "fulfilled", runId: receipt.runId });
  } catch (error) {
    write({
      outcome: "rejected",
      code: (error as { readonly code?: unknown }).code,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
