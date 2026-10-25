/** Builds a provider's serializable authoring descriptor; acquiring a runtime is a separate integration role. */
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
} from "@relkit/provider";

export const cacheAdapter = defineProviderAdapter({
  integration: defineIntegrationReference("example-cache"),
  capability: defineProviderCapability("cache"),
  adapterId: "example-cache.v1",
  connectionContract: defineConnectionContract({ url: { sensitive: true } }),
  connection: { url: "redis://127.0.0.1:6379" },
  behavior: defineProviderBehavior({ keyPrefix: "products" }),
});
