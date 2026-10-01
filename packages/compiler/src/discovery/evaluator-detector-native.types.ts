import type { EvaluatorSideEffectKind } from "./evaluator-protocol.types.js";

/** Native objects whose writable methods are temporarily replaced by the detector owner. */
export type MutableRecord = Record<string, unknown>;

/**
 * Opaque native invocation contract; each replacement preserves the original receiver.
 * @param args - Native arguments retained without domain re-encoding.
 * @returns The original platform result.
 */
export type GenericFunction = (...args: unknown[]) => unknown;

/**
 * Synchronous native release capability, owned by a detector session.
 * @returns Nothing after restoring the native resource; unexpected native failures may throw.
 */
export type Restore = () => void;

/**
 * Native boundary that records and throws a blocked operation before it reaches the platform.
 * @param kind - Blocked native capability category.
 * @param operation - Platform invocation label.
 * @param target - Diagnostic destination.
 * @returns Never because rejected platform invocations cannot proceed.
 */
export type Violate = (kind: EvaluatorSideEffectKind, operation: string, target: string) => never;
