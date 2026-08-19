import type { EvaluatorSideEffect, EvaluatorSideEffectKind } from "./evaluator-protocol.js";
import { installFileDetectors } from "./evaluator-detector-files.js";
import { installNetworkDetectors } from "./evaluator-detector-network.js";
import { installOutput, installTimers, type TimerRecord } from "./evaluator-detector-timers.js";

type Restore = () => void;

export interface EvaluatorDetectorOptions {
  readonly projectRoot: string;
  readonly generatedDirectory: string;
  readonly networkAllowlist: readonly string[];
}

export interface EvaluatorDetectorReport {
  readonly sideEffects: readonly EvaluatorSideEffect[];
  readonly stdout: string;
  readonly stderr: string;
}

export interface EvaluatorDetectorSession {
  finish(): EvaluatorDetectorReport;
  restore(): void;
}

/** Installs best-effort hooks for one candidate and restores them before framing. */
export function installEvaluatorDetectors(
  options: EvaluatorDetectorOptions,
): EvaluatorDetectorSession {
  const sideEffects: EvaluatorSideEffect[] = [];
  const timersByHandle = new Map<unknown, TimerRecord>();
  const restores: Restore[] = [];
  let stdout = "";
  let stderr = "";
  let restored = false;

  const record = (kind: EvaluatorSideEffectKind, operation: string, target: string): void => {
    sideEffects.push({ kind, operation, target });
  };
  const violate = (kind: EvaluatorSideEffectKind, operation: string, target: string): never => {
    record(kind, operation, target);
    throw new Error(`Evaluator blocked ${kind} through ${operation}.`);
  };

  installTimers(timersByHandle, restores);
  installOutput(restores, (stream, value) => {
    record("direct-output", `${stream}.write`, stream);
    if (stream === "stdout") stdout += value;
    else stderr += value;
  });
  installFileDetectors(options, restores, violate);
  installNetworkDetectors(options.networkAllowlist, restores, violate);

  return {
    finish(): EvaluatorDetectorReport {
      for (const [handle, timer] of timersByHandle) {
        record("live-timer", timer.kind, timer.kind);
        timer.cancel();
        timersByHandle.delete(handle);
      }
      return {
        sideEffects: Object.freeze([...sideEffects]),
        stdout,
        stderr,
      };
    },
    restore(): void {
      if (restored) return;
      restored = true;
      for (const timer of timersByHandle.values()) timer.cancel();
      timersByHandle.clear();
      for (const restore of restores.reverse()) restore();
    },
  };
}
