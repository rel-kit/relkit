/** Constructs the original restart RPC client and persisted inspection snapshot without changing worker process or saver ownership. */
import { invokeAgent } from "../../integrations/packages/langchain/src/index.ts";
import { createClient } from "../../packages/client/src/index.ts";
import { createRegistrationPlan } from "../../packages/graph/src/index.ts";
import { createLocalAgentStateProvider } from "../../packages/providers-local/src/index.ts";
import { createApp, type RuntimeManifest } from "../../packages/runtime-hono/src/index.ts";
import { digest } from "../../packages/runtime-hono/src/agent-rpc-support.ts";
import { runtimeCohort } from "../../packages/runtime-hono/tests/test-cohort.ts";
import { createRestartGraph } from "./agent-graph-fixture.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { IntegrationDependencyRequirements } from "../../packages/contracts/src/integration-dependencies.js";

const RuntimePackages = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      integrationId: Schema.NonEmptyString,
      packageName: Schema.NonEmptyString,
      packageVersion: Schema.NonEmptyString,
      exportName: Schema.NonEmptyString,
      registrations: Schema.Array(
        Schema.Struct({
          capability: Schema.NonEmptyString,
          adapterId: Schema.NonEmptyString,
          protocolVersion: Schema.Literal(1),
        }),
      ),
      requirements: Schema.optionalKey(IntegrationDependencyRequirements),
    }),
  ),
);

/** Reads real Bun-validated metadata before Node runs the native SQLite worker.
 * @param root - Exclusive retained fixture root written by the Bun parent.
 * @returns Complete decoded registrations and SDK requirements.
 */
export function readRestartRuntimePackages(root: string) {
  return Schema.decodeUnknownSync(RuntimePackages)(
    readFileSync(join(root, "runtime-integrations.json"), "utf8"),
  );
}

export function createRestartClient(
  graph: ReturnType<typeof createRestartGraph>,
  plan: ReturnType<typeof createRegistrationPlan>,
  provider: ReturnType<typeof createLocalAgentStateProvider>,
  mode: string,
) {
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
  return client;
}
export async function inspectRestartState(
  client: ReturnType<typeof createRestartClient>,
  provider: ReturnType<typeof createLocalAgentStateProvider>,
  agentId: string,
  threadId: string,
) {
  const snapshot = await client["relkit.agent.load"]({ agentId: agentId, threadId });
  const journal = await provider.readJournal({
    applicationId: "fixture",
    environment: "test",
    profile: "default",
    providerEpoch: snapshot.providerEpoch,
    agentId: agentId,
    ownerScope: "viewer",
    authorizationGrantId: digest({
      identity: { identityScope: "viewer", sessionEpoch: "session" },
      agentId: agentId,
    }),
    threadId,
    after: { ...snapshot.checkpoint, sequence: "0" },
    limit: 100,
    maxEncodedBytes: 1024 * 1024,
  });
  return {
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
  };
}
