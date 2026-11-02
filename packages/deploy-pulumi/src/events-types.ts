import type { OpMap, UpdateResult } from "@pulumi/pulumi/automation";
import type { JsonValue } from "@relkit/contracts";

/** @experimental */
export const PULUMI_REPORT_VERSION = 1 as const;
/** @experimental */
export type PulumiLogLevel = "info" | "warn" | "error";
/** @experimental */
export interface PulumiEventOptions {
  readonly redaction?: import("@relkit/observability").RedactionPolicy;
  readonly redact?: (value: unknown) => JsonValue;
}
/** @experimental */
export interface PulumiEventLog {
  readonly sequence: number;
  readonly timestamp: number;
  readonly kind: string;
  readonly level: PulumiLogLevel;
  readonly message: string;
  readonly fields: Readonly<Record<string, JsonValue>>;
}
/** @experimental */
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
/** @experimental */
export interface PulumiOutput {
  readonly secret: false;
  readonly value: JsonValue;
}
/** @experimental */
export interface PulumiSecretOutput {
  readonly secret: true;
}
/** @experimental */
export type PulumiOutputValue = PulumiOutput | PulumiSecretOutput;
/** @experimental */
export type PulumiOutputs = Readonly<Record<string, PulumiOutputValue>>;
/** @experimental */
export interface PulumiPreviewReport {
  readonly version: typeof PULUMI_REPORT_VERSION;
  readonly kind: "preview";
  readonly summary: PulumiEventSummary;
  readonly logs: readonly PulumiEventLog[];
}
/** @experimental */
export interface PulumiUpdateReport {
  readonly version: typeof PULUMI_REPORT_VERSION;
  readonly kind: "update";
  readonly summary: PulumiEventSummary;
  readonly outputs: PulumiOutputs;
  readonly logs: readonly PulumiEventLog[];
}
/** @experimental */
export interface PulumiOutputReport {
  readonly version: typeof PULUMI_REPORT_VERSION;
  readonly kind: "outputs";
  readonly outputs: PulumiOutputs;
}
/** @experimental */
export type PulumiReport = PulumiPreviewReport | PulumiUpdateReport | PulumiOutputReport;
