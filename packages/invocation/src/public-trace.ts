import type { MaybePromise, TraceAttributes } from "@relkit/contracts";
import { Context, Exit, Option } from "effect";
import { currentExecutionContext, runInExecutionContext } from "./dispatcher-scope.js";
import { isReservedTraceKey } from "./trace-limits.js";
import { RelkitSpan } from "./tracing-span.js";

export interface PublicSpanOptions {
  readonly attributes?: TraceAttributes;
  readonly kind?: "internal" | "client";
}
export interface PublicTrace {
  span<A>(name: string, callback: () => MaybePromise<A>): Promise<A>;
  span<A>(name: string, options: PublicSpanOptions, callback: () => MaybePromise<A>): Promise<A>;
  event(name: string, attributes?: TraceAttributes): void;
  setAttributes(attributes: TraceAttributes): void;
}
export interface FrameworkSpanOptions {
  readonly attributes?: TraceAttributes;
  readonly kind?: "internal" | "server" | "client" | "producer" | "consumer";
  readonly input?: unknown;
}
export interface FrameworkTrace {
  span<A>(name: string, callback: () => MaybePromise<A>): Promise<A>;
  span<A>(name: string, options: FrameworkSpanOptions, callback: () => MaybePromise<A>): Promise<A>;
  event(name: string, attributes?: TraceAttributes): void;
  setAttributes(attributes: TraceAttributes): void;
  rename(name: string): void;
}

function safeAttributes(attributes: TraceAttributes, allowReserved: boolean): TraceAttributes {
  const safe: Record<string, string | number | boolean> = Object.create(null);
  for (const key of Object.keys(attributes)) {
    const descriptor = Object.getOwnPropertyDescriptor(attributes, key);
    if ((allowReserved || !isReservedTraceKey(key)) && descriptor && "value" in descriptor) {
      safe[key] = descriptor.value;
    }
  }
  return safe;
}

async function runSpan<A>(
  name: string,
  optionsOrCallback: FrameworkSpanOptions | (() => MaybePromise<A>),
  callback?: () => MaybePromise<A>,
  allowReserved = false,
): Promise<A> {
  const options = typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
  const run = typeof optionsOrCallback === "function" ? optionsOrCallback : callback!;
  const context = currentExecutionContext();
  if (!context || context.runtime.closed) return run();
  const child = context.runtime.start(
    {
      name,
      parent: Option.some(context.span),
      annotations: Context.empty(),
      links: [],
      startTime: BigInt(Date.now()) * 1_000_000n,
      kind: options.kind ?? "internal",
      root: false,
      sampled: context.span.sampled,
    },
    options.attributes === undefined
      ? undefined
      : safeAttributes(options.attributes, allowReserved),
  );
  if ("input" in options) child.capture("input", options.input);
  return runInExecutionContext({ ...context, span: child }, async () => {
    try {
      const result = await run();
      child.capture("output", result);
      child.end(BigInt(Date.now()) * 1_000_000n, Exit.void);
      return result;
    } catch (error) {
      child.end(BigInt(Date.now()) * 1_000_000n, Exit.fail(error));
      throw error;
    }
  });
}

function publicSpan<A>(
  name: string,
  optionsOrCallback: PublicSpanOptions | (() => MaybePromise<A>),
  callback?: () => MaybePromise<A>,
): Promise<A> {
  return runSpan(name, optionsOrCallback, callback);
}

function frameworkSpan<A>(
  name: string,
  optionsOrCallback: FrameworkSpanOptions | (() => MaybePromise<A>),
  callback?: () => MaybePromise<A>,
): Promise<A> {
  return runSpan(name, optionsOrCallback, callback, true);
}

/** Resolves context on every operation, so a saved ctx.trace never pins a request. */
export const publicTrace: PublicTrace = Object.freeze({
  span: publicSpan,
  event(name: string, attributes: TraceAttributes = {}) {
    const active = currentExecutionContext()?.span;
    if (!(active instanceof RelkitSpan)) return;
    active.event(name, BigInt(Date.now()) * 1_000_000n, safeAttributes(attributes, false));
  },
  setAttributes(attributes: TraceAttributes) {
    const active = currentExecutionContext()?.span;
    if (active instanceof RelkitSpan) {
      for (const [key, value] of Object.entries(safeAttributes(attributes, false))) {
        active.attribute(key, value);
      }
    }
  },
});

/** Internal instrumentation may set reserved framework identity attributes. */
export const frameworkTrace: FrameworkTrace = Object.freeze({
  span: frameworkSpan,
  event(name: string, attributes: TraceAttributes = {}) {
    const active = currentExecutionContext()?.span;
    if (active instanceof RelkitSpan) {
      active.event(name, BigInt(Date.now()) * 1_000_000n, safeAttributes(attributes, true));
    }
  },
  setAttributes(attributes: TraceAttributes) {
    const active = currentExecutionContext()?.span;
    if (active instanceof RelkitSpan) {
      for (const [key, value] of Object.entries(safeAttributes(attributes, true))) {
        active.attribute(key, value);
      }
    }
  },
  rename(name: string) {
    const active = currentExecutionContext()?.span;
    if (active instanceof RelkitSpan) active.rename(name);
  },
});
