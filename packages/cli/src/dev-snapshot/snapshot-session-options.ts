/**
 * Projects an accepted receipt and acquired callbacks into existing session policy.
 * This pure factory starts no child or support worker. Port resolution occurs at
 * its caller's typed native boundary, and execution remains owned by the engine.
 */
import { devLogSinks } from "../commands/dev-logger.js";
import { snapshotVerificationFetch } from "./snapshot-http-auth.js";
import type { DevOptions } from "../commands/dev.types.js";
import type { DevCapture } from "../commands/dev-capture.types.js";
import type { PreparedDevSelection } from "./snapshot-command.types.js";
import type { SnapshotSessionCompiler } from "./snapshot-session-compiler.types.js";

/** Optional support yields one short interval to the newly serving backend. */
export const preparedSupportStartupDelayMs = 500;

/**
 * Builds backend/inspector policy from one previously validated selection.
 * @param selected - Accepted cohort with actual configured port defaults.
 * @param compiler - Scoped prepared-to-safe compiler transition owner.
 * @param telemetry - Acquired ingress callbacks; persistent run remains separate.
 * @param backendPort - Already resolved public application port.
 * @param signal - Native invocation cancellation retained through physical cleanup.
 * @param generatedDirectory - Exclusive parent acquired before the engine's resources.
 * @returns Existing session options without any listener, worker or process acquisition.
 */
export function preparedSessionOptions(
  selected: PreparedDevSelection,
  compiler: SnapshotSessionCompiler,
  telemetry: DevCapture,
  backendPort: number,
  signal: AbortSignal,
  generatedDirectory: string,
): DevOptions {
  const { options, snapshot, projectRoot } = selected;
  return {
    projectRoot,
    generatedDirectory,
    stablePort: backendPort,
    signal,
    installSignalHandlers: false,
    compile: compiler.compile,
    preparedActivationFingerprint: compiler.fingerprint,
    candidateVerificationEffect: compiler.verify,
    candidateVerificationPublished: compiler.publish,
    candidateVerificationRejected: compiler.reject,
    candidateVerificationConcurrentHealth: true,
    candidateVerificationFetch: snapshotVerificationFetch,
    candidateAdmission: compiler.admission,
    supportStartupDelayMs: preparedSupportStartupDelayMs,
    inspector: snapshot.receipt.inspector?.enabled ? snapshot.receipt.inspector.connection : false,
    logger: {
      minimumLevel: options.logLevel ?? (options.verbose ? "debug" : "info"),
      redact: telemetry.redact,
      ...devLogSinks(false),
    },
    terminal: { verbose: options.verbose ?? false, color: !options.noColor },
    environment: { RELKIT_DEV_LOGS: "1", ...telemetry.environment },
    intercept: compiler.intercept,
    inspectionRecords: telemetry.records,
    onRecord: telemetry.append,
    observability: { append: telemetry.append },
  };
}
