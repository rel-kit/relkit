import {
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type LocalServiceRecipe,
  type LocalServiceRecipeOutputContext,
} from "@relkit/local-service";

const REDIS_IMAGE =
  "redis:7.4.2-alpine@sha256:02419de7eddf55aa5bcf49efb74e88fa8d931b4d77c07eff8a6b2144472b6952";

export const localRecipe = Object.freeze({
  kind: "local-service-recipe",
  protocolVersion: LOCAL_SERVICE_PROTOCOL_VERSION,
  integrationId: "redis",
  recipeId: "redis-docker",
  recipeVersion: 1,
  materializerId: "docker",
  image: REDIS_IMAGE,
  command: Object.freeze(["redis-server", "--appendonly", "yes"]),
  ports: Object.freeze({ redis: 6379 }),
  volume: Object.freeze({ mountPath: "/data" }),
  health: Object.freeze({
    command: Object.freeze(["redis-cli", "PING"]),
    intervalMs: 250,
    timeoutMs: 2_000,
    retries: 40,
  }),
  outputs: ({ ports }: LocalServiceRecipeOutputContext) => {
    const port = ports.redis;
    if (typeof port !== "number" || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new TypeError("Redis local port is invalid");
    }
    return Object.freeze({ url: `redis://127.0.0.1:${port}` });
  },
}) satisfies LocalServiceRecipe<"redis">;
