import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApplicationGraph } from "@zsys/graph";
import { hashGraph } from "@zsys/graph";
import {
  createSupervisorDrain,
  startCandidate,
  verifyCandidate,
  type StartedCandidate,
  type SupervisorCandidateToken,
} from "@zsys/supervisor";
import type { DevSession } from "./dev-session.js";

export async function activateCandidate(
  session: DevSession,
  version: number,
  changedFiles: readonly string[],
): Promise<boolean> {
  const token = session.stateMachine.requestSourceChange();
  const controller = new AbortController();
  session.controllers.add(controller);
  const signal = AbortSignal.any([session.abortController.signal, controller.signal]);
  let candidate: StartedCandidate | undefined;
  try {
    candidate = await startCandidate({
      projectRoot: session.projectRoot,
      token,
      compile: session.options.compile,
      port: 0,
      signal,
      ...(session.options.candidateHostname === undefined
        ? {}
        : { hostname: session.options.candidateHostname }),
      ...(session.options.generatedDirectory === undefined
        ? {}
        : { generatedDirectory: session.options.generatedDirectory }),
      ...(session.options.environment === undefined
        ? {}
        : { environment: session.options.environment }),
      ...(session.options.maxStartupOutputBytes === undefined
        ? {}
        : { maxStartupOutputBytes: session.options.maxStartupOutputBytes }),
      ...(session.options.candidateStopTimeoutMs === undefined
        ? {}
        : { stopTimeoutMs: session.options.candidateStopTimeoutMs }),
      logger: (event) =>
        session.log({
          level: event.level,
          event: event.event,
          fields: { directory: event.directory, ...(event.fields ?? {}) },
        }),
    });
    if (
      !session.stateMachine.compileSucceeded(token) ||
      !session.stateMachine.startSucceeded(token)
    ) {
      await candidate.dispose();
      return false;
    }
    const graphHash = await resolveGraphHash(session, candidate);
    session.hashes.set(token.generationToken, graphHash);
    await verifyCandidate({
      candidate,
      graphHash,
      signal,
      ...(session.options.healthTimeoutMs === undefined
        ? {}
        : { healthTimeoutMs: session.options.healthTimeoutMs }),
    });
    if (!session.stateMachine.verificationSucceeded(token)) {
      await candidate.dispose();
      return false;
    }
    if (session.isStopping) {
      await candidate.dispose();
      return false;
    }
    const previous = session.active;
    const candidateKey = tokenKey(candidate.token);
    session.drains.set(
      candidateKey,
      createSupervisorDrain({
        token: candidate.token,
        candidate,
        ...(session.options.drainTimeoutMs === undefined
          ? {}
          : { deadlineMs: session.options.drainTimeoutMs }),
      }),
    );
    if (!session.proxy.compareAndSwitch(previous?.token, candidate)) {
      session.stateMachine.switchFailed(token, "The stable proxy target changed.");
      session.drains.delete(candidateKey);
      await candidate.dispose();
      return false;
    }
    session.stateMachine.switchSucceeded(token);
    session.active = candidate;
    session.activeGraphHash = graphHash;
    watchCandidate(session, candidate);
    if (previous !== undefined) await session.drain(previous, token);
    session.log({
      level: "info",
      event: "dev.generation.active",
      fields: { version, changedFiles: changedFiles.length },
    });
    return true;
  } catch (error) {
    await candidate?.dispose().catch(() => undefined);
    session.drains.delete(tokenKey(token));
    failState(session, token, error);
    session.log({
      level: "error",
      event: "dev.generation.failed",
      fields: { message: errorMessage(error) },
    });
    return false;
  } finally {
    session.controllers.delete(controller);
  }
}

async function resolveGraphHash(session: DevSession, candidate: StartedCandidate): Promise<string> {
  const value = session.options.graphHash;
  const graphHash =
    value === undefined
      ? hashGraph(
          JSON.parse(
            await readFile(join(candidate.directory, "application.graph.json"), "utf8"),
          ) as ApplicationGraph,
        )
      : typeof value === "function"
        ? await value(candidate)
        : value;
  if (typeof graphHash !== "string" || graphHash.trim() === "")
    throw new TypeError("Development candidates require a graph hash.");
  return graphHash;
}

export async function drainCandidate(
  session: DevSession,
  previous: StartedCandidate,
  activeToken: SupervisorCandidateToken,
): Promise<void> {
  const key = tokenKey(previous.token);
  const drain =
    session.drains.get(key) ??
    createSupervisorDrain({
      token: previous.token,
      candidate: previous,
      ...(session.options.drainTimeoutMs === undefined
        ? {}
        : { deadlineMs: session.options.drainTimeoutMs }),
    });
  session.drains.set(key, drain);
  const report = await drain.drain();
  session.drains.delete(key);
  if (report.outcome === "drained") session.stateMachine.drainSucceeded(activeToken);
  else session.stateMachine.drainFailed(activeToken, report.outcome);
}

function watchCandidate(session: DevSession, candidate: StartedCandidate): void {
  void candidate.exited.then((exitCode) => {
    if (candidate !== session.active || session.isStopping) return;
    void session.stop(new Error(`Backend generation exited with code ${exitCode}.`));
  });
}

function failState(session: DevSession, token: SupervisorCandidateToken, error: unknown): void {
  const state = session.stateMachine.state;
  if (state === "compiling-candidate") session.stateMachine.compileFailed(token, error);
  else if (state === "starting-candidate") session.stateMachine.startFailed(token, error);
  else if (state === "verifying-hash-and-readiness")
    session.stateMachine.verificationFailed(token, error);
  else if (state === "switching") session.stateMachine.switchFailed(token, error);
}

function tokenKey(token: SupervisorCandidateToken): string {
  return `${token.sourceToken}:${token.generationToken}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
