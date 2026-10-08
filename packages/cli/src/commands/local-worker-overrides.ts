import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { Effect, Layer } from "effect";
import { serializeJson, type JsonValue } from "@relkit/contracts";
import {
  assertProviderOverrideStateVersion,
  type ProviderOverrideState,
} from "@relkit/local-service";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { cleanupEffect, cleanupLayer } from "../services/cleanup.service.js";

const LOOPBACK_URL_HOST =
  /^(?<scheme>[a-z][a-z\d+.-]*:\/\/)(?:127\.0\.0\.1|localhost|\[::1\])(?=[:/?#]|$)/iu;

/**
 * Publishes rewritten worker bindings with exclusive temporary ownership and 0600 permissions.
 * @param providerOverridesFile - Accepted local owner override path.
 * @returns The atomic worker override path, with secondary cleanup evidence retained separately.
 */
export const prepareLocalWorkerOverridesEffect = Effect.fn("Local.prepareWorkerOverrides")(
  function* (providerOverridesFile: string) {
    const files = yield* CliFileSystem;
    const text = yield* files.readText(providerOverridesFile);
    const rewritten = yield* cliTry("local.workerOverrides", () => {
      const source: unknown = JSON.parse(text);
      assertProviderOverrideStateVersion(source);
      return {
        ...source,
        bindings: source.bindings.map((binding) => ({
          ...binding,
          values: rewriteWorkerValues(binding.values),
        })),
      } satisfies ProviderOverrideState;
    });
    const target = join(dirname(providerOverridesFile), "worker-provider-overrides.json");
    const temporary = join(dirname(target), `.worker-overrides-${randomUUID()}.tmp`);
    const content = yield* cliTry(
      "local.workerOverridesJson",
      () => `${serializeJson(rewritten)}\n`,
    );
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          files.writeExclusive(temporary, content, 0o600).pipe(Effect.as(temporary)),
          (path) => cleanupEffect("local.workerOverrides.remove", files.remove(path)),
        );
        yield* files
          .rename(temporary, target)
          .pipe(Effect.andThen(files.chmod(target, 0o600)), Effect.uninterruptible);
      }),
    );
    return target;
  },
  (effect, _providerOverridesFile: string) => observeCli("local.prepareWorkerOverrides", effect),
);

/**
 * Retains the standalone Promise edge after scoped atomic publication.
 * @param providerOverridesFile - Accepted owner override file.
 * @returns The final worker file path after temporary cleanup.
 */
export function prepareLocalWorkerOverrides(providerOverridesFile: string): Promise<string> {
  return runCliEffect(
    prepareLocalWorkerOverridesEffect(providerOverridesFile),
    Layer.merge(fileSystemLayer, cleanupLayer),
  );
}

/** Rebases local binding URLs for access from a Docker worker.
 * @param values - Validated override values.
 * @returns Immutable values whose local URLs are reachable from the worker container.
 */
function rewriteWorkerValues(
  values: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, rewriteWorkerValue(value)]),
    ),
  );
}

/** Rebases loopback URLs while preserving nested override value shapes.
 * @param value - Validated scalar or nested override value.
 * @returns The same value shape with loopback URL hosts rebased for Docker.
 */
function rewriteWorkerValue(value: JsonValue): JsonValue {
  if (typeof value === "string")
    return value.replace(LOOPBACK_URL_HOST, "$<scheme>host.docker.internal");
  if (Array.isArray(value)) return value.map(rewriteWorkerValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, rewriteWorkerValue(nested)]),
    );
  }
  return value;
}
