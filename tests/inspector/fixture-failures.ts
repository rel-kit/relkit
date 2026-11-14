/**
 * Requests that explain themselves, for the request detail page: a declared error, a validation
 * failure with issue attributes, internal failures with and without a recorded cause, an
 * invocation with captured input and result, and a request with no function (the
 * authentication mount). Records follow what the framework writes; ids start with `request-`.
 */
type Item = Record<string, unknown>;

export interface FailureFixtureOptions {
  readonly generationId: string;
  readonly graphHash: string;
  readonly routeId: string;
  readonly functionId: string;
  readonly at: string;
}

interface Spec {
  readonly id: string;
  readonly traceHex: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly outcome: string;
  readonly errorId?: string;
  readonly rootEvents?: readonly Item[];
  readonly capture?: { readonly input?: Item; readonly output?: Item };
  /** False for requests no function handles; the route is then a system route. */
  readonly function?: boolean;
  readonly routeId?: string;
}

export const FAILURE_FIXTURE_IDS = Object.freeze({
  declared: "request-declared",
  invalid: "request-invalid",
  defectDev: "request-defect-dev",
  defectTypeOnly: "request-defect-type-only",
  captured: "request-captured",
  auth: "request-auth",
});

const issueAttributes: Record<string, string | number> = { "relkit.validation.issue_count": 12 };
for (let index = 0; index < 10; index += 1) {
  issueAttributes[`relkit.validation.issues.${index}.code`] =
    index === 0 ? "missing" : "invalid_type";
  issueAttributes[`relkit.validation.issues.${index}.path`] =
    index === 0 ? "plate" : `vehicle.wheels.${index}`;
}

/** Records for every failure case, newest first like the fixture's own lists. */
export function failureFixtures(options: FailureFixtureOptions) {
  const { at } = options;
  const specs: readonly Spec[] = [
    {
      id: FAILURE_FIXTURE_IDS.declared,
      traceHex: "7",
      method: "POST",
      path: "/vehicles",
      status: 409,
      outcome: "declared-error",
      errorId: "fleet.plate-taken",
    },
    {
      id: FAILURE_FIXTURE_IDS.invalid,
      traceHex: "8",
      method: "POST",
      path: "/vehicles",
      status: 422,
      outcome: "validation-error",
      rootEvents: [{ name: "http.validation.failed", timestamp: at, attributes: issueAttributes }],
    },
    {
      id: FAILURE_FIXTURE_IDS.defectDev,
      traceHex: "9",
      method: "POST",
      path: "/vehicles",
      status: 500,
      outcome: "defect",
      rootEvents: [
        {
          name: "exception",
          timestamp: at,
          attributes: {
            "exception.type": "DatabaseError",
            "exception.message":
              "Failed query: insert into vehicles values ($1) params: [REDACTED]",
            "exception.stacktrace":
              "DatabaseError: Failed query\n    at insertVehicle (src/vehicles/store.ts:42:11)\n    at create (src/vehicles/create.function.ts:9:5)",
          },
        },
      ],
    },
    {
      id: FAILURE_FIXTURE_IDS.defectTypeOnly,
      traceHex: "b",
      method: "POST",
      path: "/vehicles",
      status: 500,
      outcome: "defect",
      rootEvents: [
        { name: "exception", timestamp: at, attributes: { "exception.type": "UnexpectedDefect" } },
      ],
    },
    {
      id: FAILURE_FIXTURE_IDS.captured,
      traceHex: "c",
      method: "POST",
      path: "/orders",
      status: 201,
      outcome: "success",
      capture: {
        input: {
          mode: "development-redacted",
          bytes: 38,
          truncated: false,
          content: { sku: "sku-1", quantity: 2, apiKey: "[redacted]" },
        },
        output: {
          mode: "development-redacted",
          bytes: 4096,
          truncated: true,
          content: { orderId: "order-100", lines: ["first line"] },
        },
      },
    },
    {
      id: FAILURE_FIXTURE_IDS.auth,
      traceHex: "d",
      method: "POST",
      path: "/api/auth/sign-in",
      status: 200,
      outcome: "success",
      function: false,
      routeId: "relkit.auth",
    },
  ];
  const built = specs.map((spec, index) => build(spec, options, 9000 + index));
  return {
    requests: built.map((item) => item.request),
    traces: built.flatMap((item) => item.records),
    logs: built.flatMap((item) => item.logs),
  };
}

