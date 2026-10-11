/**
 * Installs one verified immutable cohort into the existing supervisor owner and
 * probes its normal backend route before traffic activation. It reuses validation
 * metadata and captured byte strings; later cache edits cannot replace their content.
 */
import { Cause, Context, Effect, Layer } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { API_BASE_PATH } from "@relkit/contracts";
import { canonicalJson } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { cliAdapterError } from "../cli-errors.js";
import { SnapshotCandidateFiles } from "./snapshot-candidate-files.js";
import { SnapshotProbe } from "./snapshot-probe.service.js";
import { verifySnapshotGraphResponse } from "./snapshot-graph-proof.js";
import { snapshotDigest } from "./snapshot-fingerprint.js";
import type {
  SnapshotCandidateOperations,
  SnapshotCandidateRequest,
} from "./snapshot-candidate.types.js";
import type { SnapshotProbeOperations } from "./snapshot-candidate.types.js";
import type { SnapshotCandidateFileOperations } from "./snapshot-candidate.types.js";
import type { StartedCandidate } from "@relkit/supervisor";

/** Candidate policy captures replaceable file authorities once per session Layer. */
export class SnapshotCandidates extends Context.Service<
  SnapshotCandidates,
  SnapshotCandidateOperations
>()("relkit/DevSnapshot/Candidates", {
  make: Effect.gen(function* () {
    const writes = yield* SnapshotCandidateFiles;
    const http = yield* SnapshotProbe;
    return {
      install: (request) =>
        observeExecution("cli", "dev.snapshot.candidate.install", install(writes, request)),
      probe: (request, child, signal, publicRequest) =>
        observeExecution(
          "cli",
          "dev.snapshot.candidate.probe",
          probe(http, request, child, signal, publicRequest),
        ),
    } satisfies SnapshotCandidateOperations;
  }),
}) {}

/** Candidate policy exposes no native runtime assumptions to its callers. */
export const snapshotCandidatesLive = Layer.effect(SnapshotCandidates, SnapshotCandidates.make);

/**
 * Copies indexed bytes into the SDK generation and retains its original cohort identity.
 * @param writes - Candidate-owned native write adapter.
 * @param request - One validated receipt, live input epoch and fresh SDK generation.
 * @returns Runnable SDK receipt with the original sealed bytes; stale epochs cannot execute.
 */
const install = Effect.fn("DevSnapshot.installCandidate")(function* (
  writes: SnapshotCandidateFileOperations,
  request: SnapshotCandidateRequest,
) {
  const { snapshot, candidate, epoch, token } = request;
  yield* epoch
    .verify(token)
    .pipe(mapErrorCause((error) => cliAdapterError("dev.snapshot.epoch", error)));
  yield* Effect.forEach(
    snapshot.artifacts,
    (member) =>
      Effect.gen(function* () {
        // String content cannot be changed by a caller or later cache tampering.
        const bytes = yield* Effect.sync(() => Buffer.from(member.content, "base64"));
        yield* writes.write(candidate.outputDirectory, member.path, bytes);
      }).pipe(mapErrorCause((error) => cliAdapterError("dev.snapshot.install", error))),
    { concurrency: 8, discard: true },
  );
  const integrity = Object.fromEntries(
    snapshot.artifacts.map((member) => [member.path, { hash: member.hash, bytes: member.bytes }]),
  );
  const integrityBytes = new TextEncoder().encode(canonicalJson(integrity) + "\n");
  yield* writes
    .write(candidate.outputDirectory, "deferred-integrity.json", integrityBytes)
    .pipe(mapErrorCause((error) => cliAdapterError("dev.snapshot.install", error)));
  yield* epoch
    .verify(token)
    .pipe(mapErrorCause((error) => cliAdapterError("dev.snapshot.epoch", error)));
  return {
    entrypoint: snapshot.receipt.entrypoint,
    environment: { RELKIT_DEFERRED_INTEGRITY_HASH: snapshotDigest(integrityBytes) },
  };
});

/**
 * Executes the prepared normal route after protected supervisor cohort verification.
 * @param request - Accepted receipt and still-owned input epoch.
 * @param child - Unpublished child already matched to the cohort by the SDK.
 * @param signal - Activation cancellation combined with HTTP adapter interruption.
 * @returns Complete exact HTTP proof or typed failure; no socket-only success is accepted.
 */
const probe = Effect.fn("DevSnapshot.probeCandidate")(function* (
  http: SnapshotProbeOperations,
  request: SnapshotCandidateRequest,
  child: StartedCandidate,
  signal: AbortSignal,
  publicRequest?: Request,
) {
  const readiness = request.snapshot.receipt.readiness;
  const path = readiness.kind === "graph" ? `${API_BASE_PATH}/graph` : readiness.path;
  const response = yield* publicRequest === undefined
    ? http.read(child.port, path, signal)
    : http.forward(child.port, publicRequest, signal);
  if (readiness.kind === "graph")
    yield* verifySnapshotGraphResponse(response, request.snapshot.receipt, child.token);
  else if (response.status !== readiness.status || response.body !== readiness.body)
    return yield* cliAdapterError(
      "dev.snapshot.probe",
      new Error("Prepared backend route did not return its expected response."),
    );
  yield* request.epoch
    .verify(request.token)
    .pipe(
      Effect.catchCause((cause) =>
        Effect.failCause(Cause.map(cause, (error) => cliAdapterError("dev.snapshot.epoch", error))),
      ),
    );
  return response;
});
