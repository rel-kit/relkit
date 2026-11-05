/**
 * Providers that use a Cloudflare Worker's own bindings instead of Cloudflare's HTTP APIs: a Workers
 * KV namespace for caches and an R2 bucket for buckets. They run only in a Worker built with
 * `relkit build --runtime workers`; the binding name is recorded in the graph, so
 * `relkit deploy init cloudflare` writes the matching `kv_namespaces` and `r2_buckets` entries.
 */
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  type ProviderAdapter,
  type ProviderBehavior,
} from "relkit/provider";

const cache = defineProviderCapability("cache");
const bucket = defineProviderCapability("bucket");
const integration = defineIntegrationReference("cloudflare");
const noConnection = defineConnectionContract({});

/** Options of a provider backed by one Worker binding. @experimental */
export interface CloudflareBindingOptions<Binding extends string = string> {
  /** Binding name in `wrangler.jsonc`: an upper-case identifier such as `CACHE`. */
  readonly binding: Binding;
}

/** @experimental */
export type CloudflareKvBindingAdapter<Binding extends string = string> = ProviderAdapter<
  typeof cache,
  "cloudflare-kv-binding",
  Readonly<Record<never, never>>,
  ProviderBehavior<Readonly<{ binding: Binding; minimumTtlMs: 60_000 }>>
>;

/** @experimental */
export type CloudflareR2BindingAdapter<Binding extends string = string> = ProviderAdapter<
  typeof bucket,
  "cloudflare-r2-binding",
  Readonly<Record<never, never>>,
  ProviderBehavior<Readonly<{ binding: Binding }>>
>;

/**
 * Defines a cache on the Worker's Workers KV namespace binding.
 * @param options - The binding name.
 * @returns The cache adapter.
 * @example
 * ```ts
 * import { kvBinding } from "@relkit/cloudflare";
 * const cache = kvBinding({ binding: "CACHE" });
 * ```
 * @category Integrations
 * @since 0.8.0
 * @experimental
 */
export function kvBinding<const Binding extends string>(
  options: CloudflareBindingOptions<Binding>,
): CloudflareKvBindingAdapter<Binding> {
  const binding = bindingName(options, "Cloudflare KV binding");
  return defineProviderAdapter({
    integration,
    capability: cache,
    adapterId: "cloudflare-kv-binding",
    connectionContract: noConnection,
    connection: {},
    behavior: defineProviderBehavior({ binding, minimumTtlMs: 60_000 as const }),
  }) as CloudflareKvBindingAdapter<Binding>;
}

/**
 * Defines a bucket on the Worker's R2 bucket binding. Bindings cannot sign URLs, so this bucket has
 * no signed read or write URLs; use `r2()` with S3 credentials for those.
 * @param options - The binding name.
 * @returns The bucket adapter.
 * @example
 * ```ts
 * import { r2Binding } from "@relkit/cloudflare";
 * const uploads = r2Binding({ binding: "UPLOADS" });
 * ```
 * @category Integrations
 * @since 0.8.0
 * @experimental
 */
export function r2Binding<const Binding extends string>(
  options: CloudflareBindingOptions<Binding>,
): CloudflareR2BindingAdapter<Binding> {
  const binding = bindingName(options, "Cloudflare R2 binding");
  return defineProviderAdapter({
    integration,
    capability: bucket,
    adapterId: "cloudflare-r2-binding",
    connectionContract: noConnection,
    connection: {},
    behavior: defineProviderBehavior({ binding }),
  }) as CloudflareR2BindingAdapter<Binding>;
}

/**
 * Validates a binding option object.
 * @param options - Authored options.
 * @param label - Name for error messages.
 * @returns The binding name.
 */
function bindingName(options: unknown, label: string): string {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new TypeError(`${label} options must be an object`);
  for (const key of Object.keys(options))
    if (key !== "binding") throw new TypeError(`Unknown ${label} option "${key}"`);
  const binding = (options as { readonly binding?: unknown }).binding;
  if (typeof binding !== "string" || !/^[A-Z][A-Z0-9_]*$/u.test(binding))
    throw new TypeError(`${label} must name a binding in upper case, such as CACHE`);
  return binding;
}