function build(spec: Spec, options: FailureFixtureOptions, cursor: number) {
  const { at } = options;
  const traceId = spec.traceHex.repeat(32);
  const rootSpanId = `1${traceId.slice(-15)}`;
  const functionSpanId = `2${traceId.slice(-15)}`;
  const hasFunction = spec.function !== false;
  const request = {
    version: 2,
    signal: "request",
    phase: "completed",
    requestId: spec.id,
    traceId,
    generationId: options.generationId,
    graphHash: options.graphHash,
    ...(hasFunction ? { invocationId: `${spec.id}:invocation` } : {}),
    startedAt: at,
    completedAt: at,
    durationMs: 14,
    method: spec.method,
    rawPath: spec.path,
    normalizedRoute: spec.path,
    routeId: spec.routeId ?? options.routeId,
    ...(hasFunction ? { functionId: options.functionId } : {}),
    status: spec.status,
    outcome: spec.outcome,
    ...(spec.errorId === undefined ? {} : { errorId: spec.errorId }),
  };
  const records: Item[] = [
    {
      version: 2,
      signal: "trace",
      traceId,
      rootSpanId,
      startedAt: at,
      completedAt: at,
      durationMs: 14,
      spanCount: hasFunction ? 2 : 1,
      outcome: spec.outcome,
      requestId: spec.id,
    },
    {
      version: 2,
      signal: "span",
      spanId: rootSpanId,
      traceId,
      requestId: spec.id,
      name: `HTTP ${spec.method} ${spec.path}`,
      kind: "server",
      revision: 1,
      status: "completed",
      startedAt: at,
      completedAt: at,
      durationMs: 14,
      outcome: spec.outcome,
      attributes: {
        "http.request.method": spec.method,
        "http.response.status_code": spec.status,
        "relkit.request.id": spec.id,
        ...(spec.errorId === undefined ? {} : { "relkit.error.id": spec.errorId }),
      },
      events: [
        { name: "http.request.received", timestamp: at },
        ...(spec.rootEvents ?? []),
        { name: "http.response.completed", timestamp: at },
      ],
    },
  ];
  if (hasFunction)
    // A span is reported when it starts and again when it ends: two records, one span.
    records.push(
      {
        version: 2,
        signal: "span",
        spanId: functionSpanId,
        invocationId: `${spec.id}:invocation`,
        traceId,
        requestId: spec.id,
        name: `relkit.invoke.${options.functionId}`,
        functionId: options.functionId,
        parentSpanId: rootSpanId,
        kind: "internal",
        revision: 0,
        status: "started",
        startedAt: at,
      },
      {
        version: 2,
        signal: "span",
        spanId: functionSpanId,
        invocationId: `${spec.id}:invocation`,
        traceId,
        requestId: spec.id,
        name: `relkit.invoke.${options.functionId}`,
        functionId: options.functionId,
        parentSpanId: rootSpanId,
        kind: "internal",
        revision: 2,
        status: "completed",
        startedAt: at,
        completedAt: at,
        durationMs: 12,
        outcome: spec.outcome,
        ...(spec.capture?.input === undefined ? {} : { inputCapture: spec.capture.input }),
        ...(spec.capture?.output === undefined ? {} : { outputCapture: spec.capture.output }),
      },
    );
  const detail = (spec.rootEvents ?? []).find((event) => event.name === "exception")?.attributes;
  const logs =
    detail === undefined
      ? []
      : [
          {
            version: 2,
            signal: "log",
            cursor: String(cursor),
            timestamp: at,
            level: "error",
            origin: "application",
            spanId: rootSpanId,
            component: "relkit.http",
            message: "Request failed.",
            fields: {
              ...(detail as Item),
              "relkit.error.code": "RELKIT_UNEXPECTED_DEFECT",
              "relkit.error.kind": "defect",
            },
            traceId,
            requestId: spec.id,
          },
        ];
  return { request, records, logs };
}
