import type { Effect, Schema } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { doctorCheckSchema, doctorResultSchema } from "./doctor.schemas.js";

/** Metadata object whose owned dependency fields are Schema validated before use. */
export type PackageJson = Readonly<Record<string, unknown>>;

/** Schema-derived prerequisite shape; interface augmentation remains available. */
export interface DoctorCheck extends Schema.Schema.Type<typeof doctorCheckSchema> {}

/** Schema-derived immutable report, preserving the public interface contract. */
export interface DoctorResult extends Schema.Schema.Type<typeof doctorResultSchema> {}

/** Native prerequisite policy; callbacks must settle after cancellation. */
export interface DoctorOptions {
  readonly projectRoot?: string;
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly backendPort?: number;
  readonly inspectorPort?: number;
  readonly skipPorts?: boolean;
  readonly deploymentEnabled?: boolean;
  readonly commandRunner?: DoctorCommandRunner;
  readonly portProbe?: (port: number) => Promise<boolean>;
}
/** Native command compatibility boundary; signal-aware implementations cancel promptly. */
export type DoctorCommandRunner = (
  command: readonly string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<{ readonly exitCode: number }>;

/** Pure parser result whose absence preserves invocation defaults. */
export type ParsedDoctorArgs = Pick<
  DoctorOptions,
  "projectRoot" | "backendPort" | "inspectorPort"
> & {
  readonly skipPorts?: boolean;
  readonly deploymentEnabled?: boolean;
};

/** Invocation-owned prerequisite checks using explicit I/O capabilities. */
export interface DoctorOperations {
  /**
   * Collects ordered prerequisite results without retaining secret values.
   * @param options - Project and check settings.
   * @returns A lazy report after temporary resources and command handles settle.
   */
  readonly check: (options: DoctorOptions) => Effect.Effect<DoctorResult, CliAdapterError>;
}
