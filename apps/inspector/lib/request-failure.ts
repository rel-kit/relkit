import type { InspectorObject } from "./api-types";
import { record, records, text } from "./observability-model";
import { traceLifecycle } from "./trace-lifecycle";

export interface ValidationIssue {
  readonly code: string;
  /** Dotted path of the field; empty when the issue is about the input as a whole. */
  readonly path: string;
}

export interface ValidationSummary {
  readonly count: number;
  readonly issues: readonly ValidationIssue[];
  /** Issues counted but not listed: the framework names at most the first ten. */
  readonly more: number;
}

export interface FailureCause {
  readonly type: string;
  readonly message?: string;
  readonly stack?: string;
  /** The framework's error code, from the correlated error log. */
  readonly code?: string;
}

export interface RequestFailure {
  readonly errorId?: string;
  readonly validation?: ValidationSummary;
  readonly cause?: FailureCause;
}

const ISSUE = /^relkit\.validation\.issues\.(\d+)\.(code|path)$/;

/** The issues named by the attributes of an `http.validation.failed` event. Values are never recorded. */
export function validationSummary(attributes: unknown): ValidationSummary | undefined {
  const values = record(attributes);
  const count = values?.["relkit.validation.issue_count"];
  if (values === undefined || typeof count !== "number") return undefined;
  const byIndex = new Map<number, { code?: string; path?: string }>();
  for (const [key, value] of Object.entries(values)) {
    const match = ISSUE.exec(key);
    if (match === null || typeof value !== "string") continue;
    const index = Number(match[1]);
    byIndex.set(index, { ...byIndex.get(index), [match[2] as "code" | "path"]: value });
  }
  const issues = [...byIndex.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, issue]) =>
      issue.code === undefined ? [] : [{ code: issue.code, path: issue.path ?? "" }],
    );
  return { count, issues, more: Math.max(0, count - issues.length) };
}

const PROBLEMS: Readonly<Record<string, string>> = {
  missing: "Missing",
  "malformed-json": "Body is not valid JSON",
  "content-type": "Content type is not accepted",
  "body-too-large": "Body is too large",
  "body-not-object": "Body is not an object",
};

/** Plain words for the framework's own issue codes; a schema's code is shown as recorded. */
export function issueProblem(code: string): string {
  return PROBLEMS[code] ?? code;
}

/**
 * What a failed request recorded about itself: the declared error identifier, the validation
 * issues, and the cause of an internal failure. Spans arrive as raw records (one per revision),
 * so they are merged by span id first.
 */
export function requestFailure(
  request: InspectorObject,
  spans: readonly InspectorObject[],
  logs: readonly InspectorObject[],
): RequestFailure {
  const merged = traceLifecycle(spans);
  const errorId = text(request.errorId) || spanErrorId(merged);
  const validation = firstValidation(merged);
  const cause = recordedCause(merged, logs);
  return {
    ...(errorId === "" ? {} : { errorId }),
    ...(validation === undefined ? {} : { validation }),
    ...(cause === undefined ? {} : { cause }),
  };
}

function spanErrorId(spans: readonly InspectorObject[]): string {
  for (const span of spans) {
    const value = text(record(span.attributes)?.["relkit.error.id"]);
    if (value !== "") return value;
  }
  return "";
}

function eventsNamed(spans: readonly InspectorObject[], name: string): InspectorObject[] {
  return spans.flatMap((span) => records(span.events).filter((event) => event.name === name));
}

function firstValidation(spans: readonly InspectorObject[]): ValidationSummary | undefined {
  for (const event of eventsNamed(spans, "http.validation.failed")) {
    const summary = validationSummary(event.attributes);
    if (summary !== undefined) return summary;
  }
  return undefined;
}

function recordedCause(
  spans: readonly InspectorObject[],
  logs: readonly InspectorObject[],
): FailureCause | undefined {
  const logged = logs.flatMap((log) => {
    const fields = record(log.fields);
    return text(fields?.["exception.type"]) === "" ? [] : [fields!];
  })[0];
  const events = eventsNamed(spans, "exception").flatMap((event) => {
    const attributes = record(event.attributes);
    return text(attributes?.["exception.type"]) === "" ? [] : [attributes!];
  });
  // The request span's event carries the message in development; the invocation span's event
  // carries the type alone. Show the most detailed one.
  const source =
    events.find((attributes) => text(attributes["exception.message"]) !== "") ??
    events[0] ??
    logged;
  if (source === undefined) return undefined;
  const message = text(source["exception.message"]) || text(logged?.["exception.message"]);
  const stack = text(source["exception.stacktrace"]) || text(logged?.["exception.stacktrace"]);
  const code = text(logged?.["relkit.error.code"]);
  return {
    type: text(source["exception.type"]),
    ...(message === "" ? {} : { message }),
    ...(stack === "" ? {} : { stack }),
    ...(code === "" ? {} : { code }),
  };
}
