/**
 * Composes selected toolchain, credential, filesystem and lockfile diagnostics.
 * Port selection lives in doctor-ports so application checks do not acquire or
 * probe the independently installed inspector UI.
 */
import { Effect, Layer } from "effect";
import type { LoadedToolingConfig } from "@relkit/compiler";
import { doctorCommandEffect, availablePortEffect } from "./doctor-native.js";
import { checkPortsEffect } from "./doctor-ports.js";
export { checkPortsEffect } from "./doctor-ports.js";
import { runCliEffect, observeCli } from "../cli-runtime.js";
import { processLayer } from "../services/process.service.js";
import { checkRootsEffect } from "./doctor-roots.js";
import { cleanupLayer } from "../services/cleanup.service.js";
import { fileSystemLayer } from "../services/filesystem.service.js";
import type { DoctorCheck, DoctorCommandRunner, DoctorOptions } from "./doctor.types.js";
import { CliDoctorToolchain, doctorToolchainLayer } from "./doctor-toolchain.service.js";
export { checkRootsEffect, availablePortEffect };

/** Checks local Pulumi only when deployment is enabled.
 * @param enabled - Deployment prerequisite policy.
 * @param root - Project working directory.
 * @param runner - Optional native command replacement.
 * @returns A lazy bounded-output command result.
 */
export const checkPulumiEffect = Effect.fn("Doctor.pulumi")(
  function* (enabled: boolean, root: string, runner?: DoctorCommandRunner) {
    if (!enabled)
      return { name: "pulumi", ok: true, message: "Pulumi check skipped; deployment is disabled." };
    const executable = yield* (yield* CliDoctorToolchain).which("pulumi");
    if (executable === null)
      return { name: "pulumi", ok: false, message: "Pulumi CLI is not available." };
    const result = yield* doctorCommandEffect(
      [executable, "version", "--client-only"],
      root,
      runner,
    );
    return {
      name: "pulumi",
      ok: result.exitCode === 0,
      message:
        result.exitCode === 0 ? "Pulumi CLI is available." : "Pulumi CLI could not be invoked.",
    };
  },
  (effect) => observeCli("doctor.pulumi", effect),
);

/** Reports credential-source names without retaining values.
 * @param enabled - Whether credentials are required.
 * @param source - Caller-owned environment.
 * @returns A pure visibility check.
 */
export function checkAws(
  enabled: boolean,
  source: Readonly<Record<string, string | undefined>>,
): DoctorCheck {
  if (!enabled)
    return {
      name: "aws-credentials",
      ok: true,
      message: "AWS credential check skipped; deployment is disabled.",
    };
  const groups = [
    ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    ["AWS_PROFILE"],
    ["AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN"],
    ["AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"],
    ["AWS_CONTAINER_CREDENTIALS_FULL_URI"],
  ];
  const visible = groups.find((group) => group.every((name) => Boolean(source[name])));
  return {
    name: "aws-credentials",
    ok: visible !== undefined,
    message:
      visible === undefined ? "AWS credentials are not visible." : "AWS credentials are visible.",
    details: { sources: visible ?? [] },
  };
}

/** Runs the established frozen dry-run check.
 * @param root - Project root.
 * @param runner - Optional native callback.
 * @returns The lazy compatibility result.
 */
export const checkLockfileEffect = Effect.fn("Doctor.lockfile")(
  function* (root: string, runner?: DoctorCommandRunner) {
    const result = yield* doctorCommandEffect(
      [process.execPath, "install", "--frozen-lockfile", "--dry-run"],
      root,
      runner,
    );
    return {
      name: "lockfile",
      ok: result.exitCode === 0,
      message:
        result.exitCode === 0
          ? "Frozen lockfile is consistent."
          : "Frozen lockfile consistency check failed.",
    };
  },
  (effect) => observeCli("doctor.lockfile", effect),
);

/** Preserves the finite Pulumi Promise check.
 * @param enabled - Deployment policy.
 * @param root - Project root.
 * @param runner - Optional command authority.
 * @returns The established result.
 */
export function checkPulumi(
  enabled: boolean,
  root: string,
  runner?: DoctorCommandRunner,
): Promise<DoctorCheck> {
  return runCliEffect(
    checkPulumiEffect(enabled, root, runner),
    Layer.merge(processLayer, doctorToolchainLayer),
  );
}

/** Preserves writable-root checks.
 * @param root - Project root.
 * @returns The report after marker cleanup.
 */
export function checkRoots(root: string): Promise<DoctorCheck> {
  return runCliEffect(checkRootsEffect(root), Layer.merge(fileSystemLayer, cleanupLayer));
}

/** Preserves configured port checks.
 * @param config - Validated config.
 * @param options - Port policy.
 * @param probe - Optional native probe.
 * @returns The original ordered result.
 */
export function checkPorts(
  config: LoadedToolingConfig | undefined,
  options: DoctorOptions,
  probe?: (port: number) => Promise<boolean>,
): Promise<DoctorCheck> {
  return runCliEffect(checkPortsEffect(config, options, probe), cleanupLayer);
}

/** Preserves frozen lockfile checks.
 * @param root - Project root.
 * @param runner - Optional command authority.
 * @returns The original lockfile result.
 */
export function checkLockfile(root: string, runner?: DoctorCommandRunner): Promise<DoctorCheck> {
  return runCliEffect(checkLockfileEffect(root, runner), processLayer);
}

/** Preserves standalone finite port probing.
 * @param port - Candidate port.
 * @returns Availability after listener close.
 */
export function availablePort(port: number): Promise<boolean> {
  return runCliEffect(availablePortEffect(port), cleanupLayer);
}
