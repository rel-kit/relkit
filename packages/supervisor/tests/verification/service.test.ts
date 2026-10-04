import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Layer, Metric } from "effect";
import { TestClock } from "effect/testing";
import { API_VERSION, GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import {
  CandidateVerification,
  createVerificationLayer,
  VerificationPlatform,
} from "../../src/verification-service.js";
import { VerificationFailure } from "../../src/verification.schemas.js";
import { mockFetch } from "../fixtures/fetch.ts";
import { verifyCandidate } from "../../src/verification.js";
import { CandidateVerificationError } from "../../src/verification-error.js";

const identity = { sourceToken: 2, generationToken: 3 };
const fingerprint = {
  graphHash: "sha256:test",
  manifestHash: "sha256:manifest",
  runtimeIntegrationsPlanHash: "sha256:runtime",
};

it.live(
  "a later readiness or graph generation mismatch cannot hide behind valid live identity",
  () =>
    Effect.promise(async () => {
      for (const badEndpoint of ["ready", "graph"]) {
        let disposed = 0;
        const paths: string[] = [];
        await expect(
          verifyCandidate({
            candidate: {
              port: 3001,
              token: identity,
              dispose: async () => {
                disposed++;
              },
            },
            activationFingerprint: fingerprint,
            logger: { human: false, json: false },
            fetch: mockFetch(async (input) => {
              const endpoint = new URL(input.toString()).pathname.split("/").at(-1)!;
              paths.push(endpoint);
              return Response.json({
                protocol: "relkit.inspector",
                version: API_VERSION,
                ...identity,
                generationToken: endpoint === badEndpoint ? 99 : identity.generationToken,
                activationFingerprint: fingerprint,
                status: endpoint === "live" ? "ok" : "ready",
                environmentReady: true,
                providerReady: true,
                graphHash: fingerprint.graphHash,
                manifestGraphHash: fingerprint.graphHash,
                graphContractVersion: GRAPH_VERSION,
                manifestContractVersion: MANIFEST_VERSION,
                manifestGeneratorVersion: GENERATOR_VERSION,
              });
            }),
          }),
        ).rejects.toMatchObject({ code: "RELKIT_CANDIDATE_GENERATION_MISMATCH" });
        expect(disposed).toBe(1);
        expect(paths).toEqual(
          badEndpoint === "ready" ? ["live", "ready"] : ["live", "ready", "graph"],
        );
      }
    }),
);

it.effect(
  "all endpoints share an absolute injected-clock deadline and cancel pending native fetch",
  () =>
    Effect.gen(function* () {
      const liveEntered = yield* Deferred.make<void>();
      const readyEntered = yield* Deferred.make<AbortSignal>();
      /** Completes the held live response. @param response - Native probe response. @returns After native settlement. */
      let finishLive: (response: Response) => void = () => undefined;
      let disposed = 0;
      const paths: string[] = [];
      const registry: Metric.MetricRegistry = new Map();
      const platform = Layer.succeed(VerificationPlatform, {
        fetch: mockFetch((input, init) => {
          const path = new URL(input.toString()).pathname;
          paths.push(path);
          if (path.endsWith("/health/live"))
            return new Promise<Response>((resolve) => {
              finishLive = resolve;
              Deferred.doneUnsafe(liveEntered, Effect.void);
            });
          return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal === undefined || signal === null)
              throw new Error("Missing owned probe signal");
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            Deferred.doneUnsafe(readyEntered, Effect.succeed(signal));
          });
        }),
      });
      yield* Effect.gen(function* () {
        const service = yield* CandidateVerification;
        const verifying = yield* Effect.forkChild(service.verify);
        yield* Deferred.await(liveEntered);
        yield* TestClock.adjust(40);
        finishLive(
          Response.json({
            protocol: "relkit.inspector",
            version: API_VERSION,
            ...identity,
            status: "ok",
            activationFingerprint: fingerprint,
          }),
        );
        const signal = yield* Deferred.await(readyEntered);
        yield* TestClock.adjust(60);
        const exit = yield* Fiber.await(verifying);
        expect(
          Exit.isFailure(exit) &&
            exit.cause.reasons.some(
              (reason) =>
                reason._tag === "Fail" &&
                reason.error instanceof VerificationFailure &&
                reason.error.error instanceof CandidateVerificationError &&
                reason.error.error.code === "RELKIT_CANDIDATE_HEALTH_TIMEOUT",
            ),
        ).toBe(true);
        expect(signal.aborted).toBe(true);
        expect(disposed).toBe(1);
        expect(paths.map((path) => path.split("/").at(-1))).toEqual(["live", "ready"]);
      }).pipe(
        Effect.provide(
          createVerificationLayer({
            candidate: {
              port: 3001,
              token: identity,
              dispose: async () => {
                disposed++;
              },
            },
            activationFingerprint: fingerprint,
            healthTimeoutMs: 100,
          }).pipe(Layer.provide(platform)),
        ),
        Effect.provideService(Metric.MetricRegistry, registry),
      );
      expect(
        [...registry.values()]
          .filter((entry) => entry.id === "relkit_execution_outcomes_total")
          .map((entry) => entry.attributes?.outcome),
      ).toEqual(["failure"]);
    }).pipe(
      Effect.provide(createLoggerLayer({ human: false, json: false })),
      Effect.provideService(Metric.MetricRegistry, new Map()),
    ),
);

it.live(
  "caller abort preserves its reason and releases candidate without aborting another owner",
  () =>
    Effect.promise(async () => {
      const caller = new AbortController();
      const sibling = new AbortController();
      const reason = new Error("caller verification cancelled");
      /** Announces native fetch entry. @returns After fixture notification. */
      let enter: () => void = () => undefined;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      let disposed = 0;
      const verifying = verifyCandidate({
        candidate: {
          port: 3001,
          token: identity,
          dispose: async () => {
            disposed++;
          },
        },
        activationFingerprint: fingerprint,
        signal: caller.signal,
        logger: { human: false, json: false },
        fetch: mockFetch(
          (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
                once: true,
              });
              enter();
            }),
        ),
      });
      try {
        await entered;
        caller.abort(reason);
        await expect(verifying).rejects.toBe(reason);
        expect(disposed).toBe(1);
        expect(sibling.signal.aborted).toBe(false);
      } finally {
        caller.abort(reason);
        await verifying.catch(() => undefined);
      }
    }),
);
