import type {
  ObservabilityRecord,
  RequestDetail,
  RequestDetailKind,
  RequestOutcome,
  RequestRecord,
} from "./model.js";

export interface RequestRecordSink {
  readonly collect: (record: RequestRecord) => unknown;
  readonly read?: () => readonly ObservabilityRecord[];
  readonly readRecords?: () => readonly ObservabilityRecord[];
}

export interface RequestRecordBuilderOptions {
  readonly requestId: string;
  readonly traceId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly method: string;
  readonly rawPath: string;
  readonly startedAt?: number;
  readonly requestBytes?: number;
  readonly now?: () => number;
}

export interface RequestDetailInput {
  readonly kind: RequestDetailKind;
  readonly at?: number | string;
  readonly durationMs?: number;
  readonly targetId?: string;
  readonly status?: number;
  readonly outcome?: RequestDetail["outcome"];
}

export interface RequestRecordBuilder {
  readonly add: (detail: RequestDetailInput) => void;
  readonly setTraceId: (traceId: string) => void;
  readonly setRoute: (routeId: string, functionId: string) => void;
  readonly setInvocationId: (invocationId: string) => void;
  readonly setOutcome: (outcome: RequestOutcome, errorId?: string) => RequestOutcome;
  readonly finish: (options: {
    readonly status: number;
    readonly completedAt?: number;
    readonly responseBytes?: number;
  }) => RequestRecord;
}

/** Builds one immutable request record while keeping body values outside telemetry. */
export function createRequestRecordBuilder(
  options: RequestRecordBuilderOptions,
): RequestRecordBuilder {
  const now = options.now ?? Date.now;
  const startedAt = options.startedAt ?? now();
  const details: Array<{
    readonly at: number;
    readonly order: number;
    readonly value: RequestDetail;
  }> = [];
  let traceId = options.traceId;
  let order = 0;
  let routeId = "unknown";
  let functionId = "unknown";
  let invocationId = `request:${options.requestId}`;
  let requestOutcome: RequestOutcome = "success";
  let errorId: string | undefined;
  let finished: RequestRecord | undefined;

  const add = (detail: RequestDetailInput): void => {
    if (finished !== undefined) return;
    const at = toMillis(detail.at, now());
    const value: RequestDetail = Object.freeze({
      kind: detail.kind,
      at: new Date(at).toISOString(),
      ...(validDuration(detail.durationMs) ? { durationMs: detail.durationMs } : {}),
      ...(text(detail.targetId) === undefined ? {} : { targetId: detail.targetId }),
      ...(validStatus(detail.status) ? { status: detail.status } : {}),
      ...(detail.outcome === undefined ? {} : { outcome: detail.outcome }),
    });
    details.push({ at, order: order++, value });
  };
  const finish = (finishOptions: {
    readonly status: number;
    readonly completedAt?: number;
    readonly responseBytes?: number;
  }): RequestRecord => {
    if (finished !== undefined) return finished;
    const completedAt = finishOptions.completedAt ?? now();
    const timeline = Object.freeze(
      details
        .slice()
        .sort((left, right) => left.at - right.at || left.order - right.order)
        .map(({ value }) => value),
    );
    finished = Object.freeze({
      version: 1,
      signal: "request",
      requestId: options.requestId,
      traceId,
      generationId: options.generationId,
      graphHash: options.graphHash,
      invocationId,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      durationMs: Math.max(0, completedAt - startedAt),
      method: options.method,
      rawPath: options.rawPath,
      normalizedRoute: routeId,
      routeId,
      functionId,
      status: validStatus(finishOptions.status) ? finishOptions.status : 500,
      ...(validBytes(options.requestBytes) ? { requestBytes: options.requestBytes } : {}),
      ...(validBytes(finishOptions.responseBytes)
        ? { responseBytes: finishOptions.responseBytes }
        : {}),
      outcome: requestOutcome,
      ...(errorId === undefined ? {} : { errorId }),
      timeline,
    });
    return finished;
  };
  return Object.freeze({
    add,
    setTraceId: (value: string): void => {
      if (finished === undefined && text(value) !== undefined) traceId = value;
    },
    setRoute: (nextRouteId: string, nextFunctionId: string): void => {
      if (finished !== undefined) return;
      if (text(nextRouteId) !== undefined) routeId = nextRouteId;
      if (text(nextFunctionId) !== undefined) functionId = nextFunctionId;
    },
    setInvocationId: (value: string): void => {
      if (finished === undefined && text(value) !== undefined) invocationId = value;
    },
    setOutcome: (outcome: RequestOutcome, nextErrorId?: string): RequestOutcome => {
      if (finished !== undefined) return requestOutcome;
      if (requestOutcome === "success" || outcome !== "success") requestOutcome = outcome;
      if (text(nextErrorId) !== undefined) errorId = nextErrorId;
      return requestOutcome;
    },
    finish,
  });
}

function toMillis(value: number | string | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function text(value: string | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function validDuration(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function validBytes(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

function validStatus(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 100 && value <= 599;
}
