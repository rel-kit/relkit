import { createDescriptorBase, deepFreeze } from "@zsys/contracts";
import { createUnboundIdentity } from "@zsys/invocation";
import { isEnvRef } from "@zsys/config";
import { copyProviderMaps, isEnvDefinition, resolveDefaults } from "./config-validation.js";
import type {
  ApplicationConfigDescriptor,
  ConfigProviderMaps,
  DefineConfigOptions,
} from "./config-types.js";

export * from "./config-types.js";
export { deriveApplicationId } from "./config-validation.js";

/**
 * Defines application, environment, provider, runtime, and deployment settings.
 *
 * @example
 * ```ts
 * import { defineConfig, defineEnv, env, external, s3 } from "@zsys/app"
 *
 * const values = defineEnv({
 *   BUCKET_ENDPOINT: env.url(),
 *   BUCKET_NAME: env.string(),
 * })
 *
 * export default defineConfig({
 *   env: values,
 *   buckets: {
 *     assets: external(s3({
 *       endpoint: values.BUCKET_ENDPOINT,
 *       bucketName: values.BUCKET_NAME,
 *       region: "us-east-1",
 *     })),
 *   },
 *   defaults: { bucket: "assets" },
 * })
 * ```
 * @category Application
 * @since 0.2.0
 */
export function defineConfig<
  const S extends import("@zsys/config").EnvShape,
  const Maps extends ConfigProviderMaps,
>(options: DefineConfigOptions<S, Maps>): ApplicationConfigDescriptor<string, S, Maps> {
  if (!isRecord(options) || !isEnvDefinition(options.env)) {
    throw new TypeError("ZSYS config requires an environment definition");
  }
  if (
    options.deployment !== undefined &&
    (options.deployment.target !== "aws" || options.deployment.adapter !== "pulumi")
  ) {
    throw new TypeError("ZSYS deployment must select the aws target and pulumi adapter");
  }
  if (options.sentry?.sendDefaultPii !== undefined && options.sentry.sendDefaultPii !== false) {
    throw new TypeError("Sentry PII collection cannot be enabled through ZSYS config");
  }
  if (
    options.sentry !== undefined &&
    !(
      (typeof options.sentry.dsn === "string" && options.sentry.dsn.trim() !== "") ||
      isEnvRef(options.sentry.dsn)
    )
  ) {
    throw new TypeError("Sentry dsn must be nonempty text or an environment reference");
  }
  if (
    options.sentry?.tracesSampleRate !== undefined &&
    (!Number.isFinite(options.sentry.tracesSampleRate) ||
      options.sentry.tracesSampleRate < 0 ||
      options.sentry.tracesSampleRate > 1)
  ) {
    throw new TypeError("Sentry tracesSampleRate must be between 0 and 1");
  }
  const maps = copyProviderMaps(options);
  const defaults = resolveDefaults(maps, options.defaults);
  const base = createDescriptorBase("app", options.id ?? createUnboundIdentity(), options);
  return deepFreeze({
    ...base,
    env: options.env,
    ...maps,
    ...(Object.keys(defaults).length === 0 ? {} : { defaults }),
    ...(options.sentry === undefined ? {} : { sentry: { ...options.sentry } }),
    ...(options.telemetry === undefined ? {} : { telemetry: { ...options.telemetry } }),
    ...(options.server === undefined ? {} : { server: { ...options.server } }),
    ...(options.inspector === undefined ? {} : { inspector: { ...options.inspector } }),
    ...(options.deployment === undefined ? {} : { deployment: { ...options.deployment } }),
  }) as ApplicationConfigDescriptor<string, S, Maps>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
