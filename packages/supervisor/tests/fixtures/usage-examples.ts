import { compileCandidate, startCandidate } from "../../src/candidate.js";
import type { CandidateOptions } from "../../src/candidate.types.js";
import { verifyCandidate } from "../../src/verification.js";
import type { CandidateVerificationOptions } from "../../src/verification.types.js";
import { createSupervisorProxy } from "../../src/proxy.js";
import { createSupervisorWatcher } from "../../src/watcher.js";
import { createSupervisorObservability } from "../../src/observability.js";

/** Typechecks the public compilation example without executing native acquisition.
 * @param options - User-supplied compiler. @returns Complete directory ownership. */
export async function compileExample(options: CandidateOptions): Promise<void> {
  const compiled = await compileCandidate(options);
  try {
    console.log(compiled.entrypoint);
  } finally {
    await compiled.cleanup();
  }
}

/** Typechecks the public startup example. @param options - Native generation configuration.
 * @returns Complete process/output/directory ownership. */
export async function startExample(options: CandidateOptions): Promise<void> {
  const candidate = await startCandidate(options);
  try {
    await candidate.exited;
  } finally {
    await candidate.dispose();
  }
}

/** Typechecks the verification example. @param options - Cohort and native probe configuration.
 * @returns Complete verification, retaining the admitted generation identity. */
export async function verifyExample(options: CandidateVerificationOptions): Promise<void> {
  const verified = await verifyCandidate(options);
  console.log(verified.token.generationToken);
}

/** Typechecks the public proxy example. @returns A joined native listener lifetime. */
export async function proxyExample(): Promise<void> {
  const proxy = createSupervisorProxy({ port: 0, logger: { human: false, json: false } });
  try {
    await proxy.listen();
  } finally {
    await proxy.stop();
  }
}

/** Typechecks the watcher example. @returns Complete compile/debounce ownership. */
export async function watcherExample(): Promise<void> {
  const watcher = createSupervisorWatcher({
    compile: () => undefined,
    logger: { human: false, json: false },
  });
  try {
    watcher.notify({ version: 1 });
    await watcher.flush();
  } finally {
    await watcher.close();
  }
}

/** Typechecks the lifecycle observer example. @returns Complete native sink ownership. */
export async function observabilityExample(): Promise<void> {
  const observer = createSupervisorObservability({
    activationFingerprint: {
      graphHash: "sha256:graph",
      manifestHash: "sha256:manifest",
      runtimeIntegrationsPlanHash: "sha256:integrations",
    },
    logger: { human: false, json: false },
  });
  try {
    await observer.flush();
  } finally {
    await observer.close?.();
  }
}
