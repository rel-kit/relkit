import { expect, test } from "bun:test";
import { API_VERSION, GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import { createSupervisorStateMachine } from "./src/state-machine.js";
import { verifyCandidate, type CandidateVerificationCandidate } from "./src/verification.js";

const token = { sourceToken: 2, generationToken: 3 } as const;
const graphHash = "sha256:candidate";

test("verifies v1 API, generation, graph/manifest identity, and readiness", async () => {
  let disposed = 0;
  const result = await verifyCandidate({
    candidate: candidateFor(token, () => {
      disposed += 1;
      return Promise.resolve();
    }),
    graphHash,
    fetch: responseFor({ graphHash, manifestGraphHash: graphHash }),
  });

  expect(result).toEqual({
    token,
    graphHash,
    manifestGraphHash: graphHash,
    graphContractVersion: GRAPH_VERSION,
    manifestContractVersion: MANIFEST_VERSION,
    manifestGeneratorVersion: GENERATOR_VERSION,
    apiVersion: API_VERSION,
    environmentReady: true,
    providerReady: true,
  });
  expect(disposed).toBe(0);
});

test("verification failure disposes only the candidate and preserves active state", async () => {
  let disposed = 0;
  const machine = createSupervisorStateMachine({
    activeGeneration: { sourceToken: 1, generationToken: 1 },
  });
  const candidateToken = machine.requestSourceChange();
  machine.compileSucceeded(candidateToken);
  machine.startSucceeded(candidateToken);
  const candidate = candidateFor(candidateToken, () => {
    disposed += 1;
    return Promise.resolve();
  });

  await expect(
    verifyCandidate({
      candidate,
      graphHash,
      fetch: responseFor(
        { graphHash, manifestGraphHash: "sha256:other" },
        API_VERSION,
        candidateToken,
      ),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CANDIDATE_GRAPH_HASH_MISMATCH" });
  expect(machine.verificationFailed(candidateToken, "hash mismatch")).toBe(true);
  expect(machine.snapshot()).toMatchObject({
    state: "active",
    activeGeneration: { sourceToken: 1, generationToken: 1 },
  });
  expect(disposed).toBe(1);
});

test("waits for provider readiness before requesting the gated graph endpoint", async () => {
  let readyProbes = 0;
  const respond = responseFor({ graphHash, manifestGraphHash: graphHash });
  const result = await verifyCandidate({
    candidate: candidateFor(token),
    graphHash,
    fetch: async (input, init) => {
      const path = new URL(input.toString()).pathname;
      if (path.endsWith("/health/ready") && ++readyProbes === 1) {
        return Response.json(
          {
            protocol: "relkit.inspector",
            version: API_VERSION,
            ...token,
            status: "not-ready",
            environmentReady: true,
            providerReady: false,
          },
          { status: 503 },
        );
      }
      if (path.endsWith("/graph") && readyProbes < 2)
        return Response.json({ error: "not-ready" }, { status: 503 });
      return respond(input, init);
    },
  });
  expect(result.providerReady).toBe(true);
  expect(readyProbes).toBe(2);
});

test("rejects generation, API, readiness, and health-timeout failures", async () => {
  await expect(
    verifyCandidate({
      candidate: candidateFor(token),
      graphHash,
      fetch: responseFor({ graphHash, manifestGraphHash: graphHash }, API_VERSION, {
        sourceToken: token.sourceToken,
        generationToken: 99,
      }),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CANDIDATE_GENERATION_MISMATCH" });

  await expect(
    verifyCandidate({
      candidate: candidateFor(token),
      graphHash,
      fetch: responseFor({ graphHash, manifestGraphHash: graphHash }, API_VERSION + 1),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CANDIDATE_API_VERSION_UNSUPPORTED" });

  await expect(
    verifyCandidate({
      candidate: candidateFor(token),
      graphHash,
      fetch: responseFor({
        graphHash,
        manifestGraphHash: graphHash,
        manifestContractVersion: MANIFEST_VERSION + 1,
      }),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CANDIDATE_MANIFEST_VERSION_UNSUPPORTED" });

  await expect(
    verifyCandidate({
      candidate: candidateFor(token),
      graphHash,
      healthTimeoutMs: 5,
      fetch: responseFor({
        graphHash,
        manifestGraphHash: graphHash,
        environmentReady: false,
        providerReady: true,
      }),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CANDIDATE_ENVIRONMENT_NOT_READY" });

  await expect(
    verifyCandidate({
      candidate: candidateFor(token),
      graphHash,
      healthTimeoutMs: 5,
      fetch: responseFor({
        graphHash,
        manifestGraphHash: graphHash,
        environmentReady: true,
        providerReady: false,
      }),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CANDIDATE_PROVIDER_NOT_READY" });

  await expect(
    verifyCandidate({
      candidate: candidateFor(token),
      graphHash,
      healthTimeoutMs: 10,
      fetch: (_input, init) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          }),
        ),
    }),
  ).rejects.toMatchObject({ code: "RELKIT_CANDIDATE_HEALTH_TIMEOUT" });
});

function candidateFor(
  currentToken: CandidateVerificationCandidate["token"],
  dispose?: () => Promise<void>,
): CandidateVerificationCandidate {
  return { port: 30_001, token: currentToken, ...(dispose === undefined ? {} : { dispose }) };
}

function responseFor(
  graph: Record<string, unknown>,
  version = API_VERSION,
  identity = token,
): typeof fetch {
  return async (input) => {
    const path = new URL(input.toString()).pathname;
    const body = path.endsWith("/health/live")
      ? { status: "ok", ...identity }
      : path.endsWith("/graph")
        ? {
            graphContractVersion: GRAPH_VERSION,
            manifestContractVersion: MANIFEST_VERSION,
            manifestGeneratorVersion: GENERATOR_VERSION,
            ...graph,
            ...identity,
          }
        : {
            status: "ready",
            environmentReady:
              typeof graph.environmentReady === "boolean" ? graph.environmentReady : true,
            providerReady: typeof graph.providerReady === "boolean" ? graph.providerReady : true,
            ...identity,
          };
    return new Response(JSON.stringify({ protocol: "relkit.inspector", version, ...body }), {
      headers: {
        "content-type": "application/json",
        "x-relkit-api-version": String(version),
      },
    });
  };
}
