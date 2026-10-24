/** Runs one pause, inspect or competing resume process against the retained SQLite checkpoint and local state fixtures. */
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SqliteSaver } from "../../integrations/packages/langchain/node_modules/@langchain/langgraph-checkpoint-sqlite/dist/index.js";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { createRegistrationPlan } from "../../packages/graph/src/index.ts";
import { createLocalAgentStateProvider } from "../../packages/providers-local/src/index.ts";
import { createOperationId } from "../../packages/realtime/src/index.ts";
import { digest } from "../../packages/runtime-hono/src/agent-rpc-support.ts";
import { createRestartGraph, waitForAgentStatus } from "./agent-graph-fixture.ts";
import { resolveRestartStateRoot } from "./state-root.ts";
import {
  createRestartClient,
  inspectRestartState,
  readRestartRuntimePackages,
} from "./agent-graph-runtime.fixture.js";
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
  const normalized = normalizeCompilation({
    descriptors: [graph],
    runtimeIntegrationPackages: readRestartRuntimePackages(root),
  });
  if (normalized.graph === undefined || normalized.diagnostics.length > 0) {
    throw new Error(`Graph compilation failed: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const plan = createRegistrationPlan(normalized.graph);
  const provider = createLocalAgentStateProvider(join(root, "agent-state"), { pollingMs: 50 });
  const client = createRestartClient(graph, plan, provider, mode);
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
    write(await inspectRestartState(client, provider, graph.id, threadId));
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
