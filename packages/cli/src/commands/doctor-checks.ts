import { Effect, Layer } from "effect";
import type { LoadedToolingConfig } from "@relkit/compiler";
import { resolveApplicationPort, resolveInspectorPort } from "./ports.js";
import { doctorCommandEffect, doctorPromise, availablePortEffect } from "./doctor-native.js";
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

/** Checks configured ports in backend-first order.
 * @param config - Validated tooling config.
 * @param options - Port/environment flags.
 * @param probe - Optional finite native callback.
 * @returns A lazy result after admitted listeners close.
 */
export const checkPortsEffect = Effect.fn("Doctor.ports")(
  function* (
    config: LoadedToolingConfig | undefined,
    options: DoctorOptions,
    probe?: (port: number) => Promise<boolean>,
  ) {
    const ports = yield* Effect.try({
      try: () => {
        const source = options.source ?? process.env;
        return {
          backend: resolveApplicationPort({
            ...(options.backendPort === undefined ? {} : { flag: options.backendPort }),
            source,
            ...(config === undefined ? {} : { configured: config.server.port }),
          }),
          inspector: resolveInspectorPort({
            ...(options.inspectorPort === undefined ? {} : { flag: options.inspectorPort }),
            source,
            ...(config === undefined ? {} : { configured: config.inspector.port }),
          }),
        };
      },
      catch: (error) => error,
    }).pipe(Effect.result);
    if (ports._tag === "Failure")
      return {
        name: "ports",
        ok: false,
        message:
          ports.failure instanceof Error ? ports.failure.message : "Configured ports are invalid.",
      };
    const { backend, inspector } = ports.success;
    if (backend === inspector)
      return {
        name: "ports",
        ok: false,
        message: "Configured backend and inspector ports collide.",
        details: { backend, inspector },
      };
    const check = (port: number) =>
      probe === undefined
        ? availablePortEffect(port)
        : doctorPromise("doctor.injectedPort", () => probe(port));
    const ok = (yield* check(backend)) && (yield* check(inspector));
    return {
      name: "ports",
      ok,
      message: ok ? "Configured ports are available." : "A configured port is unavailable.",
      details: { backend, inspector },
    };
  },
  (effect) => observeCli("doctor.ports", effect),
);

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
