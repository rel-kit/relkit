import type { InspectorObject } from "./api-types";
import { number, record, text } from "./observability-model";
import { traceLifecycle } from "./trace-lifecycle";

/** What one capture of the function span holds. */
export type CaptureView =
  /** The redacted value, as recorded. */
  | { readonly state: "captured"; readonly content: unknown; readonly bytes: number }
  /** The value was larger than the capture limit, so none of it was kept. */
  | { readonly state: "truncated"; readonly limit: number }
  /** The function took no input or returned no value. */
  | { readonly state: "empty" }
  /** The application's config did not turn capture on, so nothing was recorded. */
  | { readonly state: "off" };

export interface FunctionCaptures {
  readonly functionId: string;
  readonly input: CaptureView;
  readonly output: CaptureView;
}

/**
 * Spans named `relkit.invoke.<functionId>` carry the capture. The HTTP route span also carries
 * the function id but never a capture, so it must not stand in for the invocation.
 */
const INVOCATION_SPAN = "relkit.invoke.";

/**
 * The captured input and result of the invocation behind a request, read from its invocation
 * span. Undefined when no function ran: the authentication mount, system routes and early
 * rejections have none. Spans arrive as one record per revision, so they are merged first.
 */
export function functionCaptures(
  request: InspectorObject,
  spans: readonly InspectorObject[],
): FunctionCaptures | undefined {
  const own = text(request.functionId);
  const candidates = traceLifecycle(spans)
    .filter((span) => text(span.functionId) !== "" && text(span.name).startsWith(INVOCATION_SPAN))
    .sort((left, right) => rank(left, own) - rank(right, own));
  const span = candidates[0];
  if (span === undefined) return undefined;
  return {
    functionId: text(span.functionId),
    input: view(span.inputCapture),
    output: view(span.outputCapture),
  };
}

/** The request's own function first, then the one that started earliest. */
function rank(span: InspectorObject, own: string): number {
  const started = Date.parse(text(span.startedAt));
  return (text(span.functionId) === own ? 0 : 1e15) + (Number.isFinite(started) ? started : 0);
}

function view(value: unknown): CaptureView {
  const capture = record(value);
  if (capture === undefined) return { state: "off" };
  if (capture.truncated === true) return { state: "truncated", limit: number(capture.bytes) ?? 0 };
  if (!("content" in capture)) return { state: "empty" };
  return { state: "captured", content: capture.content, bytes: number(capture.bytes) ?? 0 };
}
