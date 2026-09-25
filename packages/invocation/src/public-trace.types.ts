import type { MaybePromise, TraceAttributes } from "@relkit/contracts";

/** Optional attributes and kind for a handler-visible child span.
 * Attributes are filtered and bounded before recording.
 * @example const options: PublicSpanOptions = { kind: "client", attributes: { cache: true } };
 */
export interface PublicSpanOptions {
  readonly attributes?: TraceAttributes;
  readonly kind?: "internal" | "client";
}

/** Handler-visible tracing facade that resolves the current context on every call.
 * Child spans inherit the active invocation trace and preserve callback failures.
 * @example await context.trace.span("lookup", async () => fetchValue());
 */
export interface PublicTrace {
  /** Runs work under a child span.
   * @param name - Span name.
   * @param callback - Work to trace.
   * @returns The callback result or rejection with its original error.
   * @example await trace.span("lookup", async () => 1);
   */
  span<A>(name: string, callback: () => MaybePromise<A>): Promise<A>;
  /** Runs work under an attributed child span.
   * @param name - Span name.
   * @param options - Safe attributes and kind.
   * @param callback - Work to trace.
   * @returns The callback result or rejection with its original error.
   * @example await trace.span("lookup", { kind: "client" }, async () => 1);
   */
  span<A>(name: string, options: PublicSpanOptions, callback: () => MaybePromise<A>): Promise<A>;
  /** Emits an event on the active span.
   * @param name - Event name.
   * @param attributes - Safe event attributes.
   * @returns Void.
   * @example trace.event("cache.hit");
   */
  event(name: string, attributes?: TraceAttributes): void;
  /** Sets attributes on the active span.
   * @param attributes - Safe attributes; reserved keys are ignored.
   * @returns Void.
   * @example trace.setAttributes({ cached: true });
   */
  setAttributes(attributes: TraceAttributes): void;
}

/** Framework-only span options, including server and producer kinds.
 * Input capture is bounded by the active trace limits.
 * @example const options: FrameworkSpanOptions = { kind: "server", attributes: { route: "/orders" } };
 */
export interface FrameworkSpanOptions {
  readonly attributes?: TraceAttributes;
  readonly kind?: "internal" | "server" | "client" | "producer" | "consumer";
  readonly input?: unknown;
}

/** Internal tracing facade that may set reserved framework attributes.
 * Handler code receives PublicTrace instead of this privileged interface.
 * @example frameworkTrace.rename("http.request");
 */
export interface FrameworkTrace extends PublicTrace {
  /** Runs framework work under a child span.
   * @param name - Span name.
   * @param callback - Work to trace.
   * @returns The callback result or rejection.
   * @example await frameworkTrace.span("invoke", async () => 1);
   */
  span<A>(name: string, callback: () => MaybePromise<A>): Promise<A>;
  /** Runs framework work under a child span with privileged options.
   * @param name - Span name.
   * @param options - Framework span attributes, kind, and input.
   * @param callback - Work to trace.
   * @returns The callback result or rejection.
   * @example await frameworkTrace.span("invoke", { kind: "server" }, async () => 1);
   */
  span<A>(name: string, options: FrameworkSpanOptions, callback: () => MaybePromise<A>): Promise<A>;
  /** Renames the active span.
   * @param name - Replacement name.
   * @returns Void.
   * @example frameworkTrace.rename("http.request");
   */
  rename(name: string): void;
}
