import {
  defineLocalProviderSource,
  type LocalProviderSource,
  type ProviderAdapter,
} from "@relkit/provider";

/**
 * Selects an adapter's declared local recipe without contacting Docker.
 *
 * @example
 * ```ts
 * import { docker } from "@relkit/docker";
 * import { redis } from "@relkit/redis";
 *
 * const cache = docker(redis());
 * ```
 * @category Local services
 * @since 0.2.0
 */
export function docker<const Adapter extends ProviderAdapter>(
  adapter: Adapter,
): LocalProviderSource<Adapter> {
  return defineLocalProviderSource(adapter);
}
