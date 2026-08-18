import type {
  InspectorDiagnosticsPage,
  InspectorEnvironmentPage,
  InspectorObject,
} from "./api-types";
import { projectSource, type ProjectSource } from "./source-links";

export type SourceView = ProjectSource;

export interface GenerationView {
  readonly role: "active" | "candidate";
  readonly generationId: string;
  readonly graphHash: string;
  readonly sourceVersion?: number;
  readonly state?: string;
  readonly status?: string;
}

export interface EnvironmentFieldView {
  readonly name: string;
  readonly type: string;
  readonly requiredIn: readonly string[];
  readonly hasDefault: boolean;
  readonly optional: boolean;
  readonly sensitive: boolean;
  readonly description?: string;
  readonly source?: SourceView;
}

export interface EnvironmentSnapshot {
  readonly active: GenerationView;
  readonly fields: readonly EnvironmentFieldView[];
}

export interface DiagnosticView {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly source?: SourceView;
  readonly descriptorId?: string;
  readonly suggestion?: string;
  readonly documentationPath?: string;
}

export interface DiagnosticsSnapshot {
  readonly status: "active" | "candidate";
  readonly active: {
    readonly identity: GenerationView;
    readonly items: readonly DiagnosticView[];
  };
  readonly candidate?: {
    readonly identity: GenerationView;
    readonly items: readonly DiagnosticView[];
  };
  readonly visible: readonly DiagnosticView[];
}

export function normalizeEnvironment(payload: InspectorEnvironmentPage): EnvironmentSnapshot {
  const activePage = payload.active ?? payload;
  const active = generation(activePage, "active");
  return { active, fields: fields(payload.items) };
}

export function normalizeDiagnostics(payload: InspectorDiagnosticsPage): DiagnosticsSnapshot {
  const activePage = payload.active ?? payload;
  const active = {
    identity: generation(activePage, "active"),
    items: diagnostics(activePage.items),
  };
  const candidatePage = payload.candidate;
  const candidate =
    candidatePage === undefined
      ? undefined
      : {
          identity: generation(candidatePage, "candidate"),
          items: diagnostics(candidatePage.items),
        };
  return {
    status: payload.status === "candidate" && candidate !== undefined ? "candidate" : "active",
    active,
    ...(candidate === undefined ? {} : { candidate }),
    visible: diagnostics(payload.items),
  };
}

function generation(
  value: {
    readonly generationId?: unknown;
    readonly graphHash?: unknown;
    readonly sourceVersion?: unknown;
    readonly state?: unknown;
    readonly status?: unknown;
  },
  role: GenerationView["role"],
): GenerationView {
  const generationId = text(value.generationId);
  const graphHash = text(value.graphHash);
  if (generationId === undefined || graphHash === undefined)
    throw new TypeError("Inspector generation identity is unavailable");
  return {
    role,
    generationId,
    graphHash,
    ...(integer(value.sourceVersion) === undefined
      ? {}
      : { sourceVersion: integer(value.sourceVersion) }),
    ...(text(value.state) === undefined ? {} : { state: text(value.state) }),
    ...(text(value.status) === undefined ? {} : { status: text(value.status) }),
  };
}

function fields(items: readonly unknown[]): readonly EnvironmentFieldView[] {
  return items.flatMap((value) => {
    const item = record(value);
    if (item === undefined) return [];
    const name = text(item.name) ?? text(item.id);
    if (name === undefined) return [];
    return [
      {
        name,
        type: text(item.type) ?? "unknown",
        requiredIn: strings(item.requiredIn),
        hasDefault: item.hasDefault === true,
        optional: item.optional === true,
        sensitive: item.sensitive === true,
        ...(text(item.description) === undefined ? {} : { description: text(item.description) }),
        ...(source(item.source) === undefined ? {} : { source: source(item.source) }),
      },
    ];
  });
}

function diagnostics(items: readonly unknown[]): readonly DiagnosticView[] {
  return items.flatMap((value) => {
    const item = record(value);
    if (item === undefined) return [];
    const code = text(item.code);
    const message = text(item.message);
    const severity = item.severity;
    if (
      code === undefined ||
      message === undefined ||
      (severity !== "info" && severity !== "warning" && severity !== "error")
    )
      return [];
    return [
      {
        code,
        message,
        severity,
        ...(source(item) === undefined ? {} : { source: source(item) }),
        ...(text(item.descriptorId) === undefined ? {} : { descriptorId: text(item.descriptorId) }),
        ...(text(item.suggestion) === undefined ? {} : { suggestion: text(item.suggestion) }),
        ...(text(item.documentationPath) === undefined
          ? {}
          : { documentationPath: text(item.documentationPath) }),
      },
    ];
  });
}

function source(value: unknown): SourceView | undefined {
  return projectSource(value);
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function integer(value: unknown): number | undefined {
  return Number.isSafeInteger(value) ? (value as number) : undefined;
}
