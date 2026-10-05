import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Effect, Exit } from "effect";
import { createSpanId, createTraceId } from "@relkit/contracts";
import {
  runInExecutionContext,
  SpanRuntime,
  spanSnapshot,
  startRootSpan,
} from "@relkit/invocation";
import { runSpecializedTrace } from "../../src/operation-tracing.js";

it.effect("active invocation traces redact native results and rejection messages", () =>
  Effect.gen(function* () {
    const snapshots: unknown[] = [];
    const failures: string[] = [];
    const runtime = new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
      observer: (event) => {
        snapshots.push(spanSnapshot(event));
        if (event.span.status._tag === "Ended" && Exit.isFailure(event.span.status.exit)) {
          const cause = Cause.squash(event.span.status.exit.cause);
          failures.push(cause instanceof Error ? cause.message : String(cause));
        }
      },
      capture: (value) =>
        value === undefined
          ? undefined
          : { bytes: 1, truncated: false, content: JSON.stringify(value) },
    });
    const root = startRootSpan(runtime, "request", "server");
    const secret = "sensitive-token-and-query-value";
    const nativeFailure = new Error(secret);
    const result = { token: secret };
    yield* Effect.promise(() =>
      runInExecutionContext({ span: root, runtime }, async () => {
        expect(await runSpecializedTrace("database.findOne", () => Promise.resolve(result))).toBe(
          result,
        );
        await expect(
          runSpecializedTrace("auth.session", () => Promise.reject(nativeFailure)),
        ).rejects.toBe(nativeFailure);
      }),
    );
    runtime.close();
    expect(JSON.stringify(snapshots)).not.toContain(secret);
    expect(failures).toContain("Specialized operation failed");
    expect(JSON.stringify(failures)).not.toContain(secret);
    expect(JSON.stringify(snapshots)).toContain(root.spanId);
  }),
);
