import type { OpMap, UpdateResult } from "@pulumi/pulumi/automation";
import type { JsonValue } from "@zsys/contracts";

export const PULUMI_REPORT_VERSION = 1 as const;
export type PulumiLogLevel = "info" | "warn" | "error";
export interface PulumiEventOptions {
  readonly redaction?: import("@zsys/observability").RedactionPolicy;
  readonly redact?: (value: unknown) => JsonValue;
}
export interface PulumiEventLog {
  readonly sequence: number;
  readonly timestamp: number;
  readonly kind: string;
  readonly level: PulumiLogLevel;
  readonly message: string;
  readonly fields: Readonly<Record<string, JsonValue>>;
}
export interface PulumiEventSummary {
  readonly resourceChanges: OpMap;
  readonly diagnostics: Readonly<{
    readonly info: number;
    readonly warning: number;
    readonly error: number;
  }>;
  readonly maybeCorrupt: boolean;
  readonly durationSeconds?: number;
  readonly result?: UpdateResult;
}
export interface PulumiOutput {
  readonly secret: false;
  readonly value: JsonValue;
}
export interface PulumiSecretOutput {
  readonly secret: true;
}
export type PulumiOutputValue = PulumiOutput | PulumiSecretOutput;
export type PulumiOutputs = Readonly<Record<string, PulumiOutputValue>>;
export interface PulumiPreviewReport {
  readonly version: typeof PULUMI_REPORT_VERSION;
  readonly kind: "preview";
  readonly summary: PulumiEventSummary;
  readonly logs: readonly PulumiEventLog[];
}
export interface PulumiUpdateReport {
  readonly version: typeof PULUMI_REPORT_VERSION;
  readonly kind: "update";
  readonly summary: PulumiEventSummary;
  readonly outputs: PulumiOutputs;
  readonly logs: readonly PulumiEventLog[];
}
export interface PulumiOutputReport {
  readonly version: typeof PULUMI_REPORT_VERSION;
  readonly kind: "outputs";
  readonly outputs: PulumiOutputs;
}
export type PulumiReport = PulumiPreviewReport | PulumiUpdateReport | PulumiOutputReport;
