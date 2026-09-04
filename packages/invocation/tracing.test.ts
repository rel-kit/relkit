import { describe, expect, test } from "bun:test";
import { Context, Exit, Option } from "effect";
import {
  SpanRuntime,
  currentExecutionContext,
  publicTrace,
  runInExecutionContext,
  runDetachedExecution,
  type SpanLifecycle,
  type RelkitSpan,
} from "./src/index.js";
import { createSpanId, createTraceId } from "@relkit/contracts";

function setup(limits = {}, observer?: (event: SpanLifecycle) => unknown) {
  const events: SpanLifecycle[] = [];
  const runtime = new SpanRuntime({
    limits,
    ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
    observer: (event) => {
      events.push(event);
      return observer?.(event);
    },
  });
  const root = runtime.start({
    name: "request",
    parent: Option.none(),
    annotations: Context.empty(),
    links: [],
    startTime: 1n,
    kind: "server",
    root: true,
    sampled: true,
  });
  return { runtime, root, events };
}

describe("shared execution lifecycle", () => {
  test("nested parallel work resolves its deepest context across timers", async () => {
    const first = setup();
    const second = setup();
    await Promise.all(
      [first, second].map(({ root, runtime }) =>
        runInExecutionContext({ span: root, runtime }, async () => {
          await Promise.all(
            ["a", "b"].map((name) =>
              publicTrace.span(name, async () => {
                const child = currentExecutionContext()!.span;
                await new Promise((resolve) => setTimeout(resolve, 1));
                expect(currentExecutionContext()!.span).toBe(child);
                await publicTrace.span("nested", () => {
                  const nested = currentExecutionContext()!.span;
                  expect(
                    Option.getOrUndefined(nested._tag === "Span" ? nested.parent : Option.none())
                      ?.spanId,
                  ).toBe(child.spanId);
                  expect(nested.traceId).toBe(root.traceId);
                });
              }),
            ),
          );
          expect(currentExecutionContext()!.span).toBe(root);
        }),
      ),
    );
    expect(currentExecutionContext()).toBeUndefined();
    first.runtime.close();
    second.runtime.close();
  });

  test("preserves original results/errors despite throwing and rejecting observers", async () => {
    for (const observer of [
      () => {
        throw new Error("observer");
      },
      () => Promise.reject("observer"),
    ]) {
      const { root, runtime } = setup({}, observer);
      let calls = 0;
      const error = { application: "failure" };
      await runInExecutionContext({ span: root, runtime }, async () => {
        expect(
          await publicTrace.span("ok", () => {
            calls++;
            return 42;
          }),
        ).toBe(42);
        try {
          await publicTrace.span("fail", () => {
            calls++;
            throw error;
          });
        } catch (actual) {
          expect(actual).toBe(error);
        }
      });
      expect(calls).toBe(2);
      runtime.close();
      await Promise.resolve();
      expect(runtime.observerFailures).toBeGreaterThan(0);
    }
  });

  test("bounds updates and data while preserving authoritative completion", async () => {
    const { root, runtime, events } = setup({
      attributes: 1,
      events: 1,
      updates: 1,
      attributeBytes: 4,
    });
    await runInExecutionContext({ span: root, runtime }, async () => {
      root.attribute("relkit.invocation.id", "real");
      publicTrace.setAttributes({ "relkit.invocation.id": "fake", second: true });
      publicTrace.event("first", { value: "😀😀" });
      publicTrace.event("dropped");
    });
    root.end(2n, Exit.void);
    const revision = root.revision;
    root.attribute("after", true);
    root.event("after", 3n);
    root.end(4n, Exit.fail("late"));
    expect(root.attributes.get("relkit.invocation.id")).toBe("real");
    expect(root.events[0]?.attributes.value).toBe("😀");
    expect(root.droppedAttributes).toBe(1);
    expect(root.droppedEvents).toBe(1);
    expect(root.droppedUpdates).toBe(3);
    expect(events.map((event) => event.type)).toEqual(["started", "updated", "completed"]);
    expect(events.at(-1)?.revision).toBe(revision);
    expect(root.revision).toBe(revision);
  });

  test("recording limits preserve propagation and detached work loses request scope", async () => {
    const { root, runtime, events } = setup({ spansPerTrace: 1 });
    await runInExecutionContext({ span: root, runtime, requestId: "request-a" }, () =>
      publicTrace.span("unrecorded", async () => {
        expect(currentExecutionContext()?.span.traceId).toBe(root.traceId);
        expect(currentExecutionContext()?.span.spanId).not.toBe(root.spanId);
        await runDetachedExecution(async () => {
          expect(currentExecutionContext()).toBeUndefined();
          expect(await publicTrace.span("noop", () => "works")).toBe("works");
        });
      }),
    );
    expect(events).toHaveLength(1);
    expect(runtime.droppedSpans).toBe(1);
    expect(root.budget.dropped).toBe(1);
    runtime.close();
  });

  test("closing one generation does not disable another or mutate ended spans", async () => {
    const first = setup();
    const second = setup();
    first.runtime.close();
    await runInExecutionContext({ span: second.root, runtime: second.runtime }, async () => {
      await publicTrace.span("still-active", () =>
        expect(currentExecutionContext()?.runtime).toBe(second.runtime),
      );
    });
    expect(second.events.filter((event) => event.type === "completed")).toHaveLength(1);
    expect(first.runtime.active.size).toBe(0);
    second.runtime.close();
  });

  test("completed manual spans cannot be changed by late callbacks", async () => {
    const { root, runtime } = setup();
    let late!: () => void;
    let child!: RelkitSpan;
    await runInExecutionContext({ span: root, runtime }, () =>
      publicTrace.span("manual", () => {
        child = currentExecutionContext()!.span as RelkitSpan;
        const context = currentExecutionContext()!;
        late = () =>
          runInExecutionContext(context, () => publicTrace.setAttributes({ after: true }));
      }),
    );
    late();
    expect(child.attributes.has("after")).toBe(false);
    runtime.close();
  });
});
